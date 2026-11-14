// Art Direction Specification: единый документ, который режиссёр составляет ДО любых сцен и кода.
// Его читают все сцены (каталожные и custom_draw): из него берутся токены (src/render/tokens.js),
// по нему же слой «визуальная согласованность» проверяет готовый фильм.
import { FONT_NAMES } from '../render/fonts.js';
import { EASE_NAMES } from '../render/tokens.js';
import { TRANSITIONS } from '../render/components/index.js';

export const CAMERA_MODES = ['static', 'purposeful', 'ambient'];
// Запрещаемые эффекты, которые валидатор умеет ПРОВЕРЯТЬ по плану и запечённым кадрам. Любой другой текст принимается,
// но попадает в отчёт как «не проверяется автоматически».
export const PROHIBITABLE = {
  glow: 'glow on any primitive (glow/glowR)',
  additive_blend: "blend 'lighter' or 'screen'",
  gradients: 'gradient fills (lin/rad)',
  particles: 'burst() particle bursts',
  shake: 'shake events',
  flash: 'flash events and the flash_cut transition',
  punch: 'punch events (camera hit)',
  camera_moves: 'any scene.camera move',
  zoom_into: 'the zoom_into transition',
  ambient_camera: 'camera drift and beat pulse',
  stop: 'stop events (music drop)',
};
export const PROHIBITABLE_IDS = Object.keys(PROHIBITABLE);

const str = (v, min = 1, max = 600) => typeof v === 'string' && v.trim().length >= min && v.length <= max;
const num = (v) => typeof v === 'number' && isFinite(v);
const obj = (p, req = []) => ({ type: 'object', properties: p, required: req, additionalProperties: false });
const S = (d) => ({ type: 'string', description: d });

export const ART_DIRECTION_INPUT_SCHEMA = obj({
  concept: S('core visual concept: ONE sentence, derived from a specific feature or fact of the product'),
  narrative_progression: { type: 'array', description: '3-7 beats in order: what the viewer understands after each one (one short sentence each)', items: { type: 'string' } },
  visual_metaphor: S('the metaphor/world the picture lives in and how it maps to how the product works'),
  typography_roles: obj({ title: S(`font role for headlines; one of ${FONT_NAMES.join('|')}`), emphasis: S('font role for the accented word'), label: S('font role for small UI labels'), data: S('font role for numbers, urls, code-like text') }, ['title', 'label']),
  typography_rules: S('how type is used: scale steps, case, tracking, when emphasis is allowed'),
  composition: obj({ grid: S('the composition system, e.g. a 6-column grid with a single focal column'), margin_px: { type: 'number', description: 'safe margin in px (24..160)' }, alignment: S('left/centre/baseline rules'), focal_rule: S('where the eye lands in every scene') }, ['grid', 'margin_px', 'focal_rule']),
  color_usage: obj({ background: S('what the background carries'), text: S('text colour rule'), accent: S('what the primary accent colour is reserved for'), accent2: S('what the second accent is reserved for'), max_accents_on_screen: { type: 'integer' } }, ['background', 'text', 'accent']),
  illustration: obj({ geometry: S('shape language: rectilinear / rounded / organic, proportions, what is allowed'), treatment: S('flat / outlined / layered; level of detail; how objects are built from primitives') }, ['geometry', 'treatment']),
  stroke_weights: obj({ hair: { type: 'number' }, base: { type: 'number' }, heavy: { type: 'number' } }, ['hair', 'base', 'heavy']),
  corner_radii: obj({ xs: { type: 'number' }, chip: { type: 'number' }, panel: { type: 'number' }, card: { type: 'number' } }, ['chip', 'panel', 'card']),
  motion_language: obj({ description: S('how things move and why: rhythm, entrances, exits, what is never animated'), easing: obj({ enter: S(`one of ${EASE_NAMES.join('|')}`), exit: S('easing name'), ui: S('easing name'), emphasis: S('easing name') }, ['enter', 'exit']) }, ['description', 'easing']),
  camera_philosophy: obj({ mode: { type: 'string', enum: CAMERA_MODES, description: 'static = the camera never moves; purposeful = only moves with a stated purpose and reason; ambient = also continuous drift/beat pulse (rarely right)' }, description: S('when and why the camera moves in THIS film') }, ['mode', 'description']),
  transition_philosophy: obj({ preferred: { type: 'array', items: { type: 'string', enum: Object.keys(TRANSITIONS) }, description: 'the transitions this film uses (a plain cut is always a valid choice)' }, description: S('how scenes hand over to each other and why') }, ['preferred', 'description']),
  prohibited_effects: { type: 'array', description: `effects this film will NOT use (at least one). Machine-checked ids: ${PROHIBITABLE_IDS.join(', ')}; any other text is allowed but not verified`, items: { type: 'string' } },
}, ['concept', 'narrative_progression', 'visual_metaphor', 'typography_roles', 'composition', 'color_usage', 'illustration', 'stroke_weights', 'corner_radii', 'motion_language', 'camera_philosophy', 'transition_philosophy', 'prohibited_effects']);

