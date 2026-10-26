import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { formatNumber } from './core.js';

export const STANDARD_FONTS = [
  { label: 'Helvetica', value: 'Helvetica', pdf: StandardFonts.Helvetica },
  { label: 'Helvetica negrita', value: 'HelveticaBold', pdf: StandardFonts.HelveticaBold },
  { label: 'Times Roman', value: 'TimesRoman', pdf: StandardFonts.TimesRoman },
  { label: 'Times negrita', value: 'TimesRomanBold', pdf: StandardFonts.TimesRomanBold },
  { label: 'Courier', value: 'Courier', pdf: StandardFonts.Courier },
  { label: 'Courier negrita', value: 'CourierBold', pdf: StandardFonts.CourierBold }
];

function hexToRgb(hex) {
  const clean = String(hex || '#111827').replace('#', '').trim();
  const value = clean.length === 3
    ? clean.split('').map((char) => char + char).join('')
    : clean.padEnd(6, '0').slice(0, 6);
  const int = Number.parseInt(value, 16) || 0;
  return rgb(((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255);
}

async function embedSelectedFont(pdfDoc, fontName, customFonts, cache) {
  if (cache.has(fontName)) return cache.get(fontName);
  const standard = STANDARD_FONTS.find((item) => item.value === fontName);
  const custom = customFonts.find((item) => item.id === fontName);
  const font = standard
    ? await pdfDoc.embedFont(standard.pdf)
    : custom
      ? await pdfDoc.embedFont(custom.bytes)
      : await pdfDoc.embedFont(StandardFonts.Helvetica);
  cache.set(fontName, font);
  return font;
}

function drawAlignedText(page, text, field, font) {
  const size = Number(field.size) || 12;
  const width = font.widthOfTextAtSize(text, size);
  let x = Number(field.x) || 0;
  if (field.align === 'center') x -= width / 2;
  if (field.align === 'right') x -= width;
  page.drawText(text, { x, y: Number(field.y) || 0, size, font, color: hexToRgb(field.color) });
}

// Copia la primera página del PDF base una vez por número (dos si hay ORIGINAL/COPIA).
// onProgress(hechas, total) permite mostrar el avance en trabajos grandes.
export async function createNumberedPdf(basePdfBytes, config, customFonts = [], { previewOnly = false, onProgress } = {}) {
  const basePdf = await PDFDocument.load(basePdfBytes);
  const outputPdf = await PDFDocument.create();
  outputPdf.registerFontkit(fontkit);
  const cache = new Map();

  const badgeFont = config.duplicate ? await embedSelectedFont(outputPdf, config.badge.font, customFonts, cache) : null;
  const numberFont = await embedSelectedFont(outputPdf, config.number.font, customFonts, cache);
  const number2Font = config.secondNumberEnabled
    ? await embedSelectedFont(outputPdf, config.number2.font, customFonts, cache)
    : null;

  const start = Number(config.startNumber);
  const end = previewOnly ? start : Number(config.endNumber);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start > end) {
    throw new Error('El rango de numeración no es válido.');
  }

  const labels = config.duplicate ? [config.originalText, config.copyText] : [null];
  const total = (end - start + 1) * labels.length;
  let done = 0;

  for (let current = start; current <= end; current += 1) {
    const numberText = formatNumber(config, current);
    const pages = await outputPdf.copyPages(basePdf, labels.map(() => 0));
    pages.forEach((page, index) => {
      outputPdf.addPage(page);
      if (labels[index]) drawAlignedText(page, labels[index], config.badge, badgeFont);
      drawAlignedText(page, numberText, config.number, numberFont);
      if (number2Font) drawAlignedText(page, numberText, config.number2, number2Font);
    });
    done += pages.length;
    if (onProgress && (done % 50 === 0 || done === total)) {
      onProgress(done, total);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  return outputPdf.save();
}
