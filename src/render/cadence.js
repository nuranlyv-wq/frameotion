export const OUTPUT_FPS = 60;

export function renderCadence(score, fps = OUTPUT_FPS) {
  if (!Number.isInteger(fps) || fps < score.fps || fps % score.fps !== 0) {
    throw new Error('Output fps must be an integer multiple of the score fps');
  }
  const samplesPerFrame = fps / score.fps;
  return {fps, frames: score.frames * samplesPerFrame, samplesPerFrame};
}

export function checkPresentationTimestamps(timestamps, timeBase, {fps, frames}) {
  const [numerator, denominator] = (timeBase ?? '').split('/').map(Number);
  const ticksPerFrame = denominator / (numerator * fps);
  if (!Number.isFinite(ticksPerFrame) || ticksPerFrame < 1) {
    return {ok: false, framesChecked: timestamps.length};
  }
  const badFrame = timestamps.findIndex((tick, index) => !Number.isInteger(tick) ||
    (index > 0 && tick <= timestamps[index - 1]) || Math.abs(tick - index * ticksPerFrame) > 1);
  return {
    ok: timestamps.length === frames && badFrame === -1,
    framesChecked: timestamps.length,
    ...(badFrame !== -1 && {badFrame}),
  };
}
