// ui_cards — заголовок + карточки-фичи с иконками влетают поочерёдно; графика и текст в одном действии.
import { E, prog, clamp, lerp, rgba, mix } from '../../util.js';
import { background, text, rrect, disc, icon, ICON_NAMES, layoutWords, ring } from '../draw.js';
import { fontFor, checkFont } from '../fonts.js';

export const spec = {
  name: 'ui_cards',
  summary: 'A headline that slams in plus 2–4 feature cards with vector icons flying in one after another. Use to show benefits/features.',
  props: {
    title: 'string<=36 headline above the cards',
    items: `[{icon:"${ICON_NAMES.join('|')}", title:string<=26, sub:string<=34 optional, at:number seconds optional}] 2..4 items`,
    layout: '"stack|fan" (stack)',
    font: '"display|grotesk|condensed|serif|serif-italic|didone|humanist|slab|mono|typewriter|hand|tight|rounded" — font role for the headline (default display)',
    itemFont: 'font role for the card titles (default display)',
    bg: '"solid|grid|dots|rings|gradient" (dots)',
  },
  events: { punch: 'camera hit {strength?}', shake: 'shake {strength?}', flash: 'flash {strength?}' },
};

export function check(scene) {
  const errors = [], p = scene.props || {};
  checkFont(errors, 'props.font', p.font); checkFont(errors, 'props.itemFont', p.itemFont);
  if (typeof p.title !== 'string' || !p.title || p.title.length > 36) errors.push({ path: 'props.title', message: 'title required, max 36 chars' });
  if (!Array.isArray(p.items) || p.items.length < 2 || p.items.length > 4) { errors.push({ path: 'props.items', message: 'items must have 2..4 entries' }); return { errors, warnings: [] }; }
  p.items.forEach((it, i) => {
    if (!ICON_NAMES.includes(it.icon)) errors.push({ path: `props.items[${i}].icon`, message: `icon must be one of ${ICON_NAMES.join('|')}` });
    if (typeof it.title !== 'string' || !it.title || it.title.length > 26) errors.push({ path: `props.items[${i}].title`, message: 'title required, max 26 chars' });
    if (it.sub && it.sub.length > 34) errors.push({ path: `props.items[${i}].sub`, message: 'sub max 34 chars' });
    if (it.at != null && (it.at < 0.3 || it.at > scene.duration - 0.5)) errors.push({ path: `props.items[${i}].at`, message: `at must be within 0.3..${(scene.duration - 0.5).toFixed(1)}` });
  });
  return { errors, warnings: [] };
}
export const countEvents = (scene) => 1 + (scene.props.items || []).length + (scene.events || []).length;

function itemTimes(scene, P) {
  const n = scene.props.items.length;
  const span = Math.max(0.5, scene.duration - 1.6);
  return scene.props.items.map((it, i) => it.at ?? Math.min(scene.duration - 0.7, 0.55 + ((span * i) / Math.max(1, n)) * 0.85 * P.stagger));
}

export function readSpans(scene, S) {
  const P = S.P, words = scene.props.title.split(/\s+/).length;
  const out = [{ path: 'props.title', text: scene.props.title, from: 0.1 + (words - 1) * 0.09 * P.stagger + 0.5 / P.speed }];
  itemTimes(scene, P).forEach((t, i) => { const it = scene.props.items[i]; out.push({ path: `props.items[${i}]`, text: `${it.title} ${it.sub || ''}`.trim(), from: t + 0.6 / P.speed, weight: 0.8 }); });
  return out;
}

export function cues(scene, S) {
  const out = [{ t: 0.1, kind: 'hit', gain: 0.6 }];
  itemTimes(scene, S.P).forEach((t, i) => out.push({ t, kind: 'pop', gain: 0.7, note: i }));
  return out;
}

