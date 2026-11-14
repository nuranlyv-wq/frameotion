// cta_end — финальный призыв: заголовок, кнопка с пульсом, адрес сайта печатается.
import { E, prog, clamp, lerp, rgba, mulberry32 } from '../../util.js';
import { background, text, rrect, disc, layoutWords, measure, icon } from '../draw.js';
import { fontFor, checkFont } from '../fonts.js';

export const spec = {
  name: 'cta_end',
  summary: 'Closing call-to-action: headline words rise, button pops and pulses, the site URL types in, particles burst. Use as the final scene.',
  props: {
    headline: 'string<=40',
    button: 'string<=22 — button label',
    url: 'string<=40 — the site address shown (e.g. google.com)',
    font: '"display|grotesk|condensed|serif|serif-italic|didone|humanist|slab|mono|typewriter|hand|tight|rounded" — font role for the headline (default display)',
    urlFont: 'font role for the url line (default mono)',
    bg: '"solid|grid|dots|rings|gradient" (gradient)',
  },
  events: { punch: 'camera hit {strength?}', shake: 'shake {strength?}', flash: 'flash {strength?}' },
};

export function check(scene) {
  const errors = [], p = scene.props || {};
  checkFont(errors, 'props.font', p.font); checkFont(errors, 'props.urlFont', p.urlFont);
  if (typeof p.headline !== 'string' || !p.headline || p.headline.length > 40) errors.push({ path: 'props.headline', message: 'headline required, max 40 chars' });
  if (typeof p.button !== 'string' || !p.button || p.button.length > 22) errors.push({ path: 'props.button', message: 'button required, max 22 chars' });
  if (typeof p.url !== 'string' || !p.url || p.url.length > 40) errors.push({ path: 'props.url', message: 'url required, max 40 chars' });
  return { errors, warnings: [] };
}
export const countEvents = (scene) => 3 + (scene.events || []).length; // заголовок, кнопка, адрес

export function readSpans(scene, S) {
  const P = S.P, bt = 0.55 / P.speed + 0.3, words = scene.props.headline.split(/\s+/).length, cps = 16 * Math.min(P.speed, 1.5);
  return [
    { path: 'props.headline', text: scene.props.headline, from: 0.1 + (words - 1) * 0.1 * P.stagger + 0.55 / P.speed },
    { path: 'props.button', text: scene.props.button, from: bt + 0.4, weight: 0.6 },
    { path: 'props.url', text: scene.props.url, from: bt + 0.35 + scene.props.url.length / cps, weight: 0.5 },
  ];
}

export function cues(scene, S) {
  return [
    { t: 0.1, kind: 'whoosh', gain: 0.5 },
    { t: 0.55 / S.P.speed + 0.3, kind: 'hit', gain: 0.85 },
    { t: 0.55 / S.P.speed + 0.75, kind: 'ding', gain: 0.5 },
  ];
}

export function render(ctx, S) {
  const { t, W, H, P, pal, st, tk, props } = S;
  const bt = 0.55 / P.speed + 0.3;
  background(ctx, W, H, props.bg || 'gradient', pal, t, S, [{ t: bt, x: W / 2, y: H * 0.58, r: 700 * P.amp, color: pal.accent }]);
  const hf = fontFor(props.font, st), uf = fontFor(props.urlFont || 'mono', st);
  const tsz = 112 * hf.k;
  const lay = layoutWords(ctx, props.headline, hf.weight, hf.family, 112, W * 0.84, () => hf);   // база без k: раскладка сама умножает на k шрифта
  let y = H * 0.27;
  lay.lines.forEach((ln) => {
    ln.words.forEach((w) => {
      const tw = 0.1 + w.i * 0.1 * P.stagger, pr = prog(t, tw, S.anim(0.55), E.outExpo);
      text(ctx, w.text, W / 2 + w.cx, y + tsz * 0.85 + (1 - pr) * 110 * P.amp, { size: tsz, weight: hf.weight, family: hf.family, italic: hf.italic, fill: pal.fg, align: 'center', alpha: pr });
    });
    y += tsz * 1.08;
  });
  // кнопка
  const bp = prog(t, bt - 0.25, S.anim(0.5), E.outBack);
  if (bp > 0) {
    const pulse = 1 + 0.035 * P.amp * Math.max(0, Math.sin((t - bt) * (S.bpm / 60) * Math.PI * 2)) ;
    ctx.save(); ctx.translate(W / 2, H * 0.6); ctx.scale(lerp(0.4, 1, bp) * pulse, lerp(0.4, 1, bp) * pulse);
    ctx.font = `700 60px "${st.family}"`; const bw = Math.max(440, ctx.measureText(props.button).width + 150);
    ctx.shadowColor = rgba(pal.accent, 0.55); ctx.shadowBlur = 60; ctx.shadowOffsetY = 14;
    ctx.fillStyle = pal.accent; rrect(ctx, -bw / 2, -75, bw, 150, tk.radius.pill); ctx.fill(); ctx.shadowColor = 'transparent';
    text(ctx, props.button, 0, 21, { size: 60, weight: 700, family: st.family, fill: pal.bg, align: 'center' });
    ctx.restore();
  }
  // адрес печатается
  const ut = bt + 0.35, cps = 16 * Math.min(P.speed, 1.5);
  const n = clamp(Math.floor((t - ut) * cps) + 1, 0, props.url.length) * (t >= ut ? 1 : 0);
  if (n > 0) {
    const shown = props.url.slice(0, n);
    text(ctx, shown, W / 2, H * 0.6 + 230, { size: 62 * uf.k, weight: uf.weight, family: uf.family, italic: uf.italic, fill: pal.accent2, align: 'center' });
  }
  // частицы
  const r = mulberry32(11);
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2, sp = 260 + r() * 520, age = t - bt; if (age < 0 || age > 1.2) { r(); continue; }
    const k = age / 1.2, d = sp * E.outCubic(k) * P.amp;
    disc(ctx, W / 2 + Math.cos(a) * d, H * 0.6 + Math.sin(a) * d + age * age * 160, (6 + r() * 10) * (1 - k), i % 2 ? pal.accent : pal.accent2, 1 - k);
  }
}

export function anchors(scene, S) { return { button: { x: 0.5, y: 0.6, w: 0.56, h: 150 / S.H }, headline: { x: 0.5, y: 0.31, w: 0.86, h: 0.16 }, url: { x: 0.5, y: 0.72, w: 0.5, h: 0.05 } }; }
