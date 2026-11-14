// stat_counter — число набирается, кольцо/полоса заполняется, по завершении — взрыв лучей.
import { E, prog, clamp, lerp, rgba } from '../../util.js';
import { background, text, rrect, ring } from '../draw.js';
import { fontFor, checkFont } from '../fonts.js';

export const spec = {
  name: 'stat_counter',
  summary: 'Big animated number with a filling ring/bar and a label. Use for a proof point or scale (users, speed, count).',
  props: {
    value: 'number to count up to',
    from: 'number (0)',
    prefix: 'string e.g. "+" (optional)', suffix: 'string e.g. "%" or " mln" (optional)',
    label: 'string<=40 — what the number means',
    sub: 'string<=48 optional secondary line',
    shape: '"ring|bar|burst" (ring)',
    at: 'seconds in scene when counting starts (0.3)',
    font: '"display|grotesk|condensed|serif|serif-italic|didone|humanist|slab|mono|typewriter|hand|tight|rounded" — font role for the number (default display)',
    labelFont: 'font role for label and sub (default display)',
    bg: '"solid|grid|dots|rings|gradient" (gradient)',
  },
  events: { punch: 'camera hit {strength?}', shake: 'shake {strength?}', flash: 'flash {strength?}' },
};

export function check(scene) {
  const errors = [], warnings = [], p = scene.props || {};
  checkFont(errors, 'props.font', p.font); checkFont(errors, 'props.labelFont', p.labelFont);
  if (typeof p.value !== 'number' || !isFinite(p.value)) errors.push({ path: 'props.value', message: 'value must be a finite number' });
  if (typeof p.label !== 'string' || !p.label || p.label.length > 40) errors.push({ path: 'props.label', message: 'label required, max 40 chars' });
  if (p.sub && p.sub.length > 48) errors.push({ path: 'props.sub', message: 'sub max 48 chars' });
  if (p.shape && !['ring', 'bar', 'burst'].includes(p.shape)) errors.push({ path: 'props.shape', message: 'shape must be ring|bar|burst' });
  if (p.at != null && (p.at < 0 || p.at > scene.duration - 0.8)) errors.push({ path: 'props.at', message: `at must leave >=0.8s to count: 0..${(scene.duration - 0.8).toFixed(1)}` });
  return { errors, warnings };
}
export const countEvents = (scene) => 3 + (scene.events || []).length; // число, заполнение, подпись

const fmt = (v) => (Math.abs(v) >= 100 ? Math.round(v).toLocaleString('en-US').replace(/,/g, ' ') : String(Math.round(v * 10) / 10).replace('.', ','));
const countDur = (S) => S.anim(1.3);

export function readSpans(scene, S) {
  const P = S.P, p = scene.props, at = p.at ?? 0.3, d = 1.3 / P.speed;
  const out = [{ path: 'props.value', text: `${p.prefix || ''}${p.value}${p.suffix || ''}`, from: at + d, weight: 0.5 }, { path: 'props.label', text: p.label, from: at + d * 0.5 + 0.5 / P.speed }];
  if (p.sub) out.push({ path: 'props.sub', text: p.sub, from: at + d * 0.75 + 0.5 / P.speed });
  return out;
}

export function cues(scene, S) {
  const at = scene.props.at ?? 0.3, d = 1.3 / S.P.speed;
  const out = [{ t: at, kind: 'whoosh', gain: 0.5 }];
  for (let i = 1; i <= 6; i++) out.push({ t: at + (d * i) / 7, kind: 'tick', gain: 0.4, pitch: 0.9 + i * 0.07 });
  out.push({ t: at + d, kind: 'hit', gain: 0.9 });
  out.push({ t: at + d + 0.25, kind: 'ding', gain: 0.5 });
  return out;
}

export function render(ctx, S) {
  const { t, W, H, P, pal, st, tk, props } = S;
  const at = props.at ?? 0.3, d = countDur(S);
  const k = prog(t, at, d, E.outCubic);
  const v = lerp(props.from ?? 0, props.value, k);
  const done = at + d;
  background(ctx, W, H, props.bg || 'gradient', pal, t, S, [{ t: done, x: W / 2, y: H * 0.42, r: 600 * P.amp, color: pal.accent }]);
  const cx = W / 2, cy = H * 0.42;
  const shape = props.shape || 'ring';
  const pop = t >= done ? 1 + 0.06 * P.amp * Math.exp(-(t - done) * 9) : 1;

  if (shape === 'ring') {
    const R = 360;
    ring(ctx, cx, cy, R, 22, rgba(pal.fg, 0.12), prog(t, 0, 0.4));
    ctx.save(); ctx.lineCap = 'round'; ctx.lineWidth = 26; ctx.strokeStyle = pal.accent;
    ctx.beginPath(); ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * 0.86 * k); ctx.stroke(); ctx.restore();
  } else if (shape === 'bar') {
    const bw = W * 0.74, by = cy + 150;
    ctx.fillStyle = rgba(pal.fg, 0.12); rrect(ctx, (W - bw) / 2, by, bw, 34, tk.radius.pill); ctx.fill();
    ctx.fillStyle = pal.accent; rrect(ctx, (W - bw) / 2, by, Math.max(34, bw * k), 34, tk.radius.pill); ctx.fill();
  } else {
    const n = 28;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, bp = prog(t, done, S.anim(0.6), E.outExpo);
      const r1 = 330 + bp * 60, r2 = r1 + 40 + bp * 220 * P.amp * (i % 2 ? 1 : 0.6);
      ctx.strokeStyle = rgba(i % 2 ? pal.accent : pal.accent2, (1 - bp * 0.6) * clamp(k * 2));
      ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2); ctx.stroke();
    }
  }
  const shown = (props.prefix || '') + fmt(v) + (props.suffix || '');
  const nf = fontFor(props.font, st), lf = fontFor(props.labelFont, st);
  let size = 250 * nf.k; const fs_ = (sz) => `${nf.italic ? 'italic ' : ''}${nf.weight} ${Math.round(sz)}px "${nf.family}"`; ctx.font = fs_(size); while (ctx.measureText(shown).width > W * 0.72 && size > 80) { size -= 8; ctx.font = fs_(size); }
  ctx.save(); ctx.translate(cx, cy); ctx.scale(pop, pop);
  text(ctx, shown, 0, size * 0.34, { size, weight: nf.weight, family: nf.family, italic: nf.italic, fill: pal.fg, align: 'center', alpha: clamp(t / 0.25) });
  ctx.restore();
  const lp = prog(t, at + d * 0.5, S.anim(0.5), E.outExpo);
  text(ctx, props.label, W / 2, cy + 470 + (1 - lp) * 50 * P.amp, { size: 62 * lf.k, weight: lf.weight === 800 ? 700 : lf.weight, family: lf.family, italic: lf.italic, fill: pal.accent2, align: 'center', alpha: lp });
  if (props.sub) {
    const sp = prog(t, at + d * 0.75, S.anim(0.5), E.outExpo);
    text(ctx, props.sub, W / 2, cy + 550 + (1 - sp) * 40 * P.amp, { size: 40 * lf.k, weight: lf.weight === 800 ? 500 : lf.weight, family: lf.family, italic: lf.italic, fill: pal.muted, align: 'center', alpha: sp });
  }
}

export function anchors(scene, S) { return { number: { x: 0.5, y: 0.42, w: 0.74, h: 0.17 }, label: { x: 0.5, y: (S.H * 0.42 + 470) / S.H, w: 0.8, h: 0.05 } }; }
