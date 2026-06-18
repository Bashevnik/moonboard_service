const MOODBOARD_API_URL = "https://moonboard-service-vercel.vercel.app/api/generate-moodboard";
const IMAGE_MAX_DIMENSION = 1024;
const IMAGE_JPEG_QUALITY = 0.82;
const IS_DEBUG_MODE = new URLSearchParams(window.location.search).get("debug") === "1";
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

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
const loaderText = document.getElementById("loaderText");
const resultSection = document.getElementById("resultSection");
const emptyState = document.getElementById("emptyState");
const resultStatus = document.getElementById("resultStatus");
const resultMeta = document.getElementById("resultMeta");
const resultImage = document.getElementById("resultImage");
const downloadButton = document.getElementById("downloadButton");
const generateAgainButton = document.getElementById("generateAgainButton");
const editDescriptionButton = document.getElementById("editDescriptionButton");
const aspectRatioBtns = document.querySelectorAll(".ratio-btn");
const debugPanel = document.getElementById("debugPanel");
const debugUpdatedAt = document.getElementById("debugUpdatedAt");
const debugOriginalSize = document.getElementById("debugOriginalSize");
const debugCompressedSize = document.getElementById("debugCompressedSize");
const debugBase64Size = document.getElementById("debugBase64Size");
const debugApiStatus = document.getElementById("debugApiStatus");
const debugErrorText = document.getElementById("debugErrorText");
const debugUserAgent = document.getElementById("debugUserAgent");
const debugOrigin = document.getElementById("debugOrigin");

let selectedImageFile = null;
let previewObjectUrl = "";
let currentImageData = null;
let isGenerating = false;
let selectedAspectRatio = "16:9";

window.__MOODBOARD_LAST_DIAGNOSTICS = {};

initDebugPanel();
initAspectRatioButtons();

window.addEventListener("error", (event) => {
  logFrontendError("window error", {
    message: event.message,
    source: event.filename,
    line: event.lineno,
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
  updateLoaderText("Сжимаем изображение...");

  try {
    console.info("[Moodboard] generation start", {
      fileName: selectedImageFile.name,
      fileType: selectedImageFile.type,
      fileSizeBytes: selectedImageFile.size,
      promptLength: promptText.length,
      aspectRatio: selectedAspectRatio,
    });

    const imageData = await generateMoodboard(selectedImageFile, promptText, selectedAspectRatio);
    renderResult(imageData);

    console.info("[Moodboard] generation success", { model: imageData.model });
  } catch (error) {
    logFrontendError("generation failed", { error: serializeError(error) });
    console.error("[Moodboard] error", error);
    showError(error?.message || "Не удалось создать мудборд. Попробуйте ещё раз.");
    setResultStatus("Ошибка генерации", false);
  } finally {
    setGeneratingState(false);
  }
});

downloadButton.addEventListener("click", () => {
  downloadGeneratedImage();
});

generateAgainButton.addEventListener("click", () => {
  clearError();
  hideResult();
  generateButton.focus();
  document.getElementById("generator").scrollIntoView({ behavior: "smooth", block: "start" });
});

editDescriptionButton.addEventListener("click", () => {
  clearError();
  promptInput.focus();
  document.getElementById("generator").scrollIntoView({ behavior: "smooth", block: "start" });
});

function handleImageFile(file) {
  if (isGenerating || !file) {
    return;
  }

  if (!ALLOWED_MIME_TYPES.has(file.type.toLowerCase())) {
    clearSelectedImage();
    const isHeic = /heic|heif/i.test(file.type) || /\.heic$/i.test(file.name);
    const isSvg = /svg/i.test(file.type) || /\.svg$/i.test(file.name);

    if (isHeic) {
      showError("HEIC не поддерживается. Конвертируйте в JPEG или PNG в настройках камеры.");
    } else if (isSvg) {
      showError("SVG не поддерживается. Используйте JPEG, PNG или WebP.");
    } else {
      showError(`Формат «${file.type || file.name}» не поддерживается. Загрузите JPEG, PNG или WebP.`);
    }
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

  setLastDiagnostics({ image: null, apiResponse: null, lastFrontendError: null });
}

function initAspectRatioButtons() {
  aspectRatioBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (isGenerating) return;
      aspectRatioBtns.forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      selectedAspectRatio = btn.dataset.ratio;
    });
  });
}

