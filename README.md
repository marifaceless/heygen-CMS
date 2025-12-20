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

## Local persistence

- Queue state and library metadata are saved to localStorage automatically.
- Media files are stored in the browser's IndexedDB for refresh-safe access.
- Clearing site data will reset local state and remove stored media.

## Local rendering (Remotion)

- Rendering runs on your local machine via `render-server.js`.
- The render server listens on `http://localhost:5050` and the Vite dev server proxies `/api` requests.
- Outputs are saved to `renders/output`.
- Output is rendered at `24fps` (inputs are normalized to 24fps CFR automatically for stability).
- Ensure you have ffmpeg installed for Remotion to process media.
- Render job progress persists across browser refreshes while the render server is running.
- You can cancel an in-progress render from the Queue UI (jobs will show as `CANCELLED`).
- Use the `Engine Config` tab → `Delete Cache` to wipe local render cache/outputs without deleting your Asset Library.
