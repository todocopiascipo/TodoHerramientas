// Contorno de corte para Silhouette: detecta stickers, calcula el corte con desplazamiento
// y exporta un PNG que Silhouette Studio auto-traza (o DXF + PNG por separado).
{
// ===================== utilidades: CRC32, ZIP, PNG pHYs =====================
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (u8, c = 0xFFFFFFFF) => { for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return c; };
const crcEnd = c => (c ^ 0xFFFFFFFF) >>> 0;
function makeZip(files) { // [{name, data:Uint8Array}] sin compresión
  const enc = new TextEncoder(), parts = [], central = []; let off = 0;
  for (const f of files) {
    const nm = enc.encode(f.name), crc = crcEnd(crc32(f.data)), sz = f.data.length;
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint16(10, 0, true); h.setUint16(12, 0x21, true); h.setUint32(14, crc, true); h.setUint32(18, sz, true); h.setUint32(22, sz, true);
    h.setUint16(26, nm.length, true); h.setUint16(28, 0, true);
    parts.push(new Uint8Array(h.buffer), nm, f.data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
    c.setUint16(12, 0, true); c.setUint16(14, 0x21, true); c.setUint32(16, crc, true); c.setUint32(20, sz, true); c.setUint32(24, sz, true);
    c.setUint16(28, nm.length, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), nm);
    off += 30 + nm.length + sz;
  }
  const csize = central.reduce((s, a) => s + a.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, csize, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: 'application/zip' });
}
function pngWithDpi(u8, dpi) { // inserta chunk pHYs tras IHDR
  const ppm = Math.round(dpi / 0.0254), chunk = new Uint8Array(21), dv = new DataView(chunk.buffer);
  dv.setUint32(0, 9); chunk.set([112, 72, 89, 115], 4); dv.setUint32(8, ppm); dv.setUint32(12, ppm); chunk[16] = 1;
  dv.setUint32(17, crcEnd(crc32(chunk.subarray(4, 17))));
  const out = new Uint8Array(u8.length + 21); out.set(u8.subarray(0, 33)); out.set(chunk, 33); out.set(u8.subarray(33), 54);
  return out;
}

// ===================== Worker =====================
let worker = null;
try { worker = new Worker('worker.js'); } catch (e) { worker = null; }
const CoreMain = window.Core;
let jobSeq = 0; const pending = new Map();
if (worker) {
  worker.onmessage = e => {
    const p = pending.get(e.data.id); if (!p) return;
    if (e.data.progress !== undefined && !e.data.contours) { if (p.onProgress) p.onProgress(e.data.progress, e.data.label); return; }
    pending.delete(e.data.id);
    if (e.data.error) p.reject(new Error(e.data.error)); else p.resolve({ contours: e.data.contours, fbg: e.data.fbg });
  };
  worker.onerror = () => { worker = null; for (const [id, p] of pending) { pending.delete(id); p.reject(new Error('reintentá')); } };
}
function runCore(payload, onProgress) {
  if (!worker) return new Promise((res, rej) => setTimeout(() => { try { const r = CoreMain.process(payload.work, payload.ww, payload.wh, payload.opts); res({ contours: r.contours, fbg: CoreMain.backgroundMask(payload.full, payload.fw, payload.fh, payload.opts.tol) }); } catch (err) { rej(err); } }, 30));
  const id = ++jobSeq; return new Promise((resolve, reject) => { pending.set(id, { resolve, reject, onProgress }); worker.postMessage({ id, ...payload }); });
}

// ===================== Estado y ajustes =====================
const $ = id => document.getElementById(id);
const DEF = { width: 18, offset: 2, smooth: 0.6, removeBg: true, join: 3, gap: 1, tol: 40, mainFrac: 0.15, units: 'mm', minPiece: 6 };
let S = { ...DEF };
try { const saved = JSON.parse(localStorage.getItem('todocopias-silhouette-corte') || 'null'); if (saved) S = { ...DEF, ...saved }; } catch (e) {}
const items = []; let active = -1;
const fmt = { width: v => v + ' cm', offset: v => v + ' mm', smooth: v => Math.round(v * 100) + '%', join: v => v + ' mm', gap: v => v + ' mm', tol: v => v, mainFrac: v => Math.round(v * 100) + '%' };
function syncUI() {
  for (const k of Object.keys(DEF)) { const el = $(k); if (!el) continue; if (el.type === 'checkbox') el.checked = S[k]; else el.value = S[k]; const o = $(k + 'O'); if (o) o.textContent = fmt[k](S[k]); }
}
function readUI() {
  for (const k of Object.keys(DEF)) { const el = $(k); if (el.type === 'checkbox') S[k] = el.checked; else if (el.tagName === 'SELECT') S[k] = el.value; else { const v = parseFloat(el.value); if (isFinite(v) && v > 0 || (k === 'join' || k === 'gap') && v === 0) S[k] = v; } const o = $(k + 'O'); if (o) o.textContent = fmt[k](S[k]); }
  try { localStorage.setItem('todocopias-silhouette-corte', JSON.stringify(S)); } catch (e) {}
}
syncUI();

