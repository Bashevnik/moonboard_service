const GEMINI_API_KEY = "PASTE_GEMINI_API_KEY_HERE";

// Для дипломного демо ключ временно хранится во frontend JS.
// В реальном проекте так делать нельзя: API-ключ нужно держать на backend
// или serverless-прокси, чтобы посетители сайта не могли его увидеть.

const GEMINI_MODEL = "gemini-3.1-flash-image";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent`;

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
const downloadButton = document.getElementById("downloadButton");
const generateAgainButton = document.getElementById("generateAgainButton");
const zoomButton = document.getElementById("zoomButton");
const openPreviewButton = document.getElementById("openPreviewButton");
const imageModal = document.getElementById("imageModal");
const modalImage = document.getElementById("modalImage");
const closeModalButton = document.getElementById("closeModalButton");

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
    return "Опишите настроение и задачу для мудборда.";
  }

  if (!GEMINI_API_KEY.trim()) {
    return "Добавьте GEMINI_API_KEY в script.js.";
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
  generateButtonText.textContent = isLoading ? "Генерация..." : "Создать мудборд";

  if (isLoading) {
    setResultStatus("Запрос к Gemini", false);
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
  const requestStartedAt = performance.now();
  const base64Image = await fileToBase64(imageFile);
  const requestBody = buildGeminiRequestBody(imageFile, base64Image, promptText);

  console.info("[Moodboard] start request", {
    endpoint: GEMINI_API_URL,
    model: GEMINI_MODEL,
    fileName: imageFile.name,
    fileType: imageFile.type,
    promptLength: promptText.length,
    usingPlaceholderKey: GEMINI_API_KEY === "PASTE_GEMINI_API_KEY_HERE",
  });

  const response = await fetch(GEMINI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": GEMINI_API_KEY.trim(),
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
    throw new Error(getGeminiErrorMessage(data, response.status));
  }

  const imageUrl = extractImageFromGeminiResponse(data);

  if (!imageUrl) {
    throw new Error(
      "Gemini ответил без изображения. Попробуйте уточнить описание или проверьте доступность image generation для ключа."
    );
  }

  return imageUrl;
}

function buildGeminiRequestBody(imageFile, base64Image, promptText) {
  return {
    contents: [
      {
        role: "user",
        parts: [
          { text: buildGeminiPrompt(promptText) },
          {
            inlineData: {
              mimeType: imageFile.type || "image/png",
              data: base64Image,
            },
          },
        ],
      },
    ],
  };
}

function buildGeminiPrompt(promptText) {
  return `Create a beautiful visual moodboard based on the uploaded reference image and this description: ${promptText}.
Use the reference image only as inspiration for colors, textures, mood, lighting and visual direction.
Generate one square moodboard image with multiple aesthetic sections, color palette, material textures, visual references, and cohesive composition.
No text, no watermark, no logos.`;
}

async function parseJsonResponse(response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error("Gemini вернул ответ в неожиданном формате.");
  }
}

function extractImageFromGeminiResponse(data) {
  const directUrl = findImageUrl(data);

  if (directUrl) {
    return directUrl;
  }

  const parts = data?.candidates?.flatMap((candidate) => candidate?.content?.parts || []) || [];

  for (const part of parts) {
    const inlineData = part.inlineData || part.inline_data;

    if (inlineData?.data) {
      const mimeType = inlineData.mimeType || inlineData.mime_type || "image/png";
      return `data:${mimeType};base64,${inlineData.data}`;
    }

    const fileUri = part.fileData?.fileUri || part.file_data?.file_uri;
    if (fileUri) {
      return fileUri;
    }
  }

  const generatedImageBytes =
    data?.generatedImages?.[0]?.image?.imageBytes ||
    data?.predictions?.[0]?.bytesBase64Encoded ||
    data?.predictions?.[0]?.image?.imageBytes;

  if (generatedImageBytes) {
    return `data:image/png;base64,${generatedImageBytes}`;
  }

  return "";
}

function findImageUrl(value) {
  if (!value || typeof value !== "object") {
    return "";
  }

  if (typeof value.image_url === "string") {
    return value.image_url;
  }

  if (typeof value.imageUrl === "string") {
    return value.imageUrl;
  }

  if (value.image_url?.url) {
    return value.image_url.url;
  }

  for (const item of Object.values(value)) {
    if (Array.isArray(item)) {
      for (const child of item) {
        const nestedUrl = findImageUrl(child);
        if (nestedUrl) {
          return nestedUrl;
        }
      }
    } else if (item && typeof item === "object") {
      const nestedUrl = findImageUrl(item);
      if (nestedUrl) {
        return nestedUrl;
      }
    }
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
  setResultStatus("Готово", true);
  resultSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function hideResult() {
  currentMoodboardUrl = "";
  resultImage.removeAttribute("src");
  modalImage.removeAttribute("src");
  resultSection.hidden = true;
  emptyState.hidden = false;
  setResultStatus("Ожидает данных", false);
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
      showError("Браузер заблокировал скачивание. Откройте результат в новой вкладке.");
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
  zoomButton.focus();
}

function setResultStatus(text, isReady) {
  resultStatus.textContent = text;
  resultStatus.classList.toggle("is-ready", isReady);
}

function getGeminiErrorMessage(data, status) {
  const apiMessage = data?.error?.message || data?.message;
  const normalizedMessage = String(apiMessage || "").toLowerCase();

  if (normalizedMessage.includes("api key not valid") || normalizedMessage.includes("api_key_invalid")) {
    return "API-ключ Gemini недействителен. Замените GEMINI_API_KEY в script.js на реальный ключ.";
  }

  if (normalizedMessage.includes("api key")) {
    return "Проблема с API-ключом Gemini. Проверьте GEMINI_API_KEY в script.js.";
  }

  if (status === 400) {
    return "Gemini отклонил запрос. Проверьте формат изображения и описание.";
  }

  if (status === 401 || status === 403) {
    return "Gemini не принял API-ключ. Проверьте GEMINI_API_KEY в script.js.";
  }

  if (status === 429) {
    return "Слишком много запросов к Gemini. Подождите немного и попробуйте снова.";
  }

  return `Gemini вернул ошибку ${status}. Попробуйте ещё раз.`;
}

function getReadableApiError(error) {
  return error?.message || "Не удалось создать мудборд. Проверьте API и попробуйте ещё раз.";
}
