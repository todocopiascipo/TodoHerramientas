import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, PDFName, decodePDFRawStream, degrees, rgb } from 'pdf-lib';
import {
  MATRIX, DEFAULT_PLACEMENT, getSlot, getBackSlot, getTrimBox, getCutLines,
  getPlacement, paginateDesigns, validateJob
} from '../src/tarjetas/layout.js';
import { createTarjetasPdf } from '../src/tarjetas/pdf.js';

const PT = 72 / 25.4;
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.0001, `${actual} != ${expected}`);
const side = { ...DEFAULT_PLACEMENT, asset: { width: 950, height: 550 } };
const makeDesign = (id, quantity = 10) => ({ id, name: id, quantity, front: side, back: side });

function content(document, page) {
  const contents = page.node.Contents();
  return Array.from({ length: contents.size() }, (_, index) =>
    new TextDecoder().decode(decodePDFRawStream(document.context.lookup(contents.get(index))).decode())
  ).join('\n');
}

async function pdfSide(rotation = 0) {
  const document = await PDFDocument.create();
  const page = document.addPage([320, 220]);
  page.setCropBox(20, 30, 270, 150);
  page.setRotation(degrees(rotation));
  page.drawRectangle({ x: 20, y: 30, width: 270, height: 150, color: rgb(0.2, 0.3, 0.7) });
  const sideways = rotation % 180 !== 0;
  return {
    ...DEFAULT_PLACEMENT,
    asset: {
      kind: 'pdf', pageIndex: 0, bytes: await document.save(),
      width: sideways ? 150 : 270, height: sideways ? 270 : 150
    }
  };
}

test('ten exact 95 x 55 designs centred on A4, each with 90 x 50 trim', () => {
  for (let index = 0; index < 10; index += 1) {
    const slot = getSlot(index);
    assert.equal(slot.width, 95);
    assert.equal(slot.height, 55);
    const trim = getTrimBox(slot);
    assert.equal(trim.width, 90);
    assert.equal(trim.height, 50);
    close(trim.x - slot.x, 2.5);
    close(trim.y - slot.y, 2.5);
  }
  assert.deepEqual(getSlot(0), { x: 10, y: 11, width: 95, height: 55 });
  assert.deepEqual(getSlot(9), { x: 105, y: 231, width: 95, height: 55 });
  close(210 - (getSlot(9).x + 95), getSlot(0).x);
  close(297 - (getSlot(9).y + 55), getSlot(0).y);
});

test('cut marks terminate exactly on trim and extend into the discarded bleed', () => {
  const box = getSlot(0);
  const trim = getTrimBox(box);
  const lines = getCutLines(box);
  assert.equal(lines.length, 8);
  for (const [x1, y1, x2, y2] of lines) {
    assert.ok(x2 === trim.x || x2 === trim.x + trim.width);
    assert.ok(y2 === trim.y || y2 === trim.y + trim.height);
    assert.ok(x1 >= box.x && x1 <= box.x + box.width);
    assert.ok(y1 >= box.y && y1 <= box.y + box.height);
    assert.ok(!(x1 > trim.x && x1 < trim.x + trim.width && y1 > trim.y && y1 < trim.y + trim.height));
    close(Math.hypot(x2 - x1, y2 - y1), 2);
  }
});

test('both duplex flips align the back rectangle with its front after turning the paper', () => {
  for (let index = 0; index < 10; index += 1) {
    const front = getSlot(index);
    const long = getSlot(getBackSlot(index, 'long'));
    close(MATRIX.width - long.x - long.width, front.x);
    close(long.y, front.y);
    const short = getSlot(getBackSlot(index, 'short'));
    close(short.x, front.x);
    close(MATRIX.height - short.y - short.height, front.y);
    assert.equal(getBackSlot(getBackSlot(index, 'long'), 'long'), index);
    assert.equal(getBackSlot(getBackSlot(index, 'short'), 'short'), index);
  }
  // An incomplete sheet still uses the full sheet's registration positions.
  assert.equal(getBackSlot(0, 'long'), 1);
  assert.equal(getBackSlot(0, 'short'), 8);
});

test('mixed quantities paginate without duplicating or losing copies', () => {
  const pages = paginateDesigns([makeDesign('A', 7), makeDesign('B', 6), makeDesign('C', 10)]);
  assert.deepEqual(pages.map((page) => page.length), [10, 10, 3]);
  assert.deepEqual(pages[0].map(({ id }) => id), ['A', 'A', 'A', 'A', 'A', 'A', 'A', 'B', 'B', 'B']);
  for (const [id, count] of [['A', 7], ['B', 6], ['C', 10]]) {
    assert.equal(pages.flat().filter((item) => item.id === id).length, count);
  }
});

