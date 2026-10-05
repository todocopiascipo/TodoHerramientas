const { jsPDF } = window.jspdf;

// Medidas faciles de modificar (todas expresadas en milimetros).
const SETTINGS = {
  pageWidth: 210,
  pageHeight: 297,
  figuritas: {
    smallImageHeight: 65,
    bigImageHeight: 150,
    smallCopies: 3,
    margin: 10,
    smallGap: 4,
    sectionGap: 10,
    rotateBigImage: true,
    bigImageRotation: 90
  },
  carnet: {
    photoSize: 40,
    columns: 4,
    rows: 5,
    margin: 5,
    borderWidth: 0.15
  },
  personalizado: {
    defaultWidth: 40,
    defaultHeight: 40,
    defaultMargin: 5,
    defaultQuantity: 12,
    borderWidth: 0.15
  },
  folletos: {
    segmentWidth: 105,
    segmentHeight: 148.5,
    margin: 5,
    imageWidth: 95,
    imageHeight: 138.5,
    columns: 2,
    rows: 2,
    guideWidth: 0.12
  },
  folletoA5: {
    segmentWidth: 210,
    segmentHeight: 148.5,
    margin: 5,
    imageWidth: 200,
    imageHeight: 138.5,
    columns: 1,
    rows: 2,
    guideWidth: 0.12
  }
};

const PREVIEW_SCALE = 3;
const imageInput = document.querySelector("#imageInput");
const uploadZone = document.querySelector("#uploadZone");
const generateButton = document.querySelector("#generateButton");
const previewCanvas = document.querySelector("#previewCanvas");
const fileInfo = document.querySelector("#fileInfo");
const statusMessage = document.querySelector("#statusMessage");
const previewTitle = document.querySelector("#previewTitle");
const paperSummary = document.querySelector("#paperSummary");
const customOptions = document.querySelector("#customOptions");
const customWidthInput = document.querySelector("#customWidthInput");
const customHeightInput = document.querySelector("#customHeightInput");
const customMarginInput = document.querySelector("#customMarginInput");
const customQuantityInput = document.querySelector("#customQuantityInput");
const autoQuantityToggle = document.querySelector("#autoQuantityToggle");
const autoQuantityOptions = document.querySelector("#autoQuantityOptions");
const customLayoutInfo = document.querySelector("#customLayoutInfo");
const rotateLeftButton = document.querySelector("#rotateLeftButton");
const rotateRightButton = document.querySelector("#rotateRightButton");
const rotationValue = document.querySelector("#rotationValue");
const imageList = document.querySelector("#imageList");
let photos = [];
let selectedPhotoIndex = -1;
let loadingPhotos = false;
let distributionMode = "mixed";
let previewPageIndex = 0;
const distributionSelect = document.querySelector("#distributionSelect");
const distributionHelp = document.querySelector("#distributionHelp");
const pageNavigation = document.querySelector("#pageNavigation");
const pageCounter = document.querySelector("#pageCounter");
const previousPageButton = document.querySelector("#previousPageButton");
const nextPageButton = document.querySelector("#nextPageButton");
const cutMarksToggle = document.querySelector("#cutMarksToggle");
const fitOptions = document.querySelector("#fitOptions");
const fitToggleButton = document.querySelector("#fitToggleButton");
const fitModeHelp = document.querySelector("#fitModeHelp");
const cropOptions = document.querySelector("#cropOptions");
const cropOptionsTitle = document.querySelector("#cropOptionsTitle");
const cropOptionsHelp = document.querySelector("#cropOptionsHelp");
const cropGrid = document.querySelector("#cropGrid");
const cropEditor = document.querySelector("#cropEditor");
const cropEditorCanvas = document.querySelector("#cropEditorCanvas");
const zoomControl = document.querySelector("#zoomControl");
const zoomSlider = document.querySelector("#zoomSlider");
const zoomValue = document.querySelector("#zoomValue");
const modeTabs = Array.from(document.querySelectorAll(".mode-tab"));
const cropButtons = Array.from(document.querySelectorAll(".crop-grid button"));
const previewContext = previewCanvas.getContext("2d");
const cropEditorContext = cropEditorCanvas.getContext("2d");

let loadedImage = null;
let loadedFileName = "";
let sourceDataUrl = "";
let rotatedImageCanvas = null;
let rotatedImageDataUrl = "";
let activeMode = "figuritas";
let cropFocus = { x: 0.5, y: 0.5 };
let cropZoom = 1;
let customSize = {
  width: SETTINGS.personalizado.defaultWidth,
  height: SETTINGS.personalizado.defaultHeight,
  margin: SETTINGS.personalizado.defaultMargin
};
let customQuantity = SETTINGS.personalizado.defaultQuantity;
let autoCustomQuantity = false;
let imageRotation = 0;
let showCutMarks = true;
let imagePlacementMode = "cover";
let cropDragState = null;

configurePreviewCanvas();
updateModeUI();
drawEmptyPreview();

distributionSelect.addEventListener("change", () => {
  distributionMode = distributionSelect.value;
  previewPageIndex = 0;
  renderPhotoList();
  updateModeUI();
  loadedImage ? drawPreview() : drawEmptyPreview();
});
previousPageButton.addEventListener("click", () => { previewPageIndex -= 1; drawPreview(); });
nextPageButton.addEventListener("click", () => { previewPageIndex += 1; drawPreview(); });
imageInput.addEventListener("change", handleImageSelection);
generateButton.addEventListener("click", generatePdf);
fitToggleButton.addEventListener("click", toggleImagePlacementMode);
uploadZone.addEventListener("dragenter", handleDragEnter);
uploadZone.addEventListener("dragover", handleDragEnter);
uploadZone.addEventListener("dragleave", handleDragLeave);
uploadZone.addEventListener("drop", handleDrop);
cropEditorCanvas.addEventListener("pointerdown", handleCropEditorPointerDown);
cropEditorCanvas.addEventListener("pointermove", handleCropEditorPointerMove);
cropEditorCanvas.addEventListener("pointerup", handleCropEditorPointerUp);
cropEditorCanvas.addEventListener("pointercancel", handleCropEditorPointerUp);
zoomSlider.addEventListener("input", handleZoomChange);
[customWidthInput, customHeightInput, customMarginInput].forEach((input) => {
  input.addEventListener("input", handleCustomSizeChange);
});
customQuantityInput.addEventListener("input", handleCustomQuantityChange);
autoQuantityToggle.addEventListener("change", handleAutoQuantityToggle);
rotateLeftButton.addEventListener("click", () => rotateImage(-90));
rotateRightButton.addEventListener("click", () => rotateImage(90));
cutMarksToggle.addEventListener("change", handleCutMarksToggle);

modeTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    activeMode = tab.dataset.mode;
    previewPageIndex = 0;
    updateModeUI();
    loadedImage ? drawPreview() : drawEmptyPreview();
  });
});

cropButtons.forEach((button) => {
  button.addEventListener("click", () => {
    cropFocus = {
      x: Number(button.dataset.focusX),
      y: Number(button.dataset.focusY)
    };

    cropButtons.forEach((item) => item.classList.toggle("is-active", item === button));
    if (loadedImage) {
      drawPreview();
    }
  });
});

function configurePreviewCanvas() {
  previewCanvas.width = SETTINGS.pageWidth * PREVIEW_SCALE;
  previewCanvas.height = SETTINGS.pageHeight * PREVIEW_SCALE;
}

