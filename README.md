# Генератор мудбордов

Статический одностраничный сайт для GitHub Pages. Пользователь загружает
референс, описывает настроение, получает мудборд и может скачать результат.

## Файлы

- `index.html` - разметка страницы
- `style.css` - адаптивный визуальный дизайн
- `script.js` - загрузка файла, валидация, API-запрос, demo mode и скачивание
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

## Настройка API

В `script.js` замените значения в начале файла:

```js
const API_KEY = "PASTE_YOUR_API_KEY_HERE";
const API_URL = "PASTE_IMAGE_GENERATION_API_URL_HERE";
```

Пример запроса отправляет поля `FormData`:

- `image`
- `prompt`
- `style: "moodboard"`
- `aspect_ratio: "1:1"`

Ожидаемый JSON-ответ:

```json
{
  "image_url": "https://..."
}
```

Важно: хранить API-ключ во frontend JavaScript можно только для временного
дипломного демо. В реальном проекте запросы нужно переносить на backend или
serverless-прокси, чтобы ключ не был виден посетителям.

## Demo Mode

Если `API_KEY` равен `PASTE_YOUR_API_KEY_HERE`, сайт не обращается к API.
Через 2 секунды он создаёт демо-мудборд прямо в браузере с помощью Canvas и
загруженного референса.

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
