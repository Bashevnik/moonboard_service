const MOODBOARD_API_URL = "https://moonboard-service-vercel.vercel.app/api/generate-moodboard";
const EXPORT_WIDTH = 1920;
const EXPORT_HEIGHT = 1080;
const IMAGE_MAX_DIMENSION = 1200;
const IMAGE_JPEG_QUALITY = 0.8;
const IS_DEBUG_MODE = new URLSearchParams(window.location.search).get("debug") === "1";

// API key не хранится во frontend. GitHub Pages отправляет запрос только
// в serverless proxy, а proxy читает GEMINI_API_KEY из environment variable.

const generatorForm = document.getElementById("generatorForm");
const dropZone = document.getElementById("dropZone");
const dropContent = document.getElementById("dropContent");
const imageInput = document.getElementById("imageInput");
const previewWrap = document.getElementById("previewWrap");
const previewImage = document.getElementById("previewImage");
const fileName = document.getElementById("fileName");
const removeImageButton = document.getElementById("removeImageButton");
const promptInput = document.getElementById("promptInput");
const formError = document.getElementById("formError");
const generateButton = document.getElementById("generateButton");
const generateButtonText = generateButton.querySelector(".button-text");
const loader = document.getElementById("loader");
const resultSection = document.getElementById("resultSection");
const emptyState = document.getElementById("emptyState");
const resultStatus = document.getElementById("resultStatus");
const resultMeta = document.getElementById("resultMeta");
const moodboardCanvas = document.getElementById("moodboardCanvas");
const downloadButton = document.getElementById("downloadButton");
const generateAgainButton = document.getElementById("generateAgainButton");
const debugPanel = document.getElementById("debugPanel");
const debugUpdatedAt = document.getElementById("debugUpdatedAt");
const debugOriginalSize = document.getElementById("debugOriginalSize");
const debugCompressedSize = document.getElementById("debugCompressedSize");
const debugBase64Size = document.getElementById("debugBase64Size");
const debugApiStatus = document.getElementById("debugApiStatus");
const debugErrorText = document.getElementById("debugErrorText");
const debugUserAgent = document.getElementById("debugUserAgent");
const debugOrigin = document.getElementById("debugOrigin");

const DEFAULT_MOODBOARD = {
  title: "Визуальное направление",
  mood: "Спокойная, цельная и выразительная визуальная история для бренда, интерьера или презентации.",
  colorPalette: ["#1E1E1E", "#A46C44", "#617A55", "#C9B79E", "#F8F7F4"],
  materials: ["натуральная фактура", "матовая поверхность", "мягкая ткань", "тёплая бумага"],
  keywords: ["спокойно", "цельно", "редакционно", "тепло"],
  composition: "Крупный референс, детальные фрагменты, палитра и заметки собраны в editorial-композицию.",
  typographyMood: "Сдержанная современная типографика с уверенным заголовком и аккуратным ритмом.",
  lighting: "Мягкий естественный свет без резких контрастов.",
};

let selectedImageFile = null;
let previewObjectUrl = "";
let currentMoodboard = null;
let isGenerating = false;

window.__MOODBOARD_LAST_DIAGNOSTICS = {};

initDebugPanel();

window.addEventListener("error", (event) => {
  logFrontendError("window error", {
    message: event.message,
    source: event.filename,
    line: event.lineno,
    column: event.colno,
    error: serializeError(event.error),
  });
});

window.addEventListener("unhandledrejection", (event) => {
  logFrontendError("unhandled promise rejection", {
    reason: serializeError(event.reason),
  });
});

dropZone.addEventListener("click", (event) => {
  if (!event.target.closest("button")) {
    imageInput.click();
  }
});

dropZone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    imageInput.click();
  }
});

["dragenter", "dragover"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add("is-dragging");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropZone.addEventListener(eventName, () => {
    dropZone.classList.remove("is-dragging");
  });
});

dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  handleImageFile(event.dataTransfer.files[0]);
});

