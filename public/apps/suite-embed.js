// Marca la página cuando se abre dentro de la suite (iframe) para ocultar su
// encabezado propio: la suite ya muestra el título de la herramienta.
(function () {
  try {
    if (window.self !== window.top) document.documentElement.classList.add('in-suite');
  } catch (error) {
    document.documentElement.classList.add('in-suite');
  }
})();
