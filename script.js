const MOODBOARD_API_URL =
  window.MOODBOARD_API_URL || "https://YOUR_VERCEL_PROJECT.vercel.app/api/generate-moodboard";

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
const resultImage = document.getElementById("resultImage");
const emptyState = document.getElementById("emptyState");
const resultStatus = document.getElementById("resultStatus");
const resultMeta = document.getElementById("resultMeta");
const paletteSwatches = document.getElementById("paletteSwatches");
const referenceTags = document.getElementById("referenceTags");
const keywordTags = document.getElementById("keywordTags");
const materialTags = document.getElementById("materialTags");
const typePairing = document.getElementById("typePairing");
const compositionNote = document.getElementById("compositionNote");
const downloadButton = document.getElementById("downloadButton");
const generateAgainButton = document.getElementById("generateAgainButton");
const zoomButton = document.getElementById("zoomButton");
const openPreviewButton = document.getElementById("openPreviewButton");
const imageModal = document.getElementById("imageModal");
const modalImage = document.getElementById("modalImage");
const closeModalButton = document.getElementById("closeModalButton");

const PALETTE_PRESETS = [
  {
    match: ["олив", "зел", "forest", "botanical", "nature", "garden"],
    colors: ["#1E1E1E", "#617A55", "#A46C44", "#D7C7AF", "#F8F7F4"],
  },
  {
    match: ["fashion", "editorial", "кампейн", "сьем", "съем", "brand", "бренд"],
    colors: ["#1E1E1E", "#6F6F6F", "#A46C44", "#E8E4DC", "#FFFFFF"],
  },
  {
    match: ["интерьер", "дерево", "linen", "wood", "ceramic", "камень", "stone"],
    colors: ["#2C2621", "#8E5A37", "#B99B78", "#E8E4DC", "#F3F1EC"],
  },
  {
    match: ["сайт", "digital", "app", "product", "минимал", "clean"],
    colors: ["#1E1E1E", "#3B3B3B", "#A46C44", "#E8E4DC", "#FFFFFF"],
  },
];

const DEFAULT_PALETTE = ["#1E1E1E", "#6F6F6F", "#A46C44", "#C9B79E", "#F8F7F4"];
const DEFAULT_REFERENCES = ["hero-кадр", "детали", "свет", "ритм", "контекст"];
const DEFAULT_KEYWORDS = ["спокойно", "дорого", "цельно", "редакционно"];
const DEFAULT_MATERIALS = ["натуральная фактура", "мягкий свет", "матовая поверхность", "тонкая тень"];
const STOP_WORDS = new Set([
  "для",
  "или",
  "как",
  "это",
  "через",
  "очень",
  "with",
  "and",
  "the",
  "for",
  "from",
  "this",
  "that",
  "visual",
  "moodboard",
  "board",
]);

let selectedImageFile = null;
let previewObjectUrl = "";
let currentMoodboardUrl = "";
let isGenerating = false;

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
    const imageUrl = await generateMoodboardWithGemini(selectedImageFile, promptText);
    renderResult(imageUrl);
  } catch (error) {
    console.error("[Moodboard] error", error);
    showError(getReadableApiError(error));
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
  promptInput.focus();
  document.getElementById("generator").scrollIntoView({ behavior: "smooth", block: "start" });
});

zoomButton.addEventListener("click", openImageModal);
openPreviewButton.addEventListener("click", openImageModal);
closeModalButton.addEventListener("click", closeImageModal);

