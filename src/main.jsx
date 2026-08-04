import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import './styles.css';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const PRESET_KEY = 'pdf-numerador-imprenta-presets-v1';
const CUSTOM_FONT_KEY = 'pdf-numerador-imprenta-fonts-v1';
const STANDARD_FONTS = [
  { label: 'Helvetica', value: 'Helvetica', pdf: StandardFonts.Helvetica },
  { label: 'Times Roman', value: 'TimesRoman', pdf: StandardFonts.TimesRoman },
  { label: 'Courier', value: 'Courier', pdf: StandardFonts.Courier }
];

const DEFAULT_CONFIG = {
  duplicate: true,
  fileName: 'pdf-numerado.pdf',
  numberPrefixText: 'N° ',
  numberPrefix: '10-',
  startNumber: 1000,
  endNumber: 1002,
  digits: 7,
  originalText: 'ORIGINAL',
  copyText: 'COPIA',
  badge: {
    x: 56,
    y: 780,
    size: 12,
    font: 'Helvetica',
    color: '#111827',
    align: 'left'
  },
  number: {
    x: 56,
    y: 742,
    size: 12,
    font: 'Helvetica',
    color: '#111827',
    align: 'left'
  },
  secondNumberEnabled: false,
  number2: {
    x: 420,
    y: 742,
    size: 12,
    font: 'Helvetica',
    color: '#111827',
    align: 'left'
  }
};

function cloneConfig(config) {
  return JSON.parse(JSON.stringify(config));
}

function normalizeConfig(config) {
  const base = cloneConfig(DEFAULT_CONFIG);
  const incoming = cloneConfig(config || {});
  return {
    ...base,
    ...incoming,
    badge: { ...base.badge, ...(incoming.badge || {}) },
    number: { ...base.number, ...(incoming.number || {}) },
    number2: { ...base.number2, ...(incoming.number2 || {}) },
    secondNumberEnabled: Boolean(incoming.secondNumberEnabled)
  };
}

function hexToRgb(hex) {
  const clean = hex.replace('#', '').trim();
  const value = clean.length === 3
    ? clean.split('').map((char) => char + char).join('')
    : clean.padEnd(6, '0').slice(0, 6);
  const int = Number.parseInt(value, 16);
  return rgb(((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255);
}

function formatNumber(config, value) {
  return `${config.numberPrefixText}${config.numberPrefix}${String(value).padStart(Number(config.digits) || 0, '0')}`;
}

function safeFileName(name) {
  const trimmed = name.trim() || 'pdf-numerado.pdf';
  return trimmed.toLowerCase().endsWith('.pdf') ? trimmed : `${trimmed}.pdf`;
}

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
  for (let index = 0; index < bytes.byteLength; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return window.btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function loadPresets() {
  try {
    return JSON.parse(localStorage.getItem(PRESET_KEY) || '[]');
  } catch {
    return [];
  }
}

function savePresets(presets) {
  localStorage.setItem(PRESET_KEY, JSON.stringify(presets));
}

function loadCustomFonts() {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_FONT_KEY) || '[]').map((font) => ({
      id: font.id,
      name: font.name,
      bytes: base64ToArrayBuffer(font.base64)
    }));
  } catch {
    return [];
  }
}

function saveCustomFonts(fonts) {
  const serializable = fonts.map((font) => ({
    id: font.id,
    name: font.name,
    base64: arrayBufferToBase64(font.bytes)
  }));
  localStorage.setItem(CUSTOM_FONT_KEY, JSON.stringify(serializable));
}

async function embedSelectedFont(pdfDoc, fontName, customFonts) {
  const standard = STANDARD_FONTS.find((item) => item.value === fontName);
  if (standard) return pdfDoc.embedFont(standard.pdf);
  const custom = customFonts.find((item) => item.id === fontName);
  if (!custom) return pdfDoc.embedFont(StandardFonts.Helvetica);
  return pdfDoc.embedFont(custom.bytes);
}