const clip = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : v);

// Приведение входа модели к каноническому виду (обрезка длин, без лишних полей).
export function normalizeArtDirection(a = {}) {
  const o = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
  const out = {
    concept: clip(a.concept, 400), narrative_progression: (Array.isArray(a.narrative_progression) ? a.narrative_progression : []).slice(0, 8).map((x) => clip(String(x), 200)),
    visual_metaphor: clip(a.visual_metaphor, 500),
    typography_roles: { ...o(a.typography_roles) }, typography_rules: clip(a.typography_rules, 400),
    composition: { grid: clip(o(a.composition).grid, 300), margin_px: o(a.composition).margin_px, alignment: clip(o(a.composition).alignment, 200), focal_rule: clip(o(a.composition).focal_rule, 300) },
    color_usage: Object.fromEntries(Object.entries(o(a.color_usage)).map(([k, v]) => [k, typeof v === 'string' ? clip(v, 300) : v])),
    illustration: { geometry: clip(o(a.illustration).geometry, 400), treatment: clip(o(a.illustration).treatment, 400) },
    stroke_weights: { ...o(a.stroke_weights) }, corner_radii: { ...o(a.corner_radii) },
    motion_language: { description: clip(o(a.motion_language).description, 500), easing: { ...o(o(a.motion_language).easing) } },
    camera_philosophy: { mode: o(a.camera_philosophy).mode, description: clip(o(a.camera_philosophy).description, 400) },
    transition_philosophy: { preferred: Array.isArray(o(a.transition_philosophy).preferred) ? o(a.transition_philosophy).preferred : [], description: clip(o(a.transition_philosophy).description, 400) },
    prohibited_effects: (Array.isArray(a.prohibited_effects) ? a.prohibited_effects : []).slice(0, 16).map((x) => clip(String(x), 80)),
  };
  return out;
}

