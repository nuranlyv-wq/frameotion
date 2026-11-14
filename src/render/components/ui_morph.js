// ui_morph — цепочка состояний интерфейса. Один элемент превращается в другой, дополняющий его
// (поле поиска → круглая кнопка → карточка результата), несколько элементов СЛИВАЮТСЯ в один
// («Фото» + «Файл» → «Холст»), один РАСПАДАЕТСЯ на несколько. Форма, размер, скругление, цвет
// интерполируются, подписи и иконки перетекают — это одно действие, а не смена слайдов.
import { E, prog, clamp, lerp, mix, rgba, luminance, hashStr } from '../../util.js';
import { background, text, rrect, ring, icon, ICON_NAMES, measure } from '../draw.js';
import { fontFor, checkFont, FONT_NAMES } from '../fonts.js';

const SHAPES = ['pill', 'card', 'circle', 'chip', 'bar'];
const TONES = ['accent', 'accent2', 'light', 'dark', 'glass'];

export const spec = {
  name: 'ui_morph',
  summary: 'Chain of UI states where elements TRANSFORM: one element morphs into another complementary element (shape, size, corner radius, colour interpolate; label and icon flow), several elements MERGE into one, or one SPLITS into several. Use it to show a flow (search box -> button -> result card) or to combine features into one thing.',
  props: {
    stages: `[{at:number scene-local seconds (increasing), elements:[{id:string, shape:"${SHAPES.join('|')}", x:0..1 centre (fraction of canvas width), y:0..1 centre (fraction of canvas height), w:0.08..0.95 (fraction of canvas width), h:0.05..0.6 (fraction of canvas WIDTH; ignored for circle), tone:"${TONES.join('|')}"(accent), label:string<=24, sub:string<=30 optional, icon:"${ICON_NAMES.join('|')}" optional, from:[ids of previous-stage elements]}] 1..4 elements}] 2..5 stages. An element with the same id as one in the previous stage morphs from it; "from":[a,b] MERGES a and b into this element; two elements with "from":[a] SPLIT a. Stage 0 has no "from".`,
    title: 'string<=36 optional small headline at the top',
    font: `"${FONT_NAMES.join('|')}" label font role (default display)`,
    bg: '"solid|grid|dots|rings|gradient" (dots)',
  },
  events: { punch: 'camera hit {strength?}', shake: 'shake {strength?}', flash: 'flash {strength?}', stop: 'near-silence hold (t >= 0.6, after a state has settled)' },
};

const morphDur = (S) => 0.75 / S.P.speed;

export function check(scene) {
  const errors = [], warnings = [], p = scene.props || {};
  checkFont(errors, 'props.font', p.font);
  if (p.title && p.title.length > 36) errors.push({ path: 'props.title', message: 'title max 36 chars' });
  const st = p.stages;
  if (!Array.isArray(st) || st.length < 2 || st.length > 5) { errors.push({ path: 'props.stages', message: 'stages must have 2..5 entries' }); return { errors, warnings }; }
  let prevIds = null, prevAt = -1, continues = false;
  st.forEach((s, k) => {
    const sp = `props.stages[${k}]`;
    if (typeof s.at !== 'number' || s.at < 0 || s.at > scene.duration - 0.6) errors.push({ path: `${sp}.at`, message: `at must be within 0..${(scene.duration - 0.6).toFixed(1)} s` });
    else if (s.at <= prevAt) errors.push({ path: `${sp}.at`, message: 'stage times must increase' });
    prevAt = s.at ?? prevAt;
    if (!Array.isArray(s.elements) || s.elements.length < 1 || s.elements.length > 4) { errors.push({ path: `${sp}.elements`, message: '1..4 elements per stage' }); return; }
    const ids = new Set();
    s.elements.forEach((e, i) => {
      const ep = `${sp}.elements[${i}]`;
      if (!e.id || typeof e.id !== 'string') errors.push({ path: `${ep}.id`, message: 'id required' });
      else if (ids.has(e.id)) errors.push({ path: `${ep}.id`, message: `duplicate id "${e.id}" in the stage` }); else ids.add(e.id);
      if (!SHAPES.includes(e.shape)) errors.push({ path: `${ep}.shape`, message: `shape must be one of ${SHAPES.join('|')}` });
      if (e.tone && !TONES.includes(e.tone)) errors.push({ path: `${ep}.tone`, message: `tone must be one of ${TONES.join('|')}` });
      const num = (v, a, b) => typeof v === 'number' && v >= a && v <= b;
      if (!num(e.x, 0, 1) || !num(e.y, 0, 1)) errors.push({ path: ep, message: 'x and y must be numbers in 0..1' });
      if (!num(e.w, 0.08, 0.95)) errors.push({ path: `${ep}.w`, message: 'w must be 0.08..0.95 (fraction of canvas width)' });
      if (e.shape !== 'circle' && !num(e.h, 0.05, 0.6)) errors.push({ path: `${ep}.h`, message: 'h must be 0.05..0.6 (fraction of canvas width)' });
      if (e.label != null && (typeof e.label !== 'string' || e.label.length > 24)) errors.push({ path: `${ep}.label`, message: 'label max 24 chars' });
      if (e.sub && e.sub.length > 30) errors.push({ path: `${ep}.sub`, message: 'sub max 30 chars' });
      if (e.icon && !ICON_NAMES.includes(e.icon)) errors.push({ path: `${ep}.icon`, message: `icon must be one of ${ICON_NAMES.join('|')}` });
      if (!e.label && !e.icon) errors.push({ path: ep, message: 'an element needs a label or an icon' });
      if (e.from) {
        if (k === 0) errors.push({ path: `${ep}.from`, message: 'stage 0 cannot have "from"' });
        else if (!Array.isArray(e.from) || e.from.some((id) => !prevIds?.has(id))) errors.push({ path: `${ep}.from`, message: `"from" must list ids that exist in the previous stage (${[...(prevIds || [])].join(', ')})` });
        else continues = true;
      } else if (k > 0 && prevIds?.has(e.id)) continues = true;
    });
    prevIds = ids;
  });
  if (!continues) warnings.push({ path: 'props.stages', message: 'no element continues between stages — reuse an id or set "from" so elements morph/merge instead of just replacing each other' });
  return { errors, warnings };
}

