import express from 'express';
import cors from 'cors';
import multer from 'multer';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { spawn } from 'child_process';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition, makeCancelSignal } from '@remotion/renderer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number.isFinite(Number(process.env.RENDER_PORT))
  ? Number(process.env.RENDER_PORT)
  : 5050;
const ROOT_DIR = __dirname;
const RENDER_DIR = path.join(ROOT_DIR, 'renders');
const UPLOAD_DIR = path.join(RENDER_DIR, 'uploads');
const OUTPUT_DIR = path.join(RENDER_DIR, 'output');
const BUNDLE_DIR = path.join(RENDER_DIR, 'bundle');
const TRANSCODE_DIR = path.join(UPLOAD_DIR, 'transcoded');
const CACHE_DIR = path.join(RENDER_DIR, 'cache');
const CACHE_VIDEO_DIR = path.join(CACHE_DIR, 'video');
const CACHE_AUDIO_DIR = path.join(CACHE_DIR, 'audio');
const JOBS_FILE = path.join(RENDER_DIR, 'jobs.json');

const COMPOSITION_ID = 'heygen-cms';
const ENTRY_POINT = path.join(ROOT_DIR, 'remotion', 'index.tsx');

const ensureDir = async (dir) => {
  await fs.mkdir(dir, { recursive: true });
};

const fileExists = async (filePath) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const sanitizeName = (value) => {
  const text = typeof value === 'string' ? value : String(value || '');
  return text.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 160) || 'asset';
};

const MIN_DB = -20;
const MAX_DB = 20;

const clampDb = (value) => Math.min(MAX_DB, Math.max(MIN_DB, value));

const dbToGain = (db) => Math.pow(10, clampDb(db) / 20);

const resolveVolumeGain = (bgm) => {
  if (!bgm) {
    return 1;
  }
  const volumeDb = Number.isFinite(Number(bgm.volumeDb)) ? Number(bgm.volumeDb) : null;
  if (volumeDb !== null) {
    return dbToGain(volumeDb);
  }
  const volume = Number.isFinite(Number(bgm.volume)) ? Number(bgm.volume) : null;
  if (volume !== null) {
    return volume;
  }
  return 1;
};

const normalizeFileUrl = (filePath) => pathToFileURL(filePath).toString();
const MEDIA_BASE_URL = `http://localhost:${PORT}/media`;
const CACHE_BASE_URL = `http://localhost:${PORT}/cache`;

const toServedUrl = (filePath) => {
  const mediaRelative = path.relative(UPLOAD_DIR, filePath);
  if (!mediaRelative.startsWith('..')) {
    const safePath = mediaRelative.split(path.sep).map(encodeURIComponent).join('/');
    return `${MEDIA_BASE_URL}/${safePath}`;
  }

  const cacheRelative = path.relative(CACHE_DIR, filePath);
  if (!cacheRelative.startsWith('..')) {
    const safePath = cacheRelative.split(path.sep).map(encodeURIComponent).join('/');
    return `${CACHE_BASE_URL}/${safePath}`;
  }

  return normalizeFileUrl(filePath);
};

const runFfmpeg = (args, controller) =>
  new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: 'ignore' });
    if (controller) {
      controller.activeProcess = proc;
    }
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (controller && controller.activeProcess === proc) {
        controller.activeProcess = null;
      }
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`ffmpeg exited with code ${code}`));
    });
  });

const runFfprobe = (args) =>
  new Promise((resolve, reject) => {
    const proc = spawn('ffprobe', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(`ffprobe exited with code ${code}: ${stderr}`));
    });
  });

const parseRatio = (value) => {
  if (!value || typeof value !== 'string') {
    return null;
  }
  const [num, den] = value.split('/').map((part) => Number(part));
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) {
    return null;
  }
  return num / den;
};