function getValidationError(promptText) {
  if (!selectedImageFile) {
    return "Сначала загрузите референс.";
  }
  if (!promptText) {
    return "Опишите настроение, стиль и задачу для мудборда.";
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
  generateButtonText.textContent = isLoading ? "Создаём..." : "Создать мудборд";
}

function updateLoaderText(text) {
  if (loaderText) {
    loaderText.textContent = text;
  }
}

async function generateMoodboard(imageFile, promptText, aspectRatio) {
  updateLoaderText("Сжимаем изображение...");
  const preparedImage = await prepareImageForApi(imageFile);

  updateLoaderText("Отправляем запрос...");

  const requestBody = {
    imageBase64: preparedImage.base64,
    mimeType: preparedImage.file.type || "image/jpeg",
    prompt: promptText,
    aspectRatio,
    fileName: preparedImage.file.name,
  };

  console.info("[Moodboard] sending request", {
    endpoint: MOODBOARD_API_URL,
    fileName: preparedImage.file.name,
    mimeType: preparedImage.file.type,
    aspectRatio,
    promptLength: promptText.length,
    compressedSize: preparedImage.diagnostics.compressed.sizeFormatted,
    base64Size: preparedImage.diagnostics.base64.approxSizeFormatted,
  });

  updateLoaderText("Gemini генерирует изображение...");

  const requestStartedAt = performance.now();
  const response = await fetch(MOODBOARD_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  const data = await parseJsonResponse(response);

  console.info("[Moodboard] response received", {
    ok: response.ok,
    status: response.status,
    elapsedMs: Math.round(performance.now() - requestStartedAt),
    hasImage: Boolean(data?.imageBase64),
    mimeType: data?.mimeType,
    model: data?.model,
  });

  if (!response.ok) {
    throw new Error(data?.error || getProxyErrorMessage(response.status));
  }

  if (!data.imageBase64) {
    throw new Error("Прокси не вернул изображение. Попробуйте ещё раз.");
  }

  return data;
}

async function prepareImageForApi(imageFile) {
  const originalDiagnostics = {
    name: imageFile.name,
    type: imageFile.type || "unknown",
    sizeBytes: imageFile.size,
    sizeFormatted: formatBytes(imageFile.size),
  };

  console.info("[Moodboard][diagnostics] original image", originalDiagnostics);

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
    },
    base64: {
      length: base64.length,
      approxBytes: base64ApproxBytes,
      approxSizeFormatted: formatBytes(base64ApproxBytes),
    },
  };

  setLastDiagnostics({ image: diagnostics });

  console.info("[Moodboard][diagnostics] compressed", diagnostics.compressed);
  console.info("[Moodboard][diagnostics] base64 payload", diagnostics.base64);

  return { file: compressed.file, base64, diagnostics };
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
    throw new Error("Canvas 2D context недоступен на этом устройстве.");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  const blob = await canvasToBlob(canvas, "image/jpeg", IMAGE_JPEG_QUALITY);

  if (!blob) {
    throw new Error("Не удалось сжать изображение.");
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
      reject(new Error("Не удалось декодировать изображение. Попробуйте другое фото или сделайте скриншот."));
    };

    image.src = objectUrl;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function getResizedDimensions(width, height, maxDimension) {
  const longest = Math.max(width, height);

  if (!longest || longest <= maxDimension) {
    return { width, height };
  }

  const scale = maxDimension / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function getCompressedFileName(name) {
  const safe = String(name || "reference").replace(/\.[^.]+$/, "");
  return `${safe || "reference"}-compressed.jpg`;
}

function getBase64ApproxBytes(base64) {
  const clean = String(base64 || "").replace(/\s/g, "");
  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((clean.length * 3) / 4) - padding);
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };

    reader.onerror = () => {
      reject(new Error("Не удалось прочитать изображение."));
    };

    reader.readAsDataURL(file);
  });
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

