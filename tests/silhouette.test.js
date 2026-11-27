import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// core.js es un script de navegador/worker (define `Core` global): se evalúa aislado.
const source = readFileSync(new URL('../public/apps/silhouette-corte/core.js', import.meta.url), 'utf8');
const Core = new Function('self', `${source}\nreturn Core;`)({});

// Hoja blanca de 200 × 120 px (1 px = 1 mm) con figuras rojas.
function sheet(shapes) {
  const w = 200, h = 120, px = new Uint8ClampedArray(w * h * 4).fill(255);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (shapes.some(([cx, cy, r]) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r)) {
      const i = (y * w + x) * 4; px[i] = 200; px[i + 1] = 30; px[i + 2] = 40;
    }
  }
  return { px, w, h };
}
const OPTS = { mmPerPx: 1, offsetMm: 3, joinMm: 2, gapMm: 1, tol: 40, smooth: 0.5, minPieceMm2: 4, mainFrac: 0.15, count: 0 };
const bbox = (poly) => poly.reduce((b, [x, y]) => ({
  x0: Math.min(b.x0, x), x1: Math.max(b.x1, x), y0: Math.min(b.y0, y), y1: Math.max(b.y1, y)
}), { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity });

// Tres stickers; el primero tiene un "corazón" suelto a ~1,5 mm.
const SHAPES = [[40, 60, 22], [62, 45, 3], [105, 60, 22], [165, 60, 22]];

test('detecta cada sticker y une los adornos cercanos', () => {
  const { px, w, h } = sheet(SHAPES);
  const r = Core.process(px, w, h, OPTS);
  assert.equal(r.contours.length, 3);
});

test('el corte rodea la figura con el desplazamiento pedido', () => {
  const { px, w, h } = sheet([[100, 60, 25]]);
  const [poly] = Core.process(px, w, h, OPTS).contours;
  const b = bbox(poly);
  const radius = (b.x1 - b.x0) / 2;
  assert.ok(Math.abs(radius - 28) < 1.5, `radio ${radius}`);
  for (const [x, y] of poly) assert.ok(Math.hypot(x - 100, y - 60) > 25.5, 'el corte no toca la figura');
});

test('con cantidad fija agrupa las piezas más cercanas', () => {
  const { px, w, h } = sheet(SHAPES);
  assert.equal(Core.process(px, w, h, { ...OPTS, count: 2 }).contours.length, 2);
  assert.equal(Core.process(px, w, h, { ...OPTS, count: 4 }).contours.length, 4);
});

test('los cortes de stickers vecinos no se tocan', () => {
  const { px, w, h } = sheet(SHAPES);
  const polys = Core.process(px, w, h, OPTS).contours;
  const [a, b] = polys.map(bbox).sort((p, q) => p.x0 - q.x0);
  assert.ok(b.x0 - a.x1 >= OPTS.gapMm - 0.5, `separación ${b.x0 - a.x1}`);
});

test('DXF R12 con polilíneas cerradas en milímetros', () => {
  const dxf = Core.toDXF([[[0, 0], [10, 0], [10, 5]]], 'mm');
  const lines = dxf.split('\r\n');
  assert.equal(lines[1], 'SECTION');
  assert.ok(dxf.includes('AC1009'));
  assert.equal(lines.filter((l) => l === 'VERTEX').length, 3);
  assert.equal(lines[lines.indexOf('POLYLINE') + 12], '1'); // flag 70 = cerrada
  assert.ok(dxf.trimEnd().endsWith('EOF'));
  assert.ok(Core.toDXF([[[25.4, 0], [0, 25.4], [0, 0]]], 'in').includes('\r\n1.0000\r\n'));
});
