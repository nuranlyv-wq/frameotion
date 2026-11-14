// Reusable, deterministic tracks. Times are seconds; the renderer can seek any frame.
export const clamp01 = (n) => Math.max(0, Math.min(1, n));
export function curve(t, easing = 'smooth') {
  const x = clamp01(t);
  if (easing === 'linear') return x;
  if (easing === 'out') return 1 - (1 - x) ** 4;
  if (easing === 'in') return x ** 4;
  if (easing === 'snap') return x < .5 ? 8 * x ** 4 : 1 - (-2 * x + 2) ** 4 / 2;
  if (easing === 'back') { const c = 1.25; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2; }
  return x * x * (3 - 2 * x);
}
export function track(time, points, easing = 'smooth') {
  if (time <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [at, value, ease = easing] = points[i];
    const [before, previous] = points[i - 1];
    if (time <= at) return previous + (value - previous) * curve((time - before) / (at - before), ease);
  }
  return points.at(-1)[1];
}
export const progress = (t, from, to, ease = 'smooth') => curve((t - from) / (to - from), ease);
export const windowAt = (t, from, to, feather = .12) => progress(t, from, from + feather) * (1 - progress(t, to - feather, to));

export const CHOREOGRAPHY_RECIPES = [{
  id: 'kinetic-workbench', version: 1, name: 'Selection → portal → poster → filmstrip',
  format: 'landscape', duration: 14, source: 'KADR original, directed from user references 1 and 4',
  license: 'LicenseRef-KADR-Project',
  purpose: 'A motion-design product study. Use only when the product actually creates visual compositions or videos.',
  parameters: ['brand', 'lead', 'emphasis', 'prompt', 'endline'],
  editableObjects: ['selected-word', 'selection-frame', 'submit-disc', 'poster', 'sculpture', 'filmstrip', 'playhead', 'brand'],
  supportedMoves: ['shared-shape morph', 'camera portal', 'orbital sculpture', 'perspective fan', 'filmstrip unfold', 'frame-to-brand'],
}];

// Cues refer to visible contact/landing times; long sounds align by their energy peak.
export function kineticSoundCues(fps = 60, seconds = 14) {
  return [
    [.10, 'swish', 26], [.72, 'click', 56], [1.54, 'pop', 44], [2.42, 'click', 68],
    [3.08, 'whoosh', 76], [3.55, 'pop', 54], [4.92, 'gear', 36], [5.35, 'whoosh', 52],
    [5.83, 'hit', 40], [6.32, 'swish', 46], [7.22, 'pop', 62], [7.56, 'click', 36],
    [8.04, 'pop', 50], [8.6, 'data', 28], [9.16, 'click', 46], [9.78, 'click', 48],
    [10.58, 'riser', 34], [11.25, 'whoosh', 60], [11.8, 'hit', 58], [12.05, 'pop', 42],
  ].map(([t, kind, gain]) => ({ frame: Math.round(t / 14 * seconds * fps), kind, gain }));
}
