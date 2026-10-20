import * as pdfjs from 'pdfjs-dist';
import worker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { DEFAULT_PLACEMENT } from './layout.js';

pdfjs.GlobalWorkerOptions.workerSrc = worker;
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    image.src = url;
  });
}

export async function readPdfPage(bytes, name, pageIndex = 0) {
  let source;
  try {
    source = await pdfjs.getDocument({ data: bytes.slice() }).promise;
    const page = await source.getPage(pageIndex + 1);
    const dimensions = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(3, 1800 / Math.max(dimensions.width, dimensions.height)) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    return {
      kind: 'pdf', name, bytes, pageIndex, pageCount: source.numPages,
      width: dimensions.width, height: dimensions.height,
      image: canvas, thumbnail: canvas.toDataURL('image/png')
    };
  } catch (error) {
    if (error.name === 'PasswordException') throw new Error('El PDF tiene contraseña. Exportalo sin protección para usarlo.');
    throw new Error('No se pudo leer esa página del PDF. Comprobá que el archivo sea válido.');
  } finally {
    await source?.destroy();
  }
}

export async function readArtwork(file) {
  if (file.size > MAX_FILE_SIZE) throw new Error('Cada archivo puede pesar hasta 50 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
    return { ...DEFAULT_PLACEMENT, asset: await readPdfPage(bytes, file.name) };
  }
  if (!/\.(jpe?g|png|webp)$/i.test(file.name) && !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Usá JPG, PNG, WebP o PDF. Desde Illustrator, guardá el diseño como PDF.');
  }
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    if (image.naturalWidth * image.naturalHeight > MAX_PIXELS) throw new Error('La imagen supera los 40 megapíxeles. Reducí su tamaño antes de cargarla.');
    // Canvas resolves EXIF orientation identically for preview and exported pixels.
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext('2d').drawImage(image, 0, 0);
    const isJpeg = /jpe?g$/i.test(file.name) || file.type === 'image/jpeg';
    const mime = isJpeg ? 'image/jpeg' : 'image/png';
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, mime, 0.98));
    if (!blob) throw new Error('No se pudo preparar la imagen.');
    const thumbnailCanvas = document.createElement('canvas');
    thumbnailCanvas.width = 320;
    thumbnailCanvas.height = Math.max(1, Math.round(320 * canvas.height / canvas.width));
    thumbnailCanvas.getContext('2d').drawImage(canvas, 0, 0, thumbnailCanvas.width, thumbnailCanvas.height);
    return {
      ...DEFAULT_PLACEMENT,
      asset: {
        kind: isJpeg ? 'jpeg' : 'png', name: file.name, image: canvas,
        bytes: new Uint8Array(await blob.arrayBuffer()),
        width: canvas.width, height: canvas.height, thumbnail: thumbnailCanvas.toDataURL()
      }
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
