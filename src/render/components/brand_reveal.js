// brand_reveal — сборка бренда: орбиты/фигуры сходятся, название поднимается из-под маски, слоган.
import { E, prog, clamp, lerp, rgba } from '../../util.js';
import { background, text, disc, ring, fontStr, measure } from '../draw.js';
import { fontFor, checkFont } from '../fonts.js';

export const spec = {
  name: 'brand_reveal',
  summary: 'Brand wordmark reveal with orbiting shapes converging; optional tagline; uses the imported logo image when available. Good opener or closer.',
  props: {
    name: 'string<=24 — brand name',
    tagline: 'string<=44 optional',
    build: '"orbit|wipe|stack" (orbit)',
    logo: 'boolean — draw the imported logo/favicon in a badge if available (true)',
    font: '"display|grotesk|condensed|serif|serif-italic|didone|humanist|slab|mono|typewriter|hand|tight|rounded" — font role for the name (default display)',
    taglineFont: 'font role for the tagline (default humanist)',
    bg: '"solid|grid|dots|rings|gradient" (rings)',
  },
  events: { punch: 'camera hit {strength?}', shake: 'shake {strength?}', flash: 'flash {strength?}' },
};

export function check(scene) {
  const errors = [], p = scene.props || {};
  checkFont(errors, 'props.font', p.font); checkFont(errors, 'props.taglineFont', p.taglineFont);
  if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 24) errors.push({ path: 'props.name', message: 'name required, max 24 chars' });
  if (p.tagline && p.tagline.length > 44) errors.push({ path: 'props.tagline', message: 'tagline max 44 chars' });
  if (p.build && !['orbit', 'wipe', 'stack'].includes(p.build)) errors.push({ path: 'props.build', message: 'build must be orbit|wipe|stack' });
  return { errors, warnings: [] };
}
export const countEvents = (scene) => 3 + (scene.events || []).length; // сборка, имя, слоган

export function readSpans(scene, S) {
  const P = S.P, land = 0.05 + 0.75 / P.speed, n = [...scene.props.name].length;
  const out = [{ path: 'props.name', text: scene.props.name, from: 0.05 + 0.55 / P.speed + n * 0.045 * P.stagger + 0.5 / P.speed, weight: 0.7 }];
  if (scene.props.tagline) out.push({ path: 'props.tagline', text: scene.props.tagline, from: land + 0.2 + 0.5 / P.speed });
  return out;
}

export function cues(scene, S) {
  return [
    { t: 0.05, kind: 'riser', gain: 0.5 },
    { t: 0.05 + 0.75 / S.P.speed, kind: 'hit', gain: 0.95 },
    { t: 0.05 + 1.0 / S.P.speed, kind: 'ding', gain: 0.55 },
  ];
}

export function render(ctx, S) {
  const { t, W, H, P, pal, st, props, assets } = S;
  const land = 0.05 + 0.75 / P.speed;
  background(ctx, W, H, props.bg || 'rings', pal, t, S, [{ t: land, x: W / 2, y: H * 0.45, r: 650 * P.amp, color: pal.accent }]);
  const cx = W / 2, cy = H * 0.45;
  const build = props.build || 'orbit';
  const conv = prog(t, 0, S.anim(0.8), E.inOutCubic);
  if (build === 'orbit' || build === 'stack') {
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2 + t * 1.4 * P.speed;
      const rad = (1 - conv) * (520 + i * 40) + conv * 0;
      const r = 26 - i * 2;
      disc(ctx, cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad, r * (1 - conv * 0.6), i % 2 ? pal.accent : pal.accent2, 1 - conv * 0.9);
    }
  }
  if (build === 'wipe') {
    const wp = prog(t, 0, S.anim(0.7), E.outExpo);
    ctx.fillStyle = pal.accent; ctx.fillRect(0, cy - 8, W * wp, 16);
  }
  const logo = props.logo !== false && assets?.logoImage;
  let nameY = cy + 40;
  if (logo) {
    const bp = prog(t, 0.1, S.anim(0.6), E.outBack);
    const R = 120 * bp;
    disc(ctx, cx, cy - 190, R + 18, '#ffffff');
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy - 190, R, 0, Math.PI * 2); ctx.clip();
    const s = (R * 2) / Math.max(logo.width, logo.height); const w = logo.width * s, h = logo.height * s;
    ctx.drawImage(logo, cx - w / 2, cy - 190 - h / 2, w, h); ctx.restore();
    nameY = cy + 80;
  }
  // название поднимается из-под маски
  const name = props.name;
  const nf = fontFor(props.font, st), tf = fontFor(props.taglineFont || 'humanist', st);
  let size = 170 * nf.k; while (measure(ctx, name, nf.weight, size, nf.family, nf.italic) > W * 0.84 && size > 60) size -= 6;
  ctx.font = fontStr(nf.weight, size, nf.family, nf.italic);
  const chars = [...name]; const ws = chars.map((c) => ctx.measureText(c).width); const tot = ws.reduce((a, b) => a + b, 0);
  ctx.save(); ctx.beginPath(); ctx.rect(0, nameY - size * 1.05, W, size * 1.4); ctx.clip();
  let x = cx - tot / 2;
  chars.forEach((c, i) => {
    const tc = 0.05 + 0.55 / P.speed + i * 0.045 * P.stagger;
    const pr = prog(t, tc, S.anim(0.5), E.outExpo);
    text(ctx, c, x + ws[i] / 2, nameY + (1 - pr) * size * 1.1, { size, weight: nf.weight, family: nf.family, italic: nf.italic, fill: pal.fg, align: 'center' });
    x += ws[i];
  });
  ctx.restore();
  // линия-подчёркивание
  const lp = prog(t, land, S.anim(0.5), E.outExpo);
  ctx.fillStyle = pal.accent; ctx.fillRect(cx - (tot / 2) * lp, nameY + 28, tot * lp, 10);
  if (props.tagline) {
    const tp = prog(t, land + 0.2, S.anim(0.5), E.outExpo);
    text(ctx, props.tagline, cx, nameY + 120 + (1 - tp) * 30 * P.amp, { size: 52 * tf.k, weight: tf.weight === 800 ? 500 : tf.weight, family: tf.family, italic: tf.italic, fill: pal.muted, align: 'center', alpha: tp });
  }
}

export function anchors(scene, S) { return { name: { x: 0.5, y: 0.5, w: 0.82, h: 0.14 }, badge: { x: 0.5, y: (S.H * 0.45 - 190) / S.H, w: 0.26, h: 0.14 } }; }