// ===================== Progreso =====================
const PROC_BTNS = [...document.querySelectorAll('.proc-btn')];
let running = false;
function setProgress(state, frac, label) {
  const pct = Math.max(0, Math.min(100, Math.round(frac * 100)));
  $('prog').dataset.state = state;
  $('progBar').style.width = pct + '%';
  $('progTrack').setAttribute('aria-valuenow', pct);
  $('progLabel').textContent = label;
  $('progPct').textContent = state === 'busy' || state === 'done' ? pct + '%' : '';
}
const fresh = it => !!(it && it.result && it.key === optsKey(it));
// Refleja el estado de la imagen activa: botones, barra y marquitas de la cola.
function refreshState() {
  const it = items[active];
  PROC_BTNS.forEach(b => { b.disabled = !it || running; b.textContent = running ? 'Procesando…' : 'Procesar'; });
  const ok = fresh(it) && !!it.result.box && !running;
  $('dlOne').disabled = !ok; $('dlDxf').disabled = !ok;
  $('dlAll').disabled = items.length < 2 || running;
  [...$('queue').children].forEach((b, i) => { b.dataset.state = fresh(items[i]) ? 'done' : (items[i] && items[i].result ? 'stale' : ''); });
  if (running) return;
  if (!it) setProgress('idle', 0, 'Subí una imagen para empezar');
  else if (fresh(it)) { const n = it.result.polys.length; setProgress('done', 1, `Terminado · ${n} ${n === 1 ? 'figura' : 'figuras'}${it.secs ? ' en ' + it.secs.toFixed(1).replace('.', ',') + ' s' : ''}`); }
  else if (it.result) setProgress('stale', 1, 'Cambiaste ajustes: tocá Procesar para actualizar');
  else setProgress('ready', 0, 'Listo para procesar: tocá Procesar');
}
async function processItem(it) {
  running = true; refreshState();
  const t0 = performance.now();
  try {
    await compute(it, (p, label) => setProgress('busy', p, label));
    it.secs = (performance.now() - t0) / 1000;
    running = false;
    if (it === items[active]) draw(it);
  } catch (e) {
    running = false; refreshState();
    setProgress('error', 1, 'Error al procesar: ' + e.message);
    return;
  }
  refreshState();
}
PROC_BTNS.forEach(b => b.addEventListener('click', () => {
  const it = items[active]; if (!it || running) return;
  processItem(it);
  if (b.classList.contains('panel-proc')) $('prog').scrollIntoView({ behavior: 'smooth', block: 'center' });
}));