imageInput.addEventListener("change", () => {
  handleImageFile(imageInput.files[0]);
});

removeImageButton.addEventListener("click", () => {
  clearSelectedImage();
  clearError();
});

promptInput.addEventListener("input", () => {
  if (promptInput.value.trim()) {
    clearError();
  }
});

generatorForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (isGenerating) {
    return;
  }

  const promptText = promptInput.value.trim();
  const validationError = getValidationError(promptText);

  if (validationError) {
    showError(validationError);
    return;
  }

  clearError();
  hideResult();
  setGeneratingState(true);

  try {
    console.info("[Moodboard] generation start", {
      fileName: selectedImageFile.name,
      fileType: selectedImageFile.type,
      fileSizeBytes: selectedImageFile.size,
      fileSizeFormatted: formatBytes(selectedImageFile.size),
      promptLength: promptText.length,
    });

    const moodboard = await generateMoodboardWithGemini(selectedImageFile, promptText);
    renderResult(moodboard);

    console.info("[Moodboard] generation success", {
      title: moodboard.title,
      colors: moodboard.colorPalette.length,
    });
  } catch (error) {
    logFrontendError("generation failed", {
      error: serializeError(error),
    });
    console.error("[Moodboard] api error", error);
    showError(getReadableApiError(error));
    setResultStatus("Ошибка генерации", false);
  } finally {
    setGeneratingState(false);
  }
});

downloadButton.addEventListener("click", () => {
  downloadGeneratedMoodboard();
});

generateAgainButton.addEventListener("click", () => {
  clearError();
  promptInput.focus();
  document.getElementById("generator").scrollIntoView({ behavior: "smooth", block: "start" });
});

function handleImageFile(file) {
  if (isGenerating || !file) {
    return;
  }

  if (!file.type.startsWith("image/")) {
    clearSelectedImage();
    showError("Можно загрузить только изображение.");
    return;
  }

  selectedImageFile = file;
  clearError();
  setLastDiagnostics({
    image: {
      original: {
        name: file.name,
        type: file.type || "unknown",
        sizeBytes: file.size,
        sizeFormatted: formatBytes(file.size),
      },
    },
    apiResponse: null,
    lastFrontendError: null,
  });

  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl);
  }

  previewObjectUrl = URL.createObjectURL(file);
  previewImage.src = previewObjectUrl;
  fileName.textContent = file.name;
  dropContent.hidden = true;
  previewWrap.hidden = false;
  removeImageButton.hidden = false;
}

function clearSelectedImage() {
  selectedImageFile = null;
  imageInput.value = "";
  previewImage.removeAttribute("src");
  fileName.textContent = "Файл выбран";
  previewWrap.hidden = true;
  dropContent.hidden = false;
  removeImageButton.hidden = true;

  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = "";
  }

  setLastDiagnostics({
    image: null,
    apiResponse: null,
    lastFrontendError: null,
  });
}

function getValidationError(promptText) {
  if (!selectedImageFile) {
    return "Сначала загрузите референс.";
  }

  if (!promptText) {
    return "Опишите настроение, стиль и задачу для мудборда.";
  }

  if (!MOODBOARD_API_URL.trim()) {
    return "Не указан URL serverless proxy.";
  }

  return "";
}

function showError(message) {
  formError.textContent = message;
  formError.hidden = false;
  setLastDiagnostics({ visibleError: message });
}

function clearError() {
  formError.textContent = "";
  formError.hidden = true;
  setLastDiagnostics({ visibleError: "" });
}

