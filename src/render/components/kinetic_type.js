// kinetic_type — кинетическая типографика: слова появляются по-разному (бьют, всплывают, проявляются
// постепенно, печатаются, возникают резко), акцентные слова сопровождаются графикой, шрифты можно сочетать.
import { E, prog, clamp, lerp, rgba } from '../../util.js';
import { background, fontStr, layoutWords, measure, text, rrect, ring } from '../draw.js';
import { fontFor, checkFont, FONT_NAMES } from '../fonts.js';

const SIZES = { hero: 250, xl: 168, l: 122, m: 80, s: 56 };
const STYLES = ['slam', 'rise', 'mask', 'cascade', 'scale', 'fade', 'type', 'cut'];
const COLORS = ['fg', 'accent', 'accent2', 'muted'];

export const spec = {
  name: 'kinetic_type',
  summary: 'Kinetic typography. Lines of text; words enter in different ways (hard slam, rise, mask, cascade, gradual fade, typewriter, instant cut); emphasized words get an underline sweep + ring pulse; fonts can be paired (line font + a different font for emphasized words).',
  props: {
    lines: `[{text:string(<=44 chars; a word written [a|b|c] cycles through the options, each shown >=0.7 s), size:"hero|xl|l|m|s"(l), color:"fg|accent|accent2|muted"(fg), style:"slam|rise|mask|cascade|scale|fade|type|cut"(slam) — fade = gradual word-by-word appearance, type = typewriter, cut = whole line appears instantly on the beat, font:"${FONT_NAMES.join('|')}"(display), at:number seconds in scene (default sequential), emphasis:[word strings to highlight]}] 1..5 lines`,
    emphasisFont: `font role for the emphasized words, e.g. "serif-italic" next to a grotesk line (font pair)`,
    bg: '"solid|grid|dots|rings|gradient" (grid)',
    layout: '"center|top" (center)',
    accentShape: '"underline|ring|marker|none" (underline) — graphic tied to emphasized words',
  },
  events: {
    punch: 'camera scale hit at t {strength?0..1.5}',
    shake: 'camera shake at t {strength?0..1.5}',
    flash: 'white flash at t {strength?0..1}',
    emphasis: 'extra ring pulse + hit sound at t on {line:index}',
    stop: 'near-silence hold: music drops out for dur seconds (0.4..1.2, default 0.7), a riser leads in and picture+sound slam back on the last frame — use ONCE, placed after text has landed (t >= 0.6)',
  },
};

export function check(scene) {
  const errors = [], warnings = [];
  const L = scene.props?.lines;
  if (!Array.isArray(L) || L.length < 1 || L.length > 5) { errors.push({ path: 'props.lines', message: 'lines must be an array of 1..5 items' }); return { errors, warnings }; }
  checkFont(errors, 'props.emphasisFont', scene.props.emphasisFont);
  L.forEach((l, i) => {
    const p = `props.lines[${i}]`;
    if (typeof l.text !== 'string' || !l.text.trim()) errors.push({ path: `${p}.text`, message: 'text must be a non-empty string' });
    else if (l.text.length > 44) errors.push({ path: `${p}.text`, message: `text too long (${l.text.length} > 44 chars)`, hint: 'split into two lines or shorten' });
    for (const tok of String(l.text || '').split(/\s+/)) if (/[\[\]]/.test(tok) && !/^\[[^\[\]\s|]+(\|[^\[\]\s|]+)+\][.,!?:;]*$/.test(tok)) errors.push({ path: `${p}.text`, message: `bad cycle token "${tok}" — write [one|two|three] without spaces inside` });
    if (l.size && !SIZES[l.size]) errors.push({ path: `${p}.size`, message: `size must be one of ${Object.keys(SIZES).join('|')}` });
    if (l.style && !STYLES.includes(l.style)) errors.push({ path: `${p}.style`, message: `style must be one of ${STYLES.join('|')}` });
    if (l.color && !COLORS.includes(l.color)) errors.push({ path: `${p}.color`, message: `color must be one of ${COLORS.join('|')}` });
    checkFont(errors, `${p}.font`, l.font);
    if (l.at != null && (typeof l.at !== 'number' || l.at < 0 || l.at > scene.duration - 0.3)) errors.push({ path: `${p}.at`, message: `at must be within 0..${(scene.duration - 0.3).toFixed(1)} s` });
    if (l.emphasis && !Array.isArray(l.emphasis)) errors.push({ path: `${p}.emphasis`, message: 'emphasis must be an array of words' });
  });
  return { errors, warnings };
}

