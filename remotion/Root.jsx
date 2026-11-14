import React from 'react';
import { Composition } from 'remotion';
import { Hello } from './Hello.jsx';
import { MotionCatalog } from './Catalog.jsx';
import { Production } from './Production.jsx';

// Каждая композиция регистрируется здесь. Размер и частота совпадают с форматом KADR: 1080×1920, 30 fps.
export const Root = () => (
  <>
    <Composition id="MotionCatalog" component={MotionCatalog} durationInFrames={1} fps={30} width={1080} height={1920}
      calculateMetadata={({ props }) => ({ durationInFrames: props.cases?.reduce((n, c) => n + c.timeline.frames, 0) || 1 })} />
    <Composition id="KadrProduction" component={Production} durationInFrames={1} fps={30} width={1080} height={1920}
      calculateMetadata={({ props }) => {
        if (!props.timeline) return {};
        const { frames, fps, width, height } = props.timeline;
        const outputFps = props.outputFps ?? fps;
        return { durationInFrames: frames * (outputFps / fps), fps: outputFps, width, height };
      }} />
    <Composition id="Hello" component={Hello} durationInFrames={90} fps={30} width={1080} height={1920} defaultProps={{ title: 'Salam, Remotion' }} />
  </>
);