function relations(scene) {
  const st = scene.props.stages; let merges = 0, splits = 0;
  st.forEach((s, k) => {
    if (!k) return;
    const prevIds = new Set(st[k - 1].elements.map((e) => e.id)), uses = {};
    s.elements.forEach((e) => { const src = (e.from && e.from.length ? e.from : prevIds.has(e.id) ? [e.id] : []); if (src.length > 1) merges++; src.forEach((id) => (uses[id] = (uses[id] || 0) + 1)); });
    splits += Object.values(uses).filter((n) => n > 1).length;
  });
  return { merges, splits };
}
export function countEvents(scene) { const { merges, splits } = relations(scene); return scene.props.stages.length + merges + splits + (scene.events || []).length; }

export function readSpans(scene, S) {
  const md = morphDur(S), st = scene.props.stages, out = [];
  if (scene.props.title) out.push({ path: 'props.title', text: scene.props.title, from: 0.1 + 0.6 / S.P.speed });
  st.forEach((s, k) => {
    const nextAt = st[k + 1]?.at;
    s.elements.forEach((e, i) => {
      if (!e.label) return;
      const src = k ? (e.from && e.from.length ? e.from : [e.id]) : [];
      const same = k && src.length === 1 && st[k - 1].elements.find((x) => x.id === src[0])?.label === e.label;
      if (same) return;   // подпись не менялась — уже была прочитана в предыдущем состоянии
      out.push({ path: `props.stages[${k}].elements[${i}]`, text: e.label + (e.sub ? ` ${e.sub}` : ''), from: s.at + md * (k ? 0.85 : 0.6), to: nextAt != null ? nextAt + 0.3 * md : undefined, weight: 0.8 });
    });
  });
  return out;
}

export function cues(scene, S) {
  const md = morphDur(S), st = scene.props.stages, out = [{ t: st[0].at + 0.15, kind: 'pop', gain: 0.6 }];
  st.forEach((s, k) => {
    if (!k) return;
    const prevIds = new Set(st[k - 1].elements.map((e) => e.id));
    const merged = s.elements.some((e) => (e.from && e.from.length > 1));
    out.push({ t: s.at + 0.02, kind: 'whoosh', gain: 0.45 });
    out.push({ t: s.at + md * 0.85, kind: merged ? 'hit' : 'pop', gain: merged ? 0.8 : 0.65, note: k * 2 });
    if (merged) out.push({ t: s.at + md * 0.9, kind: 'sparkle', gain: 0.5 });
  });
  return out;
}

