
export enum BGMMode {
  FULL = 'FULL',
  VIDEO1_ONLY = 'VIDEO1_ONLY',
  VIDEO2_ONLY = 'VIDEO2_ONLY'
}

export type RenderStatus = 'PENDING' | 'RENDERING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface VideoAsset {
  id: string;
  name: string;
  url: string;
  duration: number;
}

export interface BGMAsset {
  id: string;
  name: string;
  url: string;
  duration: number;
  startTime: number;
  playLength: number;
  volumeDb: number;
  mode: BGMMode;
  loop: boolean;
}

export interface LibraryAsset {
  id: string;
  name: string;
  url: string;
  duration: number;
  addedAt: number;
}

export interface ProjectConfig {
  id: string;
  name: string;
  video1: VideoAsset | null;
  video2: VideoAsset | null;
  bgm: BGMAsset | null;
  exportQuality: '720p' | '1080p' | '4k';
  status: RenderStatus;
  progress: number;
  outputUrl?: string;
  errorMessage?: string;
  jobId?: string;
}

export interface AppState {
  isLicensed: boolean;
  currentTab: 'workstation' | 'queue' | 'library' | 'config';
}
