import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

export const Hello = ({ title }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 12 } });
  const bar = interpolate(frame, [10, 40], [0, 760], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ background: '#f7f6f2', alignItems: 'center', justifyContent: 'center', fontFamily: '"Inter", Arial, sans-serif' }}>
      <div style={{ fontSize: 120, fontWeight: 800, color: '#14161a', transform: `scale(${0.7 + 0.3 * pop})`, opacity: pop }}>{title}</div>
      <div style={{ marginTop: 40, height: 18, width: bar, background: '#0b57d0', borderRadius: 9 }} />
    </AbsoluteFill>
  );
};