test('invalid quantities and missing backs block export, preview allocation is bounded', () => {
  for (const value of ['', 0, -1, 1.5, NaN, Infinity, 1001]) {
    assert.ok(validateJob([makeDesign('A', value)]));
  }
  assert.ok(validateJob([]));
  assert.ok(validateJob([{ ...makeDesign('A'), back: null }], 'duplex'));
  assert.equal(validateJob([{ ...makeDesign('A'), back: null }], 'simple'), '');
  assert.equal(paginateDesigns([makeDesign('A', 1e10)]).flat().length, 1000);
});

test('crop, fit, rotation and short-edge turn preserve proportions and the crop centre', () => {
  const box = getSlot(0);
  const full = getPlacement(side, box);
  close(full.width, 95);
  close(full.height, 55);
  const rotated = getPlacement({ ...side, rotation: 90 }, box);
  close(rotated.height, box.width);
  assert.ok(rotated.width > box.height);
  const fitted = getPlacement({ ...side, rotation: 90, fit: 'contain', zoom: 3 }, box);
  close(fitted.width, box.height);
  const offset = { ...side, zoom: 2, focusX: 0.2, focusY: 0.8 };
  const normal = getPlacement(offset, box);
  const turned = getPlacement(offset, box, 180);
  close(normal.centerX + turned.centerX, 2 * box.x + box.width);
  close(normal.centerY + turned.centerY, 2 * box.y + box.height);
  close(turned.rotation - normal.rotation, 180);
});

test('PDF has exact A4, print scaling disabled, front-only cut lines and alternating faces', async () => {
  const artwork = await pdfSide();
  const designs = [{ ...makeDesign('A', 11), front: artwork, back: artwork }];
  const document = await PDFDocument.load(await createTarjetasPdf(designs, { mode: 'duplex' }));
  assert.equal(document.getPageCount(), 4);
  assert.equal(document.catalog.getOrCreateViewerPreferences().getPrintScaling(), 'None');
  assert.equal(document.catalog.getOrCreateViewerPreferences().getDuplex(), 'DuplexFlipLongEdge');
  for (const [index, page] of document.getPages().entries()) {
    close(page.getWidth() / PT, 210);
    close(page.getHeight() / PT, 297);
    const operators = content(document, page);
    const count = index < 2 ? 10 : 1;
    assert.equal((operators.match(/ Do\b/g) || []).length, count);
    assert.equal((operators.match(/\nS\b/g) || []).length, index % 2 ? 0 : count * 8 * 2);
    assert.equal((operators.match(/\nW\b/g) || []).length, count);
    assert.ok(!operators.includes('BT')); // no preview numbers/placeholder labels
  }
});

test('simple output omits the back; cut marks can be disabled', async () => {
  const artwork = await pdfSide();
  const document = await PDFDocument.load(await createTarjetasPdf(
    [{ ...makeDesign('A'), front: artwork, back: null }], { cutMarks: false }
  ));
  assert.equal(document.getPageCount(), 1);
  assert.equal((content(document, document.getPage(0)).match(/\nS\b/g) || []).length, 0);
  await assert.rejects(createTarjetasPdf([{ ...makeDesign('A'), front: artwork, back: null }], { mode: 'duplex' }), /dorso/);
});

test('short-edge duplex requests short-edge printing and turns the back artwork', async () => {
  const artwork = await pdfSide();
  const document = await PDFDocument.load(await createTarjetasPdf(
    [{ ...makeDesign('A', 1), front: artwork, back: artwork }], { mode: 'duplex', flip: 'short' }
  ));
  assert.equal(document.catalog.getOrCreateViewerPreferences().getDuplex(), 'DuplexFlipShortEdge');
  assert.match(content(document, document.getPage(1)), /-1 .* -1 0 0 cm/);
});

test('PDF artwork normalises each source rotation and offset CropBox without rasterisation', async () => {
  for (const rotation of [0, 90, 180, 270]) {
    const artwork = await pdfSide(rotation);
    const document = await PDFDocument.load(await createTarjetasPdf([{ ...makeDesign('A', 1), front: artwork }]));
    const xobjects = document.getPage(0).node.Resources().lookup(PDFName.of('XObject'));
    const embedded = document.context.lookup(xobjects.values()[0]);
    assert.equal(embedded.dict.get(PDFName.of('Subtype')).toString(), '/Form');
    assert.deepEqual(embedded.dict.lookup(PDFName.of('BBox')).asArray().map((value) => value.asNumber()), [20, 30, 290, 180]);
    assert.equal(embedded.dict.lookup(PDFName.of('Matrix')).size(), 6);
  }
});

test('a blank PDF page can be used as a back without failing to export', async () => {
  const blank = await PDFDocument.create();
  blank.addPage([95 * PT, 55 * PT]);
  const front = await pdfSide();
  const back = {
    ...DEFAULT_PLACEMENT,
    asset: { kind: 'pdf', pageIndex: 0, width: 95 * PT, height: 55 * PT, bytes: await blank.save() }
  };
  const result = await PDFDocument.load(await createTarjetasPdf(
    [{ ...makeDesign('A', 1), front, back }], { mode: 'duplex' }
  ));
  assert.equal(result.getPageCount(), 2);
});