// ── геометрия и цвета ──
function geom(e, W, H) {
  const w = e.w * W, h = (e.shape === 'circle' ? e.w : e.h) * W;
  const r = e.shape === 'pill' || e.shape === 'chip' ? h / 2 : e.shape === 'circle' ? w / 2 : e.shape === 'bar' ? Math.min(h / 2, 0.012 * W) : Math.min(0.05 * W, h / 2, w / 2);
  return { cx: e.x * W, cy: e.y * H, w, h, r };
}
const lerpG = (a, b, t) => ({ cx: lerp(a.cx, b.cx, t), cy: lerp(a.cy, b.cy, t), w: lerp(a.w, b.w, t), h: lerp(a.h, b.h, t), r: lerp(a.r, b.r, t) });
function union(gs) { const x0 = Math.min(...gs.map((g) => g.cx - g.w / 2)), x1 = Math.max(...gs.map((g) => g.cx + g.w / 2)), y0 = Math.min(...gs.map((g) => g.cy - g.h / 2)), y1 = Math.max(...gs.map((g) => g.cy + g.h / 2)); return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0, r: Math.min(...gs.map((g) => g.r)) }; }
function tone(name, pal) {
  const dark = (hex) => (luminance(hex) > 0.4 ? '#101216' : '#ffffff');
  switch (name) {
    case 'accent2': return { fill: pal.accent2, text: dark(pal.accent2), stroke: null };
    case 'light': return { fill: '#ffffff', text: '#14161a', stroke: null };
    case 'dark': return { fill: mix(pal.bg, '#ffffff', 0.12), text: pal.fg, stroke: rgba(pal.fg, 0.16) };
    case 'glass': return { fill: mix(pal.bg, pal.fg, 0.16), text: pal.fg, stroke: rgba(pal.fg, 0.3) };
    default: return { fill: pal.accent, text: dark(pal.accent), stroke: null };
  }
}

function drawBody(ctx, g, col, alpha, scale, tk) {
  if (alpha <= 0.01) return;
  ctx.save(); ctx.globalAlpha *= clamp(alpha); ctx.translate(g.cx, g.cy); ctx.scale(scale, scale);
  ctx.shadowColor = 'rgba(0,0,0,0.30)'; ctx.shadowBlur = 28; ctx.shadowOffsetY = 10;
  ctx.fillStyle = col.fill; rrect(ctx, -g.w / 2, -g.h / 2, g.w, g.h, g.r); ctx.fill();
  ctx.shadowColor = 'transparent';
  if (col.stroke) { ctx.lineWidth = tk.stroke.hair; ctx.strokeStyle = col.stroke; ctx.stroke(); }
  ctx.restore();
}

function drawContent(ctx, g, col, el, alpha, scale, f) {
  if (alpha <= 0.01) return;
  ctx.save(); ctx.globalAlpha *= clamp(alpha); ctx.translate(g.cx, g.cy); ctx.scale(scale, scale);
  const wt = f.weight === 800 ? 700 : f.weight, hasIcon = Boolean(el.icon);
  if (el.shape === 'circle' || (!el.label && hasIcon)) {
    if (hasIcon) icon(ctx, el.icon, 0, 0, Math.min(g.w, g.h) * 0.5, col.text, 6);
    else { let sz = g.h * 0.3 * f.k; while (measure(ctx, el.label, wt, sz, f.family, f.italic) > g.w * 0.8 && sz > 14) sz -= 2; text(ctx, el.label, 0, sz * 0.35, { size: sz, weight: wt, family: f.family, italic: f.italic, fill: col.text, align: 'center' }); }
  } else {
    const iconSize = Math.min(g.h * 0.46, 90), padL = hasIcon ? g.h * 0.3 + iconSize + g.h * 0.16 : g.h * 0.32;
    const maxW = g.w - padL - g.h * 0.32, left = hasIcon || el.sub;
    let sz = Math.min(g.h * (el.sub ? 0.3 : 0.38), 64) * f.k;
    while (measure(ctx, el.label || '', wt, sz, f.family, f.italic) > maxW && sz > 16) sz -= 2;
    if (hasIcon) icon(ctx, el.icon, -g.w / 2 + g.h * 0.3 + iconSize / 2, 0, iconSize, col.text, 6);
    const x = left ? -g.w / 2 + padL : 0, align = left ? 'left' : 'center';
    text(ctx, el.label || '', x, el.sub ? -sz * 0.12 : sz * 0.34, { size: sz, weight: wt, family: f.family, italic: f.italic, fill: col.text, align });
    if (el.sub) text(ctx, el.sub, x, sz * 0.95, { size: sz * 0.68, weight: 500, family: f.family, italic: f.italic, fill: col.text, align, alpha: 0.75 });
  }
  ctx.restore();
}