function updateModeUI() {
  distributionHelp.textContent = distributionMode === "separate"
    ? "Cada foto llena una hoja con las copias del formato elegido."
    : activeMode === "figuritas"
      ? "Las copias ocupan primero los tres espacios pequeños y después el grande. La distribución usa las proporciones de la primera foto."
      : "Las cantidades se distribuyen en orden. Si no entran, se agregan hojas automáticamente.";
  modeTabs.forEach((tab) => {
    const selected = tab.dataset.mode === activeMode;
    tab.classList.toggle("is-active", selected);
    tab.setAttribute("aria-selected", String(selected));
  });

  const supportsPlacement = modeSupportsPlacementOptions();
  const usesVisualCrop = modeUsesVisualCrop();
  customOptions.hidden = activeMode !== "personalizado";
  autoQuantityOptions.hidden = !autoCustomQuantity;
  autoQuantityToggle.checked = autoCustomQuantity;
  customWidthInput.disabled = autoCustomQuantity;
  customHeightInput.disabled = autoCustomQuantity;
  customQuantityInput.value = String(customQuantity);
  rotationValue.textContent = `${imageRotation}°`;
  rotateLeftButton.disabled = rotateRightButton.disabled = !loadedImage;
  cropButtons.forEach((button) => button.classList.toggle("is-active", Number(button.dataset.focusX) === cropFocus.x && Number(button.dataset.focusY) === cropFocus.y));
  cutMarksToggle.checked = showCutMarks;
  fitOptions.hidden = !supportsPlacement;
  cropOptions.hidden = !supportsPlacement;
  cropOptionsTitle.textContent = getCropOptionsTitle();
  cropOptionsHelp.textContent = getCropHelpText();
  fitToggleButton.classList.toggle("is-active", imagePlacementMode === "contain");
  fitToggleButton.setAttribute("aria-pressed", String(imagePlacementMode === "contain"));
  fitModeHelp.textContent = imagePlacementMode === "contain"
    ? "Modo actual: ajustar completa dentro del area util."
    : "Modo actual: recortar para llenar el area util.";
  cropGrid.hidden = usesVisualCrop;
  cropEditor.hidden = !usesVisualCrop;
  zoomControl.hidden = !usesVisualCrop;
  cropGrid.classList.toggle("is-disabled", imagePlacementMode === "contain");
  cropEditor.classList.toggle("is-disabled", imagePlacementMode === "contain");
  zoomControl.classList.toggle("is-disabled", imagePlacementMode === "contain");
  zoomSlider.disabled = imagePlacementMode === "contain";
  zoomSlider.value = String(cropZoom);
  zoomValue.textContent = `${Math.round(cropZoom * 100)}%`;
  cropButtons.forEach((button) => {
    button.disabled = imagePlacementMode === "contain";
  });
  previewTitle.textContent = getPreviewTitle();
  paperSummary.textContent = getPaperSummary();
  updateCustomLayoutInfo();
  configureCropEditorCanvas();
  drawCropEditor();

  if (loadedImage) {
    statusMessage.textContent = getReadyMessage();
  }
}

function modeSupportsPlacementOptions() {
  return activeMode === "carnet" || activeMode === "personalizado" || activeMode === "folletos" || activeMode === "folletoA5";
}

function modeUsesVisualCrop() {
  return modeSupportsPlacementOptions();
}

function getCropHelpText() {
  if (activeMode === "carnet") {
    return "Arrastra la imagen para elegir con precision que parte entra en la foto 4 x 4.";
  }

  if (activeMode === "personalizado") {
    return "Arrastra la imagen para elegir con precision que parte entra en cada copia.";
  }

  if (activeMode === "folletoA5") {
    return "Arrastra la imagen para elegir con precision que parte entra en el folleto A5.";
  }

  return "Arrastra la imagen para elegir con precision que parte entra en el folleto A6.";
}

function getCropOptionsTitle() {
  if (activeMode === "carnet") {
    return "Recorte de la foto";
  }

  if (activeMode === "personalizado") {
    return "Recorte de la copia";
  }

  return "Recorte del folleto";
}

function getPreviewTitle() {
  if (activeMode === "carnet") {
    return "20 fotos 4 x 4 cm";
  }

  if (activeMode === "personalizado") {
    const layout = calculatePersonalizadoLayout();
    return `${layout.count} copias personalizadas`;
  }

  if (activeMode === "folletos") {
    return "4 folletos A6";
  }

  if (activeMode === "folletoA5") {
    return "2 folletos A5";
  }

  return "Hoja A4 vertical";
}

function getPaperSummary() {
  if (activeMode === "carnet") {
    return "A4, margen 5 mm";
  }

  if (activeMode === "personalizado") {
    const layout = calculatePersonalizadoLayout();
    return `${formatMm(layout.itemWidth)} x ${formatMm(layout.itemHeight)} mm, ${layout.columns} x ${layout.rows}`;
  }

  if (activeMode === "folletos") {
    return "4 x A6, area 95 x 138,5 mm";
  }

  if (activeMode === "folletoA5") {
    return "2 x A5, area 200 x 138,5 mm";
  }

  return "210 x 297 mm";
}

function getReadyMessage() {
  if (activeMode === "carnet") {
    return "Modo foto carnet listo: 20 fotos de 4 x 4 cm.";
  }

  if (activeMode === "personalizado") {
    const layout = calculatePersonalizadoLayout();
    return `Modo personalizado listo: ${layout.count} copias de ${formatMm(layout.itemWidth)} x ${formatMm(layout.itemHeight)} mm.`;
  }

  if (activeMode === "folletos") {
    return "Modo folletos A6 listo: 4 copias con margen de 5 mm.";
  }

  if (activeMode === "folletoA5") {
    return "Modo folleto A5 listo: 2 copias con margen de 5 mm.";
  }

  return "Modo figuritas listo para generar.";
}

function updateCustomLayoutInfo() {
  if (activeMode !== "personalizado") {
    return;
  }

  const layout = calculatePersonalizadoLayout();
  if (autoCustomQuantity) {
    customLayoutInfo.textContent = `${layout.count} copias automaticas de ${formatMm(layout.itemWidth)} x ${formatMm(layout.itemHeight)} mm en ${layout.columns} columnas x ${layout.rows} filas.`;
    return;
  }

  const capped = layout.itemWidth !== customSize.width || layout.itemHeight !== customSize.height;
  customLayoutInfo.textContent = capped
    ? `La medida supera el area imprimible: se ajusta a ${formatMm(layout.itemWidth)} x ${formatMm(layout.itemHeight)} mm.`
    : `${layout.count} copias en ${layout.columns} columnas x ${layout.rows} filas. Separacion: ${formatMm(layout.gapX)} mm horizontal, ${formatMm(layout.gapY)} mm vertical.`;
}

function formatMm(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(".", ",");
}

function handleImageSelection(event) {
  processSelectedFiles(event.target.files);
  event.target.value = "";
}

function saveSelectedPhoto() {
  if (selectedPhotoIndex < 0) return;
  Object.assign(photos[selectedPhotoIndex], {
    imageRotation, cropFocus: { ...cropFocus }, cropZoom, imagePlacementMode
  });
}

