import React from 'react';
import { Sequence } from 'remotion';
import { Production } from './Production.jsx';
export function MotionCatalog({ cases = [] }) {
  let at = 0;
  return cases.map((item) => {
    const start = at; at += item.timeline.frames;
    return <Sequence key={item.id} name={item.id} from={start} durationInFrames={item.timeline.frames}>
      <Production narrative={item.narrative} kit={item.kit} timeline={item.timeline} />
    </Sequence>;
  });
}