function setGeneratingState(isLoading) {
  isGenerating = isLoading;
  loader.hidden = !isLoading;
  generateButton.disabled = isLoading;
  imageInput.disabled = isLoading;
  promptInput.disabled = isLoading;
  removeImageButton.disabled = isLoading;
  downloadButton.disabled = isLoading;
  generatorForm.setAttribute("aria-busy", String(isLoading));
  generateButtonText.textContent = isLoading ? "Создаём мудборд..." : "Создать мудборд";

  if (isLoading) {
    setResultStatus("Генерация", false);
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };

    reader.onerror = () => {
      const error = new Error("Не удалось прочитать изображение.");
      logFrontendError("file read failed", {
        fileName: file.name,
        fileSizeBytes: file.size,
        error: serializeError(error),
      });
      reject(error);
    };
    reader.readAsDataURL(file);
  });
}

async function generateMoodboardWithGemini(imageFile, promptText) {
  const preparedImage = await prepareImageForApi(imageFile);
  const imageBase64 = preparedImage.base64;
  const requestBody = {
    imageBase64,
    mimeType: preparedImage.file.type || "image/jpeg",
    prompt: promptText,
    fileName: preparedImage.file.name,
  };
  const requestStartedAt = performance.now();

  console.info("[Moodboard] sending JSON request", {
    endpoint: MOODBOARD_API_URL,
    method: "POST",
    fileName: preparedImage.file.name,
    fileType: preparedImage.file.type,
    promptLength: promptText.length,
    hasImage: Boolean(imageBase64),
    originalSize: preparedImage.diagnostics.original.sizeFormatted,
    compressedSize: preparedImage.diagnostics.compressed.sizeFormatted,
    base64Size: preparedImage.diagnostics.base64.approxSizeFormatted,
  });

  const response = await fetch(MOODBOARD_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  const data = await parseJsonResponse(response);

  console.info("[Moodboard] api response", {
    ok: response.ok,
    status: response.status,
    elapsedMs: Math.round(performance.now() - requestStartedAt),
    data,
  });

  if (!response.ok) {
    throw new Error(data?.error || getProxyErrorMessage(response.status));
  }

  return normalizeMoodboard(data?.moodboard);
}

async function prepareImageForApi(imageFile) {
  const originalDiagnostics = {
    name: imageFile.name,
    type: imageFile.type || "unknown",
    sizeBytes: imageFile.size,
    sizeFormatted: formatBytes(imageFile.size),
  };

  console.info("[Moodboard][diagnostics] original image file", originalDiagnostics);

  try {
    const compressed = await compressImageFile(imageFile);
    const base64 = await fileToBase64(compressed.file);
    const base64ApproxBytes = getBase64ApproxBytes(base64);
    const diagnostics = {
      original: originalDiagnostics,
      compressed: {
        name: compressed.file.name,
        type: compressed.file.type,
        sizeBytes: compressed.file.size,
        sizeFormatted: formatBytes(compressed.file.size),
        width: compressed.width,
        height: compressed.height,
        originalWidth: compressed.originalWidth,
        originalHeight: compressed.originalHeight,
        maxDimension: IMAGE_MAX_DIMENSION,
        jpegQuality: IMAGE_JPEG_QUALITY,
      },
      base64: {
        length: base64.length,
        approxBytes: base64ApproxBytes,
        approxSizeFormatted: formatBytes(base64ApproxBytes),
      },
    };

    setLastDiagnostics({ image: diagnostics });

    console.info("[Moodboard][diagnostics] compressed image file", diagnostics.compressed);
    console.info("[Moodboard][diagnostics] base64 payload", diagnostics.base64);

    return {
      file: compressed.file,
      base64,
      diagnostics,
    };
  } catch (error) {
    logFrontendError("image compression failed", {
      original: originalDiagnostics,
      error: serializeError(error),
    });
    throw new Error("Не удалось сжать изображение на устройстве. Попробуйте другое фото или сделайте скриншот изображения.");
  }
}

async function compressImageFile(file) {
  const image = await loadImageFromFile(file);
  const originalWidth = image.naturalWidth || image.width;
  const originalHeight = image.naturalHeight || image.height;
  const { width, height } = getResizedDimensions(originalWidth, originalHeight, IMAGE_MAX_DIMENSION);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", { alpha: false });

  if (!context) {
    throw new Error("Canvas 2D context is unavailable.");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  const blob = await canvasToBlob(canvas, "image/jpeg", IMAGE_JPEG_QUALITY);

  if (!blob) {
    throw new Error("Canvas returned an empty JPEG blob.");
  }

  return {
    file: new File([blob], getCompressedFileName(file.name), {
      type: "image/jpeg",
      lastModified: Date.now(),
    }),
    originalWidth,
    originalHeight,
    width,
    height,
  };
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Image decoding failed."));
    };

    image.src = objectUrl;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });
}

