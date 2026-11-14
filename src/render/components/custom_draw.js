// custom_draw — сцена, нарисованная КОДОМ модели. Код выполняется ТОЛЬКО в изоляции (src/sandbox):
// движок получает готовые «запечённые» примитивы по кадрам и рисует их сам. Это основной способ получить
// авторскую иллюстративную сцену (ночной город, дорога, машина, HUD, спрайты…) под идею ролика.
import { background } from '../draw.js';
import { drawPrims } from '../prims.js';

export const spec = {
  name: 'custom_draw',
  long: true,
  maxSec: 18,
  summary: 'An illustrated scene drawn by YOUR code (the main way to make bespoke visuals). First call run_sandbox_draw to bake function frame(t,i,N) over the scene length, then add a custom_draw scene with props.fn = fn_id. The whole scene (world, motion, on-screen text) lives in your code; the validator reads every on-screen text from the baked frames and enforces reading time.',
  props: {
    fn: 'string — fn_id returned by run_sandbox_draw (baked for >= the scene duration; scenes may last up to 18 s)',
    anchors: '{name:{x,y,w,h}} fractions of the canvas (centre + size) of the objects in YOUR drawing that the camera can zoom into or the next scene can open from (the object should be still and in place at the end of the scene)',
    beats: 'number[] — scene-local seconds of the key beats in your animation (hits, pops, reveals); they drive sound accents and event counting',
    bg: '"solid|grid|dots|rings|gradient" background under your primitives (solid)',
  },
  events: { punch: 'camera hit {strength?}', shake: 'shake {strength?}', flash: 'flash {strength?}', stop: 'near-silence hold (t >= 0.6)' },
};

export function check(scene, plan) {
  const errors = [], p = scene.props || {};
  const baked = plan.assets?.baked?.[p.fn];
  if (!baked) { errors.push({ path: 'props.fn', message: `fn "${p.fn}" is not baked. Call run_sandbox_draw first.` }); return { errors, warnings: [] }; }
  if (!baked.frames?.length && !baked.code) errors.push({ path: 'props.fn', message: `fn "${p.fn}" has no frames` });
  if (baked.duration < scene.duration - 0.35) errors.push({ path: 'props.fn', message: `fn baked for ${baked.duration}s but the scene lasts ${scene.duration}s — re-run run_sandbox_draw with duration >= ${scene.duration}` });
  if (p.beats != null && (!Array.isArray(p.beats) || p.beats.some((b) => typeof b !== 'number' || b < 0 || b > scene.duration))) errors.push({ path: 'props.beats', message: `beats must be numbers within 0..${scene.duration}` });
  return { errors, warnings: [] };
}

export const countEvents = (scene) => (Array.isArray(scene.props.beats) ? scene.props.beats.length : Math.max(3, Math.round(scene.duration * 0.8))) + (scene.events || []).length;

export function readSpans(scene, S) {
  const baked = S.assets?.baked?.[scene.props.fn];
  return (baked?.texts || []).filter((x) => x.s.trim().length >= 3).map((x, i) => ({ path: `props.fn.text[${i}]`, text: x.s, from: x.from, to: x.to, weight: 0.8 }));
}

export function cues(scene, S) {
  const out = [{ t: 0.05, kind: 'whoosh', gain: 0.5 }];
  const beats = Array.isArray(scene.props.beats) ? scene.props.beats : [];
  beats.forEach((b, i) => out.push({ t: b, kind: i % 4 === 0 ? 'hit' : 'pop', gain: i % 4 === 0 ? 0.7 : 0.55, note: i }));
  return out;
}

export function render(ctx, S) {
  const { t, W, H, pal, props, assets } = S;
  background(ctx, W, H, props.bg || 'solid', pal, t, S);
  const baked = assets?.baked?.[props.fn];
  if (!baked?.frames?.length) return;
  const i = Math.min(baked.frames.length - 1, Math.max(0, Math.floor(t * baked.fps)));
  drawPrims(ctx, baked.frames[i], pal);
}

export function anchors(scene) {
  const out = {}, a = scene.props?.anchors;
  if (a && typeof a === 'object') for (const [k, r] of Object.entries(a)) if (r && [r.x, r.y, r.w, r.h].every((v) => typeof v === 'number' && isFinite(v))) out[String(k).slice(0, 24)] = { x: r.x, y: r.y, w: Math.max(0.03, r.w), h: Math.max(0.02, r.h) };
  return out;
}
