<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This repo contains everything you need to run the app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1WlkFTh_xdez1cUyHuT3MD-nRl0ElHnDu

## Quick Start (beginner friendly)

### 0) Install what you need (one time)

- Node.js LTS: https://nodejs.org
- ffmpeg + ffprobe (needed for local rendering): https://ffmpeg.org/download.html
- Git (optional, only if you want to clone): https://git-scm.com

### 1) Open a command window

**macOS**

Open Terminal: Finder -> Applications -> Utilities -> Terminal.

**Windows**

Press the Windows key, type `Command Prompt`, press Enter.

Tip: paste with Cmd+V on macOS, or right-click in Command Prompt on Windows.
When a step says "paste a command," click in the command window, paste the line, then press Enter to run it.

### 2) Download the project

Pick one option below.

**Option A (recommended): clone with Git**

Copy and paste these lines, pressing Enter after each line:

```bash
git clone <your-repo-url>
cd heygen-cms-tool
```

**Option B: download a ZIP**

1. Click **Code -> Download ZIP** on the repo page.
2. Unzip it, then open the extracted folder.

### 3) Go to the project folder

If you used Option A above, you can skip this step. Otherwise, in the command window, type `cd ` (with a space), then drag the project folder onto the window and press Enter.

### 4) Add license keys

Open `public/licenses.json` in the project folder and paste the shared keys.
If you do not have an editor installed, use TextEdit (macOS) or Notepad (Windows).

### 5) Run the app

**macOS (first time only)**

```bash
chmod +x heygen-cms-launcher-mac.command
```

**macOS (run)**

```bash
./heygen-cms-launcher-mac.command
```

**Windows (run)**

```bat
.\heygen-cms-launcher-windows.bat
```

You can also double-click the launcher files if you prefer.
If macOS blocks the launcher, right-click the file, choose Open, then click Open.

The launchers install dependencies automatically the first time and then start the app + render server. When they finish, open the URL printed in the terminal (usually `http://localhost:5173`).

## Pipeline test (recommended)

Runs a full end-to-end local pipeline test: generates synthetic media, uploads via the render API, renders, downloads the output, and verifies the output is CFR `24fps`.

`npm run test:pipeline`

## Drag & Drop

- Workstation: drop one or many `video/*` files onto the Video 1 / Video 2 boxes.
- Workstation: drop an `audio/*` file onto the BGM box to import + auto-save into the Asset Library.
- Asset Library: drop `audio/*` files anywhere on the Library screen to add them.
- Asset Library → Workstation: drag a saved library track and drop it onto the BGM box (no re-import).

## Batch pairing (multi-clip)

- Drop multiple clips into Video 1 and (optionally) Video 2.
- Clips are paired by order (1st with 1st, 2nd with 2nd, etc.).
- If Video 2 has extra clips, they are ignored (Video 1 drives the batch).

## Single-clip + BGM placement

- Video 2 is optional. You can render with just Video 1.
- BGM supports target, start position, length, and looping:
  - Start has presets (Beginning / End / Custom).
  - End starts the music so it finishes at the end of the target clip using the selected length.
  - Length can be Full Track or Custom Length.
  - Looping is auto-enabled if the selected length exceeds the audio duration.
- Preview audio: click the preview window once to enable BGM sound in the preview.

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