const cycleOpts = (t) => String(t).split(/\s+/).map((x) => x.match(/^\[([^\[\]\s]+)\]/)).filter(Boolean).map((m) => m[1].split('|').length);
export const countEvents = (scene) => (scene.props.lines || []).reduce((a, l) => a + 1 + cycleOpts(l.text).reduce((x, n) => x + (n - 1), 0), 0) + (scene.events || []).length;

// Период смены слова-циклера: целое число долей, не короче 0.7 с (слово должно успеть прочитаться).
export const cyclePeriod = (bpm) => { const beat = 60 / bpm; return beat * Math.ceil(0.7 / beat); };

function lineTimes(scene, P) {
  let at = 0.15;
  return scene.props.lines.map((l) => {
    const t0 = l.at != null ? l.at : at;
    at = t0 + 0.55 * P.stagger + 0.35;
    return t0;
  });
}
const typeCps = (P) => 16 * clamp(P.speed, 0.8, 1.4);
const wordCount = (l) => l.text.split(/\s+/).filter(Boolean).length;
const charCount = (l) => l.text.replace(/[\[\]]/g, '').split('|')[0].length;

// Когда слово i строки появляется.
function wordStart(style, t0, i, P) {
  if (style === 'fade') return t0 + i * 0.16 * P.stagger;
  if (style === 'cut') return t0;
  if (style === 'type') return t0;
  return t0 + i * 0.08 * P.stagger;
}
// Когда ВСЯ строка полностью видна.
function landed(l, t0, P) {
  const style = l.style || 'slam', n = wordCount(l), ch = charCount(l);
  if (style === 'cut') return t0;
  if (style === 'type') return t0 + ch / typeCps(P);
  if (style === 'fade') return t0 + (n - 1) * 0.16 * P.stagger + 0.55 / P.speed;
  if (style === 'cascade') return t0 + (n - 1) * 0.08 * P.stagger + ch * 0.03 * P.stagger + 0.35 / P.speed;
  return t0 + (n - 1) * 0.08 * P.stagger + 0.5 / P.speed;
}