function selectPhoto(index) {
  saveSelectedPhoto();
  selectedPhotoIndex = index;
  const photo = photos[index];
  loadedImage = photo.image;
  loadedFileName = photo.name;
  sourceDataUrl = photo.dataUrl;
  imageRotation = photo.imageRotation;
  cropFocus = { ...photo.cropFocus };
  cropZoom = photo.cropZoom;
  imagePlacementMode = photo.imagePlacementMode;
  refreshRotatedImage();
  fileInfo.textContent = `${index + 1} de ${photos.length}: ${photo.name} - ${photo.image.naturalWidth} x ${photo.image.naturalHeight} px`;
  generateButton.disabled = loadingPhotos;
  renderPhotoList();
  updateModeUI();
  drawPreview();
}

function renderPhotoList() {
  imageList.replaceChildren();
  photos.forEach((photo, index) => {
    const row = document.createElement("div");
    row.className = "photo-row";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "photo-select";
    button.classList.toggle("is-active", index === selectedPhotoIndex);
    button.setAttribute("aria-pressed", String(index === selectedPhotoIndex));
    const thumbnail = document.createElement("img");
    thumbnail.src = photo.dataUrl;
    thumbnail.alt = "";
    const label = document.createElement("span");
    label.textContent = photo.name;
    button.append(thumbnail, label);
    button.addEventListener("click", () => selectPhoto(index));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "photo-remove";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Quitar ${photo.name}`);
    remove.addEventListener("click", () => {
      saveSelectedPhoto();
      const nextIndex = index < selectedPhotoIndex ? selectedPhotoIndex - 1 : Math.min(selectedPhotoIndex, photos.length - 2);
      photos.splice(index, 1);
      selectedPhotoIndex = -1;
      if (photos.length) selectPhoto(nextIndex);
      else { resetApp(); renderPhotoList(); updateModeUI(); }
    });
    const quantityLabel = document.createElement("label");
    quantityLabel.className = "photo-quantity";
    quantityLabel.textContent = "Copias";
    const quantity = document.createElement("input");
    quantity.type = "number";
    quantity.min = "1";
    quantity.max = "100";
    quantity.step = "1";
    quantity.value = String(photo.quantity);
    quantity.disabled = distributionMode === "separate";
    quantity.setAttribute("aria-label", `Cantidad de copias de ${photo.name}`);
    quantity.addEventListener("change", () => {
      photo.quantity = clamp(Math.round(Number(quantity.value) || 1), 1, 100);
      quantity.value = String(photo.quantity);
      updateModeUI();
      drawPreview();
    });
    quantityLabel.append(quantity);
    row.append(button, quantityLabel, remove);
    imageList.append(row);
  });
}

function readPhoto(file) {
  return new Promise((resolve, reject) => {
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      reject(new Error("Formato no admitido"));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer"));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Imagen inválida"));
      image.onload = () => resolve({ image, name: file.name, dataUrl: reader.result,
        imageRotation: 0, cropFocus: { x: 0.5, y: 0.5 }, cropZoom: 1, imagePlacementMode: "cover", quantity: 1 });
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function processSelectedFiles(fileList) {
  const files = Array.from(fileList);
  if (!files.length || loadingPhotos) return;
  loadingPhotos = true;
  generateButton.disabled = true;
  statusMessage.textContent = "Cargando fotos...";
  let failures = 0;
  let added = 0;
  try {
    for (const file of files) {
      try { photos.push(await readPhoto(file)); added += 1; }
      catch { failures += 1; }
    }
  } finally {
    loadingPhotos = false;
    if (photos.length) selectPhoto(selectedPhotoIndex < 0 ? 0 : selectedPhotoIndex);
    statusMessage.textContent = `${added} foto(s) agregada(s).${failures ? ` ${failures} archivo(s) no se pudieron cargar; usá JPG o PNG válidos.` : ""}`;
  }
}

function toggleImagePlacementMode() {
  imagePlacementMode = imagePlacementMode === "cover" ? "contain" : "cover";
  updateModeUI();
  loadedImage ? drawPreview() : drawEmptyPreview();
}

function handleZoomChange(event) {
  cropZoom = Number(event.target.value);
  zoomValue.textContent = `${Math.round(cropZoom * 100)}%`;
  drawCropEditor();
  loadedImage ? drawPreview() : drawEmptyPreview();
}

function handleCustomSizeChange() {
  customSize = readCustomSize();
  updateModeUI();
  loadedImage ? drawPreview() : drawEmptyPreview();
}

function handleCustomQuantityChange() {
  customQuantity = clamp(Math.round(Number(customQuantityInput.value) || SETTINGS.personalizado.defaultQuantity), 1, 100);
  customQuantityInput.value = String(customQuantity);
  updateModeUI();
  loadedImage ? drawPreview() : drawEmptyPreview();
}

function handleAutoQuantityToggle(event) {
  autoCustomQuantity = event.target.checked;
  updateModeUI();
  loadedImage ? drawPreview() : drawEmptyPreview();
}

function rotateImage(delta) {
  if (!loadedImage) return;
  imageRotation = (imageRotation + delta + 360) % 360;
  refreshRotatedImage();
  cropFocus = { x: 0.5, y: 0.5 };
  updateModeUI();
  loadedImage ? drawPreview() : drawEmptyPreview();
}

function handleCutMarksToggle(event) {
  showCutMarks = event.target.checked;
  loadedImage ? drawPreview() : drawEmptyPreview();
}

function readCustomSize() {
  return {
    width: clamp(Number(customWidthInput.value) || SETTINGS.personalizado.defaultWidth, 1, SETTINGS.pageWidth),
    height: clamp(Number(customHeightInput.value) || SETTINGS.personalizado.defaultHeight, 1, SETTINGS.pageHeight),
    margin: clamp(Number(customMarginInput.value) || 0, 0, 60)
  };
}

function handleDragEnter(event) {
  event.preventDefault();
  uploadZone.classList.add("is-dragging");
}

function handleDragLeave(event) {
  event.preventDefault();

  if (!uploadZone.contains(event.relatedTarget)) {
    uploadZone.classList.remove("is-dragging");
  }
}

function handleDrop(event) {
  event.preventDefault();
  uploadZone.classList.remove("is-dragging");

  processSelectedFiles(event.dataTransfer.files);
}

function handleCropEditorPointerDown(event) {
  if (!loadedImage || imagePlacementMode === "contain" || !modeUsesVisualCrop()) {
    return;
  }

  const metrics = getCropEditorMetrics();
  if (!metrics.canMoveX && !metrics.canMoveY) {
    return;
  }

  cropDragState = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    startFocusX: cropFocus.x,
    startFocusY: cropFocus.y,
    extraX: metrics.extraX,
    extraY: metrics.extraY,
    canMoveX: metrics.canMoveX,
    canMoveY: metrics.canMoveY
  };
  cropEditorCanvas.setPointerCapture(event.pointerId);
  cropEditor.classList.add("is-dragging");
}

function handleCropEditorPointerMove(event) {
  if (!cropDragState || cropDragState.pointerId !== event.pointerId) {
    return;
  }

  const deltaX = event.clientX - cropDragState.startX;
  const deltaY = event.clientY - cropDragState.startY;

  if (cropDragState.canMoveX) {
    cropFocus.x = clamp(cropDragState.startFocusX - deltaX / cropDragState.extraX, 0, 1);
  }

  if (cropDragState.canMoveY) {
    cropFocus.y = clamp(cropDragState.startFocusY - deltaY / cropDragState.extraY, 0, 1);
  }

  drawCropEditor();
  drawPreview();
}

function handleCropEditorPointerUp(event) {
  if (!cropDragState || cropDragState.pointerId !== event.pointerId) {
    return;
  }

  cropEditorCanvas.releasePointerCapture(event.pointerId);
  cropEditor.classList.remove("is-dragging");
  cropDragState = null;
}

function resetApp() {
  loadedImage = null;
  loadedFileName = "";
  sourceDataUrl = "";
  rotatedImageCanvas = null;
  rotatedImageDataUrl = "";
  generateButton.disabled = true;
  fileInfo.textContent = "Todavia no seleccionaste una imagen.";
  drawCropEditor();
  drawEmptyPreview();
}

function refreshRotatedImage() {
  rotatedImageCanvas = null;
  rotatedImageDataUrl = "";

  if (!loadedImage || imageRotation === 0) {
    return;
  }

  const angle = (imageRotation * Math.PI) / 180;
  const swapSides = imageRotation === 90 || imageRotation === 270;
  const canvas = document.createElement("canvas");
  canvas.width = swapSides ? loadedImage.naturalHeight : loadedImage.naturalWidth;
  canvas.height = swapSides ? loadedImage.naturalWidth : loadedImage.naturalHeight;
  const context = canvas.getContext("2d");

  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate(angle);
  context.drawImage(
    loadedImage,
    -loadedImage.naturalWidth / 2,
    -loadedImage.naturalHeight / 2
  );

  rotatedImageCanvas = canvas;
  rotatedImageDataUrl = canvas.toDataURL("image/png");
}

function getActiveImage() {
  return rotatedImageCanvas || loadedImage;
}

function getActiveImageDataUrl() {
  return rotatedImageDataUrl || sourceDataUrl;
}

function getImageWidth(image) {
  return image.naturalWidth || image.width;
}

function getImageHeight(image) {
  return image.naturalHeight || image.height;
}

function getActiveImageAspect() {
  const image = getActiveImage();
  if (image) {
    return getImageWidth(image) / getImageHeight(image);
  }

  return customSize.width / customSize.height;
}

function calculateFiguritasLayout(imageWidth, imageHeight) {
  const config = SETTINGS.figuritas;
  const availableWidth = SETTINGS.pageWidth - config.margin * 2;
  const availableHeight = SETTINGS.pageHeight - config.margin * 2;
  const sourceAspect = imageWidth / imageHeight;

  const desiredSmallWidth = config.smallImageHeight * sourceAspect;
  const gapsWidth = config.smallGap * (config.smallCopies - 1);
  const rowScale = Math.min(1, (availableWidth - gapsWidth) / (desiredSmallWidth * config.smallCopies));
  const smallWidth = desiredSmallWidth * rowScale;
  const smallHeight = config.smallImageHeight * rowScale;
  const rowWidth = smallWidth * config.smallCopies + gapsWidth;

  let bigWidth = config.rotateBigImage ? config.bigImageHeight : config.bigImageHeight * sourceAspect;
  let bigHeight = config.rotateBigImage ? config.bigImageHeight * sourceAspect : config.bigImageHeight;
  const remainingHeight = availableHeight - smallHeight - config.sectionGap;
  const bigScale = Math.min(1, availableWidth / bigWidth, remainingHeight / bigHeight);
  bigWidth *= bigScale;
  bigHeight *= bigScale;

  const contentHeight = smallHeight + config.sectionGap + bigHeight;
  const contentTop = config.margin + Math.max(0, (availableHeight - contentHeight) / 2);

  return {
    small: {
      width: smallWidth,
      height: smallHeight,
      startX: (SETTINGS.pageWidth - rowWidth) / 2,
      y: contentTop
    },
    big: {
      width: bigWidth,
      height: bigHeight,
      x: (SETTINGS.pageWidth - bigWidth) / 2,
      y: contentTop + smallHeight + config.sectionGap
    }
  };
}

function calculateCarnetLayout() {
  const config = SETTINGS.carnet;
  const availableWidth = SETTINGS.pageWidth - config.margin * 2;
  const availableHeight = SETTINGS.pageHeight - config.margin * 2;
  const gridWidth = config.columns * config.photoSize;
  const gridHeight = config.rows * config.photoSize;
  const gapX = (availableWidth - gridWidth) / (config.columns - 1);
  const gapY = (availableHeight - gridHeight) / (config.rows - 1);

  return {
    gapX,
    gapY,
    startX: config.margin,
    startY: config.margin
  };
}

function calculatePersonalizadoLayout() {
  const margin = customSize.margin;
  const availableWidth = Math.max(1, SETTINGS.pageWidth - margin * 2);
  const availableHeight = Math.max(1, SETTINGS.pageHeight - margin * 2);
  const autoLayout = autoCustomQuantity
    ? calculateAutoPersonalizadoLayout(availableWidth, availableHeight)
    : null;
  const itemWidth = autoLayout ? autoLayout.itemWidth : Math.min(customSize.width, availableWidth);
  const itemHeight = autoLayout ? autoLayout.itemHeight : Math.min(customSize.height, availableHeight);
  const columns = Math.max(1, Math.floor(availableWidth / itemWidth));
  const rows = autoLayout ? autoLayout.rows : Math.max(1, Math.floor(availableHeight / itemHeight));
  const finalColumns = autoLayout ? autoLayout.columns : columns;
  const finalCount = autoLayout ? customQuantity : finalColumns * rows;
  const gapX = finalColumns > 1 ? (availableWidth - finalColumns * itemWidth) / (finalColumns - 1) : 0;
  const gapY = rows > 1 ? (availableHeight - rows * itemHeight) / (rows - 1) : 0;
  const startX = finalColumns > 1 ? margin : margin + (availableWidth - itemWidth) / 2;
  const startY = rows > 1 ? margin : margin + (availableHeight - itemHeight) / 2;
  const items = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < finalColumns; col += 1) {
      if (items.length >= finalCount) break;
      items.push({
        x: startX + col * (itemWidth + gapX),
        y: startY + row * (itemHeight + gapY)
      });
    }
  }

  return {
    columns: finalColumns,
    rows,
    count: finalCount,
    gapX,
    gapY,
    itemWidth,
    itemHeight,
    margin,
    items
  };
}

function calculateAutoPersonalizadoLayout(availableWidth, availableHeight) {
  const quantity = clamp(Math.round(customQuantity) || SETTINGS.personalizado.defaultQuantity, 1, 100);
  const aspect = distributionMode === "mixed" && photos.length && selectedPhotoIndex !== 0
    ? withPhoto(photos[0], () => getActiveImageAspect())
    : getActiveImageAspect();
  let best = null;

  for (let columns = 1; columns <= quantity; columns += 1) {
    const rows = Math.ceil(quantity / columns);
    const cellWidth = availableWidth / columns;
    const cellHeight = availableHeight / rows;
    let itemWidth = cellWidth;
    let itemHeight = cellWidth / aspect;

    if (itemHeight > cellHeight) {
      itemHeight = cellHeight;
      itemWidth = cellHeight * aspect;
    }

    const area = itemWidth * itemHeight;
    const emptySlots = columns * rows - quantity;
    const score = area - emptySlots * 0.01;

    if (!best || score > best.score) {
      best = { columns, rows, itemWidth, itemHeight, score };
    }
  }

  return best;
}

function calculateFolletosLayout() {
  const config = SETTINGS.folletos;
  const items = [];

  for (let row = 0; row < config.rows; row += 1) {
    for (let col = 0; col < config.columns; col += 1) {
      const segmentX = col * config.segmentWidth;
      const segmentY = row * config.segmentHeight;
      items.push({
        segmentX,
        segmentY,
        imageX: segmentX + config.margin,
        imageY: segmentY + config.margin
      });
    }
  }

  return items;
}

function calculateFolletoA5Layout() {
  const config = SETTINGS.folletoA5;
  const items = [];

  for (let row = 0; row < config.rows; row += 1) {
    for (let col = 0; col < config.columns; col += 1) {
      const segmentX = col * config.segmentWidth;
      const segmentY = row * config.segmentHeight;
      items.push({
        segmentX,
        segmentY,
        imageX: segmentX + config.margin,
        imageY: segmentY + config.margin
      });
    }
  }

  return items;
}

function drawEmptyPreview() {
  pageNavigation.hidden = true;
  paintPaper();

  previewContext.save();
  previewContext.scale(PREVIEW_SCALE, PREVIEW_SCALE);

  if (showCutMarks) {
    previewContext.strokeStyle = "#dce4e0";
    previewContext.lineWidth = 0.6;
    previewContext.setLineDash([3, 2]);

    const margin = getCurrentSafeMargin();
    previewContext.strokeRect(
      margin,
      margin,
      SETTINGS.pageWidth - margin * 2,
      SETTINGS.pageHeight - margin * 2
    );

    if (activeMode === "carnet") {
      drawCarnetPlaceholders();
    } else if (activeMode === "personalizado") {
      drawPersonalizadoPlaceholders();
    } else if (activeMode === "folletos") {
      drawFolletosPlaceholders();
    } else if (activeMode === "folletoA5") {
      drawFolletoA5Placeholders();
    }
  }

  previewContext.fillStyle = "#8a9690";
  previewContext.font = "600 5px system-ui, sans-serif";
  previewContext.textAlign = "center";
  previewContext.fillText("La vista previa aparecera aca", SETTINGS.pageWidth / 2, SETTINGS.pageHeight / 2);
  previewContext.restore();
}

function drawPreview() {
  if (distributionMode === "mixed") {
    drawMixedPreview();
    return;
  }
  pageNavigation.hidden = true;
  paintPaper();
  previewContext.save();
  previewContext.scale(PREVIEW_SCALE, PREVIEW_SCALE);

  if (activeMode === "carnet") {
    drawCarnetPreview();
  } else if (activeMode === "personalizado") {
    drawPersonalizadoPreview();
  } else if (activeMode === "folletos") {
    drawFolletosPreview();
  } else if (activeMode === "folletoA5") {
    drawFolletoA5Preview();
  } else {
    drawFiguritasPreview();
  }

  previewContext.restore();
}

function drawFiguritasPreview() {
  const config = SETTINGS.figuritas;
  const image = getActiveImage();
  const layout = calculateFiguritasLayout(getImageWidth(image), getImageHeight(image));

  for (let index = 0; index < config.smallCopies; index += 1) {
    const x = layout.small.startX + index * (layout.small.width + config.smallGap);
    previewContext.drawImage(image, x, layout.small.y, layout.small.width, layout.small.height);
  }

  drawBigImageOnCanvas(previewContext, image, layout.big);
}

function drawCarnetPreview() {
  const config = SETTINGS.carnet;
  const layout = calculateCarnetLayout();

  for (let row = 0; row < config.rows; row += 1) {
    for (let col = 0; col < config.columns; col += 1) {
      const x = layout.startX + col * (config.photoSize + layout.gapX);
      const y = layout.startY + row * (config.photoSize + layout.gapY);
      drawCroppedSquare(previewContext, getActiveImage(), x, y, config.photoSize);
      if (showCutMarks) {
        drawCutBorder(previewContext, x, y, config.photoSize, config.photoSize, config.borderWidth);
      }
    }
  }
}

function drawPersonalizadoPreview() {
  const layout = calculatePersonalizadoLayout();

  layout.items.forEach((item) => {
    drawCroppedImage(
      previewContext,
      getActiveImage(),
      item.x,
      item.y,
      layout.itemWidth,
      layout.itemHeight
    );
    if (showCutMarks) {
      drawCutBorder(previewContext, item.x, item.y, layout.itemWidth, layout.itemHeight, SETTINGS.personalizado.borderWidth);
    }
  });
}

function drawFolletosPreview() {
  const config = SETTINGS.folletos;
  const layout = calculateFolletosLayout();

  if (showCutMarks) {
    drawA6Guides(previewContext);
  }

  layout.forEach((item) => {
    drawCroppedImage(
      previewContext,
      getActiveImage(),
      item.imageX,
      item.imageY,
      config.imageWidth,
      config.imageHeight
    );
    if (showCutMarks) {
      drawCutBorder(previewContext, item.imageX, item.imageY, config.imageWidth, config.imageHeight, config.guideWidth);
    }
  });
}

function drawFolletoA5Preview() {
  const config = SETTINGS.folletoA5;
  const layout = calculateFolletoA5Layout();

  if (showCutMarks) {
    drawA5Guides(previewContext);
  }

  layout.forEach((item) => {
    drawCroppedImage(
      previewContext,
      getActiveImage(),
      item.imageX,
      item.imageY,
      config.imageWidth,
      config.imageHeight
    );
    if (showCutMarks) {
      drawCutBorder(previewContext, item.imageX, item.imageY, config.imageWidth, config.imageHeight, config.guideWidth);
    }
  });
}

function drawCarnetPlaceholders() {
  const config = SETTINGS.carnet;
  const layout = calculateCarnetLayout();

  previewContext.strokeStyle = "#dce4e0";
  previewContext.lineWidth = config.borderWidth;
  previewContext.setLineDash([]);

  for (let row = 0; row < config.rows; row += 1) {
    for (let col = 0; col < config.columns; col += 1) {
      const x = layout.startX + col * (config.photoSize + layout.gapX);
      const y = layout.startY + row * (config.photoSize + layout.gapY);
      previewContext.strokeRect(x, y, config.photoSize, config.photoSize);
    }
  }
}

function drawPersonalizadoPlaceholders() {
  const layout = calculatePersonalizadoLayout();

  previewContext.strokeStyle = "#dce4e0";
  previewContext.lineWidth = SETTINGS.personalizado.borderWidth;
  previewContext.setLineDash([]);

  layout.items.forEach((item) => {
    previewContext.strokeRect(item.x, item.y, layout.itemWidth, layout.itemHeight);
  });
}

function drawFolletosPlaceholders() {
  const config = SETTINGS.folletos;
  const layout = calculateFolletosLayout();

  if (showCutMarks) {
    drawA6Guides(previewContext);
  }
  previewContext.strokeStyle = "#dce4e0";
  previewContext.lineWidth = config.guideWidth;
  previewContext.setLineDash([]);

  layout.forEach((item) => {
    previewContext.strokeRect(item.imageX, item.imageY, config.imageWidth, config.imageHeight);
  });
}

function drawFolletoA5Placeholders() {
  const config = SETTINGS.folletoA5;
  const layout = calculateFolletoA5Layout();

  if (showCutMarks) {
    drawA5Guides(previewContext);
  }
  previewContext.strokeStyle = "#dce4e0";
  previewContext.lineWidth = config.guideWidth;
  previewContext.setLineDash([]);

  layout.forEach((item) => {
    previewContext.strokeRect(item.imageX, item.imageY, config.imageWidth, config.imageHeight);
  });
}

function drawA6Guides(context) {
  const config = SETTINGS.folletos;

  context.save();
  context.strokeStyle = "#dce4e0";
  context.lineWidth = config.guideWidth;
  context.setLineDash([2, 2]);
  context.beginPath();
  context.moveTo(config.segmentWidth, 0);
  context.lineTo(config.segmentWidth, SETTINGS.pageHeight);
  context.moveTo(0, config.segmentHeight);
  context.lineTo(SETTINGS.pageWidth, config.segmentHeight);
  context.stroke();
  context.restore();
}

function drawA5Guides(context) {
  const config = SETTINGS.folletoA5;

  context.save();
  context.strokeStyle = "#dce4e0";
  context.lineWidth = config.guideWidth;
  context.setLineDash([2, 2]);
  context.beginPath();
  context.moveTo(0, config.segmentHeight);
  context.lineTo(SETTINGS.pageWidth, config.segmentHeight);
  context.stroke();
  context.restore();
}

function getCurrentSafeMargin() {
  if (activeMode === "carnet") {
    return SETTINGS.carnet.margin;
  }

  if (activeMode === "personalizado") {
    return customSize.margin;
  }

  if (activeMode === "folletos") {
    return SETTINGS.folletos.margin;
  }

  if (activeMode === "folletoA5") {
    return SETTINGS.folletoA5.margin;
  }

  return SETTINGS.figuritas.margin;
}

function paintPaper() {
  previewContext.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  previewContext.fillStyle = "#ffffff";
  previewContext.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
}

function drawBigImageOnCanvas(context, image, box) {
  const config = SETTINGS.figuritas;

  if (!config.rotateBigImage) {
    context.drawImage(image, box.x, box.y, box.width, box.height);
    return;
  }

  context.save();
  context.translate(box.x + box.width / 2, box.y + box.height / 2);
  context.rotate((config.bigImageRotation * Math.PI) / 180);
  context.drawImage(image, -box.height / 2, -box.width / 2, box.height, box.width);
  context.restore();
}

function drawCroppedSquare(context, image, x, y, size) {
  drawImageInBox(context, image, x, y, size, size);
}

function drawCroppedImage(context, image, x, y, width, height) {
  drawImageInBox(context, image, x, y, width, height);
}

function drawImageInBox(context, image, x, y, width, height) {
  context.save();
  context.fillStyle = "#ffffff";
  context.fillRect(x, y, width, height);

  if (imagePlacementMode === "contain") {
    const target = getContainBox(image, x, y, width, height);
    context.drawImage(image, target.x, target.y, target.width, target.height);
  } else {
    const crop = getCoverCrop(image, width / height);
    context.drawImage(
      image,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      x,
      y,
      width,
      height
    );
  }

  context.restore();
}

function configureCropEditorCanvas() {
  if (!modeUsesVisualCrop()) {
    return;
  }

  const aspect = getActiveCropAspect();
  const width = 520;
  const height = Math.round(width / aspect);
  cropEditorCanvas.width = width;
  cropEditorCanvas.height = height;
}

function drawCropEditor() {
  if (!modeUsesVisualCrop()) {
    return;
  }

  configureCropEditorCanvas();
  cropEditorContext.clearRect(0, 0, cropEditorCanvas.width, cropEditorCanvas.height);
  cropEditorContext.fillStyle = "#ffffff";
  cropEditorContext.fillRect(0, 0, cropEditorCanvas.width, cropEditorCanvas.height);

  if (!loadedImage) {
    cropEditorContext.strokeStyle = "#dce4e0";
    cropEditorContext.lineWidth = 2;
    cropEditorContext.setLineDash([10, 8]);
    cropEditorContext.strokeRect(1, 1, cropEditorCanvas.width - 2, cropEditorCanvas.height - 2);
    cropEditorContext.fillStyle = "#8a9690";
    cropEditorContext.font = "700 18px system-ui, sans-serif";
    cropEditorContext.textAlign = "center";
    cropEditorContext.fillText("Carga una imagen para ajustar el recorte", cropEditorCanvas.width / 2, cropEditorCanvas.height / 2);
    return;
  }

  if (imagePlacementMode === "contain") {
    const image = getActiveImage();
    const target = getContainBox(image, 0, 0, cropEditorCanvas.width, cropEditorCanvas.height);
    cropEditorContext.drawImage(image, target.x, target.y, target.width, target.height);
  } else {
    const image = getActiveImage();
    const metrics = getCropEditorMetrics();
    cropEditorContext.drawImage(image, metrics.x, metrics.y, metrics.width, metrics.height);
  }

  drawCropEditorOverlay();
}

function drawCropEditorOverlay() {
  const width = cropEditorCanvas.width;
  const height = cropEditorCanvas.height;

  cropEditorContext.save();
  cropEditorContext.strokeStyle = "#147a52";
  cropEditorContext.lineWidth = 4;
  cropEditorContext.setLineDash([]);
  cropEditorContext.strokeRect(2, 2, width - 4, height - 4);

  cropEditorContext.strokeStyle = "rgba(255, 255, 255, 0.72)";
  cropEditorContext.lineWidth = 1;
  cropEditorContext.beginPath();
  cropEditorContext.moveTo(width / 3, 0);
  cropEditorContext.lineTo(width / 3, height);
  cropEditorContext.moveTo((width / 3) * 2, 0);
  cropEditorContext.lineTo((width / 3) * 2, height);
  cropEditorContext.moveTo(0, height / 3);
  cropEditorContext.lineTo(width, height / 3);
  cropEditorContext.moveTo(0, (height / 3) * 2);
  cropEditorContext.lineTo(width, (height / 3) * 2);
  cropEditorContext.stroke();
  cropEditorContext.restore();
}

function getCropEditorMetrics() {
  const frameWidth = cropEditorCanvas.width;
  const frameHeight = cropEditorCanvas.height;
  const image = getActiveImage();
  const sourceAspect = getImageWidth(image) / getImageHeight(image);
  const frameAspect = frameWidth / frameHeight;
  let width = frameWidth;
  let height = frameHeight;

  if (sourceAspect > frameAspect) {
    width = frameHeight * sourceAspect;
  } else {
    height = frameWidth / sourceAspect;
  }

  width *= cropZoom;
  height *= cropZoom;

  const extraX = Math.max(0, width - frameWidth);
  const extraY = Math.max(0, height - frameHeight);

  return {
    x: -extraX * cropFocus.x,
    y: -extraY * cropFocus.y,
    width,
    height,
    extraX,
    extraY,
    canMoveX: extraX > 0.5,
    canMoveY: extraY > 0.5
  };
}

function getActiveCropAspect() {
  if (activeMode === "carnet") {
    return 1;
  }

  if (activeMode === "personalizado") {
    const layout = calculatePersonalizadoLayout();
    return layout.itemWidth / layout.itemHeight;
  }

  if (activeMode === "folletoA5") {
    return SETTINGS.folletoA5.imageWidth / SETTINGS.folletoA5.imageHeight;
  }

  return SETTINGS.folletos.imageWidth / SETTINGS.folletos.imageHeight;
}

function drawCutBorder(context, x, y, width, height, lineWidth) {
  context.save();
  context.strokeStyle = "#b8c2bd";
  context.lineWidth = lineWidth;
  context.setLineDash([]);
  context.strokeRect(x, y, width, height);
  context.restore();
}

function getSquareCrop(image) {
  const crop = getCoverCrop(image, 1);

  return {
    x: crop.x,
    y: crop.y,
    size: crop.width
  };
}

function getCoverCrop(image, targetAspect) {
  const sourceWidth = getImageWidth(image);
  const sourceHeight = getImageHeight(image);
  const sourceAspect = sourceWidth / sourceHeight;
  let width = sourceWidth;
  let height = sourceHeight;

  if (sourceAspect > targetAspect) {
    width = sourceHeight * targetAspect;
  } else {
    height = sourceWidth / targetAspect;
  }

  width /= cropZoom;
  height /= cropZoom;

  return {
    x: (sourceWidth - width) * cropFocus.x,
    y: (sourceHeight - height) * cropFocus.y,
    width,
    height
  };
}

function getContainBox(image, x, y, width, height) {
  const sourceAspect = getImageWidth(image) / getImageHeight(image);
  const targetAspect = width / height;
  let drawWidth = width;
  let drawHeight = height;

  if (sourceAspect > targetAspect) {
    drawHeight = width / sourceAspect;
  } else {
    drawWidth = height * sourceAspect;
  }

  return {
    x: x + (width - drawWidth) / 2,
    y: y + (height - drawHeight) / 2,
    width: drawWidth,
    height: drawHeight
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function createBigImageDataUrl() {
  const config = SETTINGS.figuritas;
  const image = getActiveImage();

  if (!config.rotateBigImage) {
    return getActiveImageDataUrl();
  }

  const rotatedCanvas = document.createElement("canvas");
  rotatedCanvas.width = getImageHeight(image);
  rotatedCanvas.height = getImageWidth(image);
  const context = rotatedCanvas.getContext("2d");

  context.translate(rotatedCanvas.width / 2, rotatedCanvas.height / 2);
  context.rotate((config.bigImageRotation * Math.PI) / 180);
  context.drawImage(
    image,
    -getImageWidth(image) / 2,
    -getImageHeight(image) / 2
  );

  return rotatedCanvas.toDataURL("image/png");
}

function createCarnetImageDataUrl() {
  const outputSize = 900;
  return createPreparedImageDataUrl(1, outputSize, outputSize);
}

function createPersonalizadoImageDataUrl() {
  const layout = calculatePersonalizadoLayout();
  const aspect = layout.itemWidth / layout.itemHeight;
  const outputWidth = 1000;
  const outputHeight = Math.round(outputWidth / aspect);
  return createPreparedImageDataUrl(aspect, outputWidth, outputHeight);
}

function createFolletoImageDataUrl() {
  const config = SETTINGS.folletos;
  const outputWidth = 1200;
  const outputHeight = Math.round(outputWidth * (config.imageHeight / config.imageWidth));
  return createPreparedImageDataUrl(config.imageWidth / config.imageHeight, outputWidth, outputHeight);
}

function createFolletoA5ImageDataUrl() {
  const config = SETTINGS.folletoA5;
  const outputWidth = 1600;
  const outputHeight = Math.round(outputWidth * (config.imageHeight / config.imageWidth));
  return createPreparedImageDataUrl(config.imageWidth / config.imageHeight, outputWidth, outputHeight);
}

function createPreparedImageDataUrl(targetAspect, outputWidth, outputHeight) {
  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, outputWidth, outputHeight);

  if (imagePlacementMode === "contain") {
    const image = getActiveImage();
    const target = getContainBox(image, 0, 0, outputWidth, outputHeight);
    context.drawImage(image, target.x, target.y, target.width, target.height);
  } else {
    const image = getActiveImage();
    const crop = getCoverCrop(image, targetAspect);
    context.drawImage(
      image,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      outputWidth,
      outputHeight
    );
  }

  return canvas.toDataURL("image/jpeg", 0.95);
}

// Switch image state without changing the selection or rebuilding the controls.
function withPhoto(photo, callback) {
  const previous = { loadedImage, loadedFileName, sourceDataUrl, imageRotation,
    cropFocus, cropZoom, imagePlacementMode, rotatedImageCanvas, rotatedImageDataUrl };
  loadedImage = photo.image;
  loadedFileName = photo.name;
  sourceDataUrl = photo.dataUrl;
  imageRotation = photo.imageRotation;
  cropFocus = { ...photo.cropFocus };
  cropZoom = photo.cropZoom;
  imagePlacementMode = photo.imagePlacementMode;
  refreshRotatedImage();
  try { return callback(); }
  finally {
    ({ loadedImage, loadedFileName, sourceDataUrl, imageRotation, cropFocus,
      cropZoom, imagePlacementMode, rotatedImageCanvas, rotatedImageDataUrl } = previous);
  }
}

function getMixedSlots() {
  if (activeMode === "personalizado") {
    const layout = calculatePersonalizadoLayout();
    return layout.items.map(item => ({ ...item, width: layout.itemWidth, height: layout.itemHeight }));
  }
  if (activeMode === "carnet") {
    const config = SETTINGS.carnet;
    const layout = calculateCarnetLayout();
    return Array.from({ length: config.columns * config.rows }, (_, index) => ({
      x: layout.startX + (index % config.columns) * (config.photoSize + layout.gapX),
      y: layout.startY + Math.floor(index / config.columns) * (config.photoSize + layout.gapY),
      width: config.photoSize, height: config.photoSize
    }));
  }
  if (activeMode === "folletos" || activeMode === "folletoA5") {
    const config = SETTINGS[activeMode];
    const layout = activeMode === "folletos" ? calculateFolletosLayout() : calculateFolletoA5Layout();
    return layout.map(item => ({ x: item.imageX, y: item.imageY, width: config.imageWidth, height: config.imageHeight }));
  }
  return withPhoto(photos[0], () => {
    const image = getActiveImage();
    const config = SETTINGS.figuritas;
    const layout = calculateFiguritasLayout(getImageWidth(image), getImageHeight(image));
    const slots = Array.from({ length: config.smallCopies }, (_, index) => ({
      x: layout.small.startX + index * (layout.small.width + config.smallGap),
      y: layout.small.y, width: layout.small.width, height: layout.small.height
    }));
    slots.push({ ...layout.big, big: config.rotateBigImage });
    return slots;
  });
}

function getMixedPages() {
  saveSelectedPhoto();
  if (!photos.length) return [];
  const slots = getMixedSlots();
  const copies = photos.flatMap(photo => Array.from({ length: photo.quantity }, () => photo));
  const pages = [];
  for (let index = 0; index < copies.length; index += slots.length) {
    pages.push(copies.slice(index, index + slots.length).map((photo, slotIndex) => ({ photo, slot: slots[slotIndex] })));
  }
  return pages;
}

function getMixedImageDataUrl(slot) {
  // Figuritas keeps each image complete, including in the rotated large space.
  if (activeMode === "figuritas") {
    imagePlacementMode = "contain";
    if (slot.big) {
      imageRotation = (imageRotation + SETTINGS.figuritas.bigImageRotation) % 360;
      refreshRotatedImage();
    }
  }
  const width = 1200;
  return createPreparedImageDataUrl(slot.width / slot.height, width, Math.max(1, Math.round(width * slot.height / slot.width)));
}

function getMixedBorderWidth() {
  return SETTINGS[activeMode].borderWidth || SETTINGS[activeMode].guideWidth || 0.15;
}

function drawMixedPreview() {
  const pages = getMixedPages();
  if (!pages.length) { drawEmptyPreview(); return; }
  previewPageIndex = clamp(previewPageIndex, 0, pages.length - 1);
  pageNavigation.hidden = false;
  pageCounter.textContent = `Hoja ${previewPageIndex + 1} de ${pages.length}`;
  previousPageButton.disabled = previewPageIndex === 0;
  nextPageButton.disabled = previewPageIndex === pages.length - 1;
  paintPaper();
  previewContext.save();
  previewContext.scale(PREVIEW_SCALE, PREVIEW_SCALE);
  if (showCutMarks && activeMode === "folletos") drawA6Guides(previewContext);
  if (showCutMarks && activeMode === "folletoA5") drawA5Guides(previewContext);
  pages[previewPageIndex].forEach(({ photo, slot }) => withPhoto(photo, () => {
    if (activeMode === "figuritas") {
      imagePlacementMode = "contain";
      if (slot.big) {
        imageRotation = (imageRotation + SETTINGS.figuritas.bigImageRotation) % 360;
        refreshRotatedImage();
      }
    }
    drawImageInBox(previewContext, getActiveImage(), slot.x, slot.y, slot.width, slot.height);
    if (showCutMarks) drawCutBorder(previewContext, slot.x, slot.y, slot.width, slot.height, getMixedBorderWidth());
  }));
  previewContext.restore();
}

function addMixedPage(pdf, items) {
  if (showCutMarks) {
    pdf.setDrawColor(184, 194, 189);
    pdf.setLineWidth(getMixedBorderWidth());
    if (activeMode === "folletos" || activeMode === "folletoA5") {
      const config = SETTINGS[activeMode];
      pdf.setLineDashPattern([2, 2], 0);
      if (activeMode === "folletos") pdf.line(config.segmentWidth, 0, config.segmentWidth, SETTINGS.pageHeight);
      pdf.line(0, config.segmentHeight, SETTINGS.pageWidth, config.segmentHeight);
      pdf.setLineDashPattern([], 0);
    }
  }
  items.forEach(({photo, slot}) => {
    const dataUrl = withPhoto(photo, () => getMixedImageDataUrl(slot));
    pdf.addImage(dataUrl, "JPEG", slot.x, slot.y, slot.width, slot.height, undefined, "FAST");
    if (showCutMarks) pdf.rect(slot.x, slot.y, slot.width, slot.height);
  });
}

function generatePdf() {
  if (!loadedImage || loadingPhotos) return;
  saveSelectedPhoto();
  generateButton.disabled = true;
  statusMessage.textContent = "Generando PDF...";
  try {
    const pdf = createPdf();
    let pageCount;
    if (distributionMode === "mixed") {
      const pages = getMixedPages();
      pageCount = pages.length;
      pages.forEach((items, index) => {
        if (index) pdf.addPage();
        addMixedPage(pdf, items);
      });
    } else {
      pageCount = photos.length;
      const renderPage = { figuritas: generateFiguritasPdf, carnet: generateCarnetPdf,
        personalizado: generatePersonalizadoPdf, folletos: generateFolletosPdf, folletoA5: generateFolletoA5Pdf }[activeMode];
      photos.forEach((photo, index) => {
        if (index) pdf.addPage();
        withPhoto(photo, () => renderPage(pdf));
      });
    }
    pdf.save(`AutoFoto-${activeMode}-${photos.length > 1 ? photos.length + "-fotos" : getCleanFileName("foto")}.pdf`);
    statusMessage.textContent = `PDF generado: ${pageCount} hoja(s).`;
  } catch (error) {
    console.error(error);
    statusMessage.textContent = "No se pudo generar el PDF. Proba con otra imagen.";
  } finally {
    generateButton.disabled = false;
  }
}

function generateFiguritasPdf(pdf) {
  const config = SETTINGS.figuritas;
  const image = getActiveImage();
  const activeImageDataUrl = getActiveImageDataUrl();
  const layout = calculateFiguritasLayout(getImageWidth(image), getImageHeight(image));
  const imageFormat = activeImageDataUrl.startsWith("data:image/png") ? "PNG" : "JPEG";

  for (let index = 0; index < config.smallCopies; index += 1) {
    const x = layout.small.startX + index * (layout.small.width + config.smallGap);
    pdf.addImage(
      activeImageDataUrl,
      imageFormat,
      x,
      layout.small.y,
      layout.small.width,
      layout.small.height,
      undefined,
      "FAST"
    );
  }

  pdf.addImage(
    createBigImageDataUrl(),
    config.rotateBigImage ? "PNG" : imageFormat,
    layout.big.x,
    layout.big.y,
    layout.big.width,
    layout.big.height,
    undefined,
    "FAST"
  );

}

function generateCarnetPdf(pdf) {
  const config = SETTINGS.carnet;
  const layout = calculateCarnetLayout();
  const carnetImage = createCarnetImageDataUrl();

  if (showCutMarks) {
    pdf.setDrawColor(184, 194, 189);
    pdf.setLineWidth(config.borderWidth);
  }

  for (let row = 0; row < config.rows; row += 1) {
    for (let col = 0; col < config.columns; col += 1) {
      const x = layout.startX + col * (config.photoSize + layout.gapX);
      const y = layout.startY + row * (config.photoSize + layout.gapY);
      pdf.addImage(carnetImage, "JPEG", x, y, config.photoSize, config.photoSize, undefined, "FAST");
      if (showCutMarks) {
        pdf.rect(x, y, config.photoSize, config.photoSize);
      }
    }
  }

}

function generatePersonalizadoPdf(pdf) {
  const layout = calculatePersonalizadoLayout();
  const customImage = createPersonalizadoImageDataUrl();

  if (showCutMarks) {
    pdf.setDrawColor(184, 194, 189);
    pdf.setLineWidth(SETTINGS.personalizado.borderWidth);
  }

  layout.items.forEach((item) => {
    pdf.addImage(
      customImage,
      "JPEG",
      item.x,
      item.y,
      layout.itemWidth,
      layout.itemHeight,
      undefined,
      "FAST"
    );
    if (showCutMarks) {
      pdf.rect(item.x, item.y, layout.itemWidth, layout.itemHeight);
    }
  });

}

function generateFolletosPdf(pdf) {
  const config = SETTINGS.folletos;
  const layout = calculateFolletosLayout();
  const folletoImage = createFolletoImageDataUrl();

  if (showCutMarks) {
    pdf.setDrawColor(220, 228, 224);
    pdf.setLineWidth(config.guideWidth);
    pdf.setLineDashPattern([2, 2], 0);
    pdf.line(config.segmentWidth, 0, config.segmentWidth, SETTINGS.pageHeight);
    pdf.line(0, config.segmentHeight, SETTINGS.pageWidth, config.segmentHeight);
    pdf.setLineDashPattern([], 0);
  }

  layout.forEach((item) => {
    pdf.addImage(
      folletoImage,
      "JPEG",
      item.imageX,
      item.imageY,
      config.imageWidth,
      config.imageHeight,
      undefined,
      "FAST"
    );
  });

}

function generateFolletoA5Pdf(pdf) {
  const config = SETTINGS.folletoA5;
  const layout = calculateFolletoA5Layout();
  const folletoImage = createFolletoA5ImageDataUrl();

  if (showCutMarks) {
    pdf.setDrawColor(220, 228, 224);
    pdf.setLineWidth(config.guideWidth);
    pdf.setLineDashPattern([2, 2], 0);
    pdf.line(0, config.segmentHeight, SETTINGS.pageWidth, config.segmentHeight);
    pdf.setLineDashPattern([], 0);
  }

  layout.forEach((item) => {
    pdf.addImage(
      folletoImage,
      "JPEG",
      item.imageX,
      item.imageY,
      config.imageWidth,
      config.imageHeight,
      undefined,
      "FAST"
    );
  });

}

function createPdf() {
  return new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true
  });
}

function getCleanFileName(fallback) {
  return loadedFileName.replace(/\.[^.]+$/, "").replace(/[^\w-]+/g, "-") || fallback;
}
