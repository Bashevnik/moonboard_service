const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_FALLBACK_MODEL = "gemini-1.5-flash";
const MAX_IMAGE_BASE64_LENGTH = 8 * 1024 * 1024;

module.exports = async function handler(request, response) {
  setCorsHeaders(request, response);

  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }

  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Метод не поддерживается. Используйте POST." });
    return;
  }

  if (!isOriginAllowed(request.headers.origin)) {
    sendJson(response, 403, { error: "Этот origin не разрешён для proxy endpoint." });
    return;
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      sendJson(response, 500, {
        error: "На serverless proxy не задан GEMINI_API_KEY. Добавьте переменную окружения в Vercel.",
      });
      return;
    }

    const body = await readJsonBody(request);
    const prompt = String(body.prompt || "").trim();
    const mimeType = String(body.mimeType || "image/png").trim();
    const imageBase64 = normalizeBase64(body.imageBase64 || body.image || "");
    const validationError = getValidationError({ imageBase64, mimeType, prompt });

    if (validationError) {
      sendJson(response, 400, { error: validationError });
      return;
    }

    const geminiResult = await requestGeminiWithFallback({
      apiKey,
      imageBase64,
      mimeType,
      prompt,
      fileName: body.fileName || "uploaded-image",
    });
    const { geminiResponse, geminiData, model } = geminiResult;

    if (!geminiResponse.ok) {
      logRawGeminiError({
        label: "raw Gemini text-model error response",
        model,
        geminiResponse,
        rawText: geminiResult.rawText,
        parsedResponse: geminiData,
      });

      sendJson(response, geminiResponse.status, {
        error: getReadableGeminiError(geminiData, geminiResponse.status),
      });
      return;
    }

    const moodboard = normalizeMoodboard(extractMoodboardFromGeminiResponse(geminiData));

    sendJson(response, 200, {
      moodboard,
      model,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Moodboard API] error", error);
    sendJson(response, 500, {
      error: "Serverless proxy не смог обработать запрос. Проверьте Vercel Function logs.",
    });
  }
};

async function requestGeminiWithFallback({ apiKey, imageBase64, mimeType, prompt, fileName }) {
  const primaryResult = await requestGeminiModel({
    apiKey,
    imageBase64,
    mimeType,
    prompt,
    fileName,
    model: GEMINI_MODEL,
  });

  if (primaryResult.geminiResponse.ok || !isModelNotFoundError(primaryResult.geminiData)) {
    return primaryResult;
  }

  logRawGeminiError({
    label: "Gemini text model not found, trying fallback",
    model: GEMINI_MODEL,
    geminiResponse: primaryResult.geminiResponse,
    rawText: primaryResult.rawText,
    parsedResponse: primaryResult.geminiData,
    extra: { fallbackModel: GEMINI_FALLBACK_MODEL },
  });

  return requestGeminiModel({
    apiKey,
    imageBase64,
    mimeType,
    prompt,
    fileName,
    model: GEMINI_FALLBACK_MODEL,
  });
}

async function requestGeminiModel({ apiKey, imageBase64, mimeType, prompt, fileName, model }) {
  const geminiApiUrl = getGeminiApiUrl(model);

  console.info("[Moodboard API] start Gemini JSON request", {
    model,
    fileName,
    mimeType,
    promptLength: prompt.length,
    imageBytesApprox: Math.round((imageBase64.length * 3) / 4),
  });

  const geminiResponse = await fetch(geminiApiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(buildGeminiRequestBody({ imageBase64, mimeType, prompt })),
  });

  const { data: geminiData, rawText } = await parseJsonResponse(geminiResponse);

  console.info("[Moodboard API] Gemini JSON response", {
    model,
    ok: geminiResponse.ok,
    status: geminiResponse.status,
  });

  return {
    geminiResponse,
    geminiData,
    rawText,
    model,
  };
}

function getGeminiApiUrl(model) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