export function render(ctx, S) {
  const { t, W, H, P, pal, st, tk, props } = S;
  background(ctx, W, H, props.bg || 'dots', pal, t, S);
  // заголовок: слова бьются в кадр
  const hf = fontFor(props.font, st), cf = fontFor(props.itemFont, st);
  const tsz = 98 * hf.k;
  const lay = layoutWords(ctx, props.title, hf.weight, hf.family, 98, W * 0.84, () => hf);   // база без k: раскладка сама умножает на k шрифта
  let y = H * 0.13;
  lay.lines.forEach((ln) => {
    ln.words.forEach((w) => {
      const tw = 0.1 + w.i * 0.09 * P.stagger, pr = prog(t, tw, S.anim(0.5), E.outBack);
      if (t < tw) return;
      ctx.save(); ctx.translate(W / 2 + w.cx, y + tsz * 0.55); const s = lerp(1 + 0.7 * P.amp, 1, pr); ctx.scale(s, s);
      text(ctx, w.text, 0, tsz * 0.3, { size: tsz, weight: hf.weight, family: hf.family, italic: hf.italic, fill: pal.fg, align: 'center', alpha: clamp((t - tw) / 0.08) });
      ctx.restore();
    });
    y += tsz * 1.08;
  });
  const items = props.items, times = itemTimes(S.scene, P);
  const cardH = 230, gap = 34, cw = W * 0.86;
  const startY = Math.max(y + 50, H * 0.3);
  items.forEach((it, i) => {
    const ta = times[i];
    if (t < ta) return;
    const pr = prog(t, ta, S.anim(0.6), E.outBack);
    const fromX = i % 2 ? W + 300 : -cw - 300;
    const fan = props.layout === 'fan';
    const targetY = startY + i * (cardH + gap);
    const cx = lerp(fromX, (W - cw) / 2 + (fan ? (i % 2 ? 24 : -24) : 0), E.outCubic(clamp((t - ta) / S.anim(0.55))));
    const rot = fan ? (i % 2 ? 1 : -1) * 0.025 * (1 - pr) * P.amp : (i % 2 ? 1 : -1) * 0.05 * (1 - pr) * P.amp;
    ctx.save();
    ctx.translate(cx + cw / 2, targetY + cardH / 2); ctx.rotate(rot); ctx.scale(lerp(0.9, 1, pr), lerp(0.9, 1, pr));
    ctx.shadowColor = 'rgba(0,0,0,0.38)'; ctx.shadowBlur = 36; ctx.shadowOffsetY = 14;
    ctx.fillStyle = mix(pal.bg, '#ffffff', 0.1); rrect(ctx, -cw / 2, -cardH / 2, cw, cardH, tk.radius.card); ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = rgba(pal.fg, 0.14); ctx.lineWidth = tk.stroke.hair; rrect(ctx, -cw / 2, -cardH / 2, cw, cardH, tk.radius.card); ctx.stroke();
    const badge = 128;
    ctx.fillStyle = i % 2 ? pal.accent2 : pal.accent; rrect(ctx, -cw / 2 + 36, -badge / 2, badge, badge, tk.radius.pill); ctx.fill();
    icon(ctx, it.icon, -cw / 2 + 36 + badge / 2, 0, 68, pal.bg, 7);
    text(ctx, it.title, -cw / 2 + 36 + badge + 36, it.sub ? -6 : 16, { size: 56 * cf.k, weight: cf.weight === 800 ? 700 : cf.weight, family: cf.family, italic: cf.italic, fill: pal.fg });
    if (it.sub) text(ctx, it.sub, -cw / 2 + 36 + badge + 36, 54, { size: 36, weight: 500, family: st.family, fill: pal.muted });
    ctx.restore();
    const age = t - ta; if (age < 0.6) ring(ctx, (W) / 2, targetY + cardH / 2, 80 + age * 1100, 5 * (1 - age / 0.6) + 1, i % 2 ? pal.accent2 : pal.accent, (1 - age / 0.6) * 0.45);
  });
}

import { createCanvas } from '@napi-rs/canvas';
let _scratch = null;
export function anchors(scene, S) {
  const { W, H, st } = S, p = scene.props, hf = fontFor(p.font, st);
  _scratch = _scratch || createCanvas(8, 8).getContext('2d');
  const lay = layoutWords(_scratch, p.title, hf.weight, hf.family, 98, W * 0.84, () => hf), tsz = 98 * hf.k;
  const titleBottom = H * 0.13 + lay.lines.length * tsz * 1.08, startY = Math.max(titleBottom + 50, H * 0.3);
  const out = { title: { x: 0.5, y: (H * 0.13 + (lay.lines.length * tsz * 1.08) / 2) / H, w: 0.86, h: (lay.lines.length * tsz * 1.08) / H } };
  (p.items || []).forEach((it, i) => { out[`card${i}`] = { x: 0.5, y: (startY + i * 264 + 115) / H, w: 0.86, h: 230 / H }; });
  return out;
}
