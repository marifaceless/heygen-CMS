import { BGMMode, LibraryAsset, ProjectConfig, RenderStatus, VideoAsset, BGMAsset } from './types';
import { clampDb, gainToDb } from './audioLevels';
import { loadMediaUrl } from './mediaStore';

const STORAGE_KEY = 'heygen_cms_state';
const STORAGE_VERSION = 1;
const VALID_TABS = ['workstation', 'queue', 'library', 'config'] as const;
const VALID_STATUSES: RenderStatus[] = ['PENDING', 'RENDERING', 'COMPLETED', 'FAILED', 'CANCELLED'];
const VALID_QUALITIES = ['720p', '1080p', '4k'] as const;

type ActiveTab = (typeof VALID_TABS)[number];

export interface PersistedState {
  version: number;
  savedAt: string;
  activeTab: ActiveTab;
  queue: ProjectConfig[];
  library: LibraryAsset[];
}

export interface PersistedStateInput {
  activeTab: ActiveTab;
  queue: ProjectConfig[];
  library: LibraryAsset[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

const asNumber = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && !Number.isNaN(value) ? value : fallback;

const asBoolean = (value: unknown, fallback = false): boolean =>
  typeof value === 'boolean' ? value : fallback;

const sanitizeVideoAsset = (value: unknown): VideoAsset | null => {
  if (!isRecord(value)) {
    return null;
  }

  const id = asString(value.id);
  const name = asString(value.name);
  const url = asString(value.url);
  const duration = asNumber(value.duration, 0);

  if (!id || !name) {
    return null;
  }

  return { id, name, url, duration };
};

const sanitizeBgmAsset = (value: unknown): BGMAsset | null => {
  if (!isRecord(value)) {
    return null;
  }

  const id = asString(value.id);
  const name = asString(value.name);
  const url = asString(value.url);
  const duration = asNumber(value.duration, 0);
  const startTime = asNumber(value.startTime, 0);
  const playLength = asNumber(value.playLength, 0);
  const volumeDbRaw = asNumber(value.volumeDb, Number.NaN);
  let volumeDb = Number.isFinite(volumeDbRaw) ? volumeDbRaw : null;
  if (volumeDb === null) {
    const legacyVolume = asNumber(value.volume, Number.NaN);
    if (Number.isFinite(legacyVolume)) {
      volumeDb = gainToDb(legacyVolume);
    }
  }
  const normalizedVolumeDb = clampDb(volumeDb ?? 0);
  const modeValue = asString(value.mode);
  const mode = Object.values(BGMMode).includes(modeValue as BGMMode) ? (modeValue as BGMMode) : BGMMode.FULL;
  const loop = asBoolean(value.loop, false);

  if (!id || !name) {
    return null;
  }

  return { id, name, url, duration, startTime, playLength, volumeDb: normalizedVolumeDb, mode, loop };
};

const sanitizeLibraryAsset = (value: unknown): LibraryAsset | null => {
  if (!isRecord(value)) {
    return null;
  }

  const id = asString(value.id);
  const name = asString(value.name);
  const url = asString(value.url);
  const duration = asNumber(value.duration, 0);
  const addedAt = asNumber(value.addedAt, Date.now());

  if (!id || !name) {
    return null;
  }

  return { id, name, url, duration, addedAt };
};

const sanitizeProjectConfig = (value: unknown): ProjectConfig | null => {
  if (!isRecord(value)) {
    return null;
  }

  const id = asString(value.id);
  const name = asString(value.name);
  if (!id || !name) {
    return null;
  }

  const exportQuality = VALID_QUALITIES.includes(value.exportQuality as (typeof VALID_QUALITIES)[number])
    ? (value.exportQuality as ProjectConfig['exportQuality'])
    : '1080p';
  const status = VALID_STATUSES.includes(value.status as RenderStatus)
    ? (value.status as RenderStatus)
    : 'PENDING';
  const progress = Math.min(100, Math.max(0, asNumber(value.progress, 0)));
  const outputUrl = asString(value.outputUrl);
  const errorMessage = asString(value.errorMessage);
  const jobId = asString(value.jobId);
  const video1 = sanitizeVideoAsset(value.video1);
  const video2 = sanitizeVideoAsset(value.video2);
  const bgm = sanitizeBgmAsset(value.bgm);

  return {
    id,
    name,
    video1,
    video2,
    bgm,
    exportQuality,
    status,
    progress,
    outputUrl: outputUrl || undefined,
    errorMessage: errorMessage || undefined,
    jobId: jobId || undefined,
  };
};

const sanitizePersistedState = (value: unknown): PersistedState => {
  const activeTab = VALID_TABS.includes((value as PersistedState)?.activeTab)
    ? ((value as PersistedState).activeTab as ActiveTab)
    : 'workstation';

  const queueInput = Array.isArray((value as PersistedState)?.queue) ? (value as PersistedState).queue : [];
  const libraryInput = Array.isArray((value as PersistedState)?.library) ? (value as PersistedState).library : [];

  const queue = queueInput.map((item) => sanitizeProjectConfig(item)).filter(Boolean) as ProjectConfig[];
  const library = libraryInput.map((item) => sanitizeLibraryAsset(item)).filter(Boolean) as LibraryAsset[];

  const savedAt = asString((value as PersistedState)?.savedAt, new Date().toISOString());

  return {
    version: STORAGE_VERSION,
    savedAt,
    activeTab,
    queue,
    library,
  };
};

export const loadPersistedState = (): PersistedState | null => {
  if (typeof localStorage === 'undefined') {
    return null;
  }

  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const data = JSON.parse(raw) as PersistedState;
    return sanitizePersistedState(data);
  } catch (error) {
    console.warn('[storage] Unable to parse local state.', error);
    return null;
  }
};

export const hydratePersistedState = async (state: PersistedState): Promise<PersistedState> => {
  const urlCache = new Map<string, string | null>();

  const hydrateAsset = async <T extends { id: string; url: string }>(asset: T | null): Promise<T | null> => {
    if (!asset) {
      return null;
    }

    if (!urlCache.has(asset.id)) {
      const url = await loadMediaUrl(asset.id);
      urlCache.set(asset.id, url);
    }

    const cached = urlCache.get(asset.id);
    if (cached) {
      return { ...asset, url: cached };
    }

    // If we can't hydrate from IndexedDB (quota cleared, asset deleted, etc),
    // drop the stale blob: URL from persisted state to avoid ERR_FILE_NOT_FOUND.
    return { ...asset, url: '' };
  };

  const library = await Promise.all(state.library.map((asset) => hydrateAsset(asset)));
  const queue = await Promise.all(
    state.queue.map(async (item) => ({
      ...item,
      video1: await hydrateAsset(item.video1),
      video2: await hydrateAsset(item.video2),
      bgm: await hydrateAsset(item.bgm),
    }))
  );

  return {
    ...state,
    library: library.filter(Boolean) as LibraryAsset[],
    queue,
  };
};

export const savePersistedState = (state: PersistedStateInput): void => {
  if (typeof localStorage === 'undefined') {
    return;
  }

  const payload: PersistedState = {
    version: STORAGE_VERSION,
    savedAt: new Date().toISOString(),
    activeTab: state.activeTab,
    queue: state.queue,
    library: state.library,
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn('[storage] Unable to save local state.', error);
  }
};

export const clearPersistedState = (): void => {
  if (typeof localStorage === 'undefined') {
    return;
  }

  localStorage.removeItem(STORAGE_KEY);
};