function drawAlignedText(page, text, field, font) {
  const size = Number(field.size) || 12;
  const width = font.widthOfTextAtSize(text, size);
  let x = Number(field.x) || 0;
  if (field.align === 'center') x -= width / 2;
  if (field.align === 'right') x -= width;

  page.drawText(text, {
    x,
    y: Number(field.y) || 0,
    size,
    font,
    color: hexToRgb(field.color || '#111827')
  });
}

async function createNumberedPdf(basePdfBytes, config, customFonts, previewOnly = false) {
  const basePdf = await PDFDocument.load(basePdfBytes);
  const outputPdf = await PDFDocument.create();
  outputPdf.registerFontkit(fontkit);

  const badgeFont = await embedSelectedFont(outputPdf, config.badge.font, customFonts);
  const numberFont = await embedSelectedFont(outputPdf, config.number.font, customFonts);
  const number2Font = config.secondNumberEnabled
    ? await embedSelectedFont(outputPdf, config.number2.font, customFonts)
    : null;
  const firstPageIndex = 0;
  const start = Number(config.startNumber);
  const end = previewOnly ? start : Number(config.endNumber);

  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
    throw new Error('El rango de numeración no es válido.');
  }

  for (let current = start; current <= end; current += 1) {
    const numberText = formatNumber(config, current);
    const labels = config.duplicate ? [config.originalText, config.copyText] : [null];

    for (const label of labels) {
      const [page] = await outputPdf.copyPages(basePdf, [firstPageIndex]);
      outputPdf.addPage(page);
      if (label) drawAlignedText(page, label, config.badge, badgeFont);
      drawAlignedText(page, numberText, config.number, numberFont);
      if (config.secondNumberEnabled) drawAlignedText(page, numberText, config.number2, number2Font);
    }
  }

  return outputPdf.save();
}

function FieldMarker({ label, color, position, scale, pdfHeight, active, onPointerDown }) {
  const left = position.x * scale;
  const top = (pdfHeight - position.y) * scale;

  return (
    <button
      className={`marker ${active ? 'active' : ''}`}
      style={{ left, top, '--marker-color': color }}
      onPointerDown={onPointerDown}
      title={`Mover campo ${label}`}
      type="button"
    >
      <span>{label}</span>
    </button>
  );
}

