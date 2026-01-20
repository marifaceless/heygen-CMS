import { spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs/promises';
import net from 'net';
import path from 'path';

const ROOT = process.cwd();
const TEST_DIR = path.join(ROOT, 'renders', 'test-pipeline');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const run = (cmd, args, opts = {}) =>
  new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => (stdout += d.toString()));
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`${cmd} ${args.join(' ')} failed (${code}): ${stderr}`));
    });
  });

const ensureBin = async (name) => {
  await run(name, ['-version']);
};

const waitForHealth = async (baseUrl, timeoutMs = 120_000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) {
        return;
      }
    } catch {
      // ignore
    }
    await sleep(500);
  }
  throw new Error('Render server did not become healthy in time.');
};

const uploadFile = async ({ baseUrl, assetId, filePath, contentType }) => {
  const buffer = await fs.readFile(filePath);
  const blob = new Blob([buffer], { type: contentType });

  const formData = new FormData();
  formData.append('assetId', assetId);
  formData.append('file', blob, path.basename(filePath));

  const res = await fetch(`${baseUrl}/api/upload`, { method: 'POST', body: formData });
  if (!res.ok) {
    throw new Error(`upload failed: ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  return json.path;
};

const pollJob = async ({ baseUrl, jobId }) => {
  while (true) {
    const res = await fetch(`${baseUrl}/api/render/${jobId}`);
    if (!res.ok) {
      throw new Error(`job status failed: ${res.status}`);
    }
    const job = await res.json();
    process.stdout.write(`status=${job.status} progress=${job.progress}%\r`);
    if (job.status === 'completed') {
      process.stdout.write('\n');
      return job;
    }
    if (job.status === 'failed' || job.status === 'cancelled') {
      process.stdout.write('\n');
      throw new Error(`${job.status}: ${job.error || 'unknown error'}`);
    }
    await sleep(1000);
  }
};

const getFreePort = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Unable to allocate port'));
        return;
      }
      const port = address.port;
      server.close(() => resolve(port));
    });
  });

const probeFps = async (filePath) => {
  const { stdout } = await run('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=avg_frame_rate,r_frame_rate',
    '-of',
    'default=nw=1:nk=1',
    filePath,
  ]);
  const lines = stdout.trim().split('\n').filter(Boolean);
  return { r: lines[0] || '', avg: lines[1] || '' };
};

const probeDuration = async (filePath) => {
  const { stdout } = await run('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=nw=1:nk=1',
    filePath,
  ]);
  return Number(stdout.trim());
};

const detectSilenceEnd = async (filePath) => {
  const { stderr } = await run('ffmpeg', [
    '-v',
    'info',
    '-i',
    filePath,
    '-af',
    'silencedetect=noise=-45dB:d=0.2',
    '-f',
    'null',
    '-',
  ]);
  const match = stderr.match(/silence_end:\s*([0-9.]+)/);
  if (!match) {
    return null;
  }
  return Number(match[1]);
};

const probeVolume = async (filePath) => {
  const { stderr } = await run('ffmpeg', [
    '-v',
    'info',
    '-i',
    filePath,
    '-af',
    'volumedetect',
    '-f',
    'null',
    '-',
  ]);
  const mean = stderr.match(/mean_volume:\s*([-\d.]+)\s*dB/);
  const max = stderr.match(/max_volume:\s*([-\d.]+)\s*dB/);
  return {
    meanDb: mean ? Number(mean[1]) : null,
    maxDb: max ? Number(max[1]) : null,
  };
};

const within = (value, expected, tolerance) => Math.abs(value - expected) <= tolerance;

const main = async () => {
  await ensureBin('ffmpeg');
  await ensureBin('ffprobe');

  await fs.rm(TEST_DIR, { recursive: true, force: true });
  await fs.mkdir(TEST_DIR, { recursive: true });

  const video30 = path.join(TEST_DIR, 'video30.mp4');
  const video25 = path.join(TEST_DIR, 'video25.mp4');
  const video30WithAudio = path.join(TEST_DIR, 'video30-with-audio.mp4');
  const audio = path.join(TEST_DIR, 'bgm.m4a');

  await run('ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=1280x720:rate=30',
    '-t',
    '3',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    video30,
  ]);

  await run('ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=1280x720:rate=25',
    '-t',
    '3',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    video25,
  ]);

  await run('ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=1280x720:rate=30',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:sample_rate=48000',
    '-t',
    '3',
    '-shortest',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '160k',
    video30WithAudio,
  ]);

  await run('ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:sample_rate=48000',
    '-t',
    '6',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    audio,
  ]);

  const port = await getFreePort();
  const baseUrl = `http://localhost:${port}`;
  const server = spawn('node', ['render-server.js'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, RENDER_PORT: String(port) },
  });
  server.stdout.on('data', (d) => process.stdout.write(d.toString()));
  server.stderr.on('data', (d) => process.stderr.write(d.toString()));

  try {
    await waitForHealth(baseUrl);

    const asset1 = crypto.randomBytes(6).toString('hex');
    const asset2 = crypto.randomBytes(6).toString('hex');
    const asset3 = crypto.randomBytes(6).toString('hex');
    const asset4 = crypto.randomBytes(6).toString('hex');

    const uploaded1 = await uploadFile({ baseUrl, assetId: asset1, filePath: video30, contentType: 'video/mp4' });
    const uploaded2 = await uploadFile({ baseUrl, assetId: asset2, filePath: video25, contentType: 'video/mp4' });
    const uploaded3 = await uploadFile({ baseUrl, assetId: asset3, filePath: audio, contentType: 'audio/mp4' });
    const uploaded4 = await uploadFile({ baseUrl, assetId: asset4, filePath: video30WithAudio, contentType: 'video/mp4' });

    const renderRes = await fetch(`${baseUrl}/api/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `pipeline-test-${Date.now()}`,
        exportQuality: '720p',
        video1: { path: uploaded1, duration: 3 },
        video2: { path: uploaded2, duration: 3 },
        bgm: { path: uploaded3, playLength: 6, volumeDb: -14, mode: 'FULL', loop: false },
      }),
    });

    if (!renderRes.ok) {
      throw new Error(`create job failed: ${renderRes.status} ${await renderRes.text()}`);
    }

    const { jobId } = await renderRes.json();
    if (!jobId) {
      throw new Error('no jobId returned');
    }

    await pollJob({ baseUrl, jobId });

    const outPath = path.join(TEST_DIR, `output-${jobId}.mp4`);
    const dl = await fetch(`${baseUrl}/api/download/${jobId}`);
    if (!dl.ok) {
      throw new Error(`download failed: ${dl.status}`);
    }
    const outBuf = Buffer.from(await dl.arrayBuffer());
    await fs.writeFile(outPath, outBuf);

    const fps = await probeFps(outPath);
    if (fps.r !== '24/1' || fps.avg !== '24/1') {
      throw new Error(`expected 24fps CFR output, got r=${fps.r} avg=${fps.avg}`);
    }

    const duration = await probeDuration(outPath);
    if (!Number.isFinite(duration) || Math.abs(duration - 6) > 0.35) {
      throw new Error(`unexpected duration: ${duration}s (expected ~6s)`);
    }

    const { stderr } = await run('ffmpeg', ['-v', 'error', '-i', outPath, '-f', 'null', '-']);
    if (stderr.trim().length > 0) {
      throw new Error(`ffmpeg decode errors:\n${stderr}`);
    }

    const renderResSingle = await fetch(`${baseUrl}/api/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `pipeline-single-${Date.now()}`,
        exportQuality: '720p',
        video1: { path: uploaded1, duration: 3 },
        video2: null,
        bgm: { path: uploaded3, playLength: 2, startTime: 1, volumeDb: -14, mode: 'VIDEO1_ONLY', loop: false },
      }),
    });

    if (!renderResSingle.ok) {
      throw new Error(`create single job failed: ${renderResSingle.status} ${await renderResSingle.text()}`);
    }

    const { jobId: singleJobId } = await renderResSingle.json();
    if (!singleJobId) {
      throw new Error('no jobId returned for single clip test');
    }

    await pollJob({ baseUrl, jobId: singleJobId });

    const singleOutPath = path.join(TEST_DIR, `output-single-${singleJobId}.mp4`);
    const singleDl = await fetch(`${baseUrl}/api/download/${singleJobId}`);
    if (!singleDl.ok) {
      throw new Error(`single download failed: ${singleDl.status}`);
    }
    const singleBuf = Buffer.from(await singleDl.arrayBuffer());
    await fs.writeFile(singleOutPath, singleBuf);

    const singleDuration = await probeDuration(singleOutPath);
    if (!Number.isFinite(singleDuration) || Math.abs(singleDuration - 3) > 0.35) {
      throw new Error(`unexpected single duration: ${singleDuration}s (expected ~3s)`);
    }

    const silenceEnd = await detectSilenceEnd(singleOutPath);
    if (silenceEnd === null || !within(silenceEnd, 1, 0.4)) {
      throw new Error(`unexpected BGM start: ${silenceEnd}s (expected ~1s)`);
    }

    const singleDecode = await run('ffmpeg', ['-v', 'error', '-i', singleOutPath, '-f', 'null', '-']);
    if (singleDecode.stderr.trim().length > 0) {
      throw new Error(`ffmpeg decode errors (single):\n${singleDecode.stderr}`);
    }

    const renderResVideoAudio = await fetch(`${baseUrl}/api/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `pipeline-video-audio-${Date.now()}`,
        exportQuality: '720p',
        video1: { path: uploaded4, duration: 3 },
        video2: null,
        bgm: null,
      }),
    });

    if (!renderResVideoAudio.ok) {
      throw new Error(`create video-audio job failed: ${renderResVideoAudio.status} ${await renderResVideoAudio.text()}`);
    }

    const { jobId: videoAudioJobId } = await renderResVideoAudio.json();
    if (!videoAudioJobId) {
      throw new Error('no jobId returned for video-audio test');
    }

    await pollJob({ baseUrl, jobId: videoAudioJobId });

    const videoAudioOutPath = path.join(TEST_DIR, `output-video-audio-${videoAudioJobId}.mp4`);
    const videoAudioDl = await fetch(`${baseUrl}/api/download/${videoAudioJobId}`);
    if (!videoAudioDl.ok) {
      throw new Error(`video-audio download failed: ${videoAudioDl.status}`);
    }
    const videoAudioBuf = Buffer.from(await videoAudioDl.arrayBuffer());
    await fs.writeFile(videoAudioOutPath, videoAudioBuf);

    const videoAudioVolume = await probeVolume(videoAudioOutPath);
    if (
      !Number.isFinite(videoAudioVolume.meanDb) ||
      !Number.isFinite(videoAudioVolume.maxDb) ||
      videoAudioVolume.meanDb < -60 ||
      videoAudioVolume.maxDb < -40
    ) {
      throw new Error(
        `expected video audio to be present, got mean=${videoAudioVolume.meanDb}dB max=${videoAudioVolume.maxDb}dB`
      );
    }

    console.log(`OK: ${outPath}`);
    console.log(`OK: ${singleOutPath}`);
    console.log(`OK: ${videoAudioOutPath}`);
  } finally {
    server.kill('SIGTERM');
  }
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
