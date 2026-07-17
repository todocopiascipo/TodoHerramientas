const acceptedTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
]);

const state = {
  file: null,
  kind: null,
  originalName: "",
  originalPages: [],
  resultPages: [],
  resultBlob: null,
};

const els = {
  fileInput: document.querySelector("#fileInput"),
  dropZone: document.querySelector("#dropZone"),
  fileName: document.querySelector("#fileName"),
  message: document.querySelector("#message"),
  tonerMode: document.querySelector("#tonerMode"),
  fullInvert: document.querySelector("#fullInvert"),
  grayscale: document.querySelector("#grayscale"),
  blackThreshold: document.querySelector("#blackThreshold"),
  whiteThreshold: document.querySelector("#whiteThreshold"),
  contrast: document.querySelector("#contrast"),
  pdfDpi: document.querySelector("#pdfDpi"),
  blackThresholdValue: document.querySelector("#blackThresholdValue"),
  whiteThresholdValue: document.querySelector("#whiteThresholdValue"),
  contrastValue: document.querySelector("#contrastValue"),
  processBtn: document.querySelector("#processBtn"),
  downloadBtn: document.querySelector("#downloadBtn"),
  clearBtn: document.querySelector("#clearBtn"),
  showOriginalBtn: document.querySelector("#showOriginalBtn"),
  showResultBtn: document.querySelector("#showResultBtn"),
  previewLabel: document.querySelector("#previewLabel"),
  originalCanvas: document.querySelector("#originalCanvas"),
  resultCanvas: document.querySelector("#resultCanvas"),
  emptyPreview: document.querySelector("#emptyPreview"),
};

window.addEventListener("DOMContentLoaded", () => {
  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }
});

els.fileInput.addEventListener("change", (event) => {
  const [file] = event.target.files;
  if (file) loadFile(file);
});

["dragenter", "dragover"].forEach((eventName) => {
  els.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    els.dropZone.classList.add("drag-over");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  els.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    els.dropZone.classList.remove("drag-over");
  });
});

els.dropZone.addEventListener("drop", (event) => {
  const [file] = event.dataTransfer.files;
  if (file) loadFile(file);
});

[els.blackThreshold, els.whiteThreshold, els.contrast].forEach((slider) => {
  slider.addEventListener("input", updateSliderLabels);
});

els.fullInvert.addEventListener("change", () => {
  if (els.fullInvert.checked) {
    els.tonerMode.checked = false;
  }
});

els.tonerMode.addEventListener("change", () => {
  if (els.tonerMode.checked) {
    els.fullInvert.checked = false;
  }
});

els.processBtn.addEventListener("click", processCurrentFile);
els.downloadBtn.addEventListener("click", downloadResult);
els.clearBtn.addEventListener("click", clearApp);
els.showOriginalBtn.addEventListener("click", () => showPreview("original"));
els.showResultBtn.addEventListener("click", () => showPreview("result"));

updateSliderLabels();

async function loadFile(file) {
  clearResultOnly();

  if (!isSupported(file)) {
    clearApp();
    setMessage("El archivo no es compatible. Usa PNG, JPG, JPEG, WEBP o PDF.", true);
    els.fileInput.value = "";
    return;
  }

  state.file = file;
  state.kind = file.type === "application/pdf" ? "pdf" : "image";
  state.originalName = file.name;
  els.fileName.textContent = file.name;
  els.processBtn.disabled = false;
  setMessage("Archivo cargado. Puedes procesarlo cuando quieras.");

  try {
    if (state.kind === "pdf") {
      await renderPdfPreview(file);
    } else {
      await renderImagePreview(file);
    }
    showPreview("original");
  } catch (error) {
    console.error(error);
    setMessage("No se pudo leer el archivo. Prueba con otro archivo.", true);
    clearApp();
  }
}

function isSupported(file) {
  const extension = file.name.split(".").pop().toLowerCase();
  const validExtension = ["png", "jpg", "jpeg", "webp", "pdf"].includes(extension);
  return acceptedTypes.has(file.type) || validExtension;
}

