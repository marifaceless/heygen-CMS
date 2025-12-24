
import React, { useState, useEffect, useRef } from 'react';
import { ICONS } from '../constants';
import { ProjectConfig, BGMMode, BGMAsset, LibraryAsset, VideoAsset } from '../types';
import { clampDb, dbToGain, formatDb } from '../audioLevels';
import { saveMediaBlob } from '../mediaStore';
import { getMediaDuration } from '../mediaDuration';

interface TemplateEditorProps {
  onEnqueue: (configs: ProjectConfig[]) => void;
  library: LibraryAsset[];
  onAddToLibrary: (asset: LibraryAsset) => void;
}

export const TemplateEditor: React.FC<TemplateEditorProps> = ({ onEnqueue, library, onAddToLibrary }) => {
  const [config, setConfig] = useState<ProjectConfig>({
    id: '',
    name: `Composition_${new Date().toLocaleTimeString()}`,
    video1: null,
    video2: null,
    bgm: null,
    exportQuality: '1080p',
    status: 'PENDING',
    progress: 0
  });

  const [batchVideo1, setBatchVideo1] = useState<VideoAsset[]>([]);
  const [batchVideo2, setBatchVideo2] = useState<VideoAsset[]>([]);
  const [showLibraryPicker, setShowLibraryPicker] = useState(false);
  const [totalFrames, setTotalFrames] = useState(600);
  const [dragOverTarget, setDragOverTarget] = useState<null | 'video1' | 'video2' | 'bgm'>(null);
  const [dropError, setDropError] = useState<string | null>(null);
  const [bgmStartMode, setBgmStartMode] = useState<'beginning' | 'end' | 'custom'>('beginning');
  const [bgmLengthMode, setBgmLengthMode] = useState<'full' | 'custom'>('full');
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioTimers = useRef<{ start?: number; stop?: number }>({});
  const audioKickoff = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioGainRef = useRef<GainNode | null>(null);
  const audioSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const previewVideo1 = batchVideo1[0] ?? null;
  const previewVideo2 = batchVideo2[0] ?? null;

  const getClipDuration = (mode: BGMMode, video1: VideoAsset | null, video2: VideoAsset | null) => {
    const v1 = video1?.duration || 0;
    const v2 = video2?.duration || 0;

    if (mode === BGMMode.VIDEO1_ONLY) {
      return v1;
    }
    if (mode === BGMMode.VIDEO2_ONLY) {
      return v2;
    }
    return v1 + v2;
  };

  const getBgmTargetDuration = () => {
    if (!config.bgm) {
      return 0;
    }
    const duration = getClipDuration(config.bgm.mode, config.video1, config.video2);
    return duration > 0 ? duration : 30;
  };

  const clampBgmToTarget = (bgm: BGMAsset, targetDuration: number) => {
    if (targetDuration <= 0) {
      return {
        ...bgm,
        startTime: 0,
        playLength: Math.max(1, bgm.playLength || 1),
      };
    }
    const playLength = Math.min(Math.max(1, bgm.playLength), targetDuration);
    const maxStart = Math.max(0, targetDuration - playLength);
    const startTime = Math.min(Math.max(0, bgm.startTime), maxStart);
    return {
      ...bgm,
      playLength,
      startTime,
    };
  };

  useEffect(() => {
    setConfig((prev) => ({
      ...prev,
      video1: previewVideo1,
      video2: previewVideo2,
    }));
  }, [previewVideo1, previewVideo2]);

  useEffect(() => {
    const v1Dur = previewVideo1?.duration || 0;
    const v2Dur = previewVideo2?.duration || 0;
    const totalSec = v1Dur + v2Dur || 20;
    setTotalFrames(Math.floor(totalSec * 24));
  }, [previewVideo1, previewVideo2]);

  useEffect(() => {
    setBgmStartMode('beginning');
    setBgmLengthMode('full');
  }, [config.bgm?.id]);

  useEffect(() => {
    if (!config.bgm) {
      return;
    }
    if (!previewVideo2 && config.bgm.mode === BGMMode.VIDEO2_ONLY) {
      setConfig((prev) => ({
        ...prev,
        bgm: prev.bgm ? { ...prev.bgm, mode: BGMMode.VIDEO1_ONLY, startTime: 0 } : null,
      }));
      return;
    }
    const targetDuration = getBgmTargetDuration();
    let next = config.bgm;
    if (bgmLengthMode === 'full') {
      next = { ...next, playLength: next.duration || next.playLength };
    }
    next = clampBgmToTarget(next, targetDuration);
    if (bgmStartMode === 'beginning') {
      next = { ...next, startTime: 0 };
    }
    if (bgmStartMode === 'end') {
      next = { ...next, startTime: Math.max(0, targetDuration - next.playLength) };
    }
    const clamped = clampBgmToTarget(next, targetDuration);
    if (clamped.playLength !== config.bgm.playLength || clamped.startTime !== config.bgm.startTime) {
      setConfig((prev) => ({
        ...prev,
        bgm: prev.bgm ? clamped : null,
      }));
    }
  }, [
    previewVideo1,
    previewVideo2,
    config.bgm?.mode,
    config.bgm?.duration,
    config.bgm?.playLength,
    config.bgm?.startTime,
    bgmStartMode,
    bgmLengthMode,
  ]);

  const selectFromLibrary = (asset: LibraryAsset) => {
    setConfig(prev => ({
      ...prev,
      bgm: {
        id: asset.id,
        name: asset.name,
        url: asset.url,
        duration: asset.duration,
        startTime: 0,
        playLength: 30,
        volumeDb: 0,
        mode: BGMMode.FULL,
        loop: false
      }
    }));
    setShowLibraryPicker(false);
  };

  const createVideoAsset = async (file: File): Promise<VideoAsset> => {
    const url = URL.createObjectURL(file);
    const assetId = Math.random().toString(36).substr(2, 9);
    saveMediaBlob(assetId, file).catch((error) => {
      console.warn('[media] Failed to persist asset.', error);
    });
    const duration = await getMediaDuration(file);
    const safeDuration = duration > 0 ? duration : 15;
    return {
      id: assetId,
      name: file.name,
      url,
      duration: safeDuration,
    };
  };

  const createBgmAsset = async (file: File): Promise<BGMAsset> => {
    const url = URL.createObjectURL(file);
    const assetId = Math.random().toString(36).substr(2, 9);
    saveMediaBlob(assetId, file).catch((error) => {
      console.warn('[media] Failed to persist asset.', error);
    });
    const duration = await getMediaDuration(file);
    const safeDuration = duration > 0 ? duration : 180;
    return {
      id: assetId,
      name: file.name,
      url,
      duration: safeDuration,
      startTime: 0,
      playLength: 30,
      volumeDb: 0,
      mode: BGMMode.FULL,
      loop: false,
    };
  };

  const appendVideoAssets = (target: 'video1' | 'video2', assets: VideoAsset[]) => {
    if (assets.length === 0) {
      return;
    }
    if (target === 'video1') {
      setBatchVideo1((prev) => [...prev, ...assets]);
      return;
    }
    setBatchVideo2((prev) => [...prev, ...assets]);
  };

  const importVideoFiles = async (target: 'video1' | 'video2', files: File[]) => {
    const assets: VideoAsset[] = [];
    for (const file of files) {
      const asset = await createVideoAsset(file);
      assets.push(asset);
    }
    appendVideoAssets(target, assets);
  };

  const importBgmFile = async (file: File) => {
    const newBgm = await createBgmAsset(file);
    setConfig((prev) => ({ ...prev, bgm: newBgm }));
    onAddToLibrary({
      id: newBgm.id,
      name: newBgm.name,
      url: newBgm.url,
      duration: newBgm.duration,
      addedAt: Date.now(),
    });
  };

  const handleFileUpload = (type: 'video1' | 'video2' | 'bgm') => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) {
      return;
    }

    setDropError(null);

    if (type === 'bgm') {
      await importBgmFile(files[0]);
      return;
    }

    const videoFiles = files.filter((file) => file.type.startsWith('video/'));
    if (videoFiles.length === 0) {
      setDropError('Only video files can be added here.');
      return;
    }
    if (videoFiles.length < files.length) {
      setDropError('Some files were skipped (only video files are allowed).');
    }
    await importVideoFiles(type, videoFiles);
  };

  const getDroppedFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.files || []);

  const getDroppedLibraryAssetId = (e: React.DragEvent) => {
    const raw = e.dataTransfer.getData('application/x-heygen-library-asset-id');
    return raw ? raw : null;
  };

  const handleDrop = (target: 'video1' | 'video2' | 'bgm') => async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverTarget(null);

    const libraryAssetId = target === 'bgm' ? getDroppedLibraryAssetId(e) : null;
    if (libraryAssetId) {
      const asset = library.find((item) => item.id === libraryAssetId);
      if (!asset) {
        setDropError('That library asset is no longer available. Please refresh and try again.');
        return;
      }
      setDropError(null);
      selectFromLibrary(asset);
      return;
    }

    const files = getDroppedFiles(e);
    if (files.length === 0) {
      return;
    }

    if (target === 'bgm') {
      const audioFiles = files.filter((file) => file.type.startsWith('audio/'));
      if (audioFiles.length === 0) {
        setDropError('Only audio files can be dropped here.');
        return;
      }
      if (audioFiles.length > 1) {
        setDropError('Please drop only one audio file at a time.');
      }
      if (config.bgm) {
        const confirmed = window.confirm(`Replace "${config.bgm.name}" with "${audioFiles[0].name}"?`);
        if (!confirmed) {
          return;
        }
      }
      try {
        setDropError(null);
        await importBgmFile(audioFiles[0]);
      } catch (error) {
        setDropError(error instanceof Error ? error.message : 'Unable to import file.');
      }
      return;
    }

    const videoFiles = files.filter((file) => file.type.startsWith('video/'));
    if (videoFiles.length === 0) {
      setDropError('Only video files can be dropped here.');
      return;
    }
    if (videoFiles.length < files.length) {
      setDropError('Some files were skipped (only video files are allowed).');
    } else {
      setDropError(null);
    }
    try {
      await importVideoFiles(target, videoFiles);
    } catch (error) {
      setDropError(error instanceof Error ? error.message : 'Unable to import file.');
    }
  };

  const handleDragEnter = (target: 'video1' | 'video2' | 'bgm') => (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverTarget(target);
  };

  const handleDragOver = (target: 'video1' | 'video2' | 'bgm') => (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragOverTarget !== target) {
      setDragOverTarget(target);
    }
  };

  const handleDragLeave = (target: 'video1' | 'video2' | 'bgm') => (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragOverTarget === target) {
      setDragOverTarget(null);
    }
  };

  const moveBatchItem = (target: 'video1' | 'video2', index: number, delta: number) => {
    if (delta === 0) {
      return;
    }
    if (target === 'video1') {
      setBatchVideo1((prev) => {
        const next = [...prev];
        const newIndex = index + delta;
        if (newIndex < 0 || newIndex >= next.length) {
          return prev;
        }
        const [item] = next.splice(index, 1);
        next.splice(newIndex, 0, item);
        return next;
      });
      return;
    }
    setBatchVideo2((prev) => {
      const next = [...prev];
      const newIndex = index + delta;
      if (newIndex < 0 || newIndex >= next.length) {
        return prev;
      }
      const [item] = next.splice(index, 1);
      next.splice(newIndex, 0, item);
      return next;
    });
  };

  const removeBatchItem = (target: 'video1' | 'video2', id: string) => {
    if (target === 'video1') {
      setBatchVideo1((prev) => prev.filter((item) => item.id !== id));
      return;
    }
    setBatchVideo2((prev) => prev.filter((item) => item.id !== id));
  };

  const clearBatch = (target: 'video1' | 'video2') => {
    if (target === 'video1') {
      setBatchVideo1([]);
      return;
    }
    setBatchVideo2([]);
  };

  const buildBatchPairs = () =>
    batchVideo1.map((video1, index) => ({
      video1,
      video2: batchVideo2[index] ?? null,
    }));

  const clearAudioTimers = () => {
    if (audioTimers.current.start) {
      window.clearTimeout(audioTimers.current.start);
    }
    if (audioTimers.current.stop) {
      window.clearTimeout(audioTimers.current.stop);
    }
    audioTimers.current = {};
  };

  const stopPreviewAudio = () => {
    clearAudioTimers();
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    audio.pause();
    audio.currentTime = 0;
  };

  const ensureAudioGraph = () => {
    const audio = audioRef.current;
    if (!audio || typeof window === 'undefined') {
      return null;
    }
    const AudioContextClass =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) {
      return null;
    }
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextClass();
    }
    const context = audioContextRef.current;
    if (!audioGainRef.current) {
      audioGainRef.current = context.createGain();
      audioGainRef.current.gain.value = 1;
      audioGainRef.current.connect(context.destination);
    }
    if (!audioSourceRef.current || audioElementRef.current !== audio) {
      if (audioSourceRef.current) {
        audioSourceRef.current.disconnect();
      }
      audioSourceRef.current = context.createMediaElementSource(audio);
      audioSourceRef.current.connect(audioGainRef.current);
      audioElementRef.current = audio;
    }
    audio.volume = 1;
    return { context, gain: audioGainRef.current };
  };

  const setPreviewGain = (gain: number) => {
    const graph = ensureAudioGraph();
    const clamped = Math.max(0, gain);
    if (!graph) {
      const audio = audioRef.current;
      if (audio) {
        audio.volume = Math.min(1, clamped);
      }
      return;
    }
    const now = graph.context.currentTime;
    graph.gain.gain.cancelScheduledValues(now);
    graph.gain.gain.setValueAtTime(graph.gain.gain.value, now);
    graph.gain.gain.linearRampToValueAtTime(clamped, now + 0.03);
  };

  const startPreviewAudio = (settings: { delayMs: number; playLength: number; loop: boolean; gain: number }) => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    stopPreviewAudio();
    const targetGain = Math.max(0, settings.gain);
    const shouldDelay = settings.delayMs > 0;
    if (shouldDelay) {
      setPreviewGain(0);
    } else {
      setPreviewGain(targetGain);
    }
    audio.loop = settings.loop;
    audio.currentTime = 0;

    const start = () => {
      audio.play().catch(() => {
        // Browser may block autoplay; user interaction will retry on next change.
      });
      if (shouldDelay) {
        audioTimers.current.start = window.setTimeout(() => {
          setPreviewGain(targetGain);
        }, settings.delayMs);
      }
      if (settings.playLength > 0) {
        const stopDelay = settings.delayMs + settings.playLength * 1000;
        audioTimers.current.stop = window.setTimeout(() => {
          audio.pause();
          audio.currentTime = 0;
        }, stopDelay);
      }
    };

    start();
  };

  const updateBgm = (updates: Partial<BGMAsset>) => {
    setConfig((prev) => {
      if (!prev.bgm) {
        return prev;
      }
      const next = { ...prev.bgm, ...updates };
      if (typeof updates.volumeDb === 'number') {
        next.volumeDb = clampDb(updates.volumeDb);
      }
      return {
        ...prev,
        bgm: next,
      };
    });
  };

  const handleBgmModeChange = (mode: BGMMode) => {
    if (!config.bgm) {
      return;
    }
    const targetDuration = getClipDuration(mode, config.video1, config.video2) || 0;
    const clamped = clampBgmToTarget({ ...config.bgm, mode }, targetDuration);
    updateBgm(clamped);
  };

  const handleBgmLengthModeChange = (mode: 'full' | 'custom') => {
    if (!config.bgm) {
      return;
    }
    setBgmLengthMode(mode);
    if (mode === 'full') {
      const targetDuration = getBgmTargetDuration();
      const clamped = clampBgmToTarget({ ...config.bgm, playLength: config.bgm.duration || config.bgm.playLength }, targetDuration);
      updateBgm(clamped);
    }
  };

  const handleBgmStartModeChange = (mode: 'beginning' | 'end' | 'custom') => {
    if (!config.bgm) {
      return;
    }
    setBgmStartMode(mode);
    const targetDuration = getBgmTargetDuration();
    if (mode === 'beginning') {
      updateBgm({ startTime: 0 });
      return;
    }
    if (mode === 'end') {
      const playLength = Math.min(config.bgm.playLength, targetDuration);
      updateBgm({ startTime: Math.max(0, targetDuration - playLength) });
      return;
    }
  };

  const handleBgmLengthChange = (value: number) => {
    if (!config.bgm) {
      return;
    }
    setBgmLengthMode('custom');
    const targetDuration = getBgmTargetDuration();
    const clamped = clampBgmToTarget({ ...config.bgm, playLength: value }, targetDuration);
    updateBgm(clamped);
  };

  const handleBgmStartChange = (value: number) => {
    if (!config.bgm) {
      return;
    }
    setBgmStartMode('custom');
    const targetDuration = getBgmTargetDuration();
    const clamped = clampBgmToTarget({ ...config.bgm, startTime: value }, targetDuration);
    updateBgm(clamped);
  };

  const handleBgmLoopToggle = () => {
    if (!config.bgm) {
      return;
    }
    if (config.bgm.duration > 0 && config.bgm.playLength > config.bgm.duration) {
      return;
    }
    const shouldEnable = !config.bgm.loop;
    updateBgm({ loop: shouldEnable });
  };

  const handleAdd = () => {
    if (batchVideo1.length === 0) {
      alert('Validation: Clip 1 is required for batch generation.');
      return;
    }
    const pairs = buildBatchPairs();
    if (pairs.length === 0) {
      return;
    }

    const baseName = config.name.trim() || `Composition_${new Date().toLocaleTimeString()}`;
    const items = pairs.map((pair, index) => {
      const rawLabel = pair.video1?.name || pair.video2?.name || `clip_${index + 1}`;
      const label = rawLabel.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 40);
      const targetDuration = config.bgm ? getClipDuration(config.bgm.mode, pair.video1, pair.video2) : 0;
      const bgm = config.bgm ? clampBgmToTarget({ ...config.bgm }, targetDuration) : null;
      return {
        ...config,
        id: '',
        name: `${baseName}_${index + 1}_${label}`,
        video1: pair.video1,
        video2: pair.video2,
        bgm,
      };
    });

    onEnqueue(items);
    setConfig({
      id: '',
      name: `Composition_${new Date().toLocaleTimeString()}`,
      video1: null,
      video2: null,
      bgm: null,
      exportQuality: '1080p',
      status: 'PENDING',
      progress: 0
    });
    setBatchVideo1([]);
    setBatchVideo2([]);
  };

  const handlePreviewClick = () => {
    if (!audioUnlocked) {
      setAudioUnlocked(true);
    }
    const graph = ensureAudioGraph();
    if (graph && graph.context.state === 'suspended') {
      graph.context.resume().catch(() => {
        // ignore resume failures from autoplay policies
      });
    }
    if (previewAudioSettings) {
      audioKickoff.current = true;
      startPreviewAudio({
        delayMs: previewAudioSettings.delayMs,
        playLength: previewAudioSettings.playLength,
        loop: previewAudioSettings.loop,
        gain: previewAudioSettings.gain,
      });
    }
    const video = videoRef.current;
    if (video) {
      video.muted = false;
      video.currentTime = 0;
      video.play().catch(() => {
        // ignore autoplay restrictions
      });
    }
  };

  const bgmTargetDuration = config.bgm ? getBgmTargetDuration() : 0;
  const bgmDuration = config.bgm?.duration || 0;
  const bgmAutoLoop = config.bgm ? bgmDuration > 0 && config.bgm.playLength > bgmDuration : false;
  const bgmLoopActive = config.bgm ? config.bgm.loop || bgmAutoLoop : false;
  const bgmLoopLocked = bgmAutoLoop;
  const bgmPlayLengthMax = Math.max(1, Math.round(bgmTargetDuration || 0));
  const bgmStartTimeMax = Math.max(0, Math.round((bgmTargetDuration || 0) - (config.bgm?.playLength || 0)));
  const bgmStartTime = config.bgm?.startTime || 0;
  const batchPairs = buildBatchPairs();
  const ignoredClip2Count = Math.max(0, batchVideo2.length - batchVideo1.length);
  const batchQueueLabel =
    batchPairs.length > 0
      ? `Queue ${batchPairs.length} Item${batchPairs.length > 1 ? 's' : ''}`
      : 'Queue Items';
  const clip2Available = Boolean(previewVideo2);
  const bgmModeOptions = [
    { value: BGMMode.VIDEO1_ONLY, label: 'Clip 1', disabled: false },
    { value: BGMMode.VIDEO2_ONLY, label: 'Clip 2', disabled: !clip2Available },
    { value: BGMMode.FULL, label: 'Both', disabled: false },
  ] as const;
  const previewClipType: 'video1' | 'video2' | null = (() => {
    if (config.bgm?.mode === BGMMode.VIDEO2_ONLY && previewVideo2) {
      return 'video2';
    }
    if (
      config.bgm?.mode === BGMMode.FULL &&
      previewVideo1 &&
      previewVideo2 &&
      config.bgm.startTime >= (previewVideo1.duration || 0)
    ) {
      return 'video2';
    }
    if (previewVideo1) {
      return 'video1';
    }
    if (previewVideo2) {
      return 'video2';
    }
    return null;
  })();
  const previewClip = previewClipType === 'video2' ? previewVideo2 : previewClipType === 'video1' ? previewVideo1 : null;
  const previewClipDuration = previewClip?.duration || 0;
  const previewLabel = previewClipType === 'video2' ? 'Clip 2' : 'Clip 1';

  const previewAudioSettings = (() => {
    if (!config.bgm || !previewClip || !config.bgm.url) {
      return null;
    }
    if (config.bgm.mode === BGMMode.VIDEO1_ONLY && previewClipType !== 'video1') {
      return null;
    }
    if (config.bgm.mode === BGMMode.VIDEO2_ONLY && previewClipType !== 'video2') {
      return null;
    }
    let startTime = config.bgm.startTime || 0;
    if (config.bgm.mode === BGMMode.FULL && previewClipType === 'video2' && previewVideo1) {
      startTime = Math.max(0, startTime - (previewVideo1.duration || 0));
    }
    const maxPlay = Math.max(0, previewClipDuration - startTime);
    const playLength = Math.min(config.bgm.playLength, maxPlay);
    if (playLength <= 0) {
      return null;
    }
    return {
      delayMs: startTime * 1000,
      playLength,
      loop: bgmLoopActive,
      gain: dbToGain(config.bgm.volumeDb),
    };
  })();
  const previewAudioActive = audioUnlocked && Boolean(previewAudioSettings);
  const previewDelayMs = previewAudioSettings?.delayMs ?? 0;
  const previewPlayLength = previewAudioSettings?.playLength ?? 0;
  const previewLoop = previewAudioSettings?.loop ?? false;
  const previewGain = previewAudioSettings?.gain ?? 0;

  useEffect(() => {
    if (!audioUnlocked || !previewAudioActive || !config.bgm?.url) {
      stopPreviewAudio();
      return;
    }
    if (audioKickoff.current) {
      audioKickoff.current = false;
      return;
    }
    startPreviewAudio({
      delayMs: previewDelayMs,
      playLength: previewPlayLength,
      loop: previewLoop,
      gain: previewGain,
    });
    return () => {
      stopPreviewAudio();
    };
  }, [
    audioUnlocked,
    previewAudioActive,
    previewDelayMs,
    previewPlayLength,
    previewLoop,
    previewGain,
    config.bgm?.url,
  ]);

  useEffect(() => {
    if (!audioUnlocked) {
      return;
    }
    const video = videoRef.current;
    if (!video) {
      return;
    }
    video.muted = false;
    video.currentTime = 0;
    video.play().catch(() => {
      // ignore autoplay restrictions
    });
  }, [audioUnlocked, previewClip?.id]);

  return (
    <div className="max-w-[1400px] mx-auto p-8 animate-fadeIn relative">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10 pb-8 border-b border-slate-100">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
             <h1 className="text-3xl font-black text-slate-900 tracking-tight italic">HEYGEN <span className="text-blue-600 not-italic">CMS</span></h1>
             <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-[10px] font-bold rounded-md border border-blue-100 uppercase tracking-widest">v2.5.0-Stable</span>
          </div>
          <p className="text-slate-500 text-sm max-w-lg">
            High-fidelity video engine. Prepare your clips and add them to the <span className="font-bold text-blue-600">Batch Queue</span> for bulk processing.
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <input 
              type="text" 
              value={config.name} 
              onChange={(e) => setConfig({...config, name: e.target.value})}
              className="block bg-transparent text-right text-sm font-bold text-slate-700 outline-none border-b border-transparent focus:border-blue-400"
            />
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Composition Label</p>
          </div>
          <button
            onClick={handleAdd}
            className="group flex items-center gap-3 px-8 py-4 rounded-2xl font-bold shadow-xl transition-all active:scale-95 bg-blue-600 text-white hover:bg-blue-700 shadow-blue-100 border-b-4 border-blue-800"
          >
            <ICONS.Download className="w-5 h-5" /> {batchQueueLabel}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        <div className="xl:col-span-4 space-y-6">
          <section className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-3">
              <div className="w-1.5 h-4 bg-blue-600 rounded-full"></div> Asset Configuration
            </h2>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase">1. Intro Clip</label>
                <div
                  onDragEnter={handleDragEnter('video1')}
                  onDragOver={handleDragOver('video1')}
                  onDragLeave={handleDragLeave('video1')}
                  onDrop={handleDrop('video1')}
                  className={`relative border-2 border-dashed rounded-2xl p-4 transition-all ${
                    dragOverTarget === 'video1'
                      ? 'border-blue-600 bg-blue-50/50'
                      : batchVideo1.length > 0
                        ? 'border-blue-500 bg-blue-50/30'
                        : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {batchVideo1.length > 0 ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-500">
                          <ICONS.Video className="w-3 h-3 text-blue-500" />
                          {batchVideo1.length} clip{batchVideo1.length > 1 ? 's' : ''} loaded
                        </div>
                        <button
                          onClick={() => clearBatch('video1')}
                          className="text-[10px] font-black text-red-400 hover:text-red-600 transition-colors"
                        >
                          Clear
                        </button>
                      </div>
                      <div className="max-h-28 overflow-y-auto space-y-1 pr-1">
                        {batchVideo1.map((asset, index) => (
                          <div key={asset.id} className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-bold text-slate-700 truncate">
                              {index + 1}. {asset.name}
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => moveBatchItem('video1', index, -1)}
                                disabled={index === 0}
                                className="text-[9px] font-black text-slate-300 hover:text-slate-500 disabled:opacity-40"
                              >
                                Up
                              </button>
                              <button
                                onClick={() => moveBatchItem('video1', index, 1)}
                                disabled={index === batchVideo1.length - 1}
                                className="text-[9px] font-black text-slate-300 hover:text-slate-500 disabled:opacity-40"
                              >
                                Down
                              </button>
                              <button
                                onClick={() => removeBatchItem('video1', asset.id)}
                                className="text-[9px] font-black text-red-400 hover:text-red-600"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 cursor-pointer">
                        <input type="file" accept="video/*" multiple onChange={handleFileUpload('video1')} className="hidden" />
                        <ICONS.Download className="w-4 h-4 text-slate-200" />
                        Add more clips
                      </label>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center py-4 cursor-pointer">
                      <input type="file" accept="video/*" multiple onChange={handleFileUpload('video1')} className="hidden" />
                      <ICONS.Download className="w-5 h-5 text-slate-200 mb-1" />
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Select Intro Clips</span>
                      <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest mt-1">or drop multiple videos</span>
                    </label>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase">2. Body Clip (Optional)</label>
                <div
                  onDragEnter={handleDragEnter('video2')}
                  onDragOver={handleDragOver('video2')}
                  onDragLeave={handleDragLeave('video2')}
                  onDrop={handleDrop('video2')}
                  className={`relative border-2 border-dashed rounded-2xl p-4 transition-all ${
                    dragOverTarget === 'video2'
                      ? 'border-blue-600 bg-blue-50/50'
                      : batchVideo2.length > 0
                        ? 'border-blue-500 bg-blue-50/30'
                        : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {batchVideo2.length > 0 ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-500">
                          <ICONS.Video className="w-3 h-3 text-blue-500" />
                          {batchVideo2.length} clip{batchVideo2.length > 1 ? 's' : ''} loaded
                        </div>
                        <button
                          onClick={() => clearBatch('video2')}
                          className="text-[10px] font-black text-red-400 hover:text-red-600 transition-colors"
                        >
                          Clear
                        </button>
                      </div>
                      <div className="max-h-28 overflow-y-auto space-y-1 pr-1">
                        {batchVideo2.map((asset, index) => (
                          <div key={asset.id} className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-bold text-slate-700 truncate">
                              {index + 1}. {asset.name}
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => moveBatchItem('video2', index, -1)}
                                disabled={index === 0}
                                className="text-[9px] font-black text-slate-300 hover:text-slate-500 disabled:opacity-40"
                              >
                                Up
                              </button>
                              <button
                                onClick={() => moveBatchItem('video2', index, 1)}
                                disabled={index === batchVideo2.length - 1}
                                className="text-[9px] font-black text-slate-300 hover:text-slate-500 disabled:opacity-40"
                              >
                                Down
                              </button>
                              <button
                                onClick={() => removeBatchItem('video2', asset.id)}
                                className="text-[9px] font-black text-red-400 hover:text-red-600"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 cursor-pointer">
                        <input type="file" accept="video/*" multiple onChange={handleFileUpload('video2')} className="hidden" />
                        <ICONS.Download className="w-4 h-4 text-slate-200" />
                        Add more clips
                      </label>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center py-4 cursor-pointer">
                      <input type="file" accept="video/*" multiple onChange={handleFileUpload('video2')} className="hidden" />
                      <ICONS.Download className="w-5 h-5 text-slate-200 mb-1" />
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Select Body Clips</span>
                      <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest mt-1">or drop multiple videos</span>
                    </label>
                  )}
                </div>
              </div>
              {dropError && (
                <div className="text-[10px] font-bold text-red-500 bg-red-50 border border-red-100 rounded-2xl px-4 py-3">
                  {dropError}
                </div>
              )}
            </div>
          </section>

          <section className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-3">
                <div className="w-1.5 h-4 bg-blue-300 rounded-full"></div> Batch Pairing
              </h2>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                {batchPairs.length} item{batchPairs.length === 1 ? '' : 's'}
              </span>
            </div>
            {batchPairs.length === 0 ? (
              <p className="text-[10px] font-bold text-slate-400">Drop clips into Clip 1 to generate a batch.</p>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-3 text-[9px] font-black uppercase tracking-widest text-slate-400">
                  <span>Clip 1</span>
                  <span>Clip 2 (Optional)</span>
                </div>
                <div className="max-h-32 overflow-y-auto space-y-1 pr-1">
                  {batchPairs.map((pair, index) => (
                    <div key={`${pair.video1.id}-${index}`} className="grid grid-cols-2 gap-3 text-[10px] font-bold text-slate-700">
                      <span className="truncate">{pair.video1.name}</span>
                      <span className="truncate text-slate-500">{pair.video2?.name || '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {ignoredClip2Count > 0 && (
              <div className="text-[10px] font-bold text-amber-500 bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3">
                {ignoredClip2Count} clip{ignoredClip2Count > 1 ? 's' : ''} in Clip 2 have no matching Clip 1 and will be ignored.
              </div>
            )}
          </section>

          <section className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-3">
                 <div className="w-1.5 h-4 bg-blue-400 rounded-full"></div> Audio Logic
              </h2>
              {library.length > 0 && !config.bgm && (
                <button 
                  onClick={() => setShowLibraryPicker(true)}
                  className="text-[10px] font-bold text-blue-600 hover:underline flex items-center gap-1"
                >
                  <ICONS.Music className="w-3 h-3" /> Pick from Library
                </button>
              )}
            </div>
            
            {config.bgm ? (
              <div className="space-y-6">
                <div
                  onDragEnter={handleDragEnter('bgm')}
                  onDragOver={handleDragOver('bgm')}
                  onDragLeave={handleDragLeave('bgm')}
                  onDrop={handleDrop('bgm')}
                  className={`p-3 rounded-xl border flex items-center justify-between transition-all ${
                    dragOverTarget === 'bgm'
                      ? 'bg-purple-50 border-purple-300 border-dashed'
                      : 'bg-slate-50 border-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <ICONS.Music className="w-4 h-4 text-blue-500" />
                    <span className="text-[10px] font-bold truncate text-slate-600">{config.bgm.name}</span>
                  </div>
                  <button onClick={() => setConfig(prev => ({...prev, bgm: null}))} className="text-[10px] font-bold text-red-400 hover:text-red-600 transition-colors">Remove</button>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-[10px] font-black uppercase text-slate-400">
                      <span>Target Clip</span>
                      <span className="text-blue-600">{bgmModeOptions.find((item) => item.value === config.bgm.mode)?.label}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {bgmModeOptions.map((item) => (
                        <button
                          key={item.value}
                          onClick={() => handleBgmModeChange(item.value)}
                          disabled={item.disabled}
                          className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                            config.bgm.mode === item.value
                              ? 'bg-blue-600 text-white border-blue-700 shadow-sm'
                              : 'bg-white text-slate-400 border-slate-200 hover:border-blue-200 hover:text-blue-600'
                          } ${item.disabled ? 'opacity-50 cursor-not-allowed hover:border-slate-200 hover:text-slate-400' : ''}`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-[10px] font-black uppercase text-slate-400">
                      <span>Length</span>
                      <span className="text-blue-600">{Math.round(config.bgm.playLength)}s</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleBgmLengthModeChange('full')}
                        className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                          bgmLengthMode === 'full'
                            ? 'bg-blue-600 text-white border-blue-700 shadow-sm'
                            : 'bg-white text-slate-400 border-slate-200 hover:border-blue-200 hover:text-blue-600'
                        }`}
                      >
                        Full Track
                      </button>
                      <button
                        onClick={() => handleBgmLengthModeChange('custom')}
                        className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                          bgmLengthMode === 'custom'
                            ? 'bg-blue-600 text-white border-blue-700 shadow-sm'
                            : 'bg-white text-slate-400 border-slate-200 hover:border-blue-200 hover:text-blue-600'
                        }`}
                      >
                        Custom Length
                      </button>
                    </div>
                    {bgmLengthMode === 'custom' ? (
                      <input
                        type="range"
                        min="1"
                        max={bgmPlayLengthMax}
                        step="1"
                        value={config.bgm.playLength}
                        onChange={(e) => handleBgmLengthChange(parseInt(e.target.value))}
                        className="w-full h-1.5 bg-slate-100 rounded-full appearance-none cursor-pointer accent-blue-600"
                      />
                    ) : (
                      <div className="text-[10px] font-bold text-slate-400">
                        Using the full track length.
                      </div>
                    )}
                    <div className="flex justify-between text-[10px] font-bold text-slate-400">
                      <span>Target: {Math.round(bgmTargetDuration || 0)}s</span>
                      <span>Audio: {Math.round(bgmDuration || 0)}s</span>
                    </div>
                    {bgmLengthMode === 'full' && bgmDuration > bgmTargetDuration && (
                      <div className="text-[10px] font-bold text-amber-500 bg-amber-50 border border-amber-100 rounded-2xl px-3 py-2">
                        Track is longer than the target clip. It will be trimmed to fit.
                      </div>
                    )}
                    {bgmAutoLoop && (
                      <div className="flex items-center gap-2 text-[10px] font-bold text-blue-600 bg-blue-50 rounded-lg px-2 py-1 border border-blue-100">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-600"></div>
                        Auto-looping enabled because length exceeds the track.
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-[10px] font-black uppercase text-slate-400">
                      <span>Start</span>
                      <span className="text-blue-600">{bgmStartTime}s</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={() => handleBgmStartModeChange('beginning')}
                        className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                          bgmStartMode === 'beginning'
                            ? 'bg-blue-600 text-white border-blue-700 shadow-sm'
                            : 'bg-white text-slate-400 border-slate-200 hover:border-blue-200 hover:text-blue-600'
                        }`}
                      >
                        Beginning
                      </button>
                      <button
                        onClick={() => handleBgmStartModeChange('end')}
                        className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                          bgmStartMode === 'end'
                            ? 'bg-blue-600 text-white border-blue-700 shadow-sm'
                            : 'bg-white text-slate-400 border-slate-200 hover:border-blue-200 hover:text-blue-600'
                        }`}
                      >
                        End
                      </button>
                      <button
                        onClick={() => handleBgmStartModeChange('custom')}
                        className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                          bgmStartMode === 'custom'
                            ? 'bg-blue-600 text-white border-blue-700 shadow-sm'
                            : 'bg-white text-slate-400 border-slate-200 hover:border-blue-200 hover:text-blue-600'
                        }`}
                      >
                        Custom
                      </button>
                    </div>
                    {bgmStartMode === 'custom' ? (
                      <>
                        <input
                          type="range"
                          min="0"
                          max={bgmStartTimeMax}
                          step="1"
                          value={bgmStartTime}
                          onChange={(e) => handleBgmStartChange(parseInt(e.target.value))}
                          className="w-full h-1.5 bg-slate-100 rounded-full appearance-none cursor-pointer accent-blue-600"
                        />
                        <div className="flex justify-between text-[10px] font-bold text-slate-400">
                          <span>Max Start: {bgmStartTimeMax}s</span>
                          <span>Target: {Math.round(bgmTargetDuration || 0)}s</span>
                        </div>
                        <div className="text-[10px] font-bold text-slate-400">
                          Pick exactly where the music should begin within the target.
                        </div>
                      </>
                    ) : bgmStartMode === 'end' ? (
                      <div className="space-y-1 text-[10px] font-bold text-slate-400">
                        <p>Starts the music so it finishes at the end using the selected length.</p>
                        {bgmLengthMode === 'custom' && (
                          <p className="text-amber-500">
                            End uses your custom length. Switch to Full Track to place the entire song.
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="text-[10px] font-bold text-slate-400">
                        Starts at the beginning of the target clip.
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-[10px] font-black uppercase text-slate-400">
                      <span>Loop</span>
                      <span className="text-blue-600">{bgmLoopActive ? 'On' : 'Off'}</span>
                    </div>
                    <button
                      onClick={handleBgmLoopToggle}
                      disabled={bgmLoopLocked}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border text-[10px] font-black uppercase tracking-widest transition-all ${
                        bgmLoopActive
                          ? 'bg-blue-600 text-white border-blue-700'
                          : 'bg-white text-slate-400 border-slate-200 hover:border-blue-200 hover:text-blue-600'
                      } ${bgmLoopLocked ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      <span>{bgmLoopLocked ? 'Auto-Looping Forced' : bgmLoopActive ? 'Looping Enabled' : 'Looping Disabled'}</span>
                      <span className="text-[9px] font-black">
                        {bgmLoopLocked ? 'AUTO' : bgmLoopActive ? 'ON' : 'OFF'}
                      </span>
                    </button>
                  </div>

                  <div className="space-y-2 pt-2">
                    <div className="flex justify-between text-[10px] font-black uppercase text-slate-400">
                      <span>Volume</span>
                      <span className="text-blue-600">{formatDb(config.bgm.volumeDb)}</span>
                    </div>
                    <input
                      type="range"
                      min={-20}
                      max={20}
                      step={1}
                      value={config.bgm.volumeDb}
                      onChange={(e) => updateBgm({ volumeDb: Math.round(parseFloat(e.target.value)) })}
                      className="w-full h-1.5 bg-slate-100 rounded-full appearance-none cursor-pointer accent-blue-600"
                    />
                    <div className="text-[10px] font-bold text-slate-400">
                      0 dB = original volume. Boosts above 0 dB may clip.
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <label
                onDragEnter={handleDragEnter('bgm')}
                onDragOver={handleDragOver('bgm')}
                onDragLeave={handleDragLeave('bgm')}
                onDrop={handleDrop('bgm')}
                className={`flex flex-col items-center justify-center py-8 cursor-pointer border-2 border-dashed rounded-2xl transition-colors ${
                  dragOverTarget === 'bgm'
                    ? 'border-purple-500 bg-purple-50/50'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input type="file" accept="audio/*" onChange={handleFileUpload('bgm')} className="hidden" />
                <ICONS.Music className="w-8 h-8 text-slate-200 mb-2" />
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Incorporate BGM Track</span>
                <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest mt-1">drop audio / drag from library</span>
              </label>
            )}
          </section>
        </div>

        <div className="xl:col-span-8 space-y-8">
          <section
            onClick={handlePreviewClick}
            className={`bg-slate-950 rounded-[2.5rem] overflow-hidden aspect-video shadow-2xl border-[12px] border-slate-900 relative group ${
              config.bgm && !audioUnlocked ? 'cursor-pointer' : ''
            }`}
          >
            {previewClip ? (
              <div className="w-full h-full relative">
                <video ref={videoRef} src={previewClip.url} className="w-full h-full object-cover opacity-60" autoPlay muted={!audioUnlocked} loop />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                   <div className="px-6 py-2 bg-blue-600/20 backdrop-blur-xl border border-white/20 rounded-full text-white text-[10px] font-black tracking-[0.3em] uppercase">
                     Local Workspace Preview
                   </div>
                </div>
                {!audioUnlocked && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="px-5 py-2 bg-black/60 backdrop-blur-md border border-white/10 rounded-full text-white text-[10px] font-black uppercase tracking-widest">
                      Click preview to enable audio
                    </div>
                  </div>
                )}
                {config.bgm?.url && <audio ref={audioRef} src={config.bgm.url} preload="auto" />}
              </div>
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-[radial-gradient(circle_at_center,#1e293b_0%,#020617_100%)]">
                <p className="text-slate-600 font-mono text-[10px] tracking-widest font-bold uppercase">Ready for local asset injection</p>
              </div>
            )}
            
            <div className="absolute top-8 right-8 flex flex-col items-end gap-2">
               <div className="px-4 py-2 bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl text-white text-[10px] font-mono">
                 FPS: 24 | DUR: {Math.round(totalFrames / 24)}s{previewClip ? ` | ${previewLabel}` : ''}
               </div>
            </div>
          </section>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col gap-4">
                <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                   <div className="p-1.5 bg-blue-50 rounded text-blue-600"><ICONS.Settings className="w-3 h-3" /></div>
                   Dynamic Props JSON
                </h4>
                <pre className="flex-1 bg-slate-900 text-blue-400 p-4 rounded-2xl text-[10px] font-mono border border-slate-800 overflow-auto max-h-[160px]">
{JSON.stringify({
  template: "heygen-cms-v2",
  id: config.id || "TEMP",
  bgm: config.bgm ? {
    len: config.bgm.playLength,
    volDb: config.bgm.volumeDb,
    mode: config.bgm.mode,
    loop: bgmLoopActive,
    start: config.bgm.startTime
  } : null
}, null, 2)}
                </pre>
             </div>

             <div className="bg-blue-600 p-8 rounded-[2.5rem] text-white shadow-xl shadow-blue-100 flex flex-col justify-center">
                <h3 className="text-xl font-black mb-2 italic">PRODUCTION READY</h3>
                <p className="text-blue-100 text-[11px] leading-relaxed mb-6 font-medium">
                  When you add to queue, we snapshot these settings. You can then render 20+ videos sequentially with one click in the <span className="underline">Batch Queue</span> tab.
                </p>
                <div className="flex gap-4">
                   <div className="bg-white/10 rounded-xl p-3 flex-1 border border-white/10 text-center">
                      <p className="text-[8px] font-black uppercase text-white/50 mb-1 tracking-tighter">Render Engine</p>
                      <p className="text-xs font-bold">REMOTION 4.0</p>
                   </div>
                   <div className="bg-white/10 rounded-xl p-3 flex-1 border border-white/10 text-center">
                      <p className="text-[8px] font-black uppercase text-white/50 mb-1 tracking-tighter">Queue Limit</p>
                      <p className="text-xs font-bold">UNLIMITED</p>
                   </div>
                </div>
             </div>
          </div>
        </div>
      </div>

      {/* Library Selection Modal */}
      {showLibraryPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-950/20 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white w-full max-w-lg rounded-[2rem] shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[80vh]">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
               <h3 className="font-black text-slate-900 uppercase text-xs tracking-widest">Select From Library</h3>
               <button onClick={() => setShowLibraryPicker(false)} className="text-slate-400 hover:text-slate-600 text-sm font-bold">Close</button>
            </div>
            <div className="p-4 overflow-y-auto space-y-2">
               {library.map((asset) => (
                 <button 
                  key={asset.id}
                  onClick={() => selectFromLibrary(asset)}
                  className="w-full p-4 rounded-2xl hover:bg-blue-50 transition-all border border-transparent hover:border-blue-100 flex items-center justify-between group"
                 >
                   <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-blue-600 border border-slate-100 group-hover:bg-blue-600 group-hover:text-white transition-all">
                        <ICONS.Music className="w-5 h-5" />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-bold text-slate-800 truncate max-w-[200px]">{asset.name}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Library Asset • {(asset.duration / 60).toFixed(1)}m</p>
                      </div>
                   </div>
                   <ICONS.Check className="w-5 h-5 text-blue-600 opacity-0 group-hover:opacity-100" />
                 </button>
               ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
