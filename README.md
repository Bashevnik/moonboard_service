# Генератор мудбордов

Статический одностраничный сайт для GitHub Pages. Пользователь загружает
референс, описывает визуальное направление, сайт отправляет фото и текст в
Google Gemini API и показывает сгенерированный мудборд.

## Файлы

- `index.html` - структура приложения
- `style.css` - чистый product UI без декоративных заглушек
- `script.js` - загрузка файла, валидация, Gemini API, результат и скачивание
- `README.md` - описание проекта

## Локальный запуск

Можно открыть файл напрямую:

```powershell
Start-Process .\index.html
```

Или запустить статический сервер, если установлен Python:

```bash
python -m http.server 8000
```

Затем открыть:

```text
http://localhost:8000/
```

## Gemini API

В `script.js` замените:

```js
const GEMINI_API_KEY = "PASTE_GEMINI_API_KEY_HERE";
```

на реальный ключ из Google AI Studio.

Сайт отправляет запрос напрямую в Gemini:

```text
https://generativelanguage.googleapis.com/v1/models/gemini-3.1-flash-image:generateContent
```

В запросе используются:

- `inlineData` для загруженного изображения
- текстовый prompt

Квадратный формат задаётся в prompt: `Generate one square moodboard image...`.
Optional-поля `generationConfig.responseModalities/responseFormat` не добавлены в
тело запроса, потому что в браузерном REST-вызове они могут возвращать ошибку
валидации на стороне API. Gemini image model по умолчанию умеет возвращать
`inlineData` с изображением.

Ответ Gemini читается из:

```text
candidates[0].content.parts[].inlineData.data
```

Если ответ содержит `image_url`, сайт также умеет показать и скачать изображение
по этой ссылке.

## Важно про GitHub Pages и API-ключ

GitHub Pages не умеет выполнять backend-код. Поэтому текущая дипломная версия
делает запрос к Gemini напрямую из браузера, а ключ лежит в `script.js`.

Это работает для демонстрации, но ключ будет виден любому посетителю сайта. Для
реального продукта нужно вынести запрос в serverless-функцию на Vercel, Netlify
или Cloudflare Workers и хранить ключ в переменных окружения.

## Проверка работы

Откройте DevTools -> Network -> Fetch/XHR, загрузите изображение, заполните
описание и нажмите `Создать мудборд`. Должен появиться запрос к:

```text
generativelanguage.googleapis.com
```

В Console дополнительно выводятся:

- `[Moodboard] start request`
- `[Moodboard] api response`
- `[Moodboard] error`

## GitHub Pages

Для этого репозитория ссылка GitHub Pages:

```text
https://bashevnik.github.io/moonboard_service/
```