function getResizedDimensions(width, height, maxDimension) {
  const longestSide = Math.max(width, height);

  if (!longestSide || longestSide <= maxDimension) {
    return { width, height };
  }

  const scale = maxDimension / longestSide;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function getCompressedFileName(fileName) {
  const safeName = String(fileName || "reference").replace(/\.[^.]+$/, "");
  return `${safeName || "reference"}-compressed.jpg`;
}

function getBase64ApproxBytes(base64) {
  const cleanBase64 = String(base64 || "").replace(/\s/g, "");
  const padding = cleanBase64.endsWith("==") ? 2 : cleanBase64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((cleanBase64.length * 3) / 4) - padding);
}

async function parseJsonResponse(response) {
  const text = await response.text();
  let data = {};

  if (!text) {
    logApiResponse(response, text, data);
    return data;
  }

  try {
    data = JSON.parse(text);
    logApiResponse(response, text, data);
    return data;
  } catch (error) {
    logApiResponse(response, text, { parseError: serializeError(error) });
    throw new Error("Proxy вернул ответ в неожиданном формате.");
  }
}

function logApiResponse(response, rawText, parsedResponse) {
  const apiDiagnostics = {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    rawText,
    parsedResponse,
  };

  setLastDiagnostics({ apiResponse: apiDiagnostics });
  console.info("[Moodboard][diagnostics] full API response", apiDiagnostics);
}

function setLastDiagnostics(partialDiagnostics) {
  window.__MOODBOARD_LAST_DIAGNOSTICS = {
    ...window.__MOODBOARD_LAST_DIAGNOSTICS,
    ...partialDiagnostics,
    updatedAt: new Date().toISOString(),
  };
  renderDebugPanel();
}

function initDebugPanel() {
  if (!debugPanel) {
    return;
  }

  debugPanel.hidden = !IS_DEBUG_MODE;

  if (!IS_DEBUG_MODE) {
    return;
  }

  setLastDiagnostics({
    userAgent: navigator.userAgent,
    origin: window.location.origin || "file://",
    pageUrl: window.location.href,
  });
}

function renderDebugPanel() {
  if (!IS_DEBUG_MODE || !debugPanel) {
    return;
  }

  const diagnostics = window.__MOODBOARD_LAST_DIAGNOSTICS || {};
  const image = diagnostics.image || {};
  const original = image.original || {};
  const compressed = image.compressed || {};
  const base64 = image.base64 || {};
  const apiResponse = diagnostics.apiResponse || {};
  const error = diagnostics.lastFrontendError || {};
  const apiErrorText =
    apiResponse.parsedResponse?.error?.message ||
    (typeof apiResponse.parsedResponse?.error === "string" ? apiResponse.parsedResponse.error : "") ||
    apiResponse.parsedResponse?.message ||
    "";

  setDebugText(debugUpdatedAt, diagnostics.updatedAt ? new Date(diagnostics.updatedAt).toLocaleTimeString("ru-RU") : "Ожидает данных");
  setDebugText(debugOriginalSize, formatDebugFile(original));
  setDebugText(debugCompressedSize, formatDebugFile(compressed));
  setDebugText(debugBase64Size, base64.approxSizeFormatted ? `${base64.approxSizeFormatted} / ${base64.length || 0} chars` : "—");
  setDebugText(
    debugApiStatus,
    apiResponse.status ? `${apiResponse.status} ${apiResponse.statusText || ""}`.trim() : "—"
  );
  setDebugText(
    debugErrorText,
    diagnostics.visibleError || error.error?.message || error.reason?.message || error.message || error.label || apiErrorText || "—"
  );
  setDebugText(debugUserAgent, diagnostics.userAgent || navigator.userAgent || "—");
  setDebugText(debugOrigin, diagnostics.origin || window.location.origin || "file://");
}

