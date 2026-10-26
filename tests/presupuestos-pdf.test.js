import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// El módulo es un script clásico del navegador: lo ejecutamos en un contexto aislado.
const context = { window: {} };
vm.runInNewContext(readFileSync(new URL('../public/presupuestos-pdf.js', import.meta.url), 'utf8'), context);
const { classifySize, hasColor, computeSheets, totalSheets, suggestBinding } = context.window.PresupuestoPdf;

const BINDINGS = [
  { id: '7-9mm', maxSheets: 50 },
  { id: '12-14mm', maxSheets: 85 },
  { id: '17-20mm', maxSheets: 120 },
  { id: '23-25mm', maxSheets: 160 },
  { id: '29-33mm', maxSheets: 250 },
  { id: '40-45-50mm', maxSheets: 540 }
];

const pages = (spec) => spec.split('').map((char) => ({
  size: char === char.toLowerCase() ? 'A4' : 'A3',
  color: char.toLowerCase() === 'c'
}));

test('clasifica A4, A3 y tamaños parecidos', () => {
  assert.deepEqual({ ...classifySize(595, 842) }, { size: 'A4', exact: true });
  assert.deepEqual({ ...classifySize(842, 595) }, { size: 'A4', exact: true });
  assert.deepEqual({ ...classifySize(842, 1191) }, { size: 'A3', exact: true });
  assert.deepEqual({ ...classifySize(612, 1008) }, { size: 'A4', exact: false });
});

test('simple faz: una hoja por página', () => {
  const sheets = computeSheets(pages('bbcbb'));
  assert.deepEqual({ ...sheets.A4 }, { bw: 4, color: 1 });
  assert.equal(totalSheets(sheets), 5);
});

test('doble faz: la mitad de hojas, redondeando hacia arriba', () => {
  const sheets = computeSheets(pages('bbbbb'), { duplex: true });
  assert.deepEqual({ ...sheets.A4 }, { bw: 3, color: 0 });
});

test('doble faz: una cara en color hace la hoja color', () => {
  const sheets = computeSheets(pages('bcbbcc'), { duplex: true });
  assert.deepEqual({ ...sheets.A4 }, { bw: 1, color: 2 });
});

test('separa A4 de A3 y respeta el modo de color elegido', () => {
  const list = pages('bcBC');
  assert.deepEqual(JSON.parse(JSON.stringify(computeSheets(list))), { A4: { bw: 1, color: 1 }, A3: { bw: 1, color: 1 } });
  assert.deepEqual(JSON.parse(JSON.stringify(computeSheets(list, { colorMode: 'bw' }))), { A4: { bw: 2, color: 0 }, A3: { bw: 2, color: 0 } });
  assert.deepEqual(JSON.parse(JSON.stringify(computeSheets(list, { colorMode: 'color', duplex: true }))), { A4: { bw: 0, color: 1 }, A3: { bw: 0, color: 1 } });
});

test('detecta color solo cuando hay píxeles saturados suficientes', () => {
  const gray = new Uint8ClampedArray(4 * 1000).fill(128);
  assert.equal(hasColor(gray), false);
  const colored = gray.slice();
  for (let index = 0; index < 10; index += 1) colored.set([220, 30, 30, 255], index * 4);
  assert.equal(hasColor(colored), true);
});

test('sugiere el anillado más chico donde entran las hojas', () => {
  assert.equal(suggestBinding(0, BINDINGS), null);
  assert.equal(suggestBinding(50, BINDINGS).option.id, '7-9mm');
  assert.equal(suggestBinding(51, BINDINGS).option.id, '12-14mm');
  assert.equal(suggestBinding(540, BINDINGS).option.id, '40-45-50mm');
  const many = suggestBinding(600, BINDINGS);
  assert.equal(many.tooMany, true);
  assert.equal(many.quantity, 2);
});
