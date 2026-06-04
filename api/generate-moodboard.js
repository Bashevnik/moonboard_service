const GEMINI_MODEL = "gemini-2.5-flash-image";
const GEMINI_FALLBACK_MODEL = "gemini-2.5-flash-image-preview";
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
      console.error("[Moodboard API] raw Gemini error response", {
        model,
        status: geminiResponse.status,
        statusText: geminiResponse.statusText,
        rawResponse: geminiResult.rawText,
        parsedResponse: geminiData,
      });

      sendJson(response, geminiResponse.status, {
        error: getReadableGeminiError(geminiData, geminiResponse.status),
      });
      return;
    }

    const imageUrl = extractImageFromGeminiResponse(geminiData);

    if (!imageUrl) {
      const textResponse = extractTextFromGeminiResponse(geminiData);
      sendJson(response, 502, {
        error: textResponse
          ? `Gemini ответил без изображения: ${textResponse}`
          : "Gemini ответил без изображения. Проверьте доступ к image generation для этого ключа.",
      });
      return;
    }

    sendJson(response, 200, {
      imageUrl,
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

  console.error("[Moodboard API] Gemini model not found, trying fallback", {
    model: GEMINI_MODEL,
    fallbackModel: GEMINI_FALLBACK_MODEL,
    status: primaryResult.geminiResponse.status,
    rawResponse: primaryResult.rawText,
    parsedResponse: primaryResult.geminiData,
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

  console.info("[Moodboard API] start Gemini request", {
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

  console.info("[Moodboard API] Gemini response", {
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
  return `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent`;
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
  if (!origin) {
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
  };
}

function buildGeminiPrompt(prompt) {
  return `Create a beautiful visual moodboard based on the uploaded reference image and this description: ${prompt}.
Use the reference image only as inspiration for colors, textures, mood, lighting and visual direction.
Generate one square 1:1 creative direction moodboard image.
The result should look like a polished Behance moodboard, Pinterest editorial board, fashion campaign board, or premium creative direction board.
Include a strong main visual, supporting reference panels, color palette, material textures, lighting references, typography mood samples as abstract shapes only, and a cohesive editorial composition.
No readable text, no watermark, no logos.`;
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

function extractTextFromGeminiResponse(data) {
  const parts = data?.candidates?.flatMap((candidate) => candidate?.content?.parts || []) || [];
  return parts
    .map((part) => part.text)
    .filter(Boolean)
    .join(" ")
    .slice(0, 280);
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
    return "Модель Gemini image generation недоступна для этого ключа или региона.";
  }

  if (status === 400) {
    return "Gemini отклонил запрос. Проверьте формат изображения и описание мудборда.";
  }

  if (status === 401 || status === 403) {
    return "Gemini не принял API-ключ. Проверьте переменную GEMINI_API_KEY и доступ к image generation.";
  }

  if (status === 429) {
    return "Слишком много запросов к Gemini. Подождите немного и попробуйте снова.";
  }

  return `Gemini вернул ошибку ${status}. Попробуйте ещё раз.`;
}

function sendJson(response, status, payload) {
  response.status(status).json(payload);
}
