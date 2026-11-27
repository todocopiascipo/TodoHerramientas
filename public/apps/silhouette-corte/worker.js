// Corre el cálculo pesado fuera de la página para que no se congele.
importScripts('core.js');
onmessage = (e) => {
  const { id, work, ww, wh, full, fw, fh, opts } = e.data;
  try {
    opts.progress = (p, label) => postMessage({ id, progress: p, label });
    const r = Core.process(work, ww, wh, opts);
    postMessage({ id, progress: 1, label: 'Preparando la imagen' });
    const fbg = Core.backgroundMask(full, fw, fh, opts.tol);
    postMessage({ id, contours: r.contours, fbg }, [fbg.buffer]);
  } catch (err) {
    postMessage({ id, error: String((err && err.message) || err) });
  }
};