// ===================== Carga de imágenes =====================
function addFiles(list) {
  const files = [...list].filter(f => f.type.startsWith('image/'));
  if (!files.length) { $('msg').textContent = 'Ese archivo no es una imagen.'; return; }
  files.forEach(f => {
    const url = URL.createObjectURL(f), img = new Image();
    img.onload = () => {
      const it = { count: 0, name: f.name.replace(/\.[^.]+$/, '').replace(/[^\w\-áéíóúñÁÉÍÓÚÑ ]+/g, '_') || 'sticker', img, url, result: null, key: '' };
      items.push(it); renderQueue(); if (active < 0 || files.length === 1) select(items.length - 1); else refreshState();
    };
    img.onerror = () => { $('msg').textContent = 'No se pudo leer ' + f.name + '.'; };
    img.src = url;
  });
}
const drop = $('drop');
drop.onclick = () => $('file').click();
drop.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('file').click(); } };
$('file').onchange = e => { addFiles(e.target.files); e.target.value = ''; };
['dragenter', 'dragover'].forEach(t => document.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(t => document.addEventListener(t, e => { e.preventDefault(); if (t === 'drop' || e.target === document.documentElement) drop.classList.remove('over'); }));
document.addEventListener('drop', e => { if (e.dataTransfer && e.dataTransfer.files.length) addFiles(e.dataTransfer.files); });
document.addEventListener('paste', e => { const f = [...(e.clipboardData?.files || [])]; if (f.length) addFiles(f); });

function renderQueue() {
  const q = $('queue'); q.innerHTML = '';
  items.forEach((it, i) => { const b = document.createElement('button'); b.setAttribute('aria-current', i === active); b.title = it.name;
    const im = document.createElement('img'); im.src = it.url; im.alt = it.name; b.appendChild(im); b.onclick = () => select(i); q.appendChild(b); });
  refreshState();
}
function select(i) {
  active = i; renderQueue();
  const it = items[i], ci = $('count'); ci.disabled = false; ci.value = it.count || ''; $('countO').textContent = it.count ? it.count : 'automático';
  if (it.result) draw(it); else drawRaw(it);
  refreshState();
}
// Vista previa de la imagen sin procesar.
function drawRaw(it) {
  const v = $('view'), W = it.img.naturalWidth, H = it.img.naturalHeight, sc = Math.min(1, 1600 / Math.max(W, H));
  $('empty').hidden = true; v.hidden = false;
  v.width = Math.round(W * sc); v.height = Math.round(H * sc);
  v.getContext('2d').drawImage(it.img, 0, 0, v.width, v.height);
  ['sCount', 'sSize', 'sDpi'].forEach(id => { $(id).textContent = '–'; });
  $('warn').classList.remove('on'); $('msg').textContent = '';
}

// ===================== Cálculo =====================
const WORK_MAX = 1400;
function optsKey(it) { return JSON.stringify([it.count, S.width, S.offset, S.smooth, S.join, S.gap, S.tol, S.mainFrac, S.minPiece]); }
async function compute(it, onProgress = () => {}) {
  const key = optsKey(it); if (it.result && it.key === key) return it;
  onProgress(0.01, 'Leyendo la imagen');
  await new Promise(r => setTimeout(r, 20)); // deja pintar la barra
  const W = it.img.naturalWidth, H = it.img.naturalHeight;
  const mmPerPxFull = S.width * 10 / W;
  const s = Math.min(1, WORK_MAX / Math.max(W, H));
  const mmPerPxWork = mmPerPxFull / s;
  const margin = Math.ceil((S.offset + S.join + 2) / mmPerPxWork) + 4;
  const ww = Math.round(W * s) + 2 * margin, wh = Math.round(H * s) + 2 * margin;
  const c = document.createElement('canvas'); c.width = ww; c.height = wh; const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#fff'; g.fillRect(0, 0, ww, wh); g.drawImage(it.img, margin, margin, Math.round(W * s), Math.round(H * s));
  const work = g.getImageData(0, 0, ww, wh).data;
  const fc = document.createElement('canvas'); fc.width = W; fc.height = H; const fg = fc.getContext('2d', { willReadFrequently: true }); fg.drawImage(it.img, 0, 0);
  const full = fg.getImageData(0, 0, W, H).data;
  const opts = { mmPerPx: mmPerPxWork, offsetMm: S.offset, joinMm: S.join, gapMm: S.gap, tol: S.tol, smooth: S.smooth, minPieceMm2: S.minPiece, mainFrac: S.mainFrac, count: it.count || 0 };
  const r = await runCore({ work, ww, wh, full, fw: W, fh: H, opts }, (p, label) => onProgress(0.05 + p * 0.9, label));
  onProgress(0.97, 'Preparando la vista previa');
  // contornos a píxeles de la imagen original
  const k = Math.round(W * s) / W;
  const polys = r.contours.map(p => p.map(([x, y]) => [(x - margin) / k, (y - margin) / k]));
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of polys) for (const [x, y] of p) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  it.result = { polys, fbg: r.fbg, W, H, mmPerPx: mmPerPxFull, box: polys.length ? { x0: Math.floor(x0), y0: Math.floor(y0), x1: Math.ceil(x1), y1: Math.ceil(y1) } : null };
  it.key = key; onProgress(1, 'Listo');
  return it;
}

// Imagen final (PNG) del tamaño exacto del contorno exterior.
function buildCanvas(it, withBgRemoval) {
  const R = it.result, b = R.box, cw = b.x1 - b.x0, ch = b.y1 - b.y0;
  const c = document.createElement('canvas'); c.width = cw; c.height = ch; const g = c.getContext('2d');
  g.drawImage(it.img, -b.x0, -b.y0);
  if (withBgRemoval) {
    const d = g.getImageData(0, 0, cw, ch), px = d.data;
    for (let y = 0; y < ch; y++) { const sy = y + b.y0; if (sy < 0 || sy >= R.H) continue;
      for (let x = 0; x < cw; x++) { const sx = x + b.x0; if (sx < 0 || sx >= R.W) continue; if (R.fbg[sy * R.W + sx]) px[(y * cw + x) * 4 + 3] = 0; } }
    g.putImageData(d, 0, 0);
  }
  return c;
}

