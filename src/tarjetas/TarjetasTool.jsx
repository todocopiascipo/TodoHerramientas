import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MATRIX, MAX_CARDS, DEFAULT_PLACEMENT, getSlot, getBackSlot, getPlacement, paginateDesigns, validateJob } from './layout.js';
import { readArtwork, readPdfPage } from './assets.js';
import { createTarjetasPdf } from './pdf.js';
import { paintSheet } from './preview.js';
import './tarjetas.css';

const ACCEPT = '.jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf';
const faceName = (face) => face === 'front' ? 'Frente' : 'Dorso';

function Upload({ label, detail, multiple = false, onFiles, disabled, compact = false }) {
  const [dragging, setDragging] = useState(false);
  return (
    <label className={`tc-upload ${compact ? 'tc-upload-compact' : ''} ${dragging ? 'tc-dragging' : ''}`}
      onDragOver={(event) => { event.preventDefault(); if (!disabled) setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (!disabled && event.dataTransfer.files.length) onFiles(multiple ? Array.from(event.dataTransfer.files) : [event.dataTransfer.files[0]]);
      }}>
      <span className="tc-upload-symbol" aria-hidden="true">＋</span>
      <strong>{label}</strong>
      <span>{detail}</span>
      <input type="file" accept={ACCEPT} multiple={multiple} disabled={disabled}
        aria-label={label} onChange={(event) => {
          const files = Array.from(event.target.files || []);
          event.target.value = '';
          if (files.length) onFiles(files);
        }} />
    </label>
  );
}

