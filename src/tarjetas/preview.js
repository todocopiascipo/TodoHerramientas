import { MATRIX, getSlot, getBackSlot, getPlacement, getTrimBox, getCutLines } from './layout.js';

export function paintArtwork(context, side, box, turn = 0) {
  const place = getPlacement(side, box, turn);
  context.save();
  context.beginPath();
  context.rect(box.x, box.y, box.width, box.height);
  context.clip();
  context.fillStyle = '#fff';
  context.fillRect(box.x, box.y, box.width, box.height);
  context.translate(place.centerX, place.centerY);
  context.rotate(place.rotation * Math.PI / 180);
  context.drawImage(side.asset.image, -place.width / 2, -place.height / 2, place.width, place.height);
  context.restore();
}

export function paintSheet(canvas, items, { face, flip, guides, cutMarks, selectedId }) {
  const context = canvas.getContext('2d');
  const scale = 3;
  canvas.width = MATRIX.width * scale;
  canvas.height = MATRIX.height * scale;
  context.scale(scale, scale);
  context.fillStyle = '#fff';
  context.fillRect(0, 0, MATRIX.width, MATRIX.height);
  for (let index = 0; index < MATRIX.capacity; index += 1) {
    const box = getSlot(face === 'back' ? getBackSlot(index, flip) : index);
    const design = items[index];
    const side = design?.[face];
    if (side) paintArtwork(context, side, box, face === 'back' && flip === 'short' ? 180 : 0);
    if (guides) {
      if (!side) {
        context.fillStyle = design ? '#fff7ed' : '#f8fafc';
        context.fillRect(box.x, box.y, box.width, box.height);
        context.fillStyle = '#64748b';
        context.font = '3px sans-serif';
        context.textAlign = 'center';
        context.fillText(design ? 'Cargá el dorso' : 'Espacio disponible', box.x + box.width / 2, box.y + box.height / 2);
      }
      context.strokeStyle = '#0891b2';
      context.lineWidth = 0.18;
      context.setLineDash([1, 0.7]);
      context.strokeRect(box.x, box.y, box.width, box.height);
      const trim = getTrimBox(box);
      context.strokeStyle = '#c0267e';
      context.strokeRect(trim.x, trim.y, trim.width, trim.height);
      context.setLineDash([]);
      if (design?.id === selectedId) {
        context.strokeStyle = '#2563eb';
        context.lineWidth = 0.45;
        context.strokeRect(box.x + 0.3, box.y + 0.3, box.width - 0.6, box.height - 0.6);
      }
      context.fillStyle = '#ffffff';
      context.fillRect(box.x + 3.5, box.y + 3.5, 7, 5);
      context.fillStyle = '#334155';
      context.font = 'bold 3px sans-serif';
      context.textAlign = 'center';
      context.fillText(String(index + 1).padStart(2, '0'), box.x + 7, box.y + 7);
    }
  }
  if (cutMarks && face === 'front') {
    for (const [stroke, width] of [['white', 0.65 * 25.4 / 72], ['black', 0.25 * 25.4 / 72]]) {
      context.strokeStyle = stroke;
      context.lineWidth = width;
      context.beginPath();
      items.forEach((_, index) => getCutLines(getSlot(index)).forEach(([x1, y1, x2, y2]) => {
        context.moveTo(x1, y1);
        context.lineTo(x2, y2);
      }));
      context.stroke();
    }
  }
}