// PNG para Silhouette: transparente fuera de la línea de corte, borde blanco opaco adentro.
// Silhouette auto-traza el borde de la transparencia => la línea de corte queda pegada a la imagen.
function exportDpi(R) {
  const nat = 25.4 / R.mmPerPx, b = R.box, longPx = Math.max(b.x1 - b.x0, b.y1 - b.y0);
  let dpi = Math.max(nat, 300);
  if (longPx * dpi / nat > 7000) dpi = Math.max(nat, 7000 * nat / longPx);
  return dpi;
}
function buildSilCanvas(it, f) {
  const R = it.result, b = R.box;
  const cw = Math.round((b.x1 - b.x0) * f), ch = Math.round((b.y1 - b.y0) * f);
  const c = document.createElement('canvas'); c.width = cw; c.height = ch; const g = c.getContext('2d');
  const path = new Path2D();
  for (const p of R.polys) p.forEach(([x, y], i) => { const X = (x - b.x0) * f, Y = (y - b.y0) * f; i ? path.lineTo(X, Y) : path.moveTo(X, Y); }), path.closePath();
  g.fillStyle = '#ffffff'; g.fill(path);
  g.save(); g.clip(path);
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(it.img, -b.x0 * f, -b.y0 * f, R.W * f, R.H * f);
  g.restore();
  return c;
}
async function silPngFor(it, onProgress = () => {}) {
  await compute(it, (p, l) => onProgress(p * 0.6, l));
  const R = it.result, b = R.box; if (!b) return null;
  const nat = 25.4 / R.mmPerPx, dpi = exportDpi(R), f = dpi / nat;
  onProgress(0.65, 'Dibujando el PNG a ' + Math.round(dpi) + ' dpi');
  await new Promise(r => setTimeout(r, 20));
  const c = buildSilCanvas(it, f);
  onProgress(0.8, 'Comprimiendo el PNG');
  const real = c.width / ((b.x1 - b.x0) * R.mmPerPx / 25.4); // dpi exacto según píxeles redondeados
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  const wmm = (b.x1 - b.x0) * R.mmPerPx, hmm = (b.y1 - b.y0) * R.mmPerPx;
  const name = `${it.name}_${Math.round(wmm)}x${Math.round(hmm)}mm.png`;
  onProgress(1, 'PNG listo');
  return { name, data: pngWithDpi(new Uint8Array(await blob.arrayBuffer()), real) };
}

function draw(it) {
  if (it !== items[active]) return;
  const R = it.result, v = $('view');
  $('empty').hidden = true; v.hidden = false;
  if (!R.box) { $('sCount').textContent = '0'; $('msg').textContent = 'No encontré stickers: probá subir la tolerancia del fondo.'; refreshState(); return; }
  const b = R.box, maxSide = 1600, sc = Math.min(1.5, maxSide / Math.max(b.x1 - b.x0, b.y1 - b.y0));
  const base = buildSilCanvas(it, sc);
  v.width = base.width; v.height = base.height;
  const g = v.getContext('2d'); g.clearRect(0, 0, v.width, v.height);
  g.drawImage(base, 0, 0);
  g.strokeStyle = '#e6007e'; g.lineWidth = Math.max(1.5, 2 * v.width / 900); g.setLineDash([6, 4]); g.lineJoin = 'round';
  for (const p of R.polys) { g.beginPath(); p.forEach(([x, y], i) => { const X = (x - b.x0) * sc, Y = (y - b.y0) * sc; i ? g.lineTo(X, Y) : g.moveTo(X, Y); }); g.closePath(); g.stroke(); }
  const wmm = (b.x1 - b.x0) * R.mmPerPx, hmm = (b.y1 - b.y0) * R.mmPerPx, dpi = 25.4 / R.mmPerPx;
  $('sDpi').title = 'El PNG se exporta a ' + Math.round(exportDpi(R)) + ' dpi para que el borde de corte quede suave.';
  $('sCount').textContent = R.polys.length;
  $('sSize').textContent = wmm.toFixed(1) + ' × ' + hmm.toFixed(1) + ' mm';
  $('sDpi').textContent = Math.round(dpi) + ' dpi';
  const w = $('warn');
  if (dpi < 150) { w.textContent = 'Resolución baja para ' + S.width + ' cm de ancho (' + Math.round(dpi) + ' dpi): la impresión puede verse pixelada. Usá una imagen más grande o un ancho menor.'; w.classList.add('on'); } else w.classList.remove('on');
  const n = R.polys.length;
  $('msg').textContent = it.count && n !== it.count ? 'Pediste ' + it.count + ' figuras y salieron ' + n + ' cortes: probá ajustar "Unir adornos cercanos" o la tolerancia.' : (!it.count ? 'Detecté ' + n + ' figuras. Si no es correcto, escribí la cantidad real arriba y volvé a procesar.' : '');
  refreshState();
}

