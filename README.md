# Генератор мудбордов

Статический одностраничный сайт для GitHub Pages. Пользователь загружает
референс, описывает настроение, сайт отправляет фото и текст в Google Gemini API,
показывает сгенерированный мудборд и позволяет скачать результат.

## Файлы

- `index.html` - разметка страницы
- `style.css` - адаптивный визуальный дизайн
- `script.js` - загрузка файла, валидация, Gemini API, fallback и скачивание
- `README.md` - описание проекта

## Локальный запуск

Можно открыть `index.html` напрямую в браузере:

```powershell
Start-Process .\index.html
```

Если установлен Python, можно запустить небольшой статический сервер:

```bash
python -m http.server 8000
```

Затем открыть:

```text
http://localhost:8000/
```

## Настройка Gemini API

В `script.js` замените значение в начале файла:

```js
const GEMINI_API_KEY = "PASTE_GEMINI_API_KEY_HERE";
```

Сайт использует нативную генерацию/редактирование изображений Gemini:

```text
model: gemini-3.1-flash-image
endpoint: https://generativelanguage.googleapis.com/v1/models/gemini-3.1-flash-image:generateContent
```

В запрос отправляются:

- текстовый prompt
- загруженное изображение как `inlineData`
- `responseModalities: ["Image"]`
- `responseFormat.image.aspectRatio: "1:1"`

Gemini обычно возвращает изображение как base64 в:

```text
candidates[0].content.parts[].inlineData.data
```

Сайт также умеет обработать ответ с `image_url`, если API или прокси вернёт
ссылку на изображение.

Важно: хранить API-ключ во frontend JavaScript можно только для временного
дипломного демо. В реальном проекте запросы нужно переносить на backend или
serverless-прокси, чтобы ключ не был виден посетителям.

## Fallback

Если `GEMINI_API_KEY` пустой или равен `PASTE_GEMINI_API_KEY_HERE`, сайт не
отправляет запрос в Gemini. Через 2 секунды он показывает демо-мудборд,
созданный в браузере. В этом режиме исходное фото не вставляется в готовый
шаблон, это только визуальный fallback для защиты проекта без ключа.

## Публикация на GitHub Pages

1. Загрузите проект в GitHub.
2. Откройте настройки репозитория.
3. Перейдите в `Settings -> Pages`.
4. Выберите `Deploy from a branch`.
5. Выберите ветку `main` и папку `/root`.
6. Сохраните настройки.

Для этого репозитория ссылка GitHub Pages будет:

```text
https://bashevnik.github.io/moonboard_service/
```