imageModal.addEventListener("click", (event) => {
  if (event.target === imageModal) {
    closeImageModal();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !imageModal.hidden) {
    closeImageModal();
  }
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
}

function getValidationError(promptText) {
  if (!selectedImageFile) {
    return "Сначала загрузите референс.";
  }

  if (!promptText) {
    return "Опишите настроение, стиль и задачу для мудборда.";
  }

  if (!isProxyConfigured()) {
    return "Укажите URL serverless proxy в MOODBOARD_API_URL. Для GitHub Pages нужен полный URL Vercel Function.";
  }

  return "";
}

function showError(message) {
  formError.textContent = message;
  formError.hidden = false;
}

function clearError() {
  formError.textContent = "";
  formError.hidden = true;
}

function setGeneratingState(isLoading) {
  isGenerating = isLoading;
  loader.hidden = !isLoading;
  generateButton.disabled = isLoading;
  imageInput.disabled = isLoading;
  promptInput.disabled = isLoading;
  removeImageButton.disabled = isLoading;
  generatorForm.setAttribute("aria-busy", String(isLoading));
  generateButtonText.textContent = isLoading ? "Создаём мудборд..." : "Создать мудборд";

  if (isLoading) {
    setResultStatus("Запрос к proxy", false);
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

    reader.onerror = () => reject(new Error("Не удалось прочитать изображение."));
    reader.readAsDataURL(file);
  });
}