function isEmph(l, w) {
  const clean = (s) => s.toLowerCase().replace(/[.,!?:;«»"'\[\]]/g, '');
  return (l.emphasis || []).some((e) => clean(e) === clean(w));
}

// Что и с какого момента полностью читается (для проверки времени чтения).
export function readSpans(scene, S) {
  const times = lineTimes(scene, S.P), per = cyclePeriod(S.bpm);
  return scene.props.lines.map((l, i) => {
    let from = landed(l, times[i], S.P);
    const toks = l.text.split(/\s+/);
    let shown = l.text;
    toks.forEach((tok) => { const m = tok.match(/^\[([^\[\]\s]+)\]([.,!?:;]*)$/); if (m) { const o = m[1].split('|'); from = Math.max(from, times[i] + 0.3 + (o.length - 1) * per + 0.05); shown = shown.replace(tok, o.reduce((a, b) => (b.length > a.length ? b : a)) + m[2]); } });
    return { path: `props.lines[${i}]`, text: shown, from };
  });
}

export function cues(scene, S) {
  const out = [];
  const times = lineTimes(scene, S.P), per = cyclePeriod(S.bpm);
  scene.props.lines.forEach((l, i) => {
    const t0 = times[i], style = l.style || 'slam';
    if (style === 'type') { const cps = typeCps(S.P); for (let k = 0; k < charCount(l); k += 2) out.push({ t: t0 + k / cps, kind: 'tick', gain: 0.35, pitch: 0.95 + ((k * 7) % 5) * 0.03 }); }
    else if (style === 'fade') out.push({ t: t0, kind: 'swish', gain: 0.5 });
    else if (style === 'cut') out.push({ t: t0, kind: 'hit', gain: 0.7 });
    else out.push({ t: t0, kind: style === 'slam' ? 'hit' : 'whoosh', gain: 0.55 });
    l.text.split(/\s+/).forEach((w, wi) => {
      if (isEmph(l, w)) out.push({ t: wordStart(style, t0, wi, S.P) + 0.18 / S.P.speed, kind: 'pop', gain: 0.7, pitch: 1 + 0.12 * i });
      const m = w.match(/^\[([^\[\]\s]+)\]/);
      if (m) for (let k = 1; k < m[1].split('|').length; k++) out.push({ t: wordStart(style, t0, wi, S.P) + 0.3 + k * per, kind: 'tick', gain: 0.6, pitch: 1.1 + 0.12 * k });
    });
  });
  for (const e of scene.events || []) if (e.type === 'emphasis') out.push({ t: e.t, kind: 'pop', gain: 0.8, pitch: 1.2 });
  return out;
}

export function render(ctx, S) {
  const { t, W, H, P, pal, st, tk, props } = S;
  const times = lineTimes(S.scene, P), per = cyclePeriod(S.bpm);
  const maxW = W * 0.86;
  const emphFont = props.emphasisFont ? fontFor(props.emphasisFont, st) : null;
  const blocks = props.lines.map((l) => {
    const lf = fontFor(l.font, st);
    const fontOf = (tok) => (emphFont && isEmph(l, tok) ? emphFont : lf);
    let size = SIZES[l.size || 'l'];
    let lay = layoutWords(ctx, l.text, lf.weight, lf.family, size, maxW, fontOf);
    const widest = Math.max(...lay.lines.map((x) => x.width));
    if (widest > maxW) { size = Math.floor(size * (maxW / widest)); lay = layoutWords(ctx, l.text, lf.weight, lf.family, size, maxW, fontOf); }
    const K = Math.max(...lay.lines.flatMap((ln) => ln.words.map((w) => w.font.k || 1)));
    return { l, size, lay, K, lf, h: lay.lines.length * size * K * 1.06 };
  });
  const gap = 34;
  const total = blocks.reduce((a, b) => a + b.h, 0) + gap * (blocks.length - 1);
  const y = props.layout === 'top' ? H * 0.18 : (H - total) / 2;

  const pulses = [], layoutPos = [];
  let yy = y;
  blocks.forEach((b, bi) => {
    const t0 = times[bi], style = b.l.style || 'slam', lineH = b.size * b.K * 1.06;
    let charIdx = 0;
    b.lay.lines.forEach((ln, li) => {
      ln.words.forEach((w) => {
        const tw = wordStart(style, t0, w.i, P);
        const cs = charIdx; charIdx += [...w.text].length + 1;
        layoutPos.push({ bi, w, ln, tw, cs, cx: W / 2 + w.cx, cy: yy + li * lineH + b.size * b.K * 0.55, base: yy + li * lineH + b.size * b.K * 0.86 });
        if (isEmph(b.l, w.text)) pulses.push({ t: tw + 0.18 / P.speed, x: W / 2 + w.cx, y: yy + li * lineH + b.size * b.K * 0.5, r: 420 * P.amp, color: pal.accent });
      });
    });
    yy += b.h + gap;
  });
  for (const e of S.events) if (e.type === 'emphasis') {
    const lp = layoutPos.find((p) => p.bi === (e.line || 0));
    if (lp) pulses.push({ t: e.t, x: W / 2, y: lp.cy, r: 520 * P.amp, color: pal.accent2 });
  }
  background(ctx, W, H, props.bg || st.bg || 'grid', pal, t, S, pulses);

  const colorOf = (c) => ({ fg: pal.fg, accent: pal.accent, accent2: pal.accent2, muted: pal.muted }[c || 'fg']);
  const shape = props.accentShape || 'underline';
  const cur = (w, tw) => (w.cycle ? w.cycle[Math.floor(Math.max(0, t - tw - 0.3) / per) % w.cycle.length] : w.text);
  const swapAge = (w, tw) => (!w.cycle || t < tw + 0.3 ? 9 : (t - tw - 0.3) % per);
  const caretFor = {};

  for (const p of layoutPos) {
    const b = blocks[p.bi], l = b.l, style = l.style || 'slam';
    const d = S.anim(0.5);
    const emph = isEmph(l, p.w.text);
    const col = emph ? pal.accent : colorOf(l.color);
    const wf = p.w.font, sz = b.size * (wf.k || 1);
    const x = p.cx, base = p.base;
    if (t < p.tw) continue;
    const a = style === 'cut' ? 1 : clamp((t - p.tw) / 0.09);
    const float = Math.sin(t * 2.1 + p.w.i) * 3 * P.amp * P.ambient;
    const fnt = { size: sz, weight: wf.weight, family: wf.family, italic: wf.italic };
    ctx.save();
    if (style === 'slam' || style === 'scale') {
      const pr = prog(t, p.tw, d, E.outBack);
      const s = lerp(style === 'slam' ? 1 + 0.95 * P.amp : 0.6, 1, pr);
      ctx.translate(x, p.cy + float); ctx.scale(s, s);
      const sa = swapAge(p.w, p.tw);
      text(ctx, cur(p.w, p.tw), 0, sz * 0.33 + (sa < 0.2 ? (1 - prog(sa, 0, 0.2, E.outExpo)) * sz * 0.35 : 0), { ...fnt, fill: col, align: 'center', alpha: a * (sa < 0.2 ? 0.35 + 0.65 * prog(sa, 0, 0.2) : 1) });
    } else if (style === 'rise') {
      const pr = prog(t, p.tw, d, E.outExpo);
      text(ctx, cur(p.w, p.tw), x, base + (1 - pr) * 90 * P.amp + float, { ...fnt, fill: col, align: 'center', alpha: a * pr });
    } else if (style === 'mask') {
      const pr = prog(t, p.tw, d * 1.1, E.outExpo);
      ctx.beginPath(); ctx.rect(x - p.w.w / 2 - 12, p.cy - sz * 0.62, p.w.w + 24, sz * 1.18); ctx.clip();
      text(ctx, cur(p.w, p.tw), x, base + (1 - pr) * sz * 1.05, { ...fnt, fill: col, align: 'center' });
    } else if (style === 'fade') {
      // постепенное проявление: плавное нарастание прозрачности и лёгкое «оседание»
      const pr = prog(t, p.tw, S.anim(0.55), E.outQuad);
      const s = lerp(0.95, 1, pr);
      ctx.translate(x, p.cy + float); ctx.scale(s, s);
      text(ctx, cur(p.w, p.tw), 0, sz * 0.33, { ...fnt, fill: col, align: 'center', alpha: pr });
    } else if (style === 'cut') {
      // резко: вся строка возникает мгновенно, без движения
      text(ctx, cur(p.w, p.tw), x, base, { ...fnt, fill: col, align: 'center', alpha: 1 });
    } else if (style === 'type') {
      const nVis = Math.floor((t - times[p.bi]) * typeCps(P)) + 1;
      const word = p.w.text, cnt = clamp(nVis - p.cs, 0, [...word].length);
      if (cnt > 0) {
        const left = x - p.w.w / 2, shown = [...word].slice(0, cnt).join('');
        text(ctx, shown, left, base, { ...fnt, fill: col, align: 'left' });
        const cw = measure(ctx, shown, wf.weight, sz, wf.family, wf.italic);
        caretFor[p.bi] = { x: left + cw + 6, y: base, h: sz, cnt, len: [...word].length, last: p.w.i };
      }
    } else { // cascade — по буквам
      ctx.font = fontStr(wf.weight, sz, wf.family, wf.italic);
      let cx0 = x - p.w.w / 2;
      [...cur(p.w, p.tw)].forEach((ch, ci) => {
        const cw = measure(ctx, ch, wf.weight, sz, wf.family, wf.italic);
        const tc = p.tw + ci * 0.03 * P.stagger;
        const pr = prog(t, tc, S.anim(0.35), E.outBack);
        if (t >= tc) text(ctx, ch, cx0 + cw / 2, base + (1 - pr) * 70 * P.amp + float, { ...fnt, fill: col, align: 'center', alpha: clamp((t - tc) / 0.06) });
        cx0 += cw;
      });
    }
    ctx.restore();

    if (emph && shape !== 'none') {
      const t1 = p.tw + (style === 'type' ? 0.2 : d * 0.55);
      if (shape === 'underline') {
        const pr = prog(t, t1, S.anim(0.4), E.outExpo);
        ctx.save(); ctx.fillStyle = pal.accent2; rrect(ctx, x - p.w.w / 2, base + 16, p.w.w * pr, 14, tk.radius.pill); ctx.fill(); ctx.restore();
      } else if (shape === 'marker') {
        const pr = prog(t, t1 - 0.1, S.anim(0.35), E.outExpo);
        ctx.save(); ctx.globalCompositeOperation = 'destination-over'; ctx.fillStyle = rgba(pal.accent, 0.28);
        rrect(ctx, x - p.w.w / 2 - 14, p.cy - sz * 0.45, (p.w.w + 28) * pr, sz * 0.95, tk.radius.chip); ctx.fill(); ctx.restore();
      } else if (shape === 'ring') {
        const age = t - t1;
        if (age > 0 && age < 0.7) { const k = age / 0.7; ring(ctx, x, p.cy, 30 + k * 300 * P.amp, 7 * (1 - k) + 1, pal.accent2, 1 - k); }
      }
    }
  }
  // курсор печатной машинки: мигает, пока строка печатается и ещё чуть-чуть после
  for (const [bi, c] of Object.entries(caretFor)) {
    const b = blocks[bi], tDone = times[bi] + charCount(b.l) / typeCps(P);
    if (t < tDone + 0.8 && Math.floor(t * 5) % 2 === 0) { ctx.fillStyle = pal.accent; ctx.fillRect(c.x, c.y - c.h * 0.8, 6, c.h * 0.95); }
  }
}

import { createCanvas } from '@napi-rs/canvas';
let _scratch = null;
export function anchors(scene, S) {
  const { W, H, st } = S, props = scene.props; _scratch = _scratch || createCanvas(8, 8).getContext('2d');
  const maxW = W * 0.86, emphFont = props.emphasisFont ? fontFor(props.emphasisFont, st) : null;
  const blocks = props.lines.map((l) => {
    const lf = fontFor(l.font, st), fontOf = (tok) => (emphFont && isEmph(l, tok) ? emphFont : lf);
    let size = SIZES[l.size || 'l'], lay = layoutWords(_scratch, l.text, lf.weight, lf.family, size, maxW, fontOf);
    const widest = Math.max(...lay.lines.map((x) => x.width)); if (widest > maxW) { size = Math.floor(size * (maxW / widest)); lay = layoutWords(_scratch, l.text, lf.weight, lf.family, size, maxW, fontOf); }
    const K = Math.max(...lay.lines.flatMap((ln) => ln.words.map((w) => w.font.k || 1)));
    return { size, lay, h: lay.lines.length * size * K * 1.06 };
  });
  const gap = 34, total = blocks.reduce((a, b) => a + b.h, 0) + gap * (blocks.length - 1);
  let yy = props.layout === 'top' ? H * 0.18 : (H - total) / 2;
  const out = { block: { x: 0.5, y: (yy + total / 2) / H, w: 0.9, h: total / H } };
  blocks.forEach((b, i) => { out[`line${i}`] = { x: 0.5, y: (yy + b.h / 2) / H, w: Math.min(0.92, Math.max(...b.lay.lines.map((l) => l.width)) / W + 0.05), h: b.h / H + 0.012 }; yy += b.h + gap; });
  return out;
}
