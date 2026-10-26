import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import {
  DEFAULT_CONFIG, countPages, exportPresets, formatNumber, mergePresets, normalizeConfig,
  parsePresetFile, safeFileName, validateConfig
} from '../src/talonarios/core.js';
import { createNumberedPdf } from '../src/talonarios/pdf.js';

const config = (overrides = {}) => normalizeConfig({ ...DEFAULT_CONFIG, ...overrides });

async function basePdf() {
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]);
  doc.addPage([595, 842]);
  return doc.save();
}

test('formatea el número con texto previo, prefijo y ceros', () => {
  assert.equal(formatNumber(config(), 1000), 'N° 10-0001000');
  assert.equal(formatNumber(config({ numberPrefixText: '', numberPrefix: '', digits: 0 }), 7), '7');
});

test('cuenta páginas con y sin ORIGINAL/COPIA', () => {
  assert.equal(countPages(config({ startNumber: 1, endNumber: 50 })), 100);
  assert.equal(countPages(config({ startNumber: 1, endNumber: 50, duplicate: false })), 50);
  assert.equal(countPages(config({ startNumber: 5, endNumber: 1 })), 0);
});

test('valida el rango y marca el paso y campo con error', () => {
  const result = validateConfig(config({ startNumber: 10, endNumber: 5 }));
  assert.equal(result.valid, false);
  assert.deepEqual(result.errors.map((item) => [item.step, item.field]), [[2, 'endNumber']]);
  assert.equal(validateConfig(config({ startNumber: '' })).errors[0].field, 'startNumber');
  assert.equal(validateConfig(config({ startNumber: 1.5 })).valid, false);
  assert.equal(validateConfig(config()).valid, true);
});

test('avisa cuando el número no entra en los dígitos y cuando el trabajo es grande', () => {
  const digits = validateConfig(config({ startNumber: 123450, endNumber: 123456, digits: 4 }));
  assert.equal(digits.valid, true);
  assert.ok(digits.warnings.some((item) => item.field === 'digits'));
  assert.equal(validateConfig(config({ startNumber: 1, endNumber: 3000 })).valid, false);
  assert.ok(validateConfig(config({ startNumber: 1, endNumber: 1000 })).warnings.length > 0);
});

test('ignora la insignia apagada y avisa campos fuera de la página', () => {
  const off = config({ duplicate: false, originalText: '', badge: { size: 0 } });
  assert.equal(validateConfig(off).valid, true);
  const outside = validateConfig(config({ number: { x: 900, y: 10 } }), { pageSize: { width: 595, height: 842 } });
  assert.ok(outside.warnings.some((item) => item.field === 'number.x'));
});

test('limpia el nombre de archivo', () => {
  assert.equal(safeFileName('cliente/abril'), 'cliente-abril.pdf');
  assert.equal(safeFileName('  '), 'pdf-numerado.pdf');
  assert.equal(safeFileName('ok.PDF'), 'ok.PDF');
});

test('exporta e importa presets y reemplaza por nombre', () => {
  const presets = [{ name: 'Kiosco', config: config({ startNumber: 1 }) }];
  const imported = parsePresetFile(exportPresets(presets));
  assert.equal(imported[0].config.startNumber, 1);
  const merged = mergePresets([{ name: 'Kiosco', config: config() }, { name: 'Almacén', config: config() }], imported);
  assert.deepEqual(merged.map((item) => item.name), ['Almacén', 'Kiosco']);
  assert.equal(merged[1].config.startNumber, 1);
  assert.equal(parsePresetFile(JSON.stringify([{ name: 'Lista', config: {} }])).length, 1);
  assert.throws(() => parsePresetFile('no json'), /JSON/);
  assert.throws(() => parsePresetFile('{"presets":[{"name":""}]}'), /válidos/);
});

test('genera original y copia por número usando sólo la primera página', async () => {
  const progress = [];
  const bytes = await createNumberedPdf(await basePdf(), config({ startNumber: 1, endNumber: 3 }), [], {
    onProgress: (done, total) => progress.push([done, total])
  });
  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 6);
  assert.deepEqual(progress.at(-1), [6, 6]);
});

test('la vista previa genera sólo el primer número y respeta la segunda numeración', async () => {
  const bytes = await createNumberedPdf(await basePdf(), config({ duplicate: false, secondNumberEnabled: true }), [], { previewOnly: true });
  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 1);
});
