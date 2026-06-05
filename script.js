const MOODBOARD_API_URL = "https://moonboard-service-vercel.vercel.app/api/generate-moodboard";
const EXPORT_WIDTH = 1920;
const EXPORT_HEIGHT = 1080;

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