// ===================== Exportar =====================
async function filesFor(it) {
  await compute(it);
  const R = it.result, b = R.box; if (!b) return [];
  const hmm = (b.y1 - b.y0) * R.mmPerPx, wmm = (b.x1 - b.x0) * R.mmPerPx;
  const mm = R.polys.map(p => p.map(([x, y]) => [(x - b.x0) * R.mmPerPx, hmm - (y - b.y0) * R.mmPerPx]));
  let mx0 = Infinity, mx1 = -Infinity, my0 = Infinity, my1 = -Infinity;
  for (const p of mm) for (const [x, y] of p) { mx0 = Math.min(mx0, x); mx1 = Math.max(mx1, x); my0 = Math.min(my0, y); my1 = Math.max(my1, y); }
  const cw = mx1 - mx0, chh = my1 - my0;
  const dxf = new TextEncoder().encode(CoreMain.toDXF(mm, S.units));
  const c = buildCanvas(it, S.removeBg), dpi = 25.4 / R.mmPerPx;
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  const png = pngWithDpi(new Uint8Array(await blob.arrayBuffer()), dpi);
  const readme = `${it.name}\r\n\r\nStickers: ${R.polys.length}\r\nImagen PNG: ${wmm.toFixed(2)} x ${hmm.toFixed(2)} mm (${(wmm / 25.4).toFixed(3)} x ${(hmm / 25.4).toFixed(3)} pulgadas)\r\nLíneas de corte (todas juntas): ${cw.toFixed(2)} x ${chh.toFixed(2)} mm (${(cw / 25.4).toFixed(3)} x ${(chh / 25.4).toFixed(3)} pulgadas)\r\nResolución PNG: ${Math.round(dpi)} dpi\r\nDesplazamiento: ${S.offset} mm\r\nUnidades del DXF: ${S.units === 'in' ? 'pulgadas' : 'milímetros'}\r\n\r\nEn Silhouette Studio: abrí el DXF, agregá el PNG, verificá las medidas de arriba, seleccioná todo y alineá Centro + Medio.\r\n`;
  return [{ name: it.name + '_corte.dxf', data: dxf }, { name: it.name + '_imagen.png', data: png }, { name: it.name + '_LEEME.txt', data: new TextEncoder().encode(readme) }];
}
function saveBlob(name, blob) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000); $('msg').textContent = 'Descargado: ' + name;
}
async function withBar(fn) {
  running = true; refreshState();
  try { await fn((p, label) => setProgress('busy', p, label)); running = false; refreshState(); }
  catch (e) { running = false; refreshState(); setProgress('error', 1, 'Error: ' + e.message); }
}
$('dlOne').onclick = () => withBar(async bar => {
  const it = items[active]; if (!fresh(it)) return;
  const f = await silPngFor(it, bar); if (f) await saveBlob(f.name, new Blob([f.data], { type: 'image/png' }));
});
$('dlDxf').onclick = () => withBar(async bar => {
  const it = items[active]; if (!fresh(it)) return;
  bar(0.5, 'Armando DXF + PNG');
  await saveBlob(it.name + '_dxf_png.zip', makeZip(await filesFor(it)));
});
$('dlAll').onclick = () => withBar(async bar => {
  const all = [], n = items.length;
  for (let i = 0; i < n; i++) {
    const t0 = performance.now(), wasFresh = fresh(items[i]);
    const f = await silPngFor(items[i], (p, l) => bar((i + p) / n, `Imagen ${i + 1} de ${n} · ${l}`));
    if (!wasFresh) items[i].secs = (performance.now() - t0) / 1000;
    if (f) all.push(f);
    if (items[i] === items[active]) draw(items[i]);
  }
  bar(1, 'Armando el ZIP');
  await saveBlob('stickers_silhouette.zip', makeZip(all));
});

// ===================== Eventos de ajustes =====================
$('count').addEventListener('input', () => {
  const it = items[active]; if (!it) return;
  const v = parseInt($('count').value, 10); it.count = v > 0 ? Math.min(200, v) : 0;
  $('countO').textContent = it.count ? it.count : 'automático';
  refreshState();
});
document.querySelectorAll('.panel input:not([type=file]):not(#count), .panel select').forEach(el => el.addEventListener('input', () => {
  readUI(); refreshState();
}));
$('reset').onclick = () => { S = { ...DEF }; syncUI(); readUI(); refreshState(); };
refreshState();
}
