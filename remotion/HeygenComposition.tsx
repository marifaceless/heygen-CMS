import React from 'react';
import { AbsoluteFill, Audio, OffthreadVideo, Sequence, useVideoConfig } from 'remotion';
import { BGMMode } from '../types';

interface BgmConfig {
  path: string | null;
  duration: number;
  playLength: number;
  volume: number;
  mode: BGMMode;
  loop: boolean;
}

export interface RenderProps {
  video1Path: string;
  video2Path: string;
  video1Duration: number;
  video2Duration: number;
  bgm?: BgmConfig | null;
}

const clampFrames = (frames: number) => Math.max(1, Math.round(frames));

const getBgmStart = (mode: BGMMode, video1Frames: number) => {
  if (mode === BGMMode.VIDEO2_ONLY) {
    return video1Frames;
  }
  return 0;
};

const getBgmMaxFrames = (mode: BGMMode, video1Frames: number, video2Frames: number) => {
  if (mode === BGMMode.VIDEO1_ONLY) {
    return video1Frames;
  }
  if (mode === BGMMode.VIDEO2_ONLY) {
    return video2Frames;
  }
  return video1Frames + video2Frames;
};

export const HeygenComposition: React.FC<RenderProps> = ({
  video1Path,
  video2Path,
  video1Duration,
  video2Duration,
  bgm,
}) => {
  const { fps } = useVideoConfig();
  const video1Frames = clampFrames(video1Duration * fps);
  const video2Frames = clampFrames(video2Duration * fps);

  const bgmFrames = bgm ? clampFrames(bgm.playLength * fps) : 0;
  const bgmStart = bgm ? getBgmStart(bgm.mode, video1Frames) : 0;
  const bgmMaxFrames = bgm ? getBgmMaxFrames(bgm.mode, video1Frames, video2Frames) : 0;
  const bgmPlayFrames = bgm ? Math.min(bgmFrames, bgmMaxFrames) : 0;

  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      <Sequence from={0} durationInFrames={video1Frames}>
        <OffthreadVideo src={video1Path} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </Sequence>
      <Sequence from={video1Frames} durationInFrames={video2Frames}>
        <OffthreadVideo src={video2Path} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </Sequence>
      {bgm?.path && bgmPlayFrames > 0 && (
        <Sequence from={bgmStart} durationInFrames={bgmPlayFrames}>
          <Audio src={bgm.path} volume={bgm.volume} loop={bgm.loop} />
        </Sequence>
      )}
    </AbsoluteFill>
  );
};
