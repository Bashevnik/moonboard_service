# AI Moodboard Generator

A static one-page website for GitHub Pages. Users upload a reference photo,
describe the desired mood, generate a moodboard image, and download the result.

## Files

- `index.html` - page markup
- `style.css` - responsive visual design
- `script.js` - upload, validation, API request, demo mode, and download logic
- `README.md` - project notes

## Run Locally

Open `index.html` directly in a browser:

```powershell
Start-Process .\index.html
```

Optional, if Python is installed, run a small static server:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000/
```

## API Setup

In `script.js`, replace the placeholders at the top of the file:

```js
const API_KEY = "PASTE_YOUR_API_KEY_HERE";
const API_URL = "PASTE_IMAGE_GENERATION_API_URL_HERE";
```

The example request sends `FormData` fields:

- `image`
- `prompt`
- `style: "moodboard"`
- `aspect_ratio: "1:1"`

The expected JSON response is:

```json
{
  "image_url": "https://..."
}
```

Important: storing an API key in frontend JavaScript is only acceptable for a
temporary diploma/demo project. For production, use a backend or serverless
proxy so the key is not exposed to visitors.

## Demo Mode

If `API_KEY` is still `PASTE_YOUR_API_KEY_HERE`, the site does not call an API.
After 2 seconds it generates a downloadable demo moodboard in the browser using
Canvas and the uploaded reference photo.

## Deploy to GitHub Pages

1. Push the project to GitHub.
2. Open repository settings.
3. Go to `Settings -> Pages`.
4. Select `Deploy from a branch`.
5. Select branch `main` and folder `/root`.
6. Save.

For this repository, the GitHub Pages URL will be:

```text
https://bashevnik.github.io/moonboard_service/
```