function renderResult(imageData) {
  currentImageData = imageData;

  const dataUrl = `data:${imageData.mimeType};base64,${imageData.imageBase64}`;
  resultImage.src = dataUrl;

  const modelLabel = imageData.model || "Gemini";
  const timeLabel = imageData.generatedAt
    ? new Date(imageData.generatedAt).toLocaleTimeString("ru-RU")
    : "";
  resultMeta.textContent = timeLabel ? `${modelLabel} · ${timeLabel}` : modelLabel;

  emptyState.hidden = true;
  resultSection.hidden = false;
  setResultStatus("Готово", true);
  resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

function hideResult() {
  currentImageData = null;
  resultImage.removeAttribute("src");
  resultSection.hidden = true;
  emptyState.hidden = false;
  setResultStatus("Ожидает данных", false);
}

function downloadGeneratedImage() {
  if (!currentImageData) {
    showError("Сначала создайте мудборд.");
    return;
  }

  const { imageBase64, mimeType } = currentImageData;
  const ext = (mimeType || "image/png").split("/")[1] || "png";
  const date = new Date().toISOString().slice(0, 10);
  const dataUrl = `data:${mimeType};base64,${imageBase64}`;

  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = `moodboard-${date}.${ext}`;
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
  if (status === 400) return "Proxy отклонил запрос. Проверьте формат изображения и описание.";
  if (status === 403) return "Запрос заблокирован proxy.";
  if (status === 429) return "Слишком много запросов. Подождите немного и попробуйте снова.";
  if (status === 504) return "Gemini не ответил вовремя. Попробуйте ещё раз.";
  if (status >= 500) return "Serverless proxy временно недоступен. Проверьте Vercel logs и попробуйте ещё раз.";
  return `Proxy вернул ошибку ${status}. Попробуйте ещё раз.`;
}

function logApiResponse(response, rawText, parsedResponse) {
  const apiDiagnostics = {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    parsedResponse,
  };

  setLastDiagnostics({ apiResponse: apiDiagnostics });
  console.info("[Moodboard][diagnostics] API response", {
    ok: response.ok,
    status: response.status,
    hasImage: Boolean(parsedResponse?.imageBase64),
    model: parsedResponse?.model,
    error: parsedResponse?.error,
  });
}

function setLastDiagnostics(partial) {
  window.__MOODBOARD_LAST_DIAGNOSTICS = {
    ...window.__MOODBOARD_LAST_DIAGNOSTICS,
    ...partial,
    updatedAt: new Date().toISOString(),
  };
  renderDebugPanel();
}

function initDebugPanel() {
  if (!debugPanel) return;

  debugPanel.hidden = !IS_DEBUG_MODE;

  if (!IS_DEBUG_MODE) return;

  setLastDiagnostics({
    userAgent: navigator.userAgent,
    origin: window.location.origin || "file://",
    pageUrl: window.location.href,
  });
}

function renderDebugPanel() {
  if (!IS_DEBUG_MODE || !debugPanel) return;

  const d = window.__MOODBOARD_LAST_DIAGNOSTICS || {};
  const image = d.image || {};
  const original = image.original || {};
  const compressed = image.compressed || {};
  const base64 = image.base64 || {};
  const api = d.apiResponse || {};
  const err = d.lastFrontendError || {};
  const apiErrText =
    (typeof api.parsedResponse?.error === "string" ? api.parsedResponse.error : api.parsedResponse?.error?.message) ||
    api.parsedResponse?.message ||
    "";

  setDebugText(debugUpdatedAt, d.updatedAt ? new Date(d.updatedAt).toLocaleTimeString("ru-RU") : "Ожидает данных");
  setDebugText(debugOriginalSize, formatDebugFile(original));
  setDebugText(debugCompressedSize, formatDebugFile(compressed));
  setDebugText(debugBase64Size, base64.approxSizeFormatted ? `${base64.approxSizeFormatted} / ${base64.length || 0} chars` : "—");
  setDebugText(debugApiStatus, api.status ? `${api.status} ${api.statusText || ""}`.trim() : "—");
  setDebugText(debugErrorText, d.visibleError || err?.error?.message || err?.reason?.message || err?.message || err?.label || apiErrText || "—");
  setDebugText(debugUserAgent, d.userAgent || navigator.userAgent || "—");
  setDebugText(debugOrigin, d.origin || window.location.origin || "file://");
}

function formatDebugFile(fileInfo) {
  if (!fileInfo || !fileInfo.sizeFormatted) return "—";

  const dims = fileInfo.width && fileInfo.height ? `, ${fileInfo.width}×${fileInfo.height}` : "";
  const origDims = fileInfo.originalWidth ? `, исходно ${fileInfo.originalWidth}×${fileInfo.originalHeight}` : "";
  return `${fileInfo.sizeFormatted} (${fileInfo.sizeBytes || 0} B${dims}${origDims})`;
}

function setDebugText(element, value) {
  if (element) element.textContent = value || "—";
}

function logFrontendError(label, details = {}) {
  const payload = { label, ...details, timestamp: new Date().toISOString() };
  setLastDiagnostics({ lastFrontendError: payload });
  console.error("[Moodboard][frontend error]", payload);
}

function serializeError(error) {
  if (!error) return null;
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return error;
}

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  const units = ["B", "KB", "MB", "GB"];
  let value = n;
  let i = 0;

  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }

  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}