async function generateMoodboardWithGemini(imageFile, promptText) {
  const imageBase64 = await fileToBase64(imageFile);
  const requestBody = {
    imageBase64,
    mimeType: imageFile.type || "image/png",
    prompt: promptText,
    fileName: imageFile.name,
  };
  const endpoint = getProxyEndpoint();
  const requestStartedAt = performance.now();

  console.info("[Moodboard] start request", {
    endpoint,
    fileName: imageFile.name,
    fileType: imageFile.type,
    promptLength: promptText.length,
  });

  const response = await fetch(endpoint, {
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

  const imageUrl = extractProxyImage(data);

  if (!imageUrl) {
    throw new Error("Proxy вернул ответ без изображения. Проверьте доступ к Gemini image generation.");
  }

  return imageUrl;
}

async function parseJsonResponse(response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error("Proxy вернул ответ в неожиданном формате.");
  }
}

function extractProxyImage(data) {
  if (typeof data?.imageUrl === "string") {
    return data.imageUrl;
  }

  if (typeof data?.image_url === "string") {
    return data.image_url;
  }

  if (data?.imageBase64) {
    return `data:${data.mimeType || "image/png"};base64,${data.imageBase64}`;
  }

  return "";
}

function renderResult(imageUrl) {
  currentMoodboardUrl = imageUrl;
  resultImage.src = imageUrl;
  modalImage.src = imageUrl;
  emptyState.hidden = true;
  resultSection.hidden = false;
  resultMeta.textContent = `Сгенерировано ${new Date().toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
  renderDirectionDetails(promptInput.value.trim());
  setResultStatus("Готово", true);
  resultSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function hideResult() {
  currentMoodboardUrl = "";
  resultImage.removeAttribute("src");
  modalImage.removeAttribute("src");
  resultSection.hidden = true;
  emptyState.hidden = false;
  clearDirectionDetails();
  setResultStatus("Ожидает данных", false);
}

function renderDirectionDetails(promptText) {
  const tokens = extractPromptTokens(promptText);
  const palette = pickPalette(promptText);
  const references = mergeUnique(tokens.slice(0, 2), DEFAULT_REFERENCES).slice(0, 5);
  const keywords = mergeUnique(tokens, DEFAULT_KEYWORDS).slice(0, 6);
  const materials = pickMaterials(promptText, tokens);

  renderPalette(palette);
  renderTagList(referenceTags, references);
  renderTagList(keywordTags, keywords);
  renderTagList(materialTags, materials);

  typePairing.textContent = pickTypePairing(promptText);
  compositionNote.textContent =
    "Крупный центральный образ, дополнительные визуальные фрагменты, палитра, фактуры и детали собраны в единую editorial-композицию для презентации идеи.";
}

function clearDirectionDetails() {
  paletteSwatches.innerHTML = "";
  referenceTags.innerHTML = "";
  keywordTags.innerHTML = "";
  materialTags.innerHTML = "";
}

function renderPalette(colors) {
  paletteSwatches.innerHTML = "";

  colors.forEach((color) => {
    const swatch = document.createElement("span");
    swatch.style.background = color;
    swatch.setAttribute("aria-label", color);
    paletteSwatches.appendChild(swatch);
  });
}

function renderTagList(container, values) {
  container.innerHTML = "";

  values.forEach((value) => {
    const tag = document.createElement("span");
    tag.textContent = value;
    container.appendChild(tag);
  });
}

function extractPromptTokens(promptText) {
  const words = promptText.toLowerCase().match(/[\p{L}\p{N}-]+/gu) || [];

  return mergeUnique(
    words
      .map((word) => word.replace(/^-+|-+$/g, ""))
      .filter((word) => word.length > 3 && !STOP_WORDS.has(word))
      .slice(0, 10),
    []
  );
}

function pickPalette(promptText) {
  const normalized = promptText.toLowerCase();
  const preset = PALETTE_PRESETS.find((item) => item.match.some((word) => normalized.includes(word)));
  return preset?.colors || DEFAULT_PALETTE;
}

function pickMaterials(promptText, tokens) {
  const normalized = promptText.toLowerCase();
  const materials = [];

  if (normalized.includes("дерев") || normalized.includes("wood")) materials.push("дерево");
  if (normalized.includes("кам") || normalized.includes("stone")) materials.push("камень");
  if (normalized.includes("лен") || normalized.includes("linen")) materials.push("лён");
  if (normalized.includes("керами") || normalized.includes("ceramic")) materials.push("керамика");
  if (normalized.includes("металл") || normalized.includes("metal")) materials.push("металл");
  if (normalized.includes("стек") || normalized.includes("glass")) materials.push("стекло");

  return mergeUnique(materials, tokens.slice(0, 2), DEFAULT_MATERIALS).slice(0, 5);
}

function pickTypePairing(promptText) {
  const normalized = promptText.toLowerCase();

  if (normalized.includes("fashion") || normalized.includes("editorial") || normalized.includes("кампейн")) {
    return "Inter / Editorial Sans";
  }

  if (normalized.includes("brand") || normalized.includes("бренд")) {
    return "Inter / Brand Grotesk";
  }

  if (normalized.includes("сайт") || normalized.includes("digital") || normalized.includes("app")) {
    return "Inter / Product Sans";
  }

  return "Inter / Studio Sans";
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

async function downloadGeneratedImage() {
  if (!currentMoodboardUrl) {
    showError("Сначала создайте мудборд.");
    return;
  }

  const downloadName = `moodboard-${new Date().toISOString().slice(0, 10)}.png`;

  if (currentMoodboardUrl.startsWith("data:") || currentMoodboardUrl.startsWith("blob:")) {
    triggerDownload(currentMoodboardUrl, downloadName);
    return;
  }

  try {
    const response = await fetch(currentMoodboardUrl, { mode: "cors" });

    if (!response.ok) {
      throw new Error("Не удалось скачать изображение по ссылке.");
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    triggerDownload(objectUrl, downloadName);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  } catch (error) {
    console.error("[Moodboard] error", error);
    const opened = window.open(currentMoodboardUrl, "_blank", "noopener,noreferrer");

    if (!opened) {
      showError("Браузер заблокировал скачивание. Откройте результат в новом окне и сохраните изображение.");
    }
  }
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

function openImageModal() {
  if (!currentMoodboardUrl) {
    return;
  }

  modalImage.src = currentMoodboardUrl;
  imageModal.hidden = false;
  document.body.classList.add("modal-open");
  closeModalButton.focus();
}

function closeImageModal() {
  imageModal.hidden = true;
  document.body.classList.remove("modal-open");

  if (!resultSection.hidden) {
    zoomButton.focus();
  }
}

function setResultStatus(text, isReady) {
  resultStatus.textContent = text;
  resultStatus.classList.toggle("is-ready", isReady);
}

function getProxyEndpoint() {
  return MOODBOARD_API_URL.trim();
}

function isProxyConfigured() {
  const endpoint = getProxyEndpoint();
  return Boolean(endpoint) && !endpoint.includes("YOUR_VERCEL_PROJECT");
}

function getProxyErrorMessage(status) {
  if (status === 400) {
    return "Proxy отклонил запрос. Проверьте формат изображения и описание мудборда.";
  }

  if (status === 401 || status === 403) {
    return "Proxy не смог авторизоваться в Gemini. Проверьте GEMINI_API_KEY в environment variables.";
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