async function renderImagePreview(file) {
  const image = await fileToImage(file);
  const canvas = createCanvas(image.naturalWidth, image.naturalHeight);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.imageSmoothingEnabled = false;
  context.drawImage(image, 0, 0);
  state.originalPages = [{ canvas, width: canvas.width, height: canvas.height }];
  copyCanvas(canvas, els.originalCanvas);
  els.emptyPreview.hidden = true;
}

async function renderPdfPreview(file) {
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const page = await pdf.getPage(1);
  const canvas = await renderPdfPage(page, Number(els.pdfDpi.value));
  state.originalPages = [{ canvas, width: canvas.width, height: canvas.height }];
  copyCanvas(canvas, els.originalCanvas);
  els.emptyPreview.hidden = true;
  setMessage(`PDF cargado con ${pdf.numPages} página${pdf.numPages === 1 ? "" : "s"}. La vista previa muestra la primera.`);
}

async function processCurrentFile() {
  if (!state.file) return;

  els.processBtn.disabled = true;
  els.downloadBtn.disabled = true;
  setMessage("Procesando archivo...");

  try {
    if (state.kind === "pdf") {
      await processPdf();
    } else {
      await processImage();
    }

    els.downloadBtn.disabled = false;
    setMessage("Resultado listo para descargar.");
    showPreview("result");
  } catch (error) {
    console.error(error);
    setMessage("Ocurrió un error al procesar el archivo.", true);
  } finally {
    els.processBtn.disabled = false;
  }
}

async function processImage() {
  const source = state.originalPages[0].canvas;
  const result = invertCanvas(source);
  state.resultPages = [{ canvas: result, width: result.width, height: result.height }];
  copyCanvas(result, els.resultCanvas);
  state.resultBlob = await canvasToBlob(result, "image/png", 1);
}

async function processPdf() {
  const pdf = await pdfjsLib.getDocument({ data: await state.file.arrayBuffer() }).promise;
  const { jsPDF } = window.jspdf;
  const pdfDoc = new jsPDF({ unit: "pt", compress: true });
  pdfDoc.deletePage(1);
  state.resultPages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    setMessage(`Procesando página ${pageNumber} de ${pdf.numPages}...`);
    const page = await pdf.getPage(pageNumber);
    const printViewport = page.getViewport({ scale: 1 });
    const rendered = await renderPdfPage(page, Number(els.pdfDpi.value));
    const inverted = invertCanvas(rendered);
    const imageData = inverted.toDataURL("image/jpeg", 0.96);
    const orientation = printViewport.width > printViewport.height ? "landscape" : "portrait";

    pdfDoc.addPage([printViewport.width, printViewport.height], orientation);
    pdfDoc.addImage(imageData, "JPEG", 0, 0, printViewport.width, printViewport.height);

    if (pageNumber === 1) {
      state.resultPages.push({ canvas: inverted, width: inverted.width, height: inverted.height });
      copyCanvas(inverted, els.resultCanvas);
    }
  }

  state.resultBlob = pdfDoc.output("blob");
}

async function renderPdfPage(page, dpi) {
  const scale = dpi / 72;
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.imageSmoothingEnabled = false;
  await page.render({ canvasContext: context, viewport }).promise;
  return canvas;
}

