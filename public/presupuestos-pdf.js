// PDF en Presupuestos: lee sólo la cantidad de páginas. El tipo de impresión,
// la faz y las páginas a imprimir los elige la persona.
// Script clásico: expone window.PresupuestoPdf (los tests lo cargan con node:vm).
(function (global) {
  const PDFJS_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
  const PDFJS_WORKER_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  // Interpreta "1-5, 8, 10-12" para un PDF de pageCount páginas.
  // Devuelve { pages: [números ordenados sin repetir], error }.
  function parsePageSelection(text, pageCount) {
    const clean = String(text || "").trim();
    if (!clean) return { pages: [], error: "Escribí las páginas, por ejemplo 1-5, 8." };
    const pages = new Set();
    for (const rawPart of clean.split(/[,;]+/)) {
      const part = rawPart.trim();
      if (!part) continue;
      const match = part.match(/^(\d+)\s*(?:-\s*(\d+))?$/);
      if (!match) return { pages: [], error: `"${part}" no es una página ni un rango válido.` };
      let from = Number(match[1]);
      let to = match[2] === undefined ? from : Number(match[2]);
      if (from > to) [from, to] = [to, from];
      if (from < 1 || to > pageCount) {
        return { pages: [], error: `El PDF tiene ${pageCount} ${pageCount === 1 ? "página" : "páginas"}: "${part}" queda afuera.` };
      }
      for (let page = from; page <= to; page += 1) pages.add(page);
    }
    if (!pages.size) return { pages: [], error: "Escribí las páginas, por ejemplo 1-5, 8." };
    return { pages: [...pages].sort((a, b) => a - b), error: null };
  }

  // Simple faz: una hoja por página. Doble faz: la mitad, redondeando hacia arriba.
  function sheetsFor(pageCount, duplex) {
    const count = Math.max(0, Number(pageCount) || 0);
    return duplex ? Math.ceil(count / 2) : count;
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

  async function countPages(file) {
    const pdfjs = await loadPdfJs();
    try {
      const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
      const count = pdf.numPages;
      await pdf.destroy();
      return count;
    } catch (error) {
      if (error && error.name === "PasswordException") throw new Error(`${file.name}: el PDF tiene contraseña.`);
      throw new Error(`${file.name}: no se pudo leer el PDF.`);
    }
  }

  global.PresupuestoPdf = { parsePageSelection, sheetsFor, suggestBinding, countPages };
})(typeof window !== "undefined" ? window : globalThis);
