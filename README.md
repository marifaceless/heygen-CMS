<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1WlkFTh_xdez1cUyHuT3MD-nRl0ElHnDu

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Update shared license keys in [public/licenses.json](public/licenses.json)
4. Run the app + local render server:
   `npm run dev:all`

## Pipeline test (recommended)

Runs a full end-to-end local pipeline test: generates synthetic media, uploads via the render API, renders, downloads the output, and verifies the output is CFR `24fps`.

`npm run test:pipeline`

## Drag & Drop

- Workstation: drop a `video/*` file onto the Video 1 / Video 2 boxes.
- Workstation: drop an `audio/*` file onto the BGM box to import + auto-save into the Asset Library.
- Asset Library: drop `audio/*` files anywhere on the Library screen to add them.
- Asset Library → Workstation: drag a saved library track and drop it onto the BGM box (no re-import).

## Local persistence

- Queue state and library metadata are saved to localStorage automatically.
- Media files are stored in the browser's IndexedDB for refresh-safe access.
- Clearing site data will reset local state and remove stored media.

## Local rendering (Remotion)

- Rendering runs on your local machine via `render-server.js`.
- The render server listens on `http://localhost:5050` and the Vite dev server proxies `/api` requests.
- Outputs are saved to `renders/output`.
- Output is rendered at `24fps` (inputs are normalized to 24fps CFR automatically for stability).
- Ensure you have `ffmpeg` + `ffprobe` installed.
- Render job progress persists across browser refreshes while the render server is running.
- You can cancel an in-progress render from the Queue UI (jobs will show as `CANCELLED`).
- Use the `Engine Config` tab → `Delete Cache` to wipe local render cache/outputs without deleting your Asset Library.

### Cache behavior

The render server stores derived artifacts on disk for speed:
- Normalized media cache (CFR 24 conversions)
- Upload copies (server-side)
- Render outputs
- Remotion bundle + job history

`Delete Cache` deletes all of the above. It does not delete your Asset Library (stored in the browser).

### Render server API (local)

- `GET /api/health` → server health
- `POST /api/upload` → upload media file (multipart form field: `file`, optional `assetId`)
- `POST /api/render` → create a render job
- `GET /api/render/:jobId` → poll job status (`queued`, `normalizing`, `rendering`, `cancelling`, `completed`, `failed`, `cancelled`)
- `POST /api/render/:jobId/cancel` → cancel a job
- `GET /api/download/:jobId` → download output mp4
- `GET /api/cache/stats` → cache size stats
- `POST /api/cache/clear` → clear disk cache (returns `409` if a render is active)
- `POST /api/asset/:assetId/purge` → purge server-side copies for a specific asset id
