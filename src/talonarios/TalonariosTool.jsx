import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { ToolHeader } from '../shell/Shell.jsx';
import {
  DEFAULT_CONFIG, FIELDS, activeFields, countPages, exportPresets, formatNumber, mergePresets,
  normalizeConfig, parsePresetFile, safeFileName, validateConfig
} from './core.js';
import { STANDARD_FONTS, createNumberedPdf } from './pdf.js';
import './talonarios.css';

const PRESET_KEY = 'pdf-numerador-imprenta-presets-v1';
const CUSTOM_FONT_KEY = 'pdf-numerador-imprenta-fonts-v1';

const STEPS = [
  { id: 1, title: 'PDF y preset' },
  { id: 2, title: 'Numeración' },
  { id: 3, title: 'Ubicar y estilo' },
  { id: 4, title: 'Revisar y generar' }
];

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let index = 0; index < bytes.byteLength; index += 1) binary += String.fromCharCode(bytes[index]);
  return window.btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

function loadPresets() {
  try { return JSON.parse(localStorage.getItem(PRESET_KEY) || '[]'); } catch { return []; }
}

function savePresets(presets) {
  try { localStorage.setItem(PRESET_KEY, JSON.stringify(presets)); } catch {}
}

function loadCustomFonts() {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_FONT_KEY) || '[]').map((font) => ({
      id: font.id, name: font.name, bytes: base64ToArrayBuffer(font.base64)
    }));
  } catch {
    return [];
  }
}

