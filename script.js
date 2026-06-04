const GEMINI_API_KEY = "PASTE_GEMINI_API_KEY_HERE";

// Для дипломного демо ключ временно хранится во frontend JS.
// В реальном проекте так делать нельзя: API-ключ нужно держать на backend
// или serverless-прокси, чтобы посетители сайта не могли его увидеть.

const GEMINI_MODEL = "gemini-3.1-flash-image";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent`;
const GEMINI_PLACEHOLDER_KEY = "PASTE_GEMINI_API_KEY_HERE";
const DEMO_MODE_DELAY = 2000;

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
const downloadButton = document.getElementById("downloadButton");
const generateAgainButton = document.getElementById("generateAgainButton");

let selectedImageFile = null;
let previewObjectUrl = "";
let currentMoodboardUrl = "";
let isGenerating = false;

dropZone.addEventListener("click", (event) => {
  if (event.target.closest("button")) {
    return;
  }

  imageInput.click();
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
    console.error(error);
    showError(getReadableApiError(error));
  } finally {
    setGeneratingState(false);
  }
});

downloadButton.addEventListener("click", () => {
  downloadGeneratedImage();
});

generateAgainButton.addEventListener("click", () => {
  hideResult();
  clearError();
  document.getElementById("generator").scrollIntoView({ behavior: "smooth", block: "center" });
  promptInput.focus();
});

function handleImageFile(file) {
  if (isGenerating) {
    return;
  }

  if (!file) {
    return;
  }

  if (!file.type.startsWith("image/")) {
    clearSelectedImage();
    showError("Можно загрузить только файл изображения.");
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
  fileName.textContent = "Референс выбран";
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
    return "Опишите настроение мудборда.";
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
  generateButtonText.textContent = isLoading ? "Создаём..." : "Создать мудборд";
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
  if (!hasGeminiApiKey()) {
    await wait(DEMO_MODE_DELAY);
    return createDemoMoodboard(promptText);
  }

  const base64Image = await fileToBase64(imageFile);
  const response = await fetch(GEMINI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": GEMINI_API_KEY.trim(),
    },
    body: JSON.stringify({
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
      generationConfig: {
        responseModalities: ["Image"],
        responseFormat: {
          image: {
            aspectRatio: "1:1",
          },
        },
      },
    }),
  });

  const data = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(getGeminiErrorMessage(data, response.status));
  }

  const imageUrl = extractImageFromGeminiResponse(data);

  if (!imageUrl) {
    throw new Error(
      "Gemini не вернул изображение. Попробуйте изменить описание или проверьте настройки модели."
    );
  }

  return imageUrl;
}

function renderResult(imageUrl) {
  currentMoodboardUrl = imageUrl;
  resultImage.src = imageUrl;
  resultSection.hidden = false;
  resultSection.classList.remove("is-visible");
  void resultSection.offsetWidth;
  resultSection.classList.add("is-visible");
  resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

function hideResult() {
  currentMoodboardUrl = "";
  resultImage.removeAttribute("src");
  resultSection.hidden = true;
  resultSection.classList.remove("is-visible");
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
    console.warn(error);
    const link = window.open(currentMoodboardUrl, "_blank", "noopener,noreferrer");

    if (!link) {
      showError("Браузер заблокировал скачивание. Откройте результат в новой вкладке.");
    }
  }
}

function triggerDownload(url, fileName) {
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function hasGeminiApiKey() {
  const key = GEMINI_API_KEY.trim();
  return Boolean(key) && key !== GEMINI_PLACEHOLDER_KEY;
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

    if (part.fileData?.fileUri || part.file_data?.file_uri) {
      return part.fileData?.fileUri || part.file_data?.file_uri;
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

function getGeminiErrorMessage(data, status) {
  const apiMessage = data?.error?.message || data?.message;

  if (status === 400) {
    return apiMessage || "Gemini отклонил запрос. Проверьте формат изображения и описание.";
  }

  if (status === 401 || status === 403) {
    return apiMessage || "Gemini не принял API-ключ. Проверьте значение GEMINI_API_KEY.";
  }

  if (status === 429) {
    return apiMessage || "Слишком много запросов к Gemini. Подождите немного и попробуйте снова.";
  }

  return apiMessage || `Gemini вернул ошибку ${status}. Попробуйте ещё раз.`;
}

function getReadableApiError(error) {
  return error?.message || "Не удалось создать мудборд. Попробуйте ещё раз.";
}

function wait(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function createDemoMoodboard(promptText) {
  const canvas = document.createElement("canvas");
  const size = 1400;
  const ctx = canvas.getContext("2d");
  const palette = getPalette(promptText);

  canvas.width = size;
  canvas.height = size;

  drawDemoBackground(ctx, size, palette);
  drawDemoSections(ctx, palette);
  drawDemoTextures(ctx, palette);
  drawDemoPalette(ctx, palette);

  return canvas.toDataURL("image/png");
}

function getPalette(promptText) {
  const palettes = [
    ["#6a724c", "#dfc8a5", "#b06a48", "#f6ead8", "#8b765c"],
    ["#3a2d22", "#e4d3bb", "#c08a5a", "#fbf1e3", "#77815e"],
    ["#534331", "#b96f4e", "#d1aa66", "#f1e3cd", "#7f825f"],
    ["#596344", "#aeb28a", "#bd7753", "#f7ead7", "#7c6048"],
  ];

  let hash = 0;
  for (let index = 0; index < promptText.length; index += 1) {
    hash = (hash + promptText.charCodeAt(index) * (index + 1)) % palettes.length;
  }

  return palettes[hash];
}

function drawDemoBackground(ctx, size, palette) {
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, "#fbf1e3");
  gradient.addColorStop(0.48, palette[3]);
  gradient.addColorStop(1, "#e5d2b8");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = "rgba(255, 248, 236, 0.62)";
  roundedRect(ctx, 70, 70, size - 140, size - 140, 44);
  ctx.fill();
}

function drawDemoSections(ctx, palette) {
  const sections = [
    [120, 132, 520, 530, palette[1]],
    [688, 132, 592, 280, palette[4]],
    [688, 452, 250, 402, palette[2]],
    [978, 452, 302, 402, palette[0]],
    [120, 710, 520, 450, "#f8ead6"],
    [688, 900, 592, 260, "#d7bf94"],
  ];

  sections.forEach(([x, y, width, height, color], index) => {
    ctx.save();
    ctx.shadowColor = "rgba(72, 50, 32, 0.14)";
    ctx.shadowBlur = 28;
    ctx.shadowOffsetY = 16;
    ctx.fillStyle = color;
    roundedRect(ctx, x, y, width, height, 34);
    ctx.fill();
    ctx.restore();

    if (index % 2 === 0) {
      addSoftOverlay(ctx, x, y, width, height);
    }
  });
}

function drawDemoTextures(ctx, palette) {
  ctx.strokeStyle = "rgba(89, 62, 42, 0.14)";
  ctx.lineWidth = 3;

  for (let x = 150; x < 620; x += 28) {
    ctx.beginPath();
    ctx.moveTo(x, 730);
    ctx.lineTo(x + 42, 1140);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(255, 248, 236, 0.38)";
  ctx.lineWidth = 8;

  for (let y = 180; y < 392; y += 46) {
    ctx.beginPath();
    ctx.moveTo(724, y);
    ctx.bezierCurveTo(832, y - 30, 948, y + 24, 1070, y - 14);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(255, 248, 236, 0.58)";
  ctx.beginPath();
  ctx.arc(830, 652, 92, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = palette[3];
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.moveTo(1010, 648);
  ctx.bezierCurveTo(1110, 546, 1238, 626, 1240, 760);
  ctx.stroke();
}

function drawDemoPalette(ctx, palette) {
  palette.forEach((color, index) => {
    const x = 720 + index * 104;
    ctx.fillStyle = color;
    roundedRect(ctx, x, 950, 78, 150, 28);
    ctx.fill();
  });
}

function addSoftOverlay(ctx, x, y, width, height) {
  const gradient = ctx.createLinearGradient(x, y, x + width, y + height);
  gradient.addColorStop(0, "rgba(255, 255, 255, 0.22)");
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = gradient;
  roundedRect(ctx, x, y, width, height, 34);
  ctx.fill();
}

function roundedRect(ctx, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.lineTo(x + width - safeRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  ctx.lineTo(x + width, y + height - safeRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  ctx.lineTo(x + safeRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  ctx.lineTo(x, y + safeRadius);
  ctx.quadraticCurveTo(x, y, x + safeRadius, y);
  ctx.closePath();
}
