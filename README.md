# Генератор мудбордов

Одностраничный сайт на GitHub Pages + Vercel Serverless proxy.

Gemini получает изображение-референс и описание пользователя и возвращает одно профессиональное изображение мудборда. Загрузка и скачивание результата — напрямую, без внешних библиотек рендеринга.

```
GitHub Pages (frontend) → Vercel Function (proxy) → Gemini Image API → изображение PNG/JPEG
```

API-ключ и код доступа хранятся только в переменных окружения Vercel.

## Архитектура

- `index.html` — структура интерфейса
- `style.css` — визуальный стиль и мобильная адаптация
- `script.js` — загрузка, сжатие, запрос к proxy, отображение и скачивание результата
- `api/generate-moodboard.js` — Vercel Function: CORS, код доступа, запрос к Gemini
- `vercel.json` — настройки Function (maxDuration, memory)

## Локальный запуск frontend

```bash
python -m http.server 8000
```

Открыть: `http://localhost:8000`

Для работы с proxy локально добавьте `http://localhost:8000` в `ALLOWED_ORIGIN` в Vercel и перезапустите деплой.

## Переменные окружения Vercel

Все переменные задаются в `Project Settings → Environment Variables`.

| Переменная | Обязательная | Описание |
|---|---|---|
| `GEMINI_API_KEY` | Да | Ключ из Google AI Studio. Никогда не коммитить. |
| `GEMINI_IMAGE_MODEL` | Да | ID модели Gemini для генерации изображений. Рекомендовано: `gemini-2.5-flash-image` |
| `APP_ACCESS_CODE` | Да | Произвольный секретный код для защиты endpoint. Никогда не коммитить и не публиковать. |
| `ALLOWED_ORIGIN` | Нет | Разрешённые Origin через запятую. По умолчанию: `https://bashevnik.github.io` |

Без `APP_ACCESS_CODE` и `GEMINI_API_KEY` функция вернёт 500 и не запустит генерацию.

## Формат запроса frontend → proxy

```json
{
  "imageBase64": "...",
  "mimeType": "image/jpeg",
  "prompt": "описание мудборда",
  "aspectRatio": "16:9",
  "accessCode": "..."
}
```

Поддерживаемые MIME-типы: `image/jpeg`, `image/png`, `image/webp`.

## Формат ответа proxy → frontend

```json
{
  "imageBase64": "...",
  "mimeType": "image/png",
  "model": "gemini-2.5-flash-image",
  "generatedAt": "2026-06-18T14:00:00.000Z"
}
```

## URL

- Frontend: `https://bashevnik.github.io/moonboard_service/`
- API: `https://moonboard-service-vercel.vercel.app/api/generate-moodboard`

## Безопасность

- `GEMINI_API_KEY`, `APP_ACCESS_CODE` — только в Vercel Environment Variables, никогда в git.
- CORS ограничен: разрешён только `ALLOWED_ORIGIN`, пустой Origin и `*.vercel.app` заблокированы.
- Код доступа проверяется на backend; frontend хранит его только в `sessionStorage`.
- При неверном коде доступа — 401, `sessionStorage` очищается.
- `.env`, `.env.*`, `.vercel`, `node_modules` добавлены в `.gitignore`.

## Известные ограничения

- Запрос к Vercel Function ограничен 4.5 MB. Сжатие до 1024px JPEG 0.82 позволяет держать входной base64 в пределах ~1 MB.
- Сгенерированное изображение из Gemini возвращается через JSON-ответ (base64). Очень крупные изображения могут упереться в лимит ответа Vercel (~5 MB).
- Retry — только один раз и только при 503. При 429 нужно подождать и попробовать вручную.
- Aspect ratio передаётся в текстовом промпте; отдельного API-параметра для этой модели нет.
