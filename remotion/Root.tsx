import React from 'react';
import { Composition } from 'remotion';
import { HeygenComposition, RenderProps } from './HeygenComposition';

const FPS = 24;

type RenderInputProps = RenderProps & { exportQuality?: '720p' | '1080p' | '4k' };

const getDimensions = (quality: '720p' | '1080p' | '4k') => {
  if (quality === '4k') {
    return { width: 3840, height: 2160 };
  }
  if (quality === '720p') {
    return { width: 1280, height: 720 };
  }
  return { width: 1920, height: 1080 };
};

export const RemotionRoot: React.FC = () => {
  return (
    <Composition<RenderInputProps>
      id="heygen-cms"
      component={HeygenComposition}
      defaultProps={{
        video1Path: '',
        video2Path: '',
        video1Duration: 10,
        video2Duration: 10,
        bgm: null,
      }}
      fps={FPS}
      width={1920}
      height={1080}
      calculateMetadata={({ props }) => {
        const totalSeconds = Math.max(1, (props.video1Duration || 0) + (props.video2Duration || 0));
        const durationInFrames = Math.max(1, Math.round(totalSeconds * FPS));
        const dimensions = getDimensions(props.exportQuality || '1080p');
        return {
          durationInFrames,
          fps: FPS,
          width: dimensions.width,
          height: dimensions.height,
        };
      }}
    />
  );
};