const probeMedia = async (filePath) => {
  const output = await runFfprobe([
    '-v',
    'error',
    '-print_format',
    'json',
    '-show_streams',
    '-show_format',
    filePath,
  ]);
  const data = JSON.parse(output);
  const streams = Array.isArray(data.streams) ? data.streams : [];
  const format = data.format || {};

  const videoStream = streams.find((stream) => stream.codec_type === 'video') || null;
  const audioStream = streams.find((stream) => stream.codec_type === 'audio') || null;

  const duration =
    Number(videoStream?.duration) ||
    Number(format?.duration) ||
    0;

  const avgFps = parseRatio(videoStream?.avg_frame_rate) || 0;
  const rFps = parseRatio(videoStream?.r_frame_rate) || 0;

  return {
    duration: Number.isFinite(duration) ? duration : 0,
    video: videoStream
      ? {
          codec: videoStream.codec_name || null,
          pixFmt: videoStream.pix_fmt || null,
          width: Number(videoStream.width) || 0,
          height: Number(videoStream.height) || 0,
          avgFps,
          rFps,
        }
      : null,
    audio: audioStream
      ? {
          codec: audioStream.codec_name || null,
          sampleRate: Number(audioStream.sample_rate) || 0,
          channels: Number(audioStream.channels) || 0,
        }
      : null,
  };
};

const hashFile = (filePath) =>
  new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fsSync.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });

const getAssetIdFromPath = (filePath) => {
  const base = path.basename(filePath);
  const dashIndex = base.indexOf('-');
  if (dashIndex <= 0) {
    return 'asset';
  }
  return sanitizeName(base.slice(0, dashIndex)) || 'asset';
};

const isNearly = (a, b, epsilon = 0.05) => Math.abs(a - b) <= epsilon;

const normalizeVideoTo24Fps = async (inputPath, controller) => {
  const assetId = getAssetIdFromPath(inputPath);
  const meta = await probeMedia(inputPath);
  if (
    meta.video &&
    meta.video.codec === 'h264' &&
    meta.video.pixFmt === 'yuv420p' &&
    isNearly(meta.video.avgFps, 24) &&
    isNearly(meta.video.rFps || meta.video.avgFps, meta.video.avgFps)
  ) {
    return inputPath;
  }

  const inputHash = await hashFile(inputPath);
  await ensureDir(CACHE_VIDEO_DIR);

  const outputPath = path.join(CACHE_VIDEO_DIR, `${assetId}-${inputHash}-cfr24.mp4`);
  if (await fileExists(outputPath)) {
    return outputPath;
  }

  const hasAudio = Boolean(meta.audio);

  const args = [
    '-y',
    '-i',
    inputPath,
    '-vf',
    'fps=24,format=yuv420p',
    '-r',
    '24',
    '-vsync',
    'cfr',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '18',
    '-movflags',
    '+faststart',
  ];

  if (hasAudio) {
    args.push('-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2');
  } else {
    args.push('-an');
  }

  args.push(outputPath);
  await runFfmpeg(args, controller);
  return outputPath;
};

const transcodeAudioToWav = async (inputPath, controller) => {
  const assetId = getAssetIdFromPath(inputPath);
  const inputHash = await hashFile(inputPath);
  await ensureDir(CACHE_AUDIO_DIR);

  const outputPath = path.join(CACHE_AUDIO_DIR, `${assetId}-${inputHash}-48k.wav`);
  if (await fileExists(outputPath)) {
    return outputPath;
  }

  await runFfmpeg(['-y', '-i', inputPath, '-acodec', 'pcm_s16le', '-ar', '48000', outputPath], controller);
  return outputPath;
};

const buildBundle = async () => {
  await ensureDir(BUNDLE_DIR);
  return bundle({
    entryPoint: ENTRY_POINT,
    outDir: BUNDLE_DIR,
    publicDir: path.join(ROOT_DIR, 'public'),
    onProgress: (progress) => {
      const percentage = Math.round(progress > 1 ? progress : progress * 100);
      if (percentage > 0 && percentage % 25 === 0) {
        console.log(`[remotion] Bundle progress: ${percentage}%`);
      }
    },
  });
};

const uploadStorage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const assetId = sanitizeName(req.body?.assetId || crypto.randomUUID());
    const original = sanitizeName(file.originalname || 'upload');
    cb(null, `${assetId}-${original}`);
  },
});

const upload = multer({ storage: uploadStorage });

const jobs = new Map();
const jobControllers = new Map();
const queue = [];
let isRendering = false;
let serveUrl = null;
let persistTimer = null;

const listFilesRecursive = async (dir) => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(fullPath)));
      continue;
    }
    if (entry.isFile()) {
      const stat = await fs.stat(fullPath);
      files.push({ path: fullPath, bytes: stat.size });
    }
  }
  return files;
};

const getDirStats = async (dir) => {
  try {
    const files = await listFilesRecursive(dir);
    const bytes = files.reduce((sum, file) => sum + file.bytes, 0);
    return { files: files.length, bytes };
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { files: 0, bytes: 0 };
    }
    throw error;
  }
};