function TalonariosTool({ mode = 'generator', onGoHome }) {
  const [config, setConfig] = useState(() => normalizeConfig(DEFAULT_CONFIG));
  const [pdfFileName, setPdfFileName] = useState('');
  const [pdfBytes, setPdfBytes] = useState(null);
  const [pdfPageSize, setPdfPageSize] = useState({ width: 595, height: 842 });
  const [renderScale, setRenderScale] = useState(1);
  const [status, setStatus] = useState('Esperando PDF limpio');
  const [activeField, setActiveField] = useState('number');
  const [draggingField, setDraggingField] = useState(null);
  const [customFonts, setCustomFonts] = useState(loadCustomFonts);
  const [presets, setPresets] = useState(loadPresets);
  const [selectedPreset, setSelectedPreset] = useState('');
  const [presetName, setPresetName] = useState('');
  const [previewUrls, setPreviewUrls] = useState([]);

  const canvasRef = useRef(null);
  const viewerRef = useRef(null);
  const renderTaskRef = useRef(null);

  const fontOptions = useMemo(() => [
    ...STANDARD_FONTS.map(({ label, value }) => ({ label, value })),
    ...customFonts.map((font) => ({ label: font.name, value: font.id }))
  ], [customFonts]);

  const updateConfig = useCallback((path, value) => {
    setConfig((current) => {
      const next = normalizeConfig(current);
      const parts = path.split('.');
      let target = next;
      for (let index = 0; index < parts.length - 1; index += 1) {
        if (!target[parts[index]]) target[parts[index]] = {};
        target = target[parts[index]];
      }
      target[parts[parts.length - 1]] = value;
      return next;
    });
  }, []);

  const toggleSecondNumber = useCallback((enabled) => {
    setConfig((current) => ({ ...normalizeConfig(current), secondNumberEnabled: enabled }));
    if (!enabled && activeField === 'number2') setActiveField('number');
  }, [activeField]);

  const renderBasePdf = useCallback(async (bytes) => {
    if (!bytes || !canvasRef.current) return;
    const loadingTask = pdfjsLib.getDocument({ data: bytes.slice(0) });
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(1);
    const natural = page.getViewport({ scale: 1 });
    const available = Math.min(viewerRef.current?.clientWidth || 760, 900);
    const scale = Math.min(available / natural.width, 1.7);
    const viewport = page.getViewport({ scale });
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (renderTaskRef.current) {
      try { renderTaskRef.current.cancel(); } catch {}
    }

    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    context.clearRect(0, 0, canvas.width, canvas.height);

    renderTaskRef.current = page.render({ canvasContext: context, viewport });
    await renderTaskRef.current.promise;
    setPdfPageSize({ width: natural.width, height: natural.height });
    setRenderScale(scale);
  }, []);

  useEffect(() => {
    if (pdfBytes) renderBasePdf(pdfBytes).catch(() => setStatus('Error al visualizar el PDF'));
  }, [pdfBytes, renderBasePdf]);

  useEffect(() => {
    const onResize = () => {
      if (pdfBytes) renderBasePdf(pdfBytes).catch(() => setStatus('Error al visualizar el PDF'));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [pdfBytes, renderBasePdf]);

  const setFieldFromViewerPoint = useCallback((event, fieldName) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(pdfPageSize.width, (event.clientX - rect.left) / renderScale));
    const y = Math.max(0, Math.min(pdfPageSize.height, pdfPageSize.height - ((event.clientY - rect.top) / renderScale)));
    updateConfig(`${fieldName}.x`, Number(x.toFixed(2)));
    updateConfig(`${fieldName}.y`, Number(y.toFixed(2)));
  }, [pdfPageSize, renderScale, updateConfig]);

  useEffect(() => {
    const onPointerMove = (event) => {
      if (draggingField) setFieldFromViewerPoint(event, draggingField);
    };
    const onPointerUp = () => setDraggingField(null);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [draggingField, setFieldFromViewerPoint]);

  const handlePdfUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const bytes = await readFileAsArrayBuffer(file);
      setPdfBytes(bytes);
      setPdfFileName(file.name);
      setStatus('PDF cargado');
      setPreviewUrls([]);
    } catch {
      setStatus('Error al cargar PDF');
    }
  };

  const handleFontUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const extensionOk = /\.(ttf|otf)$/i.test(file.name);
    if (!extensionOk) {
      setStatus('La fuente debe ser .ttf o .otf');
      return;
    }
    const bytes = await readFileAsArrayBuffer(file);
    const id = `custom:${file.name}`;
    setCustomFonts((current) => {
      const next = [...current.filter((font) => font.id !== id), { id, name: file.name, bytes }];
      saveCustomFonts(next);
      return next;
    });
    setStatus('Fuente personalizada cargada');
  };

  const renderPreviewCanvases = async (pdfData) => {
    const loadingTask = pdfjsLib.getDocument({ data: pdfData.slice(0) });
    const pdf = await loadingTask.promise;
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

  const handleQuickPreview = async () => {
    if (!pdfBytes) {
      setStatus('Primero cargá un PDF limpio');
      return;
    }
    try {
      const previewConfig = { ...normalizeConfig(config), endNumber: config.startNumber };
      const bytes = await createNumberedPdf(pdfBytes, previewConfig, customFonts, true);
      await renderPreviewCanvases(bytes);
      setStatus('Vista previa generada');
    } catch (error) {
      setStatus(error.message || 'Error al generar vista previa');
    }
  };

  const handleGenerate = async () => {
    if (!pdfBytes) {
      setStatus('Primero cargá un PDF limpio');
      return;
    }
    try {
      setStatus('Generando PDF...');
      const bytes = await createNumberedPdf(pdfBytes, config, customFonts, false);
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = safeFileName(config.fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setStatus('PDF generado correctamente');
    } catch (error) {
      setStatus(error.message || 'Error al generar PDF');
    }
  };

  const saveCurrentPreset = () => {
    const name = presetName.trim();
    if (!name) {
      setStatus('Ingresá un nombre para el preset');
      return;
    }
    const withoutSame = presets.filter((preset) => preset.name !== name);
    const next = [...withoutSame, { name, config: normalizeConfig(config) }].sort((a, b) => a.name.localeCompare(b.name));
    setPresets(next);
    savePresets(next);
    setSelectedPreset(name);
    setStatus('Preset guardado');
  };

  const loadSelectedPreset = () => {
    const preset = presets.find((item) => item.name === selectedPreset);
    if (!preset) return;
    setConfig(normalizeConfig(preset.config));
    setStatus('Preset cargado');
  };

  const deleteSelectedPreset = () => {
    const next = presets.filter((item) => item.name !== selectedPreset);
    setPresets(next);
    savePresets(next);
    setSelectedPreset('');
    setStatus('Preset eliminado');
  };

  const pageCount = useMemo(() => {
    const start = Number(config.startNumber);
    const end = Number(config.endNumber);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) return 0;
    return (end - start + 1) * (config.duplicate ? 2 : 1);
  }, [config.startNumber, config.endNumber, config.duplicate]);

  return (
    <>
      <div className="tool-heading">
        <div>
          <p className="eyebrow">Herramienta local para imprenta</p>
          <h1>{mode === 'presets' ? 'Presets de talonarios' : 'Generadora de talonarios'}</h1>
          <p className="tool-subtitle">
            {mode === 'presets'
              ? 'Guardar y reutilizar configuraciones de numeracion, textos, posicion y estilos.'
              : 'Numerador PDF ORIGINAL/COPIA para plantillas limpias.'}
          </p>
        </div>
        <div className="tool-actions">
          <button type="button" className="home-link" onClick={onGoHome}>Volver al inicio</button>
          <div className="status-pill">{status}</div>
        </div>
      </div>
      <section className="workspace">
        <aside className="control-panel">
          <section className="panel-section">
            <h2>Cargar PDF</h2>
            <label className="file-drop">
              <input type="file" accept="application/pdf,.pdf" onChange={handlePdfUpload} />
              <span>Seleccionar PDF limpio</span>
              <small>{pdfFileName || 'Sin datos variables ni leyendas'}</small>
            </label>
          </section>

          <section className="panel-section">
            <h2>Configuración de numeración</h2>
            <div className="toggle-row">
              <span>Generar duplicado ORIGINAL/COPIA</span>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={config.duplicate}
                  onChange={(event) => updateConfig('duplicate', event.target.checked)}
                />
                <span />
              </label>
            </div>
            <div className="grid two">
              <label>Texto previo<input value={config.numberPrefixText} onChange={(event) => updateConfig('numberPrefixText', event.target.value)} /></label>
              <label>Prefijo<input value={config.numberPrefix} onChange={(event) => updateConfig('numberPrefix', event.target.value)} /></label>
              <label>Número inicial<input type="number" value={config.startNumber} onChange={(event) => updateConfig('startNumber', Number(event.target.value))} /></label>
              <label>Número final<input type="number" value={config.endNumber} onChange={(event) => updateConfig('endNumber', Number(event.target.value))} /></label>
              <label>Dígitos<input type="number" min="0" value={config.digits} onChange={(event) => updateConfig('digits', Number(event.target.value))} /></label>
              <label>Páginas finales<input readOnly value={pageCount} /></label>
            </div>
          </section>

          <section className="panel-section">
            <h2>ORIGINAL/COPIA</h2>
            <div className="grid two">
              <label>Texto original<input value={config.originalText} onChange={(event) => updateConfig('originalText', event.target.value)} /></label>
              <label>Texto copia<input value={config.copyText} onChange={(event) => updateConfig('copyText', event.target.value)} /></label>
            </div>
          </section>

          <section className="panel-section">
            <h2>Posiciones visuales</h2>
            <div className="segmented">
              <button type="button" className={activeField === 'badge' ? 'selected' : ''} onClick={() => setActiveField('badge')}>ORIGINAL/COPIA</button>
              <button type="button" className={activeField === 'number' ? 'selected' : ''} onClick={() => setActiveField('number')}>Numeración</button>
              <button type="button" className={activeField === 'number2' ? 'selected' : ''} onClick={() => setActiveField('number2')} disabled={!config.secondNumberEnabled}>Numeracion 2</button>
            </div>
            <div className="toggle-row compact-toggle">
              <span>Segunda etiqueta de numero</span>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={config.secondNumberEnabled}
                  onChange={(event) => toggleSecondNumber(event.target.checked)}
                />
                <span />
              </label>
            </div>
            <div className="grid two">
              <label>Insignia X<input type="number" step="0.1" value={config.badge.x} onChange={(event) => updateConfig('badge.x', Number(event.target.value))} /></label>
              <label>Insignia Y<input type="number" step="0.1" value={config.badge.y} onChange={(event) => updateConfig('badge.y', Number(event.target.value))} /></label>
              <label>Número X<input type="number" step="0.1" value={config.number.x} onChange={(event) => updateConfig('number.x', Number(event.target.value))} /></label>
              <label>Número Y<input type="number" step="0.1" value={config.number.y} onChange={(event) => updateConfig('number.y', Number(event.target.value))} /></label>
              {config.secondNumberEnabled && (
                <>
                  <label>Número 2 X<input type="number" step="0.1" value={config.number2.x} onChange={(event) => updateConfig('number2.x', Number(event.target.value))} /></label>
                  <label>Número 2 Y<input type="number" step="0.1" value={config.number2.y} onChange={(event) => updateConfig('number2.y', Number(event.target.value))} /></label>
                </>
              )}
            </div>
          </section>

          <section className="panel-section">
            <h2>Fuentes y estilo</h2>
            <label className="file-inline">
              <input type="file" accept=".ttf,.otf,font/ttf,font/otf" onChange={handleFontUpload} />
              <span>Subir fuente .ttf/.otf</span>
            </label>
            <StyleFields title="Insignia" field="badge" config={config.badge} fontOptions={fontOptions} updateConfig={updateConfig} />
            <StyleFields title="Numeración" field="number" config={config.number} fontOptions={fontOptions} updateConfig={updateConfig} />
            {config.secondNumberEnabled && (
              <StyleFields title="Numeracion 2" field="number2" config={config.number2} fontOptions={fontOptions} updateConfig={updateConfig} />
            )}
          </section>

          <section className="panel-section">
            <h2>Presets</h2>
            <div className="preset-row">
              <input placeholder="Nombre del preset" value={presetName} onChange={(event) => setPresetName(event.target.value)} />
              <button type="button" onClick={saveCurrentPreset}>Guardar</button>
            </div>
            <div className="preset-row">
              <select value={selectedPreset} onChange={(event) => setSelectedPreset(event.target.value)}>
                <option value="">Elegir preset</option>
                {presets.map((preset) => <option key={preset.name} value={preset.name}>{preset.name}</option>)}
              </select>
              <button type="button" onClick={loadSelectedPreset} disabled={!selectedPreset}>Cargar</button>
              <button type="button" className="ghost danger" onClick={deleteSelectedPreset} disabled={!selectedPreset}>Eliminar</button>
            </div>
          </section>

          <section className="panel-section">
            <h2>Generar</h2>
            <label>Nombre de archivo<input value={config.fileName} onChange={(event) => updateConfig('fileName', event.target.value)} /></label>
            <div className="actions">
              <button type="button" className="secondary" onClick={handleQuickPreview}>Vista previa rápida</button>
              <button type="button" className="primary" onClick={handleGenerate}>Generar PDF final</button>
            </div>
          </section>
        </aside>

        <section className="viewer-panel">
          <div className="viewer-header">
            <div>
              <h2>Vista y ubicación</h2>
              <p>Click en el PDF para ubicar el campo activo. Arrastrá los marcadores para ajustar.</p>
            </div>
            <div className="pdf-size">{Math.round(pdfPageSize.width)} x {Math.round(pdfPageSize.height)} pt</div>
          </div>
          <div className="canvas-wrap" ref={viewerRef}>
            {!pdfBytes && <div className="empty-state">Subí un PDF limpio para ver la primera página.</div>}
            <div className="canvas-stage" style={{ width: pdfPageSize.width * renderScale, height: pdfPageSize.height * renderScale }}>
              <canvas
                ref={canvasRef}
                onClick={(event) => setFieldFromViewerPoint(event, activeField)}
              />
              {pdfBytes && (
                <>
                  <FieldMarker
                    label="ORIGINAL/COPIA"
                    color="#1e61a8"
                    position={config.badge}
                    scale={renderScale}
                    pdfHeight={pdfPageSize.height}
                    active={activeField === 'badge'}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      setActiveField('badge');
                      setDraggingField('badge');
                    }}
                  />
                  <FieldMarker
                    label="N°"
                    color="#312783"
                    position={config.number}
                    scale={renderScale}
                    pdfHeight={pdfPageSize.height}
                    active={activeField === 'number'}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      setActiveField('number');
                      setDraggingField('number');
                    }}
                  />
                  {config.secondNumberEnabled && (
                    <FieldMarker
                      label="N° 2"
                      color="#7c3aed"
                      position={config.number2}
                      scale={renderScale}
                      pdfHeight={pdfPageSize.height}
                      active={activeField === 'number2'}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        setActiveField('number2');
                        setDraggingField('number2');
                      }}
                    />
                  )}
                </>
              )}
            </div>
          </div>

          <div className="preview-area">
            <div className="viewer-header compact">
              <div>
                <h2>Vista previa rápida</h2>
                <p>{config.duplicate ? 'Primer número en ORIGINAL y COPIA.' : 'Primer número en una sola página.'}</p>
              </div>
              <strong>{formatNumber(config, Number(config.startNumber) || 0)}</strong>
            </div>
            <div className="preview-grid">
              {previewUrls.length === 0 && <div className="empty-preview">Generá una vista previa para validar posición, fuente y color.</div>}
              {previewUrls.map((url, index) => (
                <figure key={url}>
                  <img src={url} alt={`Vista previa página ${index + 1}`} />
                  <figcaption>{config.duplicate ? (index === 0 ? 'ORIGINAL' : 'COPIA') : 'Numeración'}</figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
      </section>
    </>
  );
}

function StyleFields({ title, field, config, fontOptions, updateConfig }) {
  return (
    <div className="style-group">
      <h3>{title}</h3>
      <div className="grid two">
        <label>Fuente
          <select value={config.font} onChange={(event) => updateConfig(`${field}.font`, event.target.value)}>
            {fontOptions.map((font) => <option key={font.value} value={font.value}>{font.label}</option>)}
          </select>
        </label>
        <label>Tamaño<input type="number" min="1" value={config.size} onChange={(event) => updateConfig(`${field}.size`, Number(event.target.value))} /></label>
        <label>Color<input type="color" value={config.color} onChange={(event) => updateConfig(`${field}.color`, event.target.value)} /></label>
        <label>Alineación
          <select value={config.align} onChange={(event) => updateConfig(`${field}.align`, event.target.value)}>
            <option value="left">Izquierda</option>
            <option value="center">Centro</option>
            <option value="right">Derecha</option>
          </select>
        </label>
      </div>
    </div>
  );
}

function PresupuestosTool({ onGoHome }) {
  return (
    <section className="budget-shell">
      <div className="tool-heading">
        <div>
          <p className="eyebrow">Herramienta comercial</p>
          <h1>Calculadora de presupuestos</h1>
          <p className="tool-subtitle">Fotocopias, impresiones, papeles especiales y anillados.</p>
        </div>
        <div className="tool-actions">
          <button type="button" className="home-link" onClick={onGoHome}>Volver al inicio</button>
          <div className="status-pill">Lista para calcular</div>
        </div>
      </div>
      <div className="iframe-card">
        <iframe
          title="Calculadora de presupuestos Todo Copias"
          src="/presupuestos.html"
        />
      </div>
    </section>
  );
}

function EmbeddedAppTool({ eyebrow, title, subtitle, src, iframeTitle, onGoHome }) {
  return (
    <section className="budget-shell">
      <div className="tool-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="tool-subtitle">{subtitle}</p>
        </div>
        <div className="tool-actions">
          <button className="secondary home-link" type="button" onClick={onGoHome}>
            Volver al inicio
          </button>
        </div>
      </div>
      <div className="iframe-card embedded-app-frame">
        <iframe
          title={iframeTitle}
          src={src}
        />
      </div>
    </section>
  );
}

const TOOLS = [
  {
    id: 'talonarios',
    path: '/talonarios',
    title: 'Generador de Talonarios',
    icon: 'PDF',
    description: 'Numerá PDFs de talonarios con ORIGINAL/COPIA, prefijos, rangos, fuentes y vista previa visual.'
  },
  {
    id: 'presupuestos',
    path: '/presupuestos',
    title: 'Calculadora de Presupuestos',
    icon: '$',
    description: 'Calculá presupuestos de fotocopias, impresiones, papeles especiales y anillados. Usa /presupuestos.html como herramienta integrada.'
  },
  {
    id: 'presets',
    path: '/presets-talonarios',
    title: 'Presets de Talonarios',
    icon: 'CFG',
    description: 'Guardá, cargá y reutilizá configuraciones frecuentes para acelerar trabajos repetidos de numeración.'
  },
  {
    id: 'autofigu',
    path: '/autofigu',
    title: 'AutoFigu',
    icon: 'AF',
    description: 'Abri la aplicacion AutoFigu integrada en esta suite local, conservada como herramienta independiente.'
  },
  {
    id: 'inversor-bn-impresion',
    path: '/inversor-bn-impresion',
    title: 'Inversor B/N Impresion',
    icon: 'BN',
    description: 'Inverti blanco y negro para preparar archivos de impresion desde la aplicacion integrada.'
  },
  {
    id: 'todopedidos',
    path: '/todopedidos',
    title: 'TodoPedidos',
    icon: 'TP',
    description: 'Arma pedidos para proveedores con listas guardadas, copiado rapido y matching opcional contra Excel.'
  }
];

function HomePage({ onOpenTool }) {
  return (
    <section className="home-page">
      <div className="home-hero">
        <p className="eyebrow">Todo Copias</p>
        <h1>Panel principal</h1>
        <p className="tool-subtitle">Elegí una herramienta para trabajar rápido desde una suite clara y profesional.</p>
      </div>

      <div className="tool-grid">
        {TOOLS.map((tool) => (
          <article className="tool-card" key={tool.id}>
            <div className="tool-icon">{tool.icon}</div>
            <h2>{tool.title}</h2>
            <p>{tool.description}</p>
            <button type="button" className="primary" onClick={() => onOpenTool(tool.path)}>
              Abrir
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function SuiteApp() {
  const getPath = () => window.location.pathname;
  const [path, setPath] = useState(getPath);

  const navigate = useCallback((nextPath) => {
    window.history.pushState({}, '', nextPath);
    setPath(nextPath);
  }, []);

  useEffect(() => {
    const onPopState = () => setPath(getPath());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const activeTool = path === '/presupuestos'
    ? 'presupuestos'
    : path === '/talonarios'
      ? 'talonarios'
      : path === '/presets-talonarios'
        ? 'presets'
        : path === '/autofigu'
          ? 'autofigu'
          : path === '/inversor-bn-impresion'
            ? 'inversor-bn-impresion'
            : path === '/todopedidos'
              ? 'todopedidos'
              : 'home';

  return (
    <main className="app-shell">
      <header className="suite-header">
        <div>
          <p className="eyebrow">Todo Copias</p>
          <h1>Suite de herramientas</h1>
          <p className="tool-subtitle">Presupuestos, talonarios y presets en una sola webapp local.</p>
        </div>
        <nav className="suite-tabs" aria-label="Herramientas Todo Copias">
          <button
            type="button"
            className={activeTool === 'home' ? 'active' : ''}
            onClick={() => navigate('/')}
          >
            Inicio
          </button>
          <button
            type="button"
            className={activeTool === 'presupuestos' ? 'active' : ''}
            onClick={() => navigate('/presupuestos')}
          >
            Presupuestos
          </button>
          <button
            type="button"
            className={activeTool === 'talonarios' ? 'active' : ''}
            onClick={() => navigate('/talonarios')}
          >
            Talonarios
          </button>
          <button
            type="button"
            className={activeTool === 'presets' ? 'active' : ''}
            onClick={() => navigate('/presets-talonarios')}
          >
            Presets
          </button>
          <button
            type="button"
            className={activeTool === 'autofigu' ? 'active' : ''}
            onClick={() => navigate('/autofigu')}
          >
            AutoFigu
          </button>
          <button
            type="button"
            className={activeTool === 'inversor-bn-impresion' ? 'active' : ''}
            onClick={() => navigate('/inversor-bn-impresion')}
          >
            Inversor B/N
          </button>
          <button
            type="button"
            className={activeTool === 'todopedidos' ? 'active' : ''}
            onClick={() => navigate('/todopedidos')}
          >
            TodoPedidos
          </button>
        </nav>
      </header>

      {activeTool === 'home' && <HomePage onOpenTool={navigate} />}
      {activeTool === 'presupuestos' && <PresupuestosTool onGoHome={() => navigate('/')} />}
      {activeTool === 'talonarios' && <TalonariosTool onGoHome={() => navigate('/')} />}
      {activeTool === 'presets' && <TalonariosTool mode="presets" onGoHome={() => navigate('/')} />}
      {activeTool === 'autofigu' && (
        <EmbeddedAppTool
          eyebrow="Herramienta de armado"
          title="AutoFigu"
          subtitle="Figuritas, fotos carnet y folletos dentro de la suite Todo Copias."
          src="/apps/autofigu/index.html"
          iframeTitle="AutoFigu"
          onGoHome={() => navigate('/')}
        />
      )}
      {activeTool === 'inversor-bn-impresion' && (
        <EmbeddedAppTool
          eyebrow="Herramienta de impresion"
          title="Inversor B/N Impresion"
          subtitle="Inversion de blanco y negro para preparar archivos antes de imprimir."
          src="/apps/inversor-bn-impresion/index.html"
          iframeTitle="Inversor B/N Impresion"
          onGoHome={() => navigate('/')}
        />
      )}
      {activeTool === 'todopedidos' && (
        <EmbeddedAppTool
          eyebrow="Herramienta de compras"
          title="TodoPedidos"
          subtitle="Listas de pedido con Excel opcional, precios esperados y guardado local."
          src="/apps/todopedidos/index.html"
          iframeTitle="TodoPedidos"
          onGoHome={() => navigate('/')}
        />
      )}
    </main>
  );
}

createRoot(document.getElementById('root')).render(<SuiteApp />);
