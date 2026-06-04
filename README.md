# Генератор мудбордов

Статический frontend для GitHub Pages + безопасный serverless proxy для Gemini API.

Схема работы:

```text
GitHub Pages frontend -> Vercel Function -> Gemini API
```

API-ключ не хранится в репозитории и не попадает во frontend-код.

## Файлы

- `index.html` - структура интерфейса
- `style.css` - визуальный стиль и адаптив
- `script.js` - загрузка изображения, валидация, запрос к proxy, результат и скачивание
- `api/generate-moodboard.js` - Vercel Function, которая вызывает Gemini API
- `vercel.json` - настройки Vercel Function
- `README.md` - инструкция по запуску и деплою

## Локальный запуск frontend

Можно открыть файл напрямую:

```powershell
Start-Process .\index.html
```

Или запустить простой статический сервер:

```bash
python -m http.server 8000
```

Затем открыть:

```text
http://localhost:8000/
```

## Настройка serverless proxy на Vercel

1. Создайте проект на Vercel из этого GitHub-репозитория.
2. Откройте Vercel -> Project Settings -> Environment Variables.
3. Добавьте переменную:

```text
GEMINI_API_KEY=ваш_ключ_из_Google_AI_Studio
```

4. Опционально добавьте origin для CORS:

```text
ALLOWED_ORIGIN=https://bashevnik.github.io
```

5. Сделайте redeploy проекта на Vercel.
6. Скопируйте URL функции:

```text
https://YOUR_VERCEL_PROJECT.vercel.app/api/generate-moodboard
```

7. В `script.js` замените значение `MOODBOARD_API_URL` на этот URL:

```js
const MOODBOARD_API_URL = "https://YOUR_VERCEL_PROJECT.vercel.app/api/generate-moodboard";
```

Для локальной проверки через Vercel можно использовать:

```bash
npx vercel dev
```

И локальный endpoint:

```text
http://localhost:3000/api/generate-moodboard
```

## Что принимает proxy

Frontend отправляет `POST` на `MOODBOARD_API_URL`:

```json
{
  "imageBase64": "...",
  "mimeType": "image/png",
  "prompt": "описание мудборда",
  "fileName": "reference.png"
}
```

Proxy на сервере добавляет `GEMINI_API_KEY`, отправляет запрос в Gemini и возвращает:

```json
{
  "imageUrl": "data:image/png;base64,...",
  "model": "gemini-3.1-flash-image",
  "generatedAt": "2026-06-05T00:00:00.000Z"
}
```

Если Gemini отвечает ошибкой квоты, биллинга или доступа к модели, пользователь видит понятное сообщение на русском.

## Проверка Network

Откройте DevTools -> Network -> Fetch/XHR, загрузите изображение, заполните описание и нажмите `Создать мудборд`.

Должен появиться запрос к proxy endpoint:

```text
/api/generate-moodboard
```

или к вашему Vercel URL:

```text
https://YOUR_VERCEL_PROJECT.vercel.app/api/generate-moodboard
```

Запроса из браузера напрямую к `generativelanguage.googleapis.com` быть не должно.

## Безопасность

- Не коммитьте реальный `GEMINI_API_KEY`.
- Храните ключ только в Vercel Environment Variables.
- Если ключ случайно попал в git, удалите его из истории и перевыпустите ключ в Google AI Studio.
- Для публичного GitHub Pages frontend используйте полный Vercel endpoint в `MOODBOARD_API_URL`.

## GitHub Pages

Для этого репозитория ссылка GitHub Pages:

```text
https://bashevnik.github.io/moonboard_service/
```