function formatDebugFile(fileInfo) {
  if (!fileInfo || !fileInfo.sizeFormatted) {
    return "—";
  }

  const dimensions = fileInfo.width && fileInfo.height ? `, ${fileInfo.width}×${fileInfo.height}` : "";
  const originalDimensions =
    fileInfo.originalWidth && fileInfo.originalHeight ? `, исходно ${fileInfo.originalWidth}×${fileInfo.originalHeight}` : "";
  return `${fileInfo.sizeFormatted} (${fileInfo.sizeBytes || 0} B${dimensions}${originalDimensions})`;
}

function setDebugText(element, value) {
  if (element) {
    element.textContent = value || "—";
  }
}

function formatBytes(bytes) {
  const numericBytes = Number(bytes) || 0;
  const units = ["B", "KB", "MB", "GB"];
  let value = numericBytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function logFrontendError(label, details = {}) {
  const payload = {
    label,
    ...details,
    timestamp: new Date().toISOString(),
  };

  setLastDiagnostics({ lastFrontendError: payload });
  console.error("[Moodboard][frontend error]", payload);
}

function serializeError(error) {
  if (!error) {
    return null;
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return error;
}

function normalizeMoodboard(value) {
  const source = value && typeof value === "object" ? value : {};

  return {
    title: limitText(toText(source.title, DEFAULT_MOODBOARD.title), 35),
    mood: limitText(toText(source.mood, DEFAULT_MOODBOARD.mood), 160),
    colorPalette: normalizePalette(source.colorPalette),
    materials: normalizeList(source.materials, DEFAULT_MOODBOARD.materials, 4, 34),
    keywords: normalizeList(source.keywords, DEFAULT_MOODBOARD.keywords, 4, 22),
    composition: limitText(toText(source.composition, DEFAULT_MOODBOARD.composition), 120),
    typographyMood: limitText(toText(source.typographyMood, DEFAULT_MOODBOARD.typographyMood), 120),
    lighting: limitText(toText(source.lighting, DEFAULT_MOODBOARD.lighting), 120),
  };
}

function normalizePalette(colors) {
  const values = Array.isArray(colors) ? colors : [];
  const normalized = values
    .map((color) => String(color || "").trim().toUpperCase())
    .filter((color) => /^#[0-9A-F]{6}$/.test(color));

  return mergeUnique(normalized, DEFAULT_MOODBOARD.colorPalette).slice(0, 5);
}

function normalizeList(values, fallback, maxItems, maxLength) {
  const list = Array.isArray(values) ? values : [];
  return mergeUnique(
    list
      .map((item) => limitText(String(item || "").trim(), maxLength))
      .filter(Boolean),
    fallback.map((item) => limitText(item, maxLength))
  ).slice(0, maxItems);
}

function toText(value, fallback) {
  const text = String(value || "").trim();
  return text || fallback;
}

function limitText(value, maxLength) {
  const text = String(value || "").replace(/\s+/g, " ").trim();

  if (text.length <= maxLength) {
    return text;
  }

  const sliced = text.slice(0, Math.max(0, maxLength - 3)).trimEnd();
  const lastSpace = sliced.lastIndexOf(" ");
  const readable = lastSpace > Math.floor(maxLength * 0.62) ? sliced.slice(0, lastSpace) : sliced;
  return `${readable}...`;
}

function mergeUnique(...groups) {
  const seen = new Set();
  const result = [];

  groups.flat().forEach((value) => {
    const normalized = String(value || "").trim();
    const key = normalized.toLowerCase();

    if (normalized && !seen.has(key)) {
      seen.add(key);
      result.push(normalized);
    }
  });

  return result;
}

function renderResult(moodboard) {
  currentMoodboard = moodboard;
  renderMoodboardBoard(moodboard);
  emptyState.hidden = true;
  resultSection.hidden = false;
  resultMeta.textContent = `Готово к скачиванию ${EXPORT_WIDTH}×${EXPORT_HEIGHT}`;
  setResultStatus("Готово", true);
  resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

function hideResult() {
  currentMoodboard = null;
  moodboardCanvas.innerHTML = "";
  resultSection.hidden = true;
  emptyState.hidden = false;
  setResultStatus("Ожидает данных", false);
}

function renderMoodboardBoard(moodboard) {
  const referenceImageSrc = previewObjectUrl || "";
  const palette = moodboard.colorPalette;
  const accentColor = palette[1] || "#A46C44";
  const deepColor = getDarkestColor(palette);
  const softColor = palette[3] || "#E8E4DC";

  moodboardCanvas.style.setProperty("--board-accent", accentColor);
  moodboardCanvas.style.setProperty("--board-deep", deepColor);
  moodboardCanvas.style.setProperty("--board-soft", softColor);

  moodboardCanvas.innerHTML = `
    <div class="board-texture" aria-hidden="true">
      <img src="${escapeAttribute(referenceImageSrc)}" alt="" />
    </div>

    <div class="board-rule board-rule-top" aria-hidden="true"></div>
    <div class="board-rule board-rule-bottom" aria-hidden="true"></div>

    <section class="board-main-photo" aria-label="Главный референс">
      <img src="${escapeAttribute(referenceImageSrc)}" alt="Главный референс мудборда" />
      <span class="board-photo-label">reference / 01</span>
    </section>

    <section class="board-editorial">
      <span class="board-number">01</span>
      <p class="board-kicker">Creative direction</p>
      <h3>${escapeHtml(moodboard.title)}</h3>
      <p class="board-mood">${escapeHtml(moodboard.mood)}</p>
      <div class="board-keywords" aria-label="Ключевые слова">
        ${moodboard.keywords
          .map(
            (keyword, index) => `
              <span>
                <b>${String(index + 1).padStart(2, "0")}</b>
                ${escapeHtml(keyword)}
              </span>
            `
          )
          .join("")}
      </div>
    </section>

    <section class="board-detail board-detail-one" aria-label="Дополнительный фрагмент 1">
      <img src="${escapeAttribute(referenceImageSrc)}" alt="" />
      <span>texture crop</span>
    </section>

    <section class="board-detail board-detail-two" aria-label="Дополнительный фрагмент 2">
      <img src="${escapeAttribute(referenceImageSrc)}" alt="" />
      <span>light crop</span>
    </section>

    <section class="board-palette" aria-label="Палитра цветов">
      <div class="board-section-label">
        <span>02</span>
        <strong>Palette</strong>
      </div>
      <div class="board-swatches">
        ${palette
          .map(
            (color) => `
              <span>
                <i style="background:${escapeAttribute(color)}"></i>
                <b>${escapeHtml(color)}</b>
              </span>
            `
          )
          .join("")}
      </div>
    </section>

    <section class="board-materials" aria-label="Материалы">
      <div class="board-section-label">
        <span>03</span>
        <strong>Materials</strong>
      </div>
      <div class="board-material-list">
        ${moodboard.materials
          .map(
            (material) => `
              <span>${escapeHtml(material)}</span>
            `
          )
          .join("")}
      </div>
    </section>

    <section class="board-notes" aria-label="Заметки направления">
      <article>
        <span>composition</span>
        <p>${escapeHtml(moodboard.composition)}</p>
      </article>
      <article>
        <span>type</span>
        <p>${escapeHtml(moodboard.typographyMood)}</p>
      </article>
      <article>
        <span>light</span>
        <p>${escapeHtml(moodboard.lighting)}</p>
      </article>
    </section>

    <section class="board-detail board-detail-three" aria-label="Дополнительный фрагмент 3">
      <img src="${escapeAttribute(referenceImageSrc)}" alt="" />
      <span>mood crop</span>
    </section>

    <footer class="board-footer">
      <span>moodboard / 16:9</span>
      <span>visual direction</span>
    </footer>
  `;
}

async function downloadGeneratedMoodboard() {
  if (!currentMoodboard) {
    showError("Сначала создайте мудборд.");
    return;
  }

  if (!window.html2canvas) {
    showError("Библиотека html2canvas не загрузилась. Проверьте подключение к интернету и попробуйте снова.");
    return;
  }

  clearError();
  downloadButton.disabled = true;
  downloadButton.textContent = "Готовим PNG...";

  const exportStage = document.createElement("div");
  const exportBoard = moodboardCanvas.cloneNode(true);
  exportBoard.id = "moodboardExportCanvas";
  exportBoard.classList.add("export-board");
  exportStage.className = "export-stage";
  exportStage.appendChild(exportBoard);
  document.body.appendChild(exportStage);

  try {
    await waitForImages(exportBoard);

    const canvas = await window.html2canvas(exportBoard, {
      backgroundColor: "#F4EFE6",
      width: EXPORT_WIDTH,
      height: EXPORT_HEIGHT,
      windowWidth: EXPORT_WIDTH,
      windowHeight: EXPORT_HEIGHT,
      scale: 1,
      useCORS: true,
    });
    const pngDataUrl = canvas.toDataURL("image/png");
    triggerDownload(pngDataUrl, `moodboard-${new Date().toISOString().slice(0, 10)}.png`);
  } catch (error) {
    logFrontendError("download failed", {
      error: serializeError(error),
    });
    console.error("[Moodboard] download error", error);
    showError("Не удалось скачать мудборд. Попробуйте ещё раз.");
  } finally {
    exportStage.remove();
    downloadButton.disabled = false;
    downloadButton.textContent = "Скачать PNG";
  }
}

function getDarkestColor(colors) {
  return [...colors].sort((first, second) => getColorLuminance(first) - getColorLuminance(second))[0] || "#1E1E1E";
}

function getColorLuminance(hexColor) {
  const hex = String(hexColor || "").replace("#", "");

  if (!/^[0-9A-F]{6}$/i.test(hex)) {
    return 1;
  }

  const channels = [0, 2, 4].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255);
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  );

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function waitForImages(container) {
  const images = Array.from(container.querySelectorAll("img"));

  return Promise.all(
    images.map((image) => {
      if (image.complete && image.naturalWidth > 0) {
        return Promise.resolve();
      }

      return new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
      });
    })
  );
}

function triggerDownload(url, downloadName) {
  const link = document.createElement("a");
  link.href = url;
  link.download = downloadName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function setResultStatus(text, isReady) {
  resultStatus.textContent = text;
  resultStatus.classList.toggle("is-ready", isReady);
}

function getProxyErrorMessage(status) {
  if (status === 400) {
    return "Proxy отклонил запрос. Проверьте формат изображения и описание мудборда.";
  }

  if (status === 401 || status === 403) {
    return "Proxy не смог авторизоваться в Gemini. Проверьте GEMINI_API_KEY в Vercel.";
  }

  if (status === 429) {
    return "Слишком много запросов к Gemini. Подождите немного и попробуйте снова.";
  }

  if (status >= 500) {
    return "Serverless proxy временно недоступен. Проверьте Vercel Function logs и попробуйте ещё раз.";
  }

  return `Proxy вернул ошибку ${status}. Попробуйте ещё раз.`;
}

function getReadableApiError(error) {
  return error?.message || "Не удалось создать мудборд. Проверьте serverless proxy и попробуйте ещё раз.";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