const getCacheStats = async () => {
  const [uploads, cache, output, bundle] = await Promise.all([
    getDirStats(UPLOAD_DIR),
    getDirStats(CACHE_DIR),
    getDirStats(OUTPUT_DIR),
    getDirStats(BUNDLE_DIR),
  ]);

  let jobsFile = { files: 0, bytes: 0 };
  try {
    const stat = await fs.stat(JOBS_FILE);
    jobsFile = { files: 1, bytes: stat.size };
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }

  return {
    uploads,
    cache,
    output,
    bundle,
    jobsFile,
    total: {
      files: uploads.files + cache.files + output.files + bundle.files + jobsFile.files,
      bytes: uploads.bytes + cache.bytes + output.bytes + bundle.bytes + jobsFile.bytes,
    },
  };
};

const hasActiveWork = () => {
  if (isRendering || jobControllers.size > 0 || queue.length > 0) {
    return true;
  }
  for (const job of jobs.values()) {
    if (job.status === 'queued' || job.status === 'normalizing' || job.status === 'rendering' || job.status === 'cancelling') {
      return true;
    }
  }
  return false;
};

const clearRenderCache = async () => {
  jobs.clear();
  queue.length = 0;
  jobControllers.clear();
  isRendering = false;

  await Promise.all([
    fs.rm(CACHE_DIR, { recursive: true, force: true }),
    fs.rm(OUTPUT_DIR, { recursive: true, force: true }),
    fs.rm(UPLOAD_DIR, { recursive: true, force: true }),
    fs.rm(BUNDLE_DIR, { recursive: true, force: true }),
    fs.rm(JOBS_FILE, { force: true }),
  ]);

  await ensureDir(UPLOAD_DIR);
  await ensureDir(OUTPUT_DIR);
  await ensureDir(TRANSCODE_DIR);
  await ensureDir(CACHE_VIDEO_DIR);
  await ensureDir(CACHE_AUDIO_DIR);
  serveUrl = await buildBundle();
};

const purgeAssetFromDisk = async (assetIdInput) => {
  const assetId = sanitizeName(assetIdInput);
  const prefix = `${assetId}-`;

  const deletePrefixedFiles = async (dir) => {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      await Promise.all(
        entries
          .filter((entry) => entry.isFile() && entry.name.startsWith(prefix))
          .map((entry) => fs.rm(path.join(dir, entry.name), { force: true }))
      );
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw error;
      }
    }
  };

  await Promise.all([
    deletePrefixedFiles(UPLOAD_DIR),
    deletePrefixedFiles(TRANSCODE_DIR),
    deletePrefixedFiles(CACHE_VIDEO_DIR),
    deletePrefixedFiles(CACHE_AUDIO_DIR),
  ]);
};

const persistJobs = async () => {
  const payload = Array.from(jobs.entries()).map(([jobId, job]) => ({
    jobId,
    ...job,
  }));
  await fs.writeFile(JOBS_FILE, JSON.stringify(payload, null, 2), 'utf-8');
};

const schedulePersistJobs = () => {
  if (persistTimer) {
    clearTimeout(persistTimer);
  }
  persistTimer = setTimeout(() => {
    persistJobs().catch((error) => {
      console.warn('[render-server] Failed to persist jobs.', error);
    });
  }, 300);
};

const updateJob = (jobId, updates) => {
  const current = jobs.get(jobId) || {};
  jobs.set(jobId, { ...current, ...updates });
  schedulePersistJobs();
};

const chromiumOptions = { disableWebSecurity: true };