// Полнота и внутренняя согласованность. Возвращает список ошибок {path, message, hint?}.
export function checkArtDirection(ad) {
  const errors = [], e = (path, message, hint) => errors.push({ path: `art_direction.${path}`, message, ...(hint ? { hint } : {}), layer: 'consistency' });
  if (!ad) return [{ path: 'art_direction', message: 'no art direction yet', hint: 'call set_art_direction first', layer: 'consistency' }];
  if (!str(ad.concept, 20)) e('concept', 'concept must be one concrete sentence (>= 20 chars) tied to a feature of the product');
  if (!Array.isArray(ad.narrative_progression) || ad.narrative_progression.length < 3 || ad.narrative_progression.length > 7 || ad.narrative_progression.some((x) => !str(x, 6, 200))) e('narrative_progression', 'give 3-7 beats, each a short sentence saying what the viewer understands after it');
  if (!str(ad.visual_metaphor, 20)) e('visual_metaphor', 'visual_metaphor must say what the picture world is and how it maps to the product');
  const ty = ad.typography_roles || {};
  for (const k of ['title', 'label']) if (!FONT_NAMES.includes(ty[k])) e(`typography_roles.${k}`, `must be a font role: ${FONT_NAMES.join(', ')}`);
  for (const k of ['emphasis', 'data']) if (ty[k] != null && !FONT_NAMES.includes(ty[k])) e(`typography_roles.${k}`, `must be a font role: ${FONT_NAMES.join(', ')}`);
  const fams = new Set(Object.values(ty).filter(Boolean));
  if (fams.size > 3) e('typography_roles', `${fams.size} different font roles: one film needs at most 3 (a title voice, an optional accent voice, one working voice)`);
  const c = ad.composition || {};
  if (!str(c.grid, 8)) e('composition.grid', 'describe the composition system (grid, columns, focal structure)');
  if (!num(c.margin_px) || c.margin_px < 24 || c.margin_px > 160) e('composition.margin_px', 'margin_px must be 24..160');
  if (!str(c.focal_rule, 8)) e('composition.focal_rule', 'say where the eye lands in every scene');
  const cu = ad.color_usage || {};
  for (const k of ['background', 'text', 'accent']) if (!str(cu[k], 4)) e(`color_usage.${k}`, 'say what this colour role is used for');
  if (cu.max_accents_on_screen != null && !(Number.isInteger(cu.max_accents_on_screen) && cu.max_accents_on_screen >= 1 && cu.max_accents_on_screen <= 3)) e('color_usage.max_accents_on_screen', 'integer 1..3');
  if (!str(ad.illustration?.geometry, 8) || !str(ad.illustration?.treatment, 8)) e('illustration', 'describe the geometry and the treatment of illustrated objects');
  const sw = ad.stroke_weights || {};
  if (![sw.hair, sw.base, sw.heavy].every((v) => num(v) && v >= 0.5 && v <= 40) || !(sw.hair < sw.base && sw.base < sw.heavy)) e('stroke_weights', 'hair < base < heavy, each 0.5..40 px');
  const cr = ad.corner_radii || {};
  if (![cr.chip, cr.panel, cr.card].every((v) => num(v) && v >= 0 && v <= 120) || (cr.xs != null && !(num(cr.xs) && cr.xs >= 0 && cr.xs <= 120)) || !((cr.xs ?? 0) <= cr.chip && cr.chip <= cr.panel && cr.panel <= cr.card)) e('corner_radii', 'xs <= chip <= panel <= card, each 0..120 px (use one family of radii: all small for a rectilinear film, all large for a soft one)');
  const m = ad.motion_language || {};
  if (!str(m.description, 12)) e('motion_language.description', 'describe how things move and why');
  for (const k of ['enter', 'exit']) if (!EASE_NAMES.includes(m.easing?.[k])) e(`motion_language.easing.${k}`, `must be one of ${EASE_NAMES.join(', ')}`);
  for (const k of ['ui', 'emphasis']) if (m.easing?.[k] != null && !EASE_NAMES.includes(m.easing[k])) e(`motion_language.easing.${k}`, `must be one of ${EASE_NAMES.join(', ')}`);
  if (!CAMERA_MODES.includes(ad.camera_philosophy?.mode)) e('camera_philosophy.mode', `mode must be ${CAMERA_MODES.join('|')}`);
  if (!str(ad.camera_philosophy?.description, 12)) e('camera_philosophy.description', 'say when and why the camera moves in this film (or why it never does)');
  const tp = ad.transition_philosophy || {};
  if (!Array.isArray(tp.preferred) || !tp.preferred.length || tp.preferred.some((t) => !TRANSITIONS[t])) e('transition_philosophy.preferred', `list the transitions this film uses, from: ${Object.keys(TRANSITIONS).join(', ')}`);
  if (!str(tp.description, 12)) e('transition_philosophy.description', 'say how scenes hand over to each other and why');
  if (!Array.isArray(ad.prohibited_effects) || !ad.prohibited_effects.length) e('prohibited_effects', 'name at least one effect this film will NOT use (ids that are machine-checked: ' + PROHIBITABLE_IDS.join(', ') + ')');
  return errors;
}

// Какие из запретов проверяются автоматически, а какие — только текст.
export function splitProhibited(ad) {
  const list = ad?.prohibited_effects || [];
  return { checked: list.filter((x) => PROHIBITABLE_IDS.includes(x)), unverified: list.filter((x) => !PROHIBITABLE_IDS.includes(x)) };
}