export function render(ctx, S) {
  const { t, W, H, P, pal, tk, props } = S;
  const st = props.stages, md = morphDur(S), f = fontFor(props.font, S.st);
  const pulses = [];
  st.forEach((s, k) => {
    if (!k) return;
    s.elements.forEach((e) => { if (e.from && e.from.length > 1) { const g = geom(e, W, H); pulses.push({ t: s.at + md * 0.85, x: g.cx, y: g.cy, r: 380 * P.amp, color: pal.accent2 }); } });
  });
  background(ctx, W, H, props.bg || 'dots', pal, t, S, pulses);

  if (props.title) {
    const tp = prog(t, 0.1, S.anim(0.6), E.outExpo);
    text(ctx, props.title, W / 2, H * 0.1 + (1 - tp) * 30 * P.amp, { size: 56 * f.k, weight: f.weight, family: f.family, italic: f.italic, fill: pal.muted, align: 'center', alpha: tp });
  }
  let k = -1; st.forEach((s, i) => { if (t >= s.at) k = i; });
  if (k < 0) return;
  const float = (id) => Math.sin(t * 2 + (hashStr(id) % 7)) * 3 * P.amp * P.ambient;
  const withFloat = (g, id) => ({ ...g, cy: g.cy + float(id) });

  if (k === 0) {
    st[0].elements.forEach((e, i) => {
      const pr = prog(t, st[0].at + i * 0.1 * P.stagger, S.anim(0.55), E.outBack), g = withFloat(geom(e, W, H), e.id), c = tone(e.tone, pal);
      drawBody(ctx, g, c, clamp(pr * 1.6), lerp(0.7, 1, pr), tk); drawContent(ctx, g, c, e, clamp(pr * 1.6), lerp(0.7, 1, pr), f);
    });
    return;
  }
  const prev = st[k - 1], cur = st[k], pr = prog(t, cur.at, md, E.linear), pe = E.outBack(pr, 0.8 * P.amp), q = clamp((pr - 0.3) / 0.4);
  const prevById = Object.fromEntries(prev.elements.map((e) => [e.id, e]));
  const claimed = new Set();
  const plan = cur.elements.map((e) => {
    const src = (e.from && e.from.length ? e.from : prevById[e.id] ? [e.id] : []).filter((id) => prevById[id]);
    src.forEach((id) => claimed.add(id));
    return { e, src };
  });
  // 1) источники, которые ни во что не превратились — уходят
  prev.elements.filter((e) => !claimed.has(e.id)).forEach((e) => {
    const a = 1 - clamp(pr * 1.8), g = withFloat(geom(e, W, H), e.id), c = tone(e.tone, pal);
    drawBody(ctx, g, c, a, lerp(1, 0.8, pr), tk); drawContent(ctx, g, c, e, a, lerp(1, 0.8, pr), f);
  });
  // 2) цели: превращение, слияние, распад или появление с нуля
  for (const { e, src } of plan) {
    const gT = withFloat(geom(e, W, H), e.id), cT = tone(e.tone, pal);
    if (!src.length) {
      const s = clamp((pr - 0.35) / 0.6), sc = lerp(0.6, 1, E.outBack(s)), a = clamp((pr - 0.3) / 0.45);
      drawBody(ctx, gT, cT, a, sc, tk); drawContent(ctx, gT, cT, e, a, sc, f); continue;
    }
    if (src.length === 1) {
      const o = prevById[src[0]], gS = withFloat(geom(o, W, H), o.id), cS = tone(o.tone, pal);
      const g = lerpG(gS, gT, pe), c = { fill: mix(cS.fill, cT.fill, clamp(pr * 1.2)), text: mix(cS.text, cT.text, clamp(pr * 1.2)), stroke: cT.stroke };
      drawBody(ctx, g, c, 1, 1, tk);
      const same = (o.label || '') === (e.label || '') && o.icon === e.icon && o.sub === e.sub;
      if (same) drawContent(ctx, g, c, e, 1, 1, f);
      else { drawContent(ctx, g, c, o, 1 - q, 1, f); drawContent(ctx, g, c, e, q, 1, f); }
    } else { // слияние: источники стягиваются к цели, цель «проявляется» из их общего контура
      const gs = src.map((id) => withFloat(geom(prevById[id], W, H), id));
      src.forEach((id, i) => {
        const o = prevById[id], cS = tone(o.tone, pal), g = lerpG(gs[i], gT, pe), a = Math.pow(1 - clamp(pr * 1.15), 1.4), sc = lerp(1, 0.85, pr);
        drawBody(ctx, g, cS, a, sc, tk); drawContent(ctx, g, cS, o, a * (1 - q), sc, f);
      });
      const g = lerpG(union(gs), gT, pe), a = clamp((pr - 0.2) / 0.55);
      drawBody(ctx, g, cT, a, 1, tk); drawContent(ctx, g, cT, e, a * q, 1, f);
      if (pr > 0.8 && pr < 1.4) { const k2 = (pr - 0.8) / 0.6; ring(ctx, gT.cx, gT.cy, gT.w * 0.4 + k2 * 160, 5 * (1 - k2) + 1, pal.accent2, 1 - k2); }
    }
  }
}

export function anchors(scene, S) {
  const { W, H } = S, st = scene.props.stages || [], out = {};
  const rect = (e) => ({ x: e.x, y: e.y, w: e.w, h: ((e.shape === 'circle' ? e.w : e.h) * W) / H });
  st.forEach((s, k) => s.elements.forEach((e) => { out[`s${k}:${e.id}`] = rect(e); if (k === st.length - 1) out[e.id] = rect(e); }));
  return out;
}
