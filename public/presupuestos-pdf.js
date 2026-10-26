// Análisis de PDF para Presupuestos: cuenta páginas, detecta tamaño (A4/A3) y color,
// y convierte páginas en hojas según simple o doble faz.
// Script clásico: expone window.PresupuestoPdf (los tests lo cargan con node:vm).
(function (global) {
  const PDFJS_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
  const PDFJS_WORKER_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  // Lado mayor en puntos: A4 = 842, oficio = 1008, A3 = 1191.
  const A3_MIN_LONG_SIDE = 1100;
  const A4_LONG_SIDE = 842;
  const A3_LONG_SIDE = 1191;
  const SIZE_TOLERANCE = 12;

  // Un píxel es "color" si sus canales difieren más que esto (los grises tienen R≈G≈B).
  const CHROMA_THRESHOLD = 48;
  const MIN_COLOR_RATIO = 0.0004;
  const ANALYSIS_WIDTH = 220;

  function classifySize(widthPt, heightPt) {
    const longSide = Math.max(widthPt, heightPt);
    const size = longSide >= A3_MIN_LONG_SIDE ? "A3" : "A4";
    const expected = size === "A3" ? A3_LONG_SIDE : A4_LONG_SIDE;
    return { size, exact: Math.abs(longSide - expected) <= SIZE_TOLERANCE };
  }

  // Recibe los datos RGBA de una imagen y dice si tiene color visible.
  function hasColor(rgba) {
    const total = rgba.length / 4;
    const needed = Math.max(4, Math.round(total * MIN_COLOR_RATIO));
    let colored = 0;
    for (let index = 0; index < rgba.length; index += 4) {
      if (rgba[index + 3] < 128) continue;
      const r = rgba[index];
      const g = rgba[index + 1];
      const b = rgba[index + 2];
      if (Math.max(r, g, b) - Math.min(r, g, b) > CHROMA_THRESHOLD) {
        colored += 1;
        if (colored >= needed) return true;
      }
    }
    return false;
  }

  // pages: [{ size: "A4" | "A3", color: bool }]. colorMode: "auto" | "bw" | "color".
  // En doble faz se juntan las páginas de a dos (dentro de cada tamaño, en orden):
  // si cualquiera de las dos caras es color, la hoja se cobra como color.
  function computeSheets(pages, { duplex = false, colorMode = "auto" } = {}) {
    const result = { A4: { bw: 0, color: 0 }, A3: { bw: 0, color: 0 } };
    ["A4", "A3"].forEach((size) => {
      const list = pages.filter((page) => page.size === size).map((page) => (
        colorMode === "bw" ? false : colorMode === "color" ? true : Boolean(page.color)
      ));
      const step = duplex ? 2 : 1;
      for (let index = 0; index < list.length; index += step) {
        const isColor = list[index] || (duplex && Boolean(list[index + 1]));
        result[size][isColor ? "color" : "bw"] += 1;
      }
    });
    return result;
  }

  function totalSheets(sheets) {
    return sheets.A4.bw + sheets.A4.color + sheets.A3.bw + sheets.A3.color;
  }

  // Elige el anillado más chico donde entran las hojas. options: [{ id, maxSheets }].
  function suggestBinding(sheetCount, options) {
    if (!sheetCount) return null;
    const sorted = [...options].sort((a, b) => a.maxSheets - b.maxSheets);
    const fit = sorted.find((option) => option.maxSheets >= sheetCount);
    if (fit) return { option: fit, quantity: 1 };
    const largest = sorted[sorted.length - 1];
    return { option: largest, quantity: Math.ceil(sheetCount / largest.maxSheets), tooMany: true };
  }

  let pdfjsPromise = null;

  function loadPdfJs() {
    if (global.pdfjsLib) return Promise.resolve(global.pdfjsLib);
    if (!pdfjsPromise) {
      pdfjsPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = PDFJS_URL;
        script.onload = () => {
          global.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
          resolve(global.pdfjsLib);
        };
        script.onerror = () => {
          pdfjsPromise = null;
          reject(new Error("No se pudo cargar el lector de PDF. Revisá la conexión a internet."));
        };
        document.head.appendChild(script);
      });
    }
    return pdfjsPromise;
  }

  // Analiza un archivo PDF página por página. onProgress(hechas, total).
  async function analyzePdf(file, { detectColor = true, onProgress } = {}) {
    const pdfjs = await loadPdfJs();
    let pdf;
    try {
      pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    } catch (error) {
      if (error && error.name === "PasswordException") throw new Error(`${file.name}: el PDF tiene contraseña.`);
      throw new Error(`${file.name}: no se pudo leer el PDF.`);
    }
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const pages = [];
    for (let number = 1; number <= pdf.numPages; number += 1) {
      const page = await pdf.getPage(number);
      const base = page.getViewport({ scale: 1 });
      const { size, exact } = classifySize(base.width, base.height);
      let color = false;
      if (detectColor) {
        const viewport = page.getViewport({ scale: ANALYSIS_WIDTH / Math.min(base.width, base.height) });
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        // intent "print" evita requestAnimationFrame: así también funciona con la pestaña en segundo plano.
        await page.render({ canvasContext: context, viewport, intent: "print" }).promise;
        color = hasColor(context.getImageData(0, 0, canvas.width, canvas.height).data);
      }
      pages.push({ size, exact, color });
      page.cleanup();
      if (onProgress) onProgress(number, pdf.numPages);
    }
    await pdf.destroy();
    return { name: file.name, pages };
  }

  global.PresupuestoPdf = { classifySize, hasColor, computeSheets, totalSheets, suggestBinding, analyzePdf };
})(typeof window !== "undefined" ? window : globalThis);
