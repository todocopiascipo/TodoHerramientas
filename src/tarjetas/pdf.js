import {
  PDFDocument, PDFName, degrees, rgb,
  pushGraphicsState, popGraphicsState, rectangle, clip, endPath
} from 'pdf-lib';
import { MATRIX, getSlot, getBackSlot, getPlacement, getCutLines, paginateDesigns, validateJob } from './layout.js';

const PT = 72 / 25.4;

async function embedAsset(document, asset) {
  if (asset.kind === 'pdf') {
    const source = await PDFDocument.load(asset.bytes);
    const sourcePage = source.getPage(asset.pageIndex);
    const crop = sourcePage.getCropBox();
    if (!sourcePage.node.Contents()) {
      sourcePage.drawRectangle({ ...crop, color: rgb(1, 1, 1) });
    }
    const angle = ((sourcePage.getRotation().angle % 360) + 360) % 360;
    const unit = Number(sourcePage.node.get(PDFName.of('UserUnit'))?.asNumber?.() || 1);
    const { x, y, width: w, height: h } = crop;
    // Normalise /Rotate, nonzero CropBox origin and /UserUnit to match PDF.js.
    const matrices = {
      0: [unit, 0, 0, unit, -x * unit, -y * unit],
      90: [0, -unit, unit, 0, -y * unit, (x + w) * unit],
      180: [-unit, 0, 0, -unit, (x + w) * unit, (y + h) * unit],
      270: [0, unit, -unit, 0, (y + h) * unit, -x * unit]
    };
    const embedded = await document.embedPage(sourcePage, {
      left: x, bottom: y, right: x + w, top: y + h
    }, matrices[angle]);
    // drawPage's scale uses these dimensions; the form's matrix normalises its origin.
    embedded.width = (angle % 180 ? h : w) * unit;
    embedded.height = (angle % 180 ? w : h) * unit;
    return embedded;
  }
  return asset.kind === 'jpeg' ? document.embedJpg(asset.bytes) : document.embedPng(asset.bytes);
}

function drawArtwork(page, embedded, side, slot, turn) {
  const place = getPlacement(side, slot, turn);
  const width = place.width * PT;
  const height = place.height * PT;
  const angle = -place.rotation * Math.PI / 180;
  const options = {
    x: place.centerX * PT - (Math.cos(angle) * width - Math.sin(angle) * height) / 2,
    y: (MATRIX.height - place.centerY) * PT - (Math.sin(angle) * width + Math.cos(angle) * height) / 2,
    width, height, rotate: degrees(-place.rotation)
  };
  page.pushOperators(
    pushGraphicsState(),
    rectangle(slot.x * PT, (MATRIX.height - slot.y - slot.height) * PT, slot.width * PT, slot.height * PT),
    clip(), endPath()
  );
  // Transparent artwork and "fit entire" both have a white paper background.
  page.drawRectangle({
    x: slot.x * PT, y: (MATRIX.height - slot.y - slot.height) * PT,
    width: slot.width * PT, height: slot.height * PT, color: rgb(1, 1, 1)
  });
  if (side.asset.kind === 'pdf') page.drawPage(embedded, options);
  else page.drawImage(embedded, options);
  page.pushOperators(popGraphicsState());
}

export async function createTarjetasPdf(designs, { mode = 'simple', flip = 'long', cutMarks = true } = {}) {
  const error = validateJob(designs, mode);
  if (error) throw new Error(error);
  const document = await PDFDocument.create();
  document.setTitle('TARJETAS - 90 x 50 mm');
  document.setSubject('A4. Diseños 95 x 55 mm. Imprimir sin bordes a tamaño real 100%.');
  document.setCreator('Todo Copias - TARJETAS');
  const preferences = document.catalog.getOrCreateViewerPreferences();
  preferences.setPrintScaling('None');
  if (mode === 'duplex') preferences.setDuplex(flip === 'long' ? 'DuplexFlipLongEdge' : 'DuplexFlipShortEdge');
  const assets = new Map();
  for (const design of designs) {
    for (const side of [design.front, ...(mode === 'duplex' ? [design.back] : [])]) {
      if (!assets.has(side.asset)) assets.set(side.asset, await embedAsset(document, side.asset));
    }
  }
  for (const items of paginateDesigns(designs)) {
    for (const face of mode === 'duplex' ? ['front', 'back'] : ['front']) {
      const page = document.addPage([MATRIX.width * PT, MATRIX.height * PT]);
      items.forEach((design, index) => {
        const slot = getSlot(face === 'back' ? getBackSlot(index, flip) : index);
        const side = design[face];
        drawArtwork(page, assets.get(side.asset), side, slot, face === 'back' && flip === 'short' ? 180 : 0);
      });
      if (cutMarks && face === 'front') {
        for (const [color, thickness] of [[rgb(1, 1, 1), 0.65], [rgb(0, 0, 0), 0.25]]) {
          items.forEach((_, index) => getCutLines(getSlot(index)).forEach(([x1, y1, x2, y2]) => {
            page.drawLine({
              start: { x: x1 * PT, y: (MATRIX.height - y1) * PT },
              end: { x: x2 * PT, y: (MATRIX.height - y2) * PT },
              color, thickness
            });
          }));
        }
      }
    }
  }
  return document.save();
}
