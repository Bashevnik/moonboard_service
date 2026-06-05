const MOODBOARD_API_URL = "https://moonboard-service-vercel.vercel.app/api/generate-moodboard";

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

const DEFAULT_MOODBOARD = {
  title: "Визуальное направление",
  mood: "Спокойная, цельная и выразительная визуальная история.",
  colorPalette: ["#1E1E1E", "#A46C44", "#C9B79E", "#E8E4DC", "#F8F7F4"],
  materials: ["натуральная фактура", "матовая поверхность", "мягкая ткань"],
  keywords: ["спокойно", "цельно", "редакционно", "тепло"],
  composition: "Крупный референс, палитра, фактуры и детали собраны в editorial-сетку.",
  typographyMood: "Сдержанная современная типографика с аккуратным ритмом.",
  lighting: "Мягкий естественный свет без резких контрастов.",
};

let selectedImageFile = null;
let previewObjectUrl = "";
let currentMoodboard = null;
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
    console.info("[Moodboard] generation start", {
      fileName: selectedImageFile.name,
      fileType: selectedImageFile.type,
      promptLength: promptText.length,
    });

    const moodboard = await generateMoodboardWithGemini(selectedImageFile, promptText);
    renderResult(moodboard);

    console.info("[Moodboard] generation success", {
      title: moodboard.title,
      colors: moodboard.colorPalette.length,
    });
  } catch (error) {
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

  if (!MOODBOARD_API_URL.trim()) {
    return "Не указан URL serverless proxy.";
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
  downloadButton.disabled = isLoading;
  generatorForm.setAttribute("aria-busy", String(isLoading));
  generateButtonText.textContent = isLoading ? "Создаём мудборд..." : "Создать мудборд";

  if (isLoading) {
    setResultStatus("Запрос к Gemini JSON", false);
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
  const requestStartedAt = performance.now();

  console.info("[Moodboard] sending JSON request", {
    endpoint: MOODBOARD_API_URL,
    method: "POST",
    fileName: imageFile.name,
    fileType: imageFile.type,
    promptLength: promptText.length,
    hasImage: Boolean(imageBase64),
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

function normalizeMoodboard(value) {
  const source = value && typeof value === "object" ? value : {};

  return {
    title: toText(source.title, DEFAULT_MOODBOARD.title),
    mood: toText(source.mood, DEFAULT_MOODBOARD.mood),
    colorPalette: normalizePalette(source.colorPalette),
    materials: normalizeList(source.materials, DEFAULT_MOODBOARD.materials),
    keywords: normalizeList(source.keywords, DEFAULT_MOODBOARD.keywords),
    composition: toText(source.composition, DEFAULT_MOODBOARD.composition),
    typographyMood: toText(source.typographyMood, DEFAULT_MOODBOARD.typographyMood),
    lighting: toText(source.lighting, DEFAULT_MOODBOARD.lighting),
  };
}

function normalizePalette(colors) {
  const values = Array.isArray(colors) ? colors : [];
  const normalized = values
    .map((color) => String(color || "").trim().toUpperCase())
    .filter((color) => /^#[0-9A-F]{6}$/.test(color));

  return mergeUnique(normalized, DEFAULT_MOODBOARD.colorPalette).slice(0, 5);
}

function normalizeList(values, fallback) {
  const list = Array.isArray(values) ? values : [];
  return mergeUnique(
    list
      .map((item) => String(item || "").trim())
      .filter(Boolean),
    fallback
  ).slice(0, 6);
}

function toText(value, fallback) {
  const text = String(value || "").trim();
  return text || fallback;
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
  resultMeta.textContent = `Сгенерировано ${new Date().toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
  setResultStatus("Готово", true);
  resultSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
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
  const primaryColor = palette[1] || "#A46C44";
  const softColor = palette[3] || "#E8E4DC";

  moodboardCanvas.style.setProperty("--board-accent", primaryColor);
  moodboardCanvas.style.setProperty("--board-soft", softColor);

  moodboardCanvas.innerHTML = `
    <article class="board-panel board-hero">
      <img src="${escapeAttribute(referenceImageSrc)}" alt="Референс мудборда" />
      <div class="board-hero-caption">
        <span>Референс</span>
        <strong>${escapeHtml(moodboard.title)}</strong>
      </div>
    </article>

    <article class="board-panel board-title">
      <span class="board-kicker">Mood</span>
      <h3>${escapeHtml(moodboard.title)}</h3>
      <p>${escapeHtml(moodboard.mood)}</p>
    </article>

    <article class="board-panel board-palette">
      <span class="board-kicker">Палитра</span>
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
    </article>

    <article class="board-panel board-materials">
      <span class="board-kicker">Материалы</span>
      <div class="board-tags">
        ${moodboard.materials.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
      </div>
    </article>

    <article class="board-panel board-keywords">
      <span class="board-kicker">Ключевые слова</span>
      <div class="board-tags">
        ${moodboard.keywords.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
      </div>
    </article>

    <article class="board-panel board-note">
      <span class="board-kicker">Композиция</span>
      <p>${escapeHtml(moodboard.composition)}</p>
    </article>

    <article class="board-panel board-note">
      <span class="board-kicker">Типографика</span>
      <p>${escapeHtml(moodboard.typographyMood)}</p>
    </article>

    <article class="board-panel board-note board-light">
      <span class="board-kicker">Свет</span>
      <p>${escapeHtml(moodboard.lighting)}</p>
    </article>
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

  try {
    await waitForImages(moodboardCanvas);

    const canvas = await window.html2canvas(moodboardCanvas, {
      backgroundColor: "#F8F7F4",
      scale: Math.min(window.devicePixelRatio || 1, 2),
      useCORS: true,
    });
    const pngDataUrl = canvas.toDataURL("image/png");
    triggerDownload(pngDataUrl, `moodboard-${new Date().toISOString().slice(0, 10)}.png`);
  } catch (error) {
    console.error("[Moodboard] download error", error);
    showError("Не удалось скачать мудборд. Попробуйте ещё раз.");
  } finally {
    downloadButton.disabled = false;
    downloadButton.textContent = "Скачать PNG";
  }
}

function waitForImages(container) {
  const images = Array.from(container.querySelectorAll("img"));

  return Promise.all(
    images.map((image) => {
      if (image.complete) {
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