function saveCustomFonts(fonts) {
  try {
    localStorage.setItem(CUSTOM_FONT_KEY, JSON.stringify(fonts.map((font) => ({
      id: font.id, name: font.name, base64: arrayBufferToBase64(font.bytes)
    }))));
  } catch {
    // Si no entra en el almacenamiento, la fuente queda disponible sólo en esta sesión.
  }
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Field({ label, error, warning, children, hint }) {
  return (
    <label className={`field ${error ? 'has-error' : ''}`}>
      <span className="field-label">{label}</span>
      {children}
      {error && <span className="field-error">{error}</span>}
      {!error && warning && <span className="field-warning">{warning}</span>}
      {!error && !warning && hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

function Toggle({ label, checked, onChange, disabled }) {
  return (
    <div className="toggle-row">
      <span>{label}</span>
      <label className="switch">
        <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} aria-label={label} />
        <span />
      </label>
    </div>
  );
}

function FieldMarker({ field, text, position, scale, pdfHeight, active, onPointerDown, onFocus, onNudge }) {
  const left = position.x * scale;
  const top = (pdfHeight - position.y) * scale;
  return (
    <button
      className={`marker ${active ? 'active' : ''}`}
      style={{ left, top, '--marker-color': FIELDS[field].color }}
      onPointerDown={onPointerDown}
      onFocus={onFocus}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 10 : 1;
        const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
        if (moves[event.key]) {
          event.preventDefault();
          onNudge(...moves[event.key]);
        }
      }}
      title={`${FIELDS[field].label}: arrastrá para mover o usá las flechas (Shift = 10 pt)`}
      aria-label={`Mover ${FIELDS[field].label}`}
      type="button"
    >
      <span>{text}</span>
    </button>
  );
}

function StyleFields({ field, config, fontOptions, updateConfig, errors }) {
  return (
    <div className="grid two">
      <Field label="Fuente">
        <select value={config.font} onChange={(event) => updateConfig(`${field}.font`, event.target.value)}>
          {fontOptions.map((font) => <option key={font.value} value={font.value}>{font.label}</option>)}
        </select>
      </Field>
      <Field label="Tamaño (pt)" error={errors[`${field}.size`]}>
        <input type="number" min="1" max="400" value={config.size} onChange={(event) => updateConfig(`${field}.size`, Number(event.target.value))} />
      </Field>
      <Field label="Color">
        <input type="color" value={config.color} onChange={(event) => updateConfig(`${field}.color`, event.target.value)} />
      </Field>
      <Field label="Alineación">
        <div className="align-buttons" role="radiogroup" aria-label="Alineación">
          {[['left', 'Izq.'], ['center', 'Centro'], ['right', 'Der.']].map(([value, label]) => (
            <button key={value} type="button" role="radio" aria-checked={config.align === value}
              className={config.align === value ? 'selected' : ''} onClick={() => updateConfig(`${field}.align`, value)}>
              {label}
            </button>
          ))}
        </div>
      </Field>
    </div>
  );
}

export default function TalonariosTool({ tool }) {
  const [step, setStep] = useState(1);
  const [config, setConfig] = useState(() => normalizeConfig(DEFAULT_CONFIG));
  const [pdfFileName, setPdfFileName] = useState('');
  const [pdfPages, setPdfPages] = useState(0);
  const [pdfBytes, setPdfBytes] = useState(null);
  const [pdfPageSize, setPdfPageSize] = useState({ width: 595, height: 842 });
  const [renderScale, setRenderScale] = useState(1);
  const [status, setStatus] = useState({ text: 'Esperando PDF limpio', tone: 'info' });
  const [activeField, setActiveField] = useState('number');
  const [draggingField, setDraggingField] = useState(null);
  const [customFonts, setCustomFonts] = useState(loadCustomFonts);
  const [presets, setPresets] = useState(loadPresets);
  const [selectedPreset, setSelectedPreset] = useState('');
  const [presetName, setPresetName] = useState('');
  const [previewUrls, setPreviewUrls] = useState([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  const canvasRef = useRef(null);
  const viewerRef = useRef(null);
  const renderTaskRef = useRef(null);
  const previewRef = useRef(null);

  const say = (text, tone = 'info') => setStatus({ text, tone });

  const fontOptions = useMemo(() => [
    ...STANDARD_FONTS.map(({ label, value }) => ({ label, value })),
    ...customFonts.map((font) => ({ label: font.name, value: font.id }))
  ], [customFonts]);

  const validation = useMemo(
    () => validateConfig(config, { pageSize: pdfBytes ? pdfPageSize : null }),
    [config, pdfBytes, pdfPageSize]
  );
  const errors = useMemo(() => Object.fromEntries(validation.errors.map((item) => [item.field, item.message])), [validation]);
  const warnings = useMemo(() => Object.fromEntries(validation.warnings.map((item) => [item.field, item.message])), [validation]);
  const stepHasError = (id) => validation.errors.some((item) => item.step === id);
  const pageCount = countPages(config);
  const fields = activeFields(config);

  const updateConfig = useCallback((path, value) => {
    setConfig((current) => {
      const next = normalizeConfig(current);
      const parts = path.split('.');
      let target = next;
      for (let index = 0; index < parts.length - 1; index += 1) target = target[parts[index]];
      target[parts[parts.length - 1]] = value;
      return next;
    });
    setPreviewUrls([]);
  }, []);

  // Si el campo activo deja de existir (p. ej. se apaga ORIGINAL/COPIA), elegimos otro.
  useEffect(() => {
    if (!fields.includes(activeField)) setActiveField('number');
  }, [fields, activeField]);

  const renderBasePdf = useCallback(async (bytes) => {
    if (!bytes || !canvasRef.current) return;
    const pdf = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
    setPdfPages(pdf.numPages);
    const page = await pdf.getPage(1);
    const natural = page.getViewport({ scale: 1 });
    const available = Math.min((viewerRef.current?.clientWidth || 760) - 44, 900);
    const scale = Math.min(available / natural.width, 1.7);
    const viewport = page.getViewport({ scale });
    const canvas = canvasRef.current;
    if (renderTaskRef.current) {
      try { renderTaskRef.current.cancel(); } catch {}
    }
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    renderTaskRef.current = page.render({ canvasContext: canvas.getContext('2d'), viewport });
    await renderTaskRef.current.promise;
    setPdfPageSize({ width: natural.width, height: natural.height });
    setRenderScale(scale);
  }, []);

  useEffect(() => {
    if (!pdfBytes) return undefined;
    const draw = () => renderBasePdf(pdfBytes).catch((error) => {
      if (error?.name !== 'RenderingCancelledException') say('No se pudo mostrar el PDF', 'error');
    });
    draw();
    window.addEventListener('resize', draw);
    return () => window.removeEventListener('resize', draw);
  }, [pdfBytes, renderBasePdf]);

  const setFieldFromViewerPoint = useCallback((event, fieldName) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(pdfPageSize.width, (event.clientX - rect.left) / renderScale));
    const y = Math.max(0, Math.min(pdfPageSize.height, pdfPageSize.height - ((event.clientY - rect.top) / renderScale)));
    updateConfig(`${fieldName}.x`, Number(x.toFixed(1)));
    updateConfig(`${fieldName}.y`, Number(y.toFixed(1)));
  }, [pdfPageSize, renderScale, updateConfig]);

  useEffect(() => {
    if (!draggingField) return undefined;
    const onPointerMove = (event) => setFieldFromViewerPoint(event, draggingField);
    const onPointerUp = () => setDraggingField(null);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [draggingField, setFieldFromViewerPoint]);

  const nudge = (field, dx, dy) => {
    const item = config[field];
    updateConfig(`${field}.x`, Number(Math.max(0, Math.min(pdfPageSize.width, item.x + dx)).toFixed(1)));
    updateConfig(`${field}.y`, Number(Math.max(0, Math.min(pdfPageSize.height, item.y + dy)).toFixed(1)));
  };

  const loadPdfFile = async (file) => {
    if (!file) return;
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
      say('El archivo tiene que ser un PDF', 'error');
      return;
    }
    try {
      const bytes = await readFileAsArrayBuffer(file);
      setPdfBytes(bytes);
      setPdfFileName(file.name);
      setPreviewUrls([]);
      if (config.fileName === DEFAULT_CONFIG.fileName) {
        updateConfig('fileName', file.name.replace(/\.pdf$/i, '') + '-numerado.pdf');
      }
      say('PDF cargado', 'success');
    } catch {
      say('No se pudo leer el PDF', 'error');
    }
  };

  const dropHandlers = {
    onDragOver: (event) => { event.preventDefault(); setDragOver(true); },
    onDragLeave: () => setDragOver(false),
    onDrop: (event) => {
      event.preventDefault();
      setDragOver(false);
      loadPdfFile(event.dataTransfer.files?.[0]);
    }
  };

  const handleFontUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!/\.(ttf|otf)$/i.test(file.name)) {
      say('La fuente debe ser .ttf o .otf', 'error');
      return;
    }
    const bytes = await readFileAsArrayBuffer(file);
    const id = `custom:${file.name}`;
    setCustomFonts((current) => {
      const next = [...current.filter((font) => font.id !== id), { id, name: file.name, bytes }];
      saveCustomFonts(next);
      return next;
    });
    updateConfig(`${activeField}.font`, id);
    say(`Fuente ${file.name} cargada`, 'success');
  };

  const renderPreviewCanvases = async (pdfData) => {
    const pdf = await pdfjsLib.getDocument({ data: pdfData.slice(0) }).promise;
    const urls = [];
    for (let index = 1; index <= pdf.numPages; index += 1) {
      const page = await pdf.getPage(index);
      const viewport = page.getViewport({ scale: 0.78 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      urls.push(canvas.toDataURL('image/png'));
    }
    setPreviewUrls(urls);
  };

  const requirePdf = () => {
    if (pdfBytes) return true;
    say('Primero cargá un PDF limpio', 'error');
    setStep(1);
    return false;
  };

  const handleQuickPreview = async () => {
    if (!requirePdf()) return;
    setBusy(true);
    try {
      const bytes = await createNumberedPdf(pdfBytes, config, customFonts, { previewOnly: true });
      await renderPreviewCanvases(bytes);
      say('Vista previa lista', 'success');
      setTimeout(() => previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    } catch (error) {
      say(error.message || 'Error al generar la vista previa', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleGenerate = async () => {
    if (!requirePdf()) return;
    if (!validation.valid) {
      say('Corregí los errores marcados antes de generar', 'error');
      setStep(validation.errors[0].step);
      return;
    }
    setBusy(true);
    setProgress({ done: 0, total: pageCount });
    try {
      const bytes = await createNumberedPdf(pdfBytes, config, customFonts, {
        onProgress: (done, total) => setProgress({ done, total })
      });
      downloadBlob(new Blob([bytes], { type: 'application/pdf' }), safeFileName(config.fileName));
      say(`PDF generado: ${pageCount} páginas`, 'success');
    } catch (error) {
      say(error.message || 'Error al generar el PDF', 'error');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const persistPresets = (next) => {
    setPresets(next);
    savePresets(next);
  };

  const saveCurrentPreset = () => {
    const name = presetName.trim();
    if (!name) {
      say('Escribí un nombre para el preset', 'error');
      return;
    }
    const exists = presets.some((preset) => preset.name === name);
    if (exists && !window.confirm(`Ya existe un preset llamado "${name}". ¿Reemplazarlo?`)) return;
    persistPresets(mergePresets(presets, [{ name, config: normalizeConfig(config) }]));
    setSelectedPreset(name);
    say(exists ? 'Preset actualizado' : 'Preset guardado', 'success');
  };

  const applyPreset = (name) => {
    setSelectedPreset(name);
    const preset = presets.find((item) => item.name === name);
    if (!preset) return;
    setConfig(normalizeConfig(preset.config));
    setPresetName(name);
    setPreviewUrls([]);
    say(`Preset "${name}" aplicado`, 'success');
  };

  const deleteSelectedPreset = () => {
    if (!selectedPreset || !window.confirm(`¿Eliminar el preset "${selectedPreset}"?`)) return;
    persistPresets(presets.filter((item) => item.name !== selectedPreset));
    setSelectedPreset('');
    say('Preset eliminado');
  };

  const handleExportPresets = () => {
    if (!presets.length) {
      say('No hay presets para exportar', 'error');
      return;
    }
    downloadBlob(new Blob([exportPresets(presets)], { type: 'application/json' }), 'presets-talonarios.json');
    say(`${presets.length} presets exportados`, 'success');
  };

  const handleImportPresets = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const incoming = parsePresetFile(await file.text());
      persistPresets(mergePresets(presets, incoming));
      say(`${incoming.length} presets importados`, 'success');
    } catch (error) {
      say(error.message, 'error');
    }
  };

  const markerText = (field) => {
    if (field === 'badge') return config.originalText || 'ORIGINAL';
    return formatNumber(config, Number(config.startNumber) || 0);
  };

  const issues = [...validation.errors.map((item) => ({ ...item, tone: 'error' })), ...validation.warnings.map((item) => ({ ...item, tone: 'warning' }))];

  return (
    <>
      <ToolHeader tool={tool}>
        <div className={`status-pill tone-${status.tone}`} role="status">
          {progress ? `Generando… ${progress.done} de ${progress.total}` : status.text}
        </div>
      </ToolHeader>

      <section className="workspace">
        <aside className="control-panel">
          <ol className="stepper">
            {STEPS.map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => setStep(item.id)}
                  className={`${step === item.id ? 'current' : ''} ${stepHasError(item.id) ? 'invalid' : ''} ${item.id === 1 && pdfBytes ? 'done' : ''}`}
                  aria-current={step === item.id ? 'step' : undefined}
                  aria-label={`Paso ${item.id}: ${item.title}${stepHasError(item.id) ? ' (con errores)' : ''}`}>
                  <span className="step-number">{item.id}</span>
                  <span className="step-title">{item.title}</span>
                </button>
              </li>
            ))}
          </ol>

          {step === 1 && (
            <section className="panel-section">
              <h2>Cargá el PDF base</h2>
              <label className={`file-drop big ${dragOver ? 'dragging' : ''} ${pdfBytes ? 'loaded' : ''}`} {...dropHandlers}>
                <input type="file" accept="application/pdf,.pdf" onChange={(event) => { loadPdfFile(event.target.files?.[0]); event.target.value = ''; }} />
                <span>{pdfBytes ? 'Cambiar PDF' : 'Elegí o arrastrá un PDF'}</span>
                <small>{pdfFileName || 'Usá una plantilla limpia: sin números ni leyendas ORIGINAL/COPIA.'}</small>
                {pdfBytes && (
                  <small className="file-meta">
                    {Math.round(pdfPageSize.width)} × {Math.round(pdfPageSize.height)} pt
                    {pdfPages > 1 ? ` · tiene ${pdfPages} páginas, se usa sólo la primera` : ''}
                  </small>
                )}
              </label>

              <h3>¿Es un trabajo que ya hiciste?</h3>
              <Field label="Aplicar un preset guardado" hint={presets.length ? 'Carga numeración, textos, posiciones y estilos.' : 'Todavía no guardaste presets. Lo podés hacer en el paso 4.'}>
                <select value={selectedPreset} onChange={(event) => applyPreset(event.target.value)} disabled={!presets.length}>
                  <option value="">{presets.length ? 'Elegir preset…' : 'Sin presets'}</option>
                  {presets.map((preset) => <option key={preset.name} value={preset.name}>{preset.name}</option>)}
                </select>
              </Field>
              <div className="preset-tools">
                <label className="button-like secondary">
                  <input type="file" accept=".json,application/json" onChange={handleImportPresets} />
                  Importar
                </label>
                <button type="button" className="secondary" onClick={handleExportPresets} disabled={!presets.length}>Exportar</button>
                <button type="button" className="ghost danger" onClick={deleteSelectedPreset} disabled={!selectedPreset}>Eliminar</button>
              </div>
            </section>
          )}

          {step === 2 && (
            <section className="panel-section">
              <h2>Numeración</h2>
              <Toggle label="Generar ORIGINAL y COPIA" checked={config.duplicate} onChange={(value) => updateConfig('duplicate', value)} />
              <div className="grid two">
                <Field label="Número inicial" error={errors.startNumber}>
                  <input type="number" min="0" step="1" value={config.startNumber} aria-invalid={Boolean(errors.startNumber)}
                    onChange={(event) => updateConfig('startNumber', event.target.value === '' ? '' : Number(event.target.value))} />
                </Field>
                <Field label="Número final" error={errors.endNumber} warning={warnings.endNumber}>
                  <input type="number" min="0" step="1" value={config.endNumber} aria-invalid={Boolean(errors.endNumber)}
                    onChange={(event) => updateConfig('endNumber', event.target.value === '' ? '' : Number(event.target.value))} />
                </Field>
                <Field label="Texto previo" hint="Ej.: N°">
                  <input value={config.numberPrefixText} onChange={(event) => updateConfig('numberPrefixText', event.target.value)} />
                </Field>
                <Field label="Prefijo" hint="Ej.: punto de venta 10-">
                  <input value={config.numberPrefix} onChange={(event) => updateConfig('numberPrefix', event.target.value)} />
                </Field>
                <Field label="Dígitos" error={errors.digits} warning={warnings.digits} hint="Completa con ceros a la izquierda.">
                  <input type="number" min="0" max="20" value={config.digits} aria-invalid={Boolean(errors.digits)}
                    onChange={(event) => updateConfig('digits', Number(event.target.value))} />
                </Field>
              </div>
              {config.duplicate && (
                <div className="grid two spaced">
                  <Field label="Texto del original" error={errors.originalText}>
                    <input value={config.originalText} onChange={(event) => updateConfig('originalText', event.target.value)} />
                  </Field>
                  <Field label="Texto de la copia" error={errors.copyText}>
                    <input value={config.copyText} onChange={(event) => updateConfig('copyText', event.target.value)} />
                  </Field>
                </div>
              )}
              <div className="number-sample">
                <span>Así queda</span>
                <strong>{formatNumber(config, Number(config.startNumber) || 0)}</strong>
                {Number(config.endNumber) > Number(config.startNumber) && <><span>hasta</span><strong>{formatNumber(config, Number(config.endNumber) || 0)}</strong></>}
                <em>{pageCount} páginas{config.duplicate ? ' (original + copia)' : ''}</em>
              </div>
            </section>
          )}

          {step === 3 && (
            <section className="panel-section">
              <h2>Ubicar y dar estilo</h2>
              <p className="panel-help">Elegí un campo y hacé clic en el PDF para ubicarlo. También podés arrastrar el marcador o moverlo con las flechas del teclado.</p>
              <div className="segmented">
                {['badge', 'number', 'number2'].map((field) => (
                  <button key={field} type="button" className={activeField === field ? 'selected' : ''}
                    disabled={!fields.includes(field)} onClick={() => setActiveField(field)}
                    style={{ '--marker-color': FIELDS[field].color }}>
                    <i className="dot" /> {FIELDS[field].label}
                  </button>
                ))}
              </div>
              <Toggle label="Repetir el número en otro lugar (Numeración 2)" checked={config.secondNumberEnabled}
                onChange={(value) => { updateConfig('secondNumberEnabled', value); if (value) setActiveField('number2'); }} />

              <h3>Posición de {FIELDS[activeField].label} (pt desde abajo a la izquierda)</h3>
              <div className="grid two">
                <Field label="X" warning={warnings[`${activeField}.x`]}>
                  <input type="number" step="0.5" value={config[activeField].x} onChange={(event) => updateConfig(`${activeField}.x`, Number(event.target.value))} />
                </Field>
                <Field label="Y">
                  <input type="number" step="0.5" value={config[activeField].y} onChange={(event) => updateConfig(`${activeField}.y`, Number(event.target.value))} />
                </Field>
              </div>

              <h3>Estilo de {FIELDS[activeField].label}</h3>
              <StyleFields field={activeField} config={config[activeField]} fontOptions={fontOptions} updateConfig={updateConfig} errors={errors} />
              <label className="file-inline">
                <input type="file" accept=".ttf,.otf,font/ttf,font/otf" onChange={handleFontUpload} />
                <span>Subir otra fuente (.ttf / .otf)</span>
              </label>
            </section>
          )}

          {step === 4 && (
            <section className="panel-section">
              <h2>Revisar y generar</h2>
              <dl className="summary">
                <div><dt>PDF base</dt><dd>{pdfFileName || <span className="missing">Falta cargar</span>}</dd></div>
                <div><dt>Rango</dt><dd>{config.startNumber} a {config.endNumber}</dd></div>
                <div><dt>Páginas</dt><dd>{pageCount}{config.duplicate ? ' (original + copia)' : ''}</dd></div>
                <div><dt>Campos</dt><dd>{fields.map((field) => FIELDS[field].label).join(', ')}</dd></div>
              </dl>

              {issues.length > 0 && (
                <ul className="issues">
                  {issues.map((item) => (
                    <li key={`${item.field}-${item.message}`} className={item.tone}>
                      <span>{item.message}</span>
                      <button type="button" className="link-button" onClick={() => setStep(item.step)}>Ir al paso {item.step}</button>
                    </li>
                  ))}
                </ul>
              )}

              <Field label="Nombre del archivo" error={errors.fileName}>
                <input value={config.fileName} onChange={(event) => updateConfig('fileName', event.target.value)} />
              </Field>
              <div className="actions">
                <button type="button" className="secondary" onClick={handleQuickPreview} disabled={busy || !pdfBytes}>Vista previa</button>
                <button type="button" className="primary" onClick={handleGenerate} disabled={busy || !pdfBytes || !validation.valid}>
                  {busy && progress ? 'Generando…' : 'Generar PDF'}
                </button>
              </div>
              {progress && (
                <progress className="progress" max={progress.total} value={progress.done} aria-label="Progreso de generación" />
              )}

              <h3>Guardar como preset</h3>
              <div className="preset-row">
                <input placeholder="Ej.: Talonario Kiosco Juan" value={presetName} onChange={(event) => setPresetName(event.target.value)} aria-label="Nombre del preset" />
                <button type="button" onClick={saveCurrentPreset}>Guardar</button>
              </div>
            </section>
          )}

          <div className="step-nav">
            <button type="button" className="ghost" onClick={() => setStep(step - 1)} disabled={step === 1}>Anterior</button>
            {step < 4 && (
              <button type="button" className="primary" onClick={() => setStep(step + 1)} disabled={step === 1 && !pdfBytes}>
                Siguiente
              </button>
            )}
          </div>
        </aside>

        <section className="viewer-panel">
          <div className="viewer-header">
            <div>
              <h2>Vista y ubicación</h2>
              <p>{pdfBytes ? `Clic en el PDF para ubicar ${FIELDS[activeField].label}.` : 'Cargá un PDF para ubicar los campos.'}</p>
            </div>
            {pdfBytes && <div className="pdf-size">{Math.round(pdfPageSize.width)} × {Math.round(pdfPageSize.height)} pt</div>}
          </div>
          <div className={`canvas-wrap ${dragOver ? 'dragging' : ''}`} ref={viewerRef} {...dropHandlers}>
            {!pdfBytes && (
              <label className="empty-state">
                <input type="file" accept="application/pdf,.pdf" hidden onChange={(event) => { loadPdfFile(event.target.files?.[0]); event.target.value = ''; }} />
                <strong>Arrastrá tu PDF acá</strong>
                <span>o hacé clic para elegirlo</span>
              </label>
            )}
            <div className="canvas-stage" style={pdfBytes ? { width: pdfPageSize.width * renderScale, height: pdfPageSize.height * renderScale } : undefined}>
              <canvas ref={canvasRef} hidden={!pdfBytes}
                onClick={(event) => { setFieldFromViewerPoint(event, activeField); if (step < 3) setStep(3); }} />
              {pdfBytes && fields.map((field) => (
                <FieldMarker
                  key={field}
                  field={field}
                  text={markerText(field)}
                  position={config[field]}
                  scale={renderScale}
                  pdfHeight={pdfPageSize.height}
                  active={activeField === field}
                  onFocus={() => setActiveField(field)}
                  onNudge={(dx, dy) => nudge(field, dx, dy)}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.currentTarget.focus();
                    setActiveField(field);
                    setDraggingField(field);
                  }}
                />
              ))}
            </div>
          </div>

          <div className="preview-area" ref={previewRef}>
            <div className="viewer-header compact">
              <div>
                <h2>Vista previa</h2>
                <p>{config.duplicate ? 'Primer número en ORIGINAL y COPIA, tal como sale en el PDF.' : 'Primer número, tal como sale en el PDF.'}</p>
              </div>
              <button type="button" className="secondary" onClick={handleQuickPreview} disabled={busy || !pdfBytes}>Actualizar</button>
            </div>
            <div className="preview-grid">
              {previewUrls.length === 0 && <div className="empty-preview">Tocá “Actualizar” para ver el resultado real con fuente y color.</div>}
              {previewUrls.map((url, index) => (
                <figure key={url}>
                  <img src={url} alt={`Vista previa página ${index + 1}`} />
                  <figcaption>{config.duplicate ? (index === 0 ? config.originalText : config.copyText) : 'Numeración'}</figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
      </section>
    </>
  );
}
