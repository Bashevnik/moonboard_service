const RETRY_DELAYS_MS = [5000];
const GEMINI_TIMEOUT_MS = 50000;
const MAX_IMAGE_BASE64_LENGTH = 3 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

module.exports = async function handler(request, response) {
  setCorsHeaders(request, response);

  if (!isOriginAllowed(request.headers.origin)) {
    sendJson(response, 403, { error: "Origin не разрешён." });
    return;
  }

  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }

  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Метод не поддерживается. Используйте POST." });
    return;
  }

  try {
    const body = await readJsonBody(request);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      sendJson(response, 500, { error: "GEMINI_API_KEY не задан в Vercel Environment Variables." });
      return;
    }

    const model = process.env.GEMINI_IMAGE_MODEL;
    if (!model) {
      sendJson(response, 500, { error: "GEMINI_IMAGE_MODEL не задан в Vercel Environment Variables." });
      return;
    }

    const imageBase64 = normalizeBase64(String(body.imageBase64 || ""));
    const mimeType = String(body.mimeType || "").trim().toLowerCase();
    const prompt = String(body.prompt || "").trim();
    const aspectRatio = String(body.aspectRatio || "16:9").trim();

    const validationError = getValidationError({ imageBase64, mimeType, prompt });
    if (validationError) {
      sendJson(response, 400, { error: validationError });
      return;
    }

    const result = await requestGeminiImageWithRetry({ apiKey, model, imageBase64, mimeType, prompt, aspectRatio });

    sendJson(response, 200, {
      imageBase64: result.imageBase64,
      mimeType: result.mimeType,
      model: result.model,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Moodboard API] error", { message: error.message });
    const status = error.httpStatus || 500;
    sendJson(response, status, { error: error.message || "Serverless proxy не смог обработать запрос." });
  }
};

async function requestGeminiImageWithRetry({ apiKey, model, imageBase64, mimeType, prompt, aspectRatio }) {
  const maxAttempts = RETRY_DELAYS_MS.length + 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.info("[Moodboard API] Gemini image request", { model, attempt, maxAttempts, mimeType });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

    let geminiResponse;
    let data;

    try {
      geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify(buildGeminiRequestBody({ imageBase64, mimeType, prompt, aspectRatio })),
          signal: controller.signal,
        }
      );
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === "AbortError") {
        const err = new Error("Gemini не ответил вовремя. Попробуйте ещё раз.");
        err.httpStatus = 504;
        throw err;
      }
      throw fetchError;
    }

    clearTimeout(timeoutId);
    data = await parseJsonResponse(geminiResponse);

    console.info("[Moodboard API] Gemini response", {
      model,
      attempt,
      ok: geminiResponse.ok,
      status: geminiResponse.status,
    });

    if (!geminiResponse.ok) {
      const shouldRetry = canRetry(geminiResponse.status, data) && attempt < maxAttempts;

      if (shouldRetry) {
        const delayMs = RETRY_DELAYS_MS[attempt - 1];
        console.warn("[Moodboard API] retrying", { model, attempt, status: geminiResponse.status, delayMs });
        await wait(delayMs);
        continue;
      }

      const err = new Error(getReadableGeminiError(data, geminiResponse.status));
      err.httpStatus = geminiResponse.status >= 500 ? 502 : geminiResponse.status;
      throw err;
    }

    const imageData = extractImageFromGeminiResponse(data);
    return { imageBase64: imageData.data, mimeType: imageData.mimeType, model };
  }
}

function buildGeminiRequestBody({ imageBase64, mimeType, prompt, aspectRatio }) {
  return {
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType,
              data: imageBase64,
            },
          },
          {
            text: buildGeminiPrompt(prompt, aspectRatio),
          },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ["IMAGE"],
    },
  };
}

function buildGeminiPrompt(prompt, aspectRatio) {
  return `Create a professional moodboard image in ${aspectRatio} format.

IMPORTANT: The uploaded reference photo must appear as a distinct visible panel inside the moodboard layout. Do not replace or stylize it — place it as-is as the central anchor of the composition.

Around the reference photo, build a cohesive editorial moodboard that includes:
- Color palette swatches extracted from the reference photo
- Texture and material close-ups that match the mood
- 2–3 atmospheric photography panels that complement the reference
- Minimal section labels only (e.g. COLOR, TEXTURE, MOOD) — no long text

Creative direction from the user: ${prompt}

Output format: ${aspectRatio}

Rules:
- The original reference photo must be clearly visible as one of the panels
- Unified editorial layout — not a random grid of unrelated images
- No website UI, no JSON, no code, no watermarks, no chat interface elements
- Do not return the reference photo alone without any moodboard elements around it
- Professional quality suitable for brand, interior, or fashion projects`;
}

