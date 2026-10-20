// All dimensions are in millimetres, measured from the top-left of the A4.
// Illustrator matrix: 2 x 5 designs, each 95 x 55, centred on 210 x 297.
export const MATRIX = Object.freeze({
  width: 210, height: 297, columns: 2, rows: 5, capacity: 10,
  designWidth: 95, designHeight: 55, trimWidth: 90, trimHeight: 50,
  bleed: 2.5, left: 10, top: 11
});
export const MAX_CARDS = 1000;
export const DEFAULT_PLACEMENT = Object.freeze({
  rotation: 0, fit: 'cover', zoom: 1, focusX: 0.5, focusY: 0.5
});

export function getSlot(index) {
  if (!Number.isInteger(index) || index < 0 || index >= MATRIX.capacity) {
    throw new Error('La posición de tarjeta no es válida.');
  }
  return {
    x: MATRIX.left + (index % MATRIX.columns) * MATRIX.designWidth,
    y: MATRIX.top + Math.floor(index / MATRIX.columns) * MATRIX.designHeight,
    width: MATRIX.designWidth, height: MATRIX.designHeight
  };
}

export function getBackSlot(index, flip = 'long') {
  const row = Math.floor(index / MATRIX.columns);
  const column = index % MATRIX.columns;
  return flip === 'short'
    ? (MATRIX.rows - 1 - row) * MATRIX.columns + column
    : row * MATRIX.columns + (MATRIX.columns - 1 - column);
}

export function validateJob(designs, mode = 'simple') {
  if (!designs.length) return 'Agregá al menos un diseño de frente.';
  let total = 0;
  for (const design of designs) {
    if (!Number.isInteger(design.quantity) || design.quantity < 1) {
      return `Ingresá una cantidad entera mayor que cero para ${design.name}.`;
    }
    total += design.quantity;
    if (!design.front) return `Falta el frente de ${design.name}.`;
    if (mode === 'duplex' && !design.back) return `Falta el dorso de ${design.name}.`;
  }
  return total > MAX_CARDS ? `El máximo por PDF es de ${MAX_CARDS} tarjetas.` : '';
}

export function paginateDesigns(designs) {
  const pages = [];
  for (const design of designs) {
    // Invalid inputs must not allocate an unbounded preview.
    if (!Number.isInteger(design.quantity) || design.quantity < 1) continue;
    for (let copy = 0; copy < Math.min(design.quantity, MAX_CARDS); copy += 1) {
      if (!pages.length || pages.at(-1).length === MATRIX.capacity) pages.push([]);
      pages.at(-1).push(design);
      if (pages.length * MATRIX.capacity >= MAX_CARDS && pages.at(-1).length === MATRIX.capacity) return pages;
    }
  }
  return pages;
}

export function getPlacement(side, box, turn = 0) {
  const { width, height } = side.asset;
  const rotation = ((side.rotation % 360) + 360) % 360;
  const sideways = rotation % 180 !== 0;
  const rotatedWidth = sideways ? height : width;
  const rotatedHeight = sideways ? width : height;
  const scale = (side.fit === 'contain' ? Math.min : Math.max)(
    box.width / rotatedWidth, box.height / rotatedHeight
  ) * (side.fit === 'contain' ? 1 : side.zoom);
  const drawnWidth = rotatedWidth * scale;
  const drawnHeight = rotatedHeight * scale;
  let centerX = box.x + (box.width - drawnWidth) * side.focusX + drawnWidth / 2;
  let centerY = box.y + (box.height - drawnHeight) * side.focusY + drawnHeight / 2;
  if (turn === 180) {
    centerX = 2 * (box.x + box.width / 2) - centerX;
    centerY = 2 * (box.y + box.height / 2) - centerY;
  }
  return { centerX, centerY, width: width * scale, height: height * scale, rotation: rotation + turn };
}

export function getTrimBox(box) {
  return { x: box.x + MATRIX.bleed, y: box.y + MATRIX.bleed, width: MATRIX.trimWidth, height: MATRIX.trimHeight };
}

// Marks stop at the trim line and extend into the discarded bleed.
// A white under-stroke keeps the black hairline visible on dark artwork.
export function getCutLines(box) {
  const trim = getTrimBox(box);
  const length = 2;
  const lines = [];
  for (const x of [trim.x, trim.x + trim.width]) {
    for (const y of [trim.y, trim.y + trim.height]) {
      const dx = x === trim.x ? -length : length;
      const dy = y === trim.y ? -length : length;
      lines.push([x + dx, y, x, y], [x, y + dy, x, y]);
    }
  }
  return lines;
}