export default function TarjetasTool({ onGoHome }) {
  const [designs, setDesigns] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [mode, setMode] = useState('simple');
  const [face, setFace] = useState('front');
  const [flip, setFlip] = useState('long');
  const [guides, setGuides] = useState(true);
  const [cutMarks, setCutMarks] = useState(true);
  const [pageIndex, setPageIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const canvasRef = useRef(null);
  const selected = designs.find((design) => design.id === selectedId);
  const side = selected?.[face];
  const sheets = useMemo(() => paginateDesigns(designs), [designs]);
  const sheetIndex = Math.min(pageIndex, Math.max(0, sheets.length - 1));
  const items = sheets[sheetIndex] || [];
  const validation = validateJob(designs, mode);
  const total = designs.reduce((sum, design) => sum + (Number(design.quantity) || 0), 0);
  const pageCount = sheets.length * (mode === 'duplex' ? 2 : 1);
  const placement = side && getPlacement(side, getSlot(0));
  const dpi = side && side.asset.kind !== 'pdf' ? Math.round(side.asset.width / placement.width * 25.4) : null;

  useEffect(() => {
    paintSheet(canvasRef.current, items, { face, flip, guides, cutMarks, selectedId });
  }, [designs, sheetIndex, face, flip, guides, cutMarks, selectedId]);

  function updateDesign(id, changes) {
    setDesigns((current) => current.map((design) => design.id === id ? { ...design, ...changes } : design));
    setMessage('');
  }

  function updateSide(changes) {
    updateDesign(selectedId, { [face]: { ...side, ...changes } });
  }

  async function runOperation(action, pendingMessage) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    setMessage(pendingMessage);
    try {
      await action();
    } catch (failure) {
      setError(failure.message || 'No se pudo completar la operación. Intentá nuevamente.');
      setMessage('');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function addDesigns(files) {
    runOperation(async () => {
      const added = [];
      const failures = [];
      if (designs.length + files.length > 100) throw new Error('Podés cargar hasta 100 diseños por trabajo.');
      for (const file of files) {
        try {
          added.push({
            id: crypto.randomUUID(), name: file.name.replace(/\.[^.]+$/, ''),
            quantity: 10, front: await readArtwork(file), back: null
          });
        } catch (failure) {
          failures.push(`${file.name}: ${failure.message}`);
        }
      }
      setDesigns((current) => [...current, ...added]);
      if (added.length) {
        setSelectedId(added[0].id);
        setFace('front');
        setPageIndex(Math.floor(total / MATRIX.capacity));
      }
      setMessage(added.length ? `${added.length} ${added.length === 1 ? 'diseño cargado' : 'diseños cargados'}. Ajustá la cantidad de cada uno.` : '');
      setError(failures.join(' '));
    }, 'Preparando diseños…');
  }

  function replaceSide(files) {
    const targetId = selectedId;
    const targetFace = face;
    runOperation(async () => {
      const replacement = await readArtwork(files[0]);
      updateDesign(targetId, { [targetFace]: replacement });
      setMessage(`${faceName(targetFace)} cargado.`);
    }, `Preparando ${faceName(face).toLowerCase()}…`);
  }

  function changePdfPage(value) {
    const targetId = selectedId;
    const targetFace = face;
    runOperation(async () => {
      const asset = await readPdfPage(side.asset.bytes, side.asset.name, Number(value) - 1);
      updateDesign(targetId, { [targetFace]: { ...DEFAULT_PLACEMENT, asset } });
      setMessage(`Página ${value} seleccionada.`);
    }, 'Preparando página del PDF…');
  }

  function useFrontPdf() {
    runOperation(async () => {
      const asset = await readPdfPage(selected.front.asset.bytes, selected.front.asset.name, 1);
      updateDesign(selectedId, { back: { ...DEFAULT_PLACEMENT, asset } });
      setMessage('Página 2 del PDF asignada al dorso.');
    }, 'Preparando dorso…');
  }

  function removeDesign(id) {
    const remaining = designs.filter((design) => design.id !== id);
    setDesigns(remaining);
    if (selectedId === id) setSelectedId(remaining[0]?.id || null);
    setMessage('');
    setError('');
  }

  function generatePdf() {
    runOperation(async () => {
      // Give the browser a frame to paint the busy state before embedding artwork.
      await new Promise((resolve) => setTimeout(resolve, 0));
      const bytes = await createTarjetasPdf(designs, { mode, flip, cutMarks });
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `Tarjetas-90x50-${mode === 'duplex' ? 'doble-faz' : 'simple'}-${total}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setMessage(`PDF generado: ${total} tarjetas en ${sheets.length} ${sheets.length === 1 ? 'hoja' : 'hojas'} (${pageCount} ${pageCount === 1 ? 'página' : 'páginas'}).`);
    }, 'Generando PDF a tamaño real…');
  }

  function selectOnSheet(event) {
    if (busy) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (event.clientX - rect.left) * MATRIX.width / rect.width;
    const y = (event.clientY - rect.top) * MATRIX.height / rect.height;
    const match = items.find((_, index) => {
      const box = getSlot(face === 'back' ? getBackSlot(index, flip) : index);
      return x >= box.x && x < box.x + box.width && y >= box.y && y < box.y + box.height;
    });
    if (match) setSelectedId(match.id);
  }

  return (
    <section className="tc-tool">
      <div className="tool-heading">
        <div>
          <p className="eyebrow">Armado para impresión</p>
          <h1>TARJETAS</h1>
          <p className="tool-subtitle">Tu matriz de 10 tarjetas, lista para imprimir en A4.</p>
        </div>
        <button type="button" className="secondary home-link" onClick={onGoHome}>Volver al inicio</button>
      </div>

      <div className="tc-specs" aria-label="Medidas de la plantilla">
        <div><strong>90 × 50 <small>mm</small></strong><span>Tarjeta terminada</span></div>
        <div><strong>95 × 55 <small>mm</small></strong><span>Diseño con demasía de 2,5 mm</span></div>
        <div><strong>2 × 5</strong><span>10 tarjetas por hoja A4</span></div>
        <div className="tc-print-spec"><strong>100% REAL</strong><span>Imprimir sin bordes</span></div>
      </div>

      <div className="tc-workspace">
        <section className="tc-controls" aria-label="Configuración de tarjetas" aria-busy={busy}>
          <fieldset disabled={busy} className="tc-panel tc-mode-panel">
            <legend>1. Elegí el modo</legend>
            <div className="tc-segmented" role="group" aria-label="Modo de impresión">
              <button type="button" aria-pressed={mode === 'simple'} onClick={() => { setMode('simple'); setFace('front'); setMessage(''); }}>Simple</button>
              <button type="button" aria-pressed={mode === 'duplex'} onClick={() => { setMode('duplex'); setMessage(''); }}>Doble faz</button>
            </div>
            {mode === 'duplex' ? (
              <label className="tc-field">Giro de la hoja
                <select aria-label="Giro de la hoja" value={flip} onChange={(event) => { setFlip(event.target.value); setMessage(''); }}>
                  <option value="long">Borde largo (como un libro)</option>
                  <option value="short">Borde corto (como un calendario)</option>
                </select>
                <span className="tc-help">Elegí el mismo giro al imprimir. El PDF alterna frente y dorso de cada hoja.</span>
              </label>
            ) : <p className="tc-help">Una cara por hoja. Cargá el frente y elegí cuántas copias necesitás.</p>}
          </fieldset>

          <fieldset disabled={busy} className="tc-panel">
            <legend>2. Cargá tus diseños</legend>
            <Upload label="Agregar frentes" detail="JPG, PNG, WebP o PDF. Arrastrá o seleccioná archivos."
              multiple onFiles={addDesigns} disabled={busy} />
            <p className="tc-help">Prepará cada diseño a 95 × 55 mm. Desde Illustrator, guardalo como PDF.</p>
            {designs.length > 0 && (
              <div className="tc-designs" aria-label="Diseños cargados">
                {designs.map((design, index) => (
                  <div className={`tc-design ${selectedId === design.id ? 'tc-selected' : ''}`} key={design.id}>
                    <button className="tc-design-select" type="button" aria-pressed={selectedId === design.id}
                      onClick={() => setSelectedId(design.id)} aria-label={`Editar ${design.name}`}>
                      <img src={design.front.asset.thumbnail} alt="" />
                      <span><strong>{design.name}</strong><small>Diseño {index + 1}{mode === 'duplex' ? design.back ? ' · Dorso listo' : ' · Falta dorso' : ''}</small></span>
                    </button>
                    <label className="tc-quantity">Copias
                      <input aria-label={`Copias de ${design.name}`} type="number" min="1" max={MAX_CARDS} step="1"
                        value={design.quantity} onChange={(event) => updateDesign(design.id, { quantity: event.target.value === '' ? '' : Number(event.target.value) })} />
                    </label>
                    <button type="button" className="tc-delete" aria-label={`Eliminar ${design.name}`} title="Eliminar diseño" onClick={() => removeDesign(design.id)}>×</button>
                  </div>
                ))}
              </div>
            )}
          </fieldset>

          {selected && (
            <fieldset disabled={busy} className="tc-panel">
              <legend>3. Ajustá el diseño seleccionado</legend>
              <p className="tc-selected-name" title={selected.name}>{selected.name}</p>
              {mode === 'duplex' && (
                <div className="tc-segmented" role="group" aria-label="Cara a editar">
                  {['front', 'back'].map((value) => <button key={value} type="button" aria-pressed={face === value}
                    onClick={() => setFace(value)}>{faceName(value)}</button>)}
                </div>
              )}
              <Upload label={side ? `Reemplazar ${faceName(face).toLowerCase()}` : 'Agregar dorso'}
                detail={side ? side.asset.name : 'Asigná el dorso de este diseño.'}
                onFiles={replaceSide} disabled={busy} compact />
              {face === 'back' && selected.front.asset.kind === 'pdf' && selected.front.asset.pageCount > 1 && (
                <button type="button" className="tc-text-button" onClick={useFrontPdf}>Usar página 2 del PDF del frente</button>
              )}
              {side && <>
                {side.asset.kind === 'pdf' && (
                  <label className="tc-field">Página del PDF
                    <select aria-label="Página del PDF" value={side.asset.pageIndex + 1} onChange={(event) => changePdfPage(event.target.value)}>
                      {Array.from({ length: side.asset.pageCount }, (_, index) => <option key={index} value={index + 1}>Página {index + 1} de {side.asset.pageCount}</option>)}
                    </select>
                    <span className="tc-help">El PDF conserva su contenido vectorial al exportar.</span>
                  </label>
                )}
                <label className="tc-field">Encuadre
                  <select aria-label="Encuadre" value={side.fit} onChange={(event) => updateSide({ fit: event.target.value })}>
                    <option value="cover">Rellenar 95 × 55 mm (recorta el sobrante)</option>
                    <option value="contain">Ajustar diseño completo (puede dejar blanco)</option>
                  </select>
                </label>
                <div className="tc-rotation" role="group" aria-label={`Rotar ${faceName(face).toLowerCase()}`}>
                  <span>Rotación</span>
                  <button type="button" aria-label="Girar 90 grados a la izquierda" onClick={() => updateSide({ rotation: (side.rotation + 270) % 360 })}>↶</button>
                  <output>{side.rotation}°</output>
                  <button type="button" aria-label="Girar 90 grados a la derecha" onClick={() => updateSide({ rotation: (side.rotation + 90) % 360 })}>↷</button>
                </div>
                {side.fit === 'cover' && <div className="tc-sliders">
                  <label>Zoom <output>{Math.round(side.zoom * 100)}%</output><input type="range" min="1" max="3" step="0.01" value={side.zoom} onChange={(event) => updateSide({ zoom: Number(event.target.value) })} /></label>
                  <label>Posición horizontal<input type="range" min="0" max="1" step="0.01" value={side.focusX} onChange={(event) => updateSide({ focusX: Number(event.target.value) })} /></label>
                  <label>Posición vertical<input type="range" min="0" max="1" step="0.01" value={side.focusY} onChange={(event) => updateSide({ focusY: Number(event.target.value) })} /></label>
                </div>}
                <button type="button" className="tc-text-button" onClick={() => updateSide(DEFAULT_PLACEMENT)}>Restablecer encuadre</button>
                {dpi !== null && dpi < 250 && <p className="tc-warning">Resolución aproximada: {dpi} ppp con este encuadre. Para texto nítido, usá un PDF o una imagen de mayor resolución.</p>}
              </>}
            </fieldset>
          )}

          <fieldset disabled={busy} className="tc-panel tc-export">
            <legend>Salida de impresión</legend>
            <label className="tc-checkbox"><input type="checkbox" checked={cutMarks} onChange={(event) => { setCutMarks(event.target.checked); setMessage(''); }} />Marcas de corte en el frente</label>
            <p className="tc-help">Trazo negro con base blanca. El dorso se exporta sin marcas y las guías nunca se imprimen.</p>
            <div className="tc-job-summary"><strong>{total} tarjetas</strong><span>{sheets.length} hojas A4 · {pageCount} páginas PDF</span></div>
            <button type="button" className="primary tc-generate" disabled={busy || Boolean(validation)} onClick={generatePdf}>
              {busy ? 'Procesando…' : 'Descargar PDF'}
            </button>
            {validation && <p className="tc-help" role="status">{validation}</p>}
          </fieldset>
          {error && <p className="tc-error" role="alert">{error}</p>}
          <p className="tc-status" role="status">{message}</p>
        </section>

        <section className="tc-preview-panel" aria-label="Vista previa">
          <div className="tc-preview-heading">
            <div><p className="eyebrow">Vista previa</p><h2>Hoja A4 vertical</h2></div>
            <span className="tc-badge">210 × 297 mm</span>
          </div>
          <div className="tc-preview-toolbar">
            <div className="tc-segmented" role="group" aria-label="Cara de la vista previa">
              <button type="button" aria-pressed={face === 'front'} onClick={() => setFace('front')} disabled={busy}>Frente</button>
              <button type="button" aria-pressed={face === 'back'} onClick={() => setFace('back')} disabled={busy || mode === 'simple'}>Dorso</button>
            </div>
            <label className="tc-checkbox"><input type="checkbox" checked={guides} onChange={(event) => setGuides(event.target.checked)} />Ver guías</label>
          </div>
          <div className="tc-sheet-navigation">
            <button type="button" aria-label="Hoja anterior" disabled={sheetIndex === 0} onClick={() => setPageIndex(sheetIndex - 1)}>←</button>
            <span>Hoja {sheetIndex + 1} de {Math.max(1, sheets.length)} · {faceName(face)}</span>
            <button type="button" aria-label="Hoja siguiente" disabled={sheetIndex >= sheets.length - 1} onClick={() => setPageIndex(sheetIndex + 1)}>→</button>
          </div>
          <div className="tc-paper-stage">
            <canvas ref={canvasRef} onClick={selectOnSheet} aria-label={`Hoja ${sheetIndex + 1}, ${faceName(face).toLowerCase()}. ${items.length} tarjetas de 90 por 50 milímetros.`} />
          </div>
          <div className="tc-guide-key"><span><i className="tc-key-bleed" />Diseño 95 × 55 mm</span><span><i className="tc-key-trim" />Corte 90 × 50 mm</span><span>Guías y números: solo en pantalla</span></div>
          <div className="tc-print-note">
            <strong>Al imprimir: SIN BORDES · ESCALA 100% REAL</strong>
            <p>Usá papel A4 y tamaño real. Desactivá “Ajustar a página” y cualquier ampliación automática del modo sin bordes.</p>
            {mode === 'duplex' && <p>Doble faz con giro por <strong>{flip === 'long' ? 'borde largo' : 'borde corto'}</strong>. Cada dorso se ubica detrás de su frente; verificá el registro con una hoja de prueba.</p>}
          </div>
        </section>
      </div>
    </section>
  );
}