function invertCanvas(sourceCanvas) {
  const canvas = createCanvas(sourceCanvas.width, sourceCanvas.height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.imageSmoothingEnabled = false;
  context.drawImage(sourceCanvas, 0, 0);

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const options = getOptions();

  for (let index = 0; index < data.length; index += 4) {
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const alpha = data[index + 3];
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    let nextR;
    let nextG;
    let nextB;

    if (options.fullInvert) {
      nextR = 255 - r;
      nextG = 255 - g;
      nextB = 255 - b;
    } else if (options.tonerMode) {
      const invertedLum = tonerInvertLuminance(luminance, options.blackThreshold, options.whiteThreshold);
      nextR = invertedLum;
      nextG = invertedLum;
      nextB = invertedLum;
    } else {
      const inverted = 255 - luminance;
      nextR = inverted;
      nextG = inverted;
      nextB = inverted;
    }

    if (options.grayscale) {
      const gray = 0.2126 * nextR + 0.7152 * nextG + 0.0722 * nextB;
      nextR = gray;
      nextG = gray;
      nextB = gray;
    }

    data[index] = clamp(applyContrast(nextR, options.contrast));
    data[index + 1] = clamp(applyContrast(nextG, options.contrast));
    data[index + 2] = clamp(applyContrast(nextB, options.contrast));
    data[index + 3] = alpha;
  }

  context.putImageData(imageData, 0, 0);
  return canvas;
}

function tonerInvertLuminance(luminance, blackThreshold, whiteThreshold) {
  if (luminance <= blackThreshold) return 255;
  if (luminance >= whiteThreshold) return 0;

  const range = Math.max(1, whiteThreshold - blackThreshold);
  const progress = (luminance - blackThreshold) / range;
  const smooth = progress * progress * (3 - 2 * progress);
  return 255 - smooth * 255;
}

function applyContrast(value, contrast) {
  const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  return factor * (value - 128) + 128;
}

function clamp(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function getOptions() {
  return {
    tonerMode: els.tonerMode.checked,
    fullInvert: els.fullInvert.checked,
    grayscale: els.grayscale.checked,
    blackThreshold: Number(els.blackThreshold.value),
    whiteThreshold: Number(els.whiteThreshold.value),
    contrast: Number(els.contrast.value),
  };
}

function showPreview(mode) {
  const showResult = mode === "result";
  if (showResult && !state.resultBlob) {
    setMessage("Primero procesa el archivo para ver el resultado invertido.", true);
    return;
  }

  els.originalCanvas.hidden = showResult;
  els.resultCanvas.hidden = !showResult;
  els.showOriginalBtn.classList.toggle("active", !showResult);
  els.showResultBtn.classList.toggle("active", showResult);
  els.previewLabel.textContent = showResult ? "Vista invertida" : "Vista original";
}

function downloadResult() {
  if (!state.resultBlob) return;

  const extension = state.kind === "pdf" ? "pdf" : "png";
  const url = URL.createObjectURL(state.resultBlob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${baseName(state.originalName)}_invertido.${extension}`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function clearApp() {
  state.file = null;
  state.kind = null;
  state.originalName = "";
  state.originalPages = [];
  clearResultOnly();
  els.fileInput.value = "";
  els.fileName.textContent = "Ningún archivo cargado";
  els.processBtn.disabled = true;
  clearCanvas(els.originalCanvas);
  clearCanvas(els.resultCanvas);
  els.emptyPreview.hidden = false;
  setMessage("");
  showPreview("original");
}

function clearResultOnly() {
  state.resultPages = [];
  state.resultBlob = null;
  els.downloadBtn.disabled = true;
  clearCanvas(els.resultCanvas);
}

function setMessage(text, isError = false) {
  els.message.textContent = text;
  els.message.classList.toggle("error", isError);
}

function updateSliderLabels() {
  els.blackThresholdValue.value = els.blackThreshold.value;
  els.whiteThresholdValue.value = els.whiteThreshold.value;
  els.contrastValue.value = els.contrast.value;
}

function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(image.src);
      resolve(image);
    };
    image.onerror = reject;
    image.src = URL.createObjectURL(file);
  });
}

function createCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function copyCanvas(source, target) {
  target.width = source.width;
  target.height = source.height;
  const context = target.getContext("2d");
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, target.width, target.height);
  context.drawImage(source, 0, 0);
}

function clearCanvas(canvas) {
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width || 1, canvas.height || 1);
  canvas.width = 0;
  canvas.height = 0;
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function baseName(fileName) {
  return fileName.replace(/\.[^/.]+$/, "");
}
