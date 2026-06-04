const API_KEY = "PASTE_YOUR_API_KEY_HERE";
const API_URL = "PASTE_IMAGE_GENERATION_API_URL_HERE";

// Diploma/demo note: keeping an API key in frontend JavaScript is insecure.
// For production, move API calls to a backend or serverless proxy and keep keys private.

const PLACEHOLDER_API_KEY = "PASTE_YOUR_API_KEY_HERE";
const PLACEHOLDER_API_URL = "PASTE_IMAGE_GENERATION_API_URL_HERE";

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
  const file = event.dataTransfer.files[0];
  handleImageFile(file);
});

imageInput.addEventListener("change", () => {
  const file = imageInput.files[0];
  handleImageFile(file);
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
    const imageUrl = await generateMoodboard(selectedImageFile, promptText);
    showResult(imageUrl);
  } catch (error) {
    console.error(error);
    showError(
      "Generation failed. Check your API key, API URL, and response format, then try again."
    );
  } finally {
    setGeneratingState(false);
  }
});

downloadButton.addEventListener("click", () => {
  downloadMoodboard();
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
    showError("Please upload an image file only.");
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
  fileName.textContent = "Selected image";
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
    return "Please upload a reference photo before generating.";
  }

  if (!promptText) {
    return "Please describe the moodboard before generating.";
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
  generateButtonText.textContent = isLoading ? "Generating..." : "Generate Moodboard";
}

function showResult(imageUrl) {
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

async function downloadMoodboard() {
  if (!currentMoodboardUrl) {
    return;
  }

  const fileName = `moodboard-${new Date().toISOString().slice(0, 10)}.png`;

  if (currentMoodboardUrl.startsWith("data:")) {
    triggerDownload(currentMoodboardUrl, fileName);
    return;
  }

  try {
    const response = await fetch(currentMoodboardUrl, { mode: "cors" });

    if (!response.ok) {
      throw new Error("Could not fetch generated image for download.");
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    triggerDownload(objectUrl, fileName);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  } catch (error) {
    console.warn(error);
    triggerDownload(currentMoodboardUrl, fileName);
  }
}

function triggerDownload(url, fileName) {
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";

  if (!url.startsWith("data:") && !url.startsWith("blob:")) {
    link.target = "_blank";
  }

  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function generateMoodboard(imageFile, promptText) {
  if (API_KEY === PLACEHOLDER_API_KEY) {
    await wait(2000);
    return createDemoMoodboard(imageFile, promptText);
  }

  if (!API_URL || API_URL === PLACEHOLDER_API_URL) {
    throw new Error("Set API_URL before calling a real image generation API.");
  }

  const formData = new FormData();
  formData.append("image", imageFile, imageFile.name);
  formData.append("prompt", promptText);
  formData.append("style", "moodboard");
  formData.append("aspect_ratio", "1:1");

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}.`);
  }

  const data = await response.json();

  if (!data.image_url) {
    throw new Error("API response must include an image_url field.");
  }

  return data.image_url;
}

function wait(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function createDemoMoodboard(imageFile, promptText) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const image = new Image();

      image.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          const size = 1400;
          const ctx = canvas.getContext("2d");
          const palette = getPalette(promptText);

          canvas.width = size;
          canvas.height = size;

          drawDemoBackground(ctx, size, palette);
          drawImagePanel(ctx, image, palette);
          drawColorStory(ctx, palette);
          drawPromptPanel(ctx, promptText, palette);
          drawAccentShapes(ctx, palette);

          resolve(canvas.toDataURL("image/png"));
        } catch (error) {
          reject(error);
        }
      };

      image.onerror = () => reject(new Error("Could not load uploaded image."));
      image.src = reader.result;
    };

    reader.onerror = () => reject(new Error("Could not read uploaded image."));
    reader.readAsDataURL(imageFile);
  });
}

function getPalette(promptText) {
  const palettes = [
    {
      name: "Soft Focus",
      colors: ["#2f5d58", "#d9c8ae", "#b86c4e", "#f7f4ed", "#6f8f86"],
    },
    {
      name: "Gallery Calm",
      colors: ["#26313a", "#dbe2db", "#c39b6b", "#f8f7f2", "#607d96"],
    },
    {
      name: "Urban Warmth",
      colors: ["#33424a", "#b85f49", "#d6b64f", "#eef2ea", "#788b7d"],
    },
    {
      name: "Natural Edit",
      colors: ["#28453f", "#9fb2a0", "#bf7658", "#f4f1e8", "#4d6d82"],
    },
  ];

  let hash = 0;
  for (let index = 0; index < promptText.length; index += 1) {
    hash = (hash + promptText.charCodeAt(index) * (index + 1)) % palettes.length;
  }

  return palettes[hash];
}

function drawDemoBackground(ctx, size, palette) {
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, "#fbfaf7");
  gradient.addColorStop(0.52, palette.colors[3]);
  gradient.addColorStop(1, "#e8efea");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = "rgba(255, 255, 255, 0.52)";
  roundedRect(ctx, 54, 54, size - 108, size - 108, 46);
  ctx.fill();
}

function drawImagePanel(ctx, image, palette) {
  drawShadow(ctx, 86, 118, 720, 770, 44);
  roundedRect(ctx, 86, 118, 720, 770, 44);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  drawCoverImage(ctx, image, 112, 144, 668, 718, 34);

  ctx.fillStyle = palette.colors[0];
  roundedRect(ctx, 132, 786, 208, 52, 26);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.font = "700 24px Inter, Arial, sans-serif";
  ctx.fillText("REFERENCE", 164, 821);
}

function drawColorStory(ctx, palette) {
  ctx.save();
  ctx.translate(846, 122);

  ctx.fillStyle = "#ffffff";
  drawShadow(ctx, 0, 0, 430, 338, 34);
  roundedRect(ctx, 0, 0, 430, 338, 34);
  ctx.fill();

  ctx.fillStyle = "#232a30";
  ctx.font = "800 44px Inter, Arial, sans-serif";
  ctx.fillText("Color story", 34, 70);

  palette.colors.forEach((color, index) => {
    const x = 36 + index * 76;
    ctx.fillStyle = color;
    roundedRect(ctx, x, 112, 58, 150, 28);
    ctx.fill();
  });

  ctx.fillStyle = "#6f7880";
  ctx.font = "500 22px Inter, Arial, sans-serif";
  ctx.fillText(palette.name, 34, 300);
  ctx.restore();
}

function drawPromptPanel(ctx, promptText, palette) {
  drawShadow(ctx, 846, 508, 430, 338, 34);
  roundedRect(ctx, 846, 508, 430, 338, 34);
  ctx.fillStyle = "#ffffff";
  ctx.fill();

  ctx.fillStyle = palette.colors[2];
  ctx.font = "800 28px Inter, Arial, sans-serif";
  ctx.fillText("MOOD DIRECTION", 888, 574);

  ctx.fillStyle = "#242c31";
  ctx.font = "700 36px Inter, Arial, sans-serif";
  wrapText(ctx, promptText, 888, 640, 336, 48, 4);

  ctx.fillStyle = "#6f7880";
  ctx.font = "500 22px Inter, Arial, sans-serif";
  ctx.fillText("Generated demo moodboard", 888, 790);
}

function drawAccentShapes(ctx, palette) {
  drawShadow(ctx, 118, 942, 480, 272, 36);
  roundedRect(ctx, 118, 942, 480, 272, 36);
  ctx.fillStyle = palette.colors[1];
  ctx.fill();

  ctx.fillStyle = "rgba(255, 255, 255, 0.72)";
  roundedRect(ctx, 154, 980, 190, 196, 28);
  ctx.fill();

  ctx.fillStyle = palette.colors[0];
  ctx.beginPath();
  ctx.arc(448, 1074, 82, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = palette.colors[2];
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(700, 1000);
  ctx.bezierCurveTo(842, 908, 986, 1036, 1126, 938);
  ctx.stroke();

  ctx.fillStyle = palette.colors[4];
  roundedRect(ctx, 762, 1046, 432, 170, 32);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.font = "800 48px Inter, Arial, sans-serif";
  ctx.fillText("AI MOODBOARD", 810, 1134);
}

function drawCoverImage(ctx, image, x, y, width, height, radius) {
  const scale = Math.max(width / image.width, height / image.height);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (image.width - sourceWidth) / 2;
  const sourceY = (image.height - sourceHeight) / 2;

  ctx.save();
  roundedRect(ctx, x, y, width, height, radius);
  ctx.clip();
  ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
  ctx.restore();
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const words = text.split(/\s+/);
  let line = "";
  let linesDrawn = 0;

  for (let index = 0; index < words.length; index += 1) {
    const testLine = line ? `${line} ${words[index]}` : words[index];
    const metrics = ctx.measureText(testLine);

    if (metrics.width > maxWidth && line) {
      linesDrawn += 1;

      if (linesDrawn === maxLines) {
        ctx.fillText(`${line.replace(/[.,;:]$/, "")}...`, x, y);
        return;
      }

      ctx.fillText(line, x, y);
      line = words[index];
      y += lineHeight;
    } else {
      line = testLine;
    }
  }

  if (line && linesDrawn < maxLines) {
    ctx.fillText(line, x, y);
  }
}

function drawShadow(ctx, x, y, width, height, radius) {
  ctx.save();
  ctx.shadowColor = "rgba(31, 41, 47, 0.18)";
  ctx.shadowBlur = 34;
  ctx.shadowOffsetY = 18;
  ctx.fillStyle = "#ffffff";
  roundedRect(ctx, x, y, width, height, radius);
  ctx.fill();
  ctx.restore();
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
