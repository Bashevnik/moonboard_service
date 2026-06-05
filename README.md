# Генератор мудбордов

Одностраничный сайт для GitHub Pages с безопасным serverless proxy на Vercel.

Проект работает без платной Gemini image generation: Gemini text model анализирует фото и описание, возвращает JSON-структуру мудборда, а frontend собирает красивый HTML/CSS-мудборд и скачивает его как PNG через `html2canvas`.

```text
GitHub Pages frontend -> Vercel Function -> Gemini text model -> moodboard JSON
```

API-ключ хранится только в переменных окружения Vercel и не попадает во frontend-код.

## Файлы проекта

- `index.html` - структура интерфейса и подключение `html2canvas`
- `style.css` - визуальный стиль, адаптив и оформление мудборда
- `script.js` - загрузка фото, валидация, запрос к proxy, рендер JSON-мудборда и скачивание PNG
- `api/generate-moodboard.js` - Vercel Function для запроса к Gemini
- `vercel.json` - настройки Vercel Function
- `README.md` - инструкция по запуску и деплою

## Как это работает

1. Пользователь загружает фото и пишет описание настроения.
2. Frontend отправляет `POST` на Vercel endpoint:

```text
https://moonboard-service-vercel.vercel.app/api/generate-moodboard
```

3. Vercel Function добавляет `GEMINI_API_KEY` из environment variable и вызывает Gemini text model.
4. Backend возвращает JSON:

```json
{
  "moodboard": {
    "title": "Тихая студийная теплота",
    "mood": "Спокойное, собранное и тактильное визуальное направление.",
    "colorPalette": ["#F8F7F4", "#A46C44", "#617A55", "#E8E4DC"],
    "materials": ["натуральное дерево", "матовая керамика", "мягкий лен"],
    "keywords": ["спокойствие", "ремесленность", "премиальность"],
    "composition": "Крупный референс, рядом палитра, материалы и заметки по направлению.",
    "typographyMood": "Чистая современная типографика с уверенным заголовком.",
    "lighting": "Мягкий дневной свет с теплым рассеянным контрастом."
  }
}
```

5. Frontend рендерит готовый мудборд в HTML/CSS.
6. Кнопка `Скачать мудборд` экспортирует этот блок в PNG через `html2canvas`.

## Локальный запуск frontend

Можно открыть файл напрямую:

```powershell
Start-Process .\index.html
```

Или запустить статический сервер:

```bash
python -m http.server 8000
```

После этого открыть:

```text
http://localhost:8000/
```

## Настройка Vercel Function

1. Создайте или откройте проект на Vercel.
2. Перейдите в `Project Settings -> Environment Variables`.
3. Добавьте переменную:

```text
GEMINI_API_KEY=ваш_ключ_из_Google_AI_Studio
```

4. Опционально добавьте origin для CORS:

```text
ALLOWED_ORIGIN=https://bashevnik.github.io
```

5. Сделайте redeploy проекта.

В backend используется бесплатная текстовая модель:

```js
const GEMINI_MODEL = "gemini-2.5-flash";
```

Если модель недоступна, функция пробует fallback:

```js
const GEMINI_FALLBACK_MODEL = "gemini-1.5-flash";
```

## Проверка запроса

В DevTools откройте `Network -> Fetch/XHR`, загрузите изображение, заполните описание и нажмите `Создать мудборд`.

Должен появиться запрос к Vercel endpoint:

```text
https://moonboard-service-vercel.vercel.app/api/generate-moodboard
```

Запроса из браузера напрямую к `generativelanguage.googleapis.com` быть не должно.

## Формат запроса frontend -> proxy

```json
{
  "imageBase64": "...",
  "mimeType": "image/png",
  "prompt": "описание мудборда",
  "fileName": "reference.png"
}
```

## Безопасность

- Не коммитьте реальный `GEMINI_API_KEY`.
- Храните ключ только в Vercel Environment Variables.
- Если ключ случайно попал в git, удалите его из истории и перевыпустите ключ в Google AI Studio.
- Frontend на GitHub Pages должен обращаться только к serverless proxy, а не напрямую к Gemini.

## GitHub Pages

Ссылка GitHub Pages для этого репозитория:

```text
https://bashevnik.github.io/moonboard_service/
```