function buildGeminiRequestBody({ imageBase64, mimeType, prompt }) {
  return {
    contents: [
      {
        role: "user",
        parts: [
          { text: buildGeminiPrompt(prompt) },
          {
            inlineData: {
              mimeType,
              data: imageBase64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.85,
      responseMimeType: "application/json",
    },
  };
}

function buildGeminiPrompt(prompt) {
  return `You are a senior creative director.

Analyze the uploaded reference image and the user's description.
Return only valid JSON. No markdown, no comments, no extra text.

User description:
${prompt}

Create a moodboard concept in Russian. Use the image as inspiration for color, materials, lighting and atmosphere.

JSON shape:
{
  "moodboard": {
    "title": "short Russian title",
    "mood": "one concise Russian sentence",
    "colorPalette": ["#HEX", "#HEX", "#HEX", "#HEX", "#HEX"],
    "materials": ["material 1", "material 2", "material 3", "material 4"],
    "keywords": ["keyword 1", "keyword 2", "keyword 3", "keyword 4", "keyword 5"],
    "composition": "Russian composition direction",
    "typographyMood": "Russian typography direction",
    "lighting": "Russian lighting direction"
  }
}`;
}

async function parseJsonResponse(response) {
  const text = await response.text();

  if (!text) {
    return { data: {}, rawText: "" };
  }

  try {
    return { data: JSON.parse(text), rawText: text };
  } catch (error) {
    return { data: { error: { message: text } }, rawText: text };
  }
}

function extractMoodboardFromGeminiResponse(data) {
  if (data?.moodboard) {
    return data.moodboard;
  }

  const text = extractTextFromGeminiResponse(data);

  if (!text) {
    throw new Error("Gemini вернул ответ без JSON-структуры moodboard.");
  }

  try {
    const parsed = JSON.parse(stripJsonFences(text));
    return parsed.moodboard || parsed;
  } catch (error) {
    console.error("[Moodboard API] cannot parse Gemini moodboard JSON", { text });
    throw new Error("Gemini вернул JSON в неожиданном формате.");
  }
}

function extractTextFromGeminiResponse(data) {
  const parts = data?.candidates?.flatMap((candidate) => candidate?.content?.parts || []) || [];
  return parts
    .map((part) => part.text)
    .filter(Boolean)
    .join("\n")
    .trim();
}

function stripJsonFences(text) {
  return String(text)
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");
}

function normalizeMoodboard(value) {
  const source = value && typeof value === "object" ? value : {};

  return {
    title: toText(source.title, "Визуальное направление"),
    mood: toText(source.mood, "Спокойная, цельная и выразительная визуальная история."),
    colorPalette: normalizePalette(source.colorPalette),
    materials: normalizeList(source.materials, ["натуральная фактура", "матовая поверхность", "мягкая ткань"]),
    keywords: normalizeList(source.keywords, ["спокойно", "цельно", "редакционно", "тепло"]),
    composition: toText(source.composition, "Крупный референс, палитра, фактуры и детали собраны в editorial-сетку."),
    typographyMood: toText(source.typographyMood, "Сдержанная современная типографика с аккуратным ритмом."),
    lighting: toText(source.lighting, "Мягкий естественный свет без резких контрастов."),
  };
}

function normalizePalette(colors) {
  const values = Array.isArray(colors) ? colors : [];
  const normalized = values
    .map((color) => String(color || "").trim().toUpperCase())
    .filter((color) => /^#[0-9A-F]{6}$/.test(color));

  return mergeUnique(normalized, ["#1E1E1E", "#A46C44", "#C9B79E", "#E8E4DC", "#F8F7F4"]).slice(0, 5);
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

function setCorsHeaders(request, response) {
  const origin = request.headers.origin;
  const allowedOrigin = isOriginAllowed(origin) ? origin : getDefaultAllowedOrigin();

  response.setHeader("Access-Control-Allow-Origin", allowedOrigin || "*");
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Access-Control-Max-Age", "86400");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Vary", "Origin");
}

function isOriginAllowed(origin = "") {
  if (!origin || origin === "null") {
    return true;
  }

  const configuredOrigins = getConfiguredOrigins();

  if (configuredOrigins.includes(origin)) {
    return true;
  }

  try {
    const { hostname } = new URL(origin);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".vercel.app");
  } catch (error) {
    return false;
  }
}

function getConfiguredOrigins() {
  return String(process.env.ALLOWED_ORIGIN || "https://bashevnik.github.io")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function getDefaultAllowedOrigin() {
  return getConfiguredOrigins()[0] || "";
}

async function readJsonBody(request) {
  if (request.body && typeof request.body === "object") {
    return request.body;
  }

  if (typeof request.body === "string") {
    return JSON.parse(request.body || "{}");
  }

  let rawBody = "";

  for await (const chunk of request) {
    rawBody += chunk;
  }

  return JSON.parse(rawBody || "{}");
}

function normalizeBase64(value) {
  const rawValue = String(value || "");
  return rawValue.includes(",") ? rawValue.split(",").pop() : rawValue;
}

function getValidationError({ imageBase64, mimeType, prompt }) {
  if (!imageBase64) {
    return "Изображение не передано в запросе.";
  }

  if (!mimeType.startsWith("image/")) {
    return "Можно загружать только image-файлы.";
  }

  if (!prompt) {
    return "Описание мудборда не передано в запросе.";
  }

  if (imageBase64.length > MAX_IMAGE_BASE64_LENGTH) {
    return "Изображение слишком большое. Уменьшите файл и попробуйте снова.";
  }

  return "";
}

function isModelNotFoundError(data) {
  const apiMessage = data?.error?.message || data?.message;
  const normalizedMessage = String(apiMessage || "").toLowerCase();

  return (
    normalizedMessage.includes("model") &&
    (normalizedMessage.includes("not found") ||
      normalizedMessage.includes("not_found") ||
      normalizedMessage.includes("not supported"))
  );
}

function getReadableGeminiError(data, status) {
  const apiMessage = data?.error?.message || data?.message;
  const normalizedMessage = String(apiMessage || "").toLowerCase();

  if (normalizedMessage.includes("api key not valid") || normalizedMessage.includes("api_key_invalid")) {
    return "API-ключ Gemini недействителен. Проверьте GEMINI_API_KEY в Vercel Environment Variables.";
  }

  if (normalizedMessage.includes("api key")) {
    return "Проблема с API-ключом Gemini. Проверьте GEMINI_API_KEY в Vercel.";
  }

  if (normalizedMessage.includes("billing") || normalizedMessage.includes("quota")) {
    return "Gemini не выполнил запрос из-за лимита, квоты или биллинга. Проверьте настройки проекта Google AI Studio.";
  }

  if (normalizedMessage.includes("not found") || normalizedMessage.includes("not supported")) {
    return "Текстовая модель Gemini недоступна для этого ключа или региона.";
  }

  if (status === 400) {
    return "Gemini отклонил запрос. Проверьте формат изображения и описание мудборда.";
  }

  if (status === 401 || status === 403) {
    return "Gemini не принял API-ключ. Проверьте переменную GEMINI_API_KEY.";
  }

  if (status === 429) {
    return "Слишком много запросов к Gemini. Подождите немного и попробуйте снова.";
  }

  return `Gemini вернул ошибку ${status}. Попробуйте ещё раз.`;
}

function logRawGeminiError({ label, model, geminiResponse, rawText, parsedResponse, extra = {} }) {
  console.error(
    `[Moodboard API] ${label}\n${JSON.stringify(
      {
        model,
        status: geminiResponse.status,
        statusText: geminiResponse.statusText,
        rawText,
        parsedResponse,
        ...extra,
      },
      null,
      2
    )}`
  );
}

function sendJson(response, status, payload) {
  response.status(status).json(payload);
}
