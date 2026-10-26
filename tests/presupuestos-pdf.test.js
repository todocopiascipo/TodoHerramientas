import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// El módulo es un script clásico del navegador: lo ejecutamos en un contexto aislado.
const context = { window: {} };
vm.runInNewContext(readFileSync(new URL('../public/presupuestos-pdf.js', import.meta.url), 'utf8'), context);
const { parsePageSelection, sheetsFor, suggestBinding } = context.window.PresupuestoPdf;

const BINDINGS = [
  { id: '7-9mm', maxSheets: 50 },
  { id: '12-14mm', maxSheets: 85 },
  { id: '17-20mm', maxSheets: 120 },
  { id: '23-25mm', maxSheets: 160 },
  { id: '29-33mm', maxSheets: 250 },
  { id: '40-45-50mm', maxSheets: 540 }
];

const pagesOf = (text, count) => [...parsePageSelection(text, count).pages];

test('interpreta rangos y páginas sueltas sin repetir', () => {
  assert.deepEqual(pagesOf('1-3, 5', 10), [1, 2, 3, 5]);
  assert.deepEqual(pagesOf('8, 2-3; 3', 10), [2, 3, 8]);
  assert.deepEqual(pagesOf(' 5 - 2 ', 10), [2, 3, 4, 5]);
  assert.deepEqual(pagesOf('10', 10), [10]);
});

test('rechaza páginas fuera del PDF o texto inválido', () => {
  assert.match(parsePageSelection('1-12', 10).error, /10 páginas/);
  assert.match(parsePageSelection('0', 10).error, /afuera/);
  assert.match(parsePageSelection('a-b', 10).error, /no es una página/);
  assert.match(parsePageSelection('  ', 10).error, /Escribí/);
});

test('simple faz: hojas = páginas; doble faz: la mitad hacia arriba', () => {
  assert.equal(sheetsFor(7, false), 7);
  assert.equal(sheetsFor(7, true), 4);
  assert.equal(sheetsFor(8, true), 4);
  assert.equal(sheetsFor(0, true), 0);
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
