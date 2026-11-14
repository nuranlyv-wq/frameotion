// Модель плана: значения по умолчанию, раскладка сцен по таймлайну, привязка к биту.
// План — единственный контракт между режиссёром (Opus), валидатором и движком.
import { CONFIG } from '../config.js';
import { getProfile } from '../dynamism.js';
import { clamp } from '../util.js';
import { COMPONENTS } from '../render/components/index.js';
import { getStyle } from '../styles/presets.js';

export const SFX_KINDS = ['tick', 'pop', 'whoosh', 'hit', 'thud', 'riser', 'ding', 'click', 'swish', 'sparkle'];
export const GENERIC_EVENTS = ['punch', 'shake', 'flash', 'stop'];

export function emptyPlan({ dynamism = 'medium', styleId = 'clean', lang = 'az', mode = 'silent', length = 'short' } = {}) {
  const style = getStyle(styleId);
  const P = getProfile(dynamism);
  const plan = {
    meta: { title: '', lang, dynamism: P.id, styleId: style.id, mode, length, concept: '', craftRules: true, fps: CONFIG.video.fps, width: CONFIG.video.width, height: CONFIG.video.height },
    palette: { ...style.palette },
    style: { family: style.typography.family, weight: style.typography.weight, bg: style.bg },
    scenes: [],
    audio: { bpm: P.bpm, mood: style.music?.mood || 'warm', key: style.music?.key || 'A', autoSfx: true, sfx: [] },
    voiceover: { lines: [] },
    assets: { baked: {} },
  };
  return attachProfile(plan);
}

// Профиль прикрепляется неперечисляемым свойством: в JSON он не попадает, но доступен проверкам.
export function attachProfile(plan) {
  Object.defineProperty(plan, '_P', { value: getProfile(plan.meta?.dynamism), enumerable: false, writable: true, configurable: true });
  return plan;
}

export function clonePlan(plan) {
  // запечённые кадры (десятки МБ) делятся по ссылке — клонируется только сам план
  const { assets, ...rest } = plan;
  const c = JSON.parse(JSON.stringify(rest));
  c.assets = { ...assets, baked: assets?.baked || {} };
  return attachProfile(c);
}

export function effectiveTransition(plan, i) {
  const P = plan._P, s = plan.scenes[i];
  if (i === 0) return { type: 'cut', duration: 0 };
  const prev = plan.scenes[i - 1];
  const tr = s.transition_in || {};
  const type = tr.type || P.transitions.defaultType;
  const range = type === 'zoom_into' ? P.zoomDur : [P.transitions.minDur, P.transitions.maxDur];
  let d = type === 'cut' ? 0 : (tr.duration ?? (type === 'zoom_into' ? (range[0] + range[1]) / 2 : P.transitions.defaultDur));
  d = clamp(d, type === 'cut' ? 0 : range[0], range[1]);
  d = Math.min(d, 0.45 * Math.min(prev.duration, s.duration));
  return { type, duration: type === 'cut' ? 0 : d, dir: tr.dir, target: tr.target, variant: tr.variant, roll: tr.roll };
}

// Раскладка: каждая следующая сцена перекрывает предыдущую на длительность перехода.
// snap=true — старты сцен (границы переходов) выравниваются по долям бита, длительности подстраиваются.
export function layoutScenes(plan, { snap = false } = {}) {
  const P = plan._P;
  const grid = snap ? 60 / (plan.audio?.bpm || P.bpm) / Math.max(1, P.music.snapDiv) : 0;
  const out = [];
  plan.scenes.forEach((s, i) => {
    const tr = effectiveTransition(plan, i);
    const L = { id: s.id, start: 0, duration: s.duration, tin: tr.duration, transition: tr };
    if (i > 0) {
      const prev = out[i - 1];
      let start = prev.start + prev.duration - tr.duration;
      if (snap && grid) {
        start = Math.max(prev.start + 0.8, Math.round(start / grid) * grid);
        prev.duration = start + tr.duration - prev.start;
      }
      L.start = start;
    }
    out.push(L);
  });
  const last = out[out.length - 1];
  return { scenes: out, total: last ? last.start + last.duration : 0, grid };
}

function snapTo(globalT, grid, minG, maxG) {
  if (!grid) return globalT;
  let g = Math.round(globalT / grid) * grid;
  if (g < minG) g = Math.ceil(minG / grid) * grid;
  if (g > maxG) g = Math.floor(maxG / grid) * grid;
  return g;
}

// Нормализованная копия плана для рендера: фактические start/duration + события на бит.
export function normalizePlan(planIn) {
  const plan = clonePlan(planIn);
  const P = plan._P;
  const lay = layoutScenes(plan, { snap: true });
  plan.scenes.forEach((s, i) => {
    const L = lay.scenes[i];
    s.start = L.start; s.duration = L.duration; s.transition = L.transition;
    s.events = s.events || [];
    const comp = COMPONENTS[s.component];
    const T = comp?.timing ? comp.timing(s, P) : null;
    const snapLocal = (t, minL, maxL) => {
      const g = snapTo(s.start + t, lay.grid, s.start + minL, s.start + maxL);
      return g - s.start;
    };
    if (s.component === 'search_to_map') {
      for (const d of s.props.dots || []) d.t = snapLocal(d.t, T.mapAt, s.duration - 0.12);
      for (const c of s.props.cards || []) c.t = snapLocal(c.t, T.mapAt, s.duration - 0.2);
    }
    for (const e of s.events) if (GENERIC_EVENTS.includes(e.type) || e.type === 'emphasis') e.t = snapLocal(e.t, 0.05, s.duration - 0.05);
  });
  plan.meta.totalDuration = lay.total;
  plan.meta.beat = lay.grid;
  return plan;
}