const processQueue = async () => {
  if (isRendering || queue.length === 0) {
    return;
  }
  const job = queue.shift();
  if (!job) {
    return;
  }

  isRendering = true;
  const { cancelSignal, cancel } = makeCancelSignal();
  const controller = { cancelled: false, cancel, cancelSignal, activeProcess: null };
  jobControllers.set(job.jobId, controller);
  updateJob(job.jobId, { status: 'normalizing', progress: 1, error: null });

  try {
    if (controller.cancelled) {
      updateJob(job.jobId, { status: 'cancelled', error: 'Render cancelled by user.' });
      return;
    }

    const normalizeVideoInput = async (inputPath) => {
      const normalizedPath = await normalizeVideoTo24Fps(inputPath, controller);
      const meta = await probeMedia(normalizedPath);
      return {
        path: normalizedPath,
        url: toServedUrl(normalizedPath),
        duration: Math.max(0.01, meta.duration || 0),
      };
    };

    const normalizedVideo1 = await normalizeVideoInput(job.video1Path);
    if (controller.cancelled) {
      updateJob(job.jobId, { status: 'cancelled', error: 'Render cancelled by user.' });
      return;
    }
    let normalizedVideo2 = { url: '', duration: 0 };
    if (job.video2Path) {
      normalizedVideo2 = await normalizeVideoInput(job.video2Path);
      if (controller.cancelled) {
        updateJob(job.jobId, { status: 'cancelled', error: 'Render cancelled by user.' });
        return;
      }
    }

    const inputProps = {
      video1Path: normalizedVideo1.url,
      video2Path: normalizedVideo2.url,
      video1Duration: normalizedVideo1.duration,
      video2Duration: normalizedVideo2.duration,
      exportQuality: job.exportQuality || '1080p',
      bgm: null,
    };

    if (job.bgm?.path) {
      const audioPath = await transcodeAudioToWav(job.bgm.path, controller);
      const audioMeta = await probeMedia(audioPath);
      inputProps.bgm = {
        path: toServedUrl(audioPath),
        duration: Math.max(0.01, audioMeta.duration || 0),
        playLength: Number(job.bgm.playLength || 0),
        volume: resolveVolumeGain(job.bgm),
        mode: job.bgm.mode,
        startTime: Number(job.bgm.startTime || 0),
        loop: Boolean(job.bgm.loop),
      };
    }

    updateJob(job.jobId, { status: 'rendering', progress: 5, error: null });

    const composition = await selectComposition({
      serveUrl,
      id: COMPOSITION_ID,
      inputProps,
      chromiumOptions,
    });

    await renderMedia({
      serveUrl,
      composition,
      codec: 'h264',
      outputLocation: job.outputPath,
      overwrite: true,
      inputProps,
      chromiumOptions,
      cancelSignal: controller.cancelSignal,
      onProgress: ({ progress }) => {
        if (controller.cancelled) {
          return;
        }
        const percentage = Math.min(100, Math.max(5, Math.round(5 + progress * 95)));
        updateJob(job.jobId, { progress: percentage });
      },
    });

    updateJob(job.jobId, {
      status: 'completed',
      progress: 100,
      outputUrl: `/api/download/${job.jobId}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Render failed.';
    updateJob(job.jobId, {
      status: controller.cancelled ? 'cancelled' : 'failed',
      error: controller.cancelled ? 'Render cancelled by user.' : message,
    });
  } finally {
    isRendering = false;
    jobControllers.delete(job.jobId);
    processQueue();
  }
};

const enqueueJob = (job) => {
  queue.push(job);
  updateJob(job.jobId, {
    status: 'queued',
    progress: 0,
    name: job.name,
    outputPath: job.outputPath,
  });
  processQueue();
};

const cancelJob = (jobId) => {
  const job = jobs.get(jobId);
  if (!job) {
    return { ok: false, message: 'Job not found.' };
  }
  if (job.status === 'completed') {
    return { ok: false, message: 'Job already completed.' };
  }
  if (job.status === 'failed' || job.status === 'cancelled') {
    return { ok: true, message: 'Job already stopped.' };
  }

  const controller = jobControllers.get(jobId);
  if (controller) {
    controller.cancelled = true;
    controller.cancel();
    if (controller.activeProcess) {
      controller.activeProcess.kill('SIGKILL');
      controller.activeProcess = null;
    }
    updateJob(jobId, { status: 'cancelling', error: null });
  }

  const queuedIndex = queue.findIndex((queued) => queued.jobId === jobId);
  if (queuedIndex >= 0) {
    queue.splice(queuedIndex, 1);
    updateJob(jobId, { status: 'cancelled', error: 'Render cancelled by user.' });
    return { ok: true, message: 'Job cancelled.' };
  }

  return { ok: true, message: 'Job cancelled.' };
};

const loadJobsFromDisk = async () => {
  try {
    const data = await fs.readFile(JOBS_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed)) {
      return;
    }
    parsed.forEach((job) => {
      if (!job?.jobId) {
        return;
      }
      jobs.set(job.jobId, { ...job });
    });
    jobs.forEach((job, jobId) => {
      if (job.status === 'rendering' || job.status === 'queued' || job.status === 'normalizing' || job.status === 'cancelling') {
        updateJob(jobId, {
          status: 'failed',
          error: 'Render server restarted before completion.',
        });
      }
    });
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.warn('[render-server] Failed to load jobs file.', error);
    }
  }
};

const bootstrap = async () => {
  await ensureDir(UPLOAD_DIR);
  await ensureDir(OUTPUT_DIR);
  await ensureDir(TRANSCODE_DIR);
  await ensureDir(CACHE_VIDEO_DIR);
  await ensureDir(CACHE_AUDIO_DIR);
  await loadJobsFromDisk();
  serveUrl = await buildBundle();

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use('/media', express.static(UPLOAD_DIR));
  app.use('/cache', express.static(CACHE_DIR));

  app.get('/api/health', (_, res) => {
    res.json({ ok: true });
  });

  app.get('/api/cache/stats', async (_, res) => {
    try {
      const stats = await getCacheStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unable to read cache stats.' });
    }
  });

  app.post('/api/cache/clear', async (req, res) => {
    try {
      const force = Boolean(req.body?.force);
      if (hasActiveWork() && !force) {
        res.status(409).json({ error: 'Cannot clear cache while a render is active. Cancel renders first.' });
        return;
      }

      if (force) {
        jobControllers.forEach((controller) => {
          controller.cancelled = true;
          controller.cancel();
          if (controller.activeProcess) {
            controller.activeProcess.kill('SIGKILL');
            controller.activeProcess = null;
          }
        });
      }

      const before = await getCacheStats();
      await clearRenderCache();
      const after = await getCacheStats();
      res.json({ ok: true, before, after });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unable to clear cache.' });
    }
  });

  app.post('/api/asset/:assetId/purge', async (req, res) => {
    try {
      await purgeAssetFromDisk(req.params.assetId);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unable to purge asset files.' });
    }
  });

  app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'No file provided.' });
      return;
    }
    res.json({ path: req.file.path });
  });

  app.post('/api/render', async (req, res) => {
    try {
      const { name, exportQuality, video1, video2, bgm } = req.body || {};
      if (!video1?.path) {
        res.status(400).json({ error: 'Missing video asset.' });
        return;
      }

      const jobId = crypto.randomUUID();
      const outputName = sanitizeName(name || `render-${jobId}`);
      const outputPath = path.join(OUTPUT_DIR, `${outputName}.mp4`);

      const video1Exists = await fileExists(video1.path);
      if (!video1Exists) {
        res.status(400).json({ error: 'Uploaded media missing on disk. Please re-upload and try again.' });
        return;
      }
      if (video2?.path) {
        const video2Exists = await fileExists(video2.path);
        if (!video2Exists) {
          res.status(400).json({ error: 'Uploaded media missing on disk. Please re-upload and try again.' });
          return;
        }
      }

      const bgmVolume = bgm ? resolveVolumeGain(bgm) : 1;

      enqueueJob({
        jobId,
        name: outputName,
        outputPath,
        exportQuality: exportQuality || '1080p',
        video1Path: video1.path,
        video2Path: video2?.path || null,
        bgm: bgm?.path
          ? {
              path: bgm.path,
              playLength: Number(bgm.playLength || 0),
              volume: bgmVolume,
              mode: bgm.mode,
              startTime: Number(bgm.startTime || 0),
              loop: Boolean(bgm.loop),
            }
          : null,
      });
      res.json({ jobId });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Render job failed.' });
    }
  });

  app.get('/api/render/:jobId', (req, res) => {
    const job = jobs.get(req.params.jobId);
    if (!job) {
      res.status(404).json({ status: 'missing' });
      return;
    }
    res.json(job);
  });

  app.post('/api/render/:jobId/cancel', (req, res) => {
    const result = cancelJob(req.params.jobId);
    if (!result.ok) {
      res.status(400).json({ error: result.message });
      return;
    }
    res.json({ ok: true });
  });

  app.get('/api/download/:jobId', (req, res) => {
    const job = jobs.get(req.params.jobId);
    if (!job?.outputUrl) {
      res.status(404).json({ error: 'Output not ready.' });
      return;
    }
    res.download(job.outputPath, path.basename(job.outputPath));
  });

  app.listen(PORT, () => {
    console.log(`[render-server] Listening on http://localhost:${PORT}`);
  });
};

bootstrap().catch((error) => {
  console.error('[render-server] Failed to start.', error);
  process.exit(1);
});