function extractImageFromGeminiResponse(data) {
  const parts = (data?.candidates ?? []).flatMap((c) => c?.content?.parts ?? []);
  const imagePart = parts.find((p) => p?.inlineData?.mimeType?.startsWith("image/"));

  if (!imagePart) {
    const err = new Error(
      "Gemini не вернул изображение. Модель может быть недоступна для этого ключа. Проверьте GEMINI_IMAGE_MODEL в Vercel."
    );
    err.httpStatus = 502;
    throw err;
  }

  return {
    data: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType,
  };
}

function getValidationError({ imageBase64, mimeType, prompt }) {
  if (!imageBase64) {
    return "Изображение не передано в запросе.";
  }

  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return "Разрешены только JPEG, PNG и WebP.";
  }

  if (!prompt) {
    return "Описание мудборда не передано в запросе.";
  }

  if (imageBase64.length > MAX_IMAGE_BASE64_LENGTH) {
    return "Изображение слишком большое. Уменьшите файл и попробуйте снова.";
  }

  return "";
}

function canRetry(status, data) {
  if (status === 503) {
    const apiStatus = String(data?.error?.status ?? "").toUpperCase();
    return !apiStatus || apiStatus === "UNAVAILABLE";
  }
  return false;
}

function getReadableGeminiError(data, status) {
  const msg = String(data?.error?.message ?? data?.message ?? "").toLowerCase();

  if (msg.includes("api key not valid") || msg.includes("api_key_invalid")) {
    return "API-ключ Gemini недействителен. Проверьте GEMINI_API_KEY в Vercel.";
  }
  if (msg.includes("api key")) {
    return "Проблема с API-ключом Gemini. Проверьте GEMINI_API_KEY в Vercel.";
  }
  if (msg.includes("billing") || msg.includes("quota")) {
    return "Gemini: превышена квота или лимит биллинга. Проверьте настройки Google AI Studio.";
  }
  if (msg.includes("not found") || msg.includes("not supported") || msg.includes("model")) {
    return "Модель Gemini недоступна. Проверьте GEMINI_IMAGE_MODEL в Vercel.";
  }
  if (status === 400) {
    return "Gemini отклонил запрос. Проверьте формат изображения и описание.";
  }
  if (status === 401 || status === 403) {
    return "Gemini не принял API-ключ. Проверьте GEMINI_API_KEY в Vercel.";
  }
  if (status === 429) {
    return "Слишком много запросов к Gemini. Подождите и попробуйте снова.";
  }
  if (status === 503) {
    return "Gemini перегружен. Попробуйте ещё раз через минуту.";
  }
  return `Gemini вернул ошибку ${status}. Попробуйте ещё раз.`;
}

function setCorsHeaders(request, response) {
  const origin = request.headers.origin;
  const allowed = isOriginAllowed(origin);

  response.setHeader("Access-Control-Allow-Origin", allowed ? origin : "");
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Access-Control-Max-Age", "86400");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Vary", "Origin");
}

function isOriginAllowed(origin) {
  if (!origin || origin === "null") {
    return false;
  }

  return getAllowedOrigins().includes(origin);
}

function getAllowedOrigins() {
  return String(process.env.ALLOWED_ORIGIN || "https://bashevnik.github.io")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

async function readJsonBody(request) {
  if (request.body && typeof request.body === "object") {
    return request.body;
  }

  if (typeof request.body === "string") {
    return JSON.parse(request.body || "{}");
  }

  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
  }

  return JSON.parse(raw || "{}");
}

async function parseJsonResponse(response) {
  const text = await response.text();

  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { error: { message: text } };
  }
}

function normalizeBase64(value) {
  return value.includes(",") ? value.split(",").pop() : value;
}

function sendJson(response, status, payload) {
  response.status(status).json(payload);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
