// Низкоуровневые примитивы рисования для @napi-rs/canvas.
import { clamp, lerp, mix, rgba, mulberry32 } from '../util.js';

import { DEFAULT_FAMILY, resolveFamily } from './fonts.js';   // импорт регистрирует встроенные шрифты в canvas
export { DEFAULT_FAMILY };
export const fontStr = (weight, size, family = DEFAULT_FAMILY, italic = false) => `${italic ? 'italic ' : ''}${weight} ${Math.round(size)}px "${resolveFamily(family)}"`;

export function rrect(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function text(ctx, s, x, y, o = {}) {
  const { size = 48, weight = 700, family = DEFAULT_FAMILY, italic = false, fill = '#fff', align = 'left', base = 'alphabetic', alpha = 1, stroke, lw = 0 } = o;
  ctx.save();
  ctx.globalAlpha *= clamp(alpha);
  ctx.font = fontStr(weight, size, family, italic);
  ctx.textAlign = align;
  ctx.textBaseline = base;
  if (stroke && lw) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.lineJoin = 'round'; ctx.strokeText(s, x, y); }
  ctx.fillStyle = fill;
  ctx.fillText(s, x, y);
  ctx.restore();
}

export function measure(ctx, s, weight, size, family = DEFAULT_FAMILY, italic = false) {
  ctx.font = fontStr(weight, size, family, italic);
  return ctx.measureText(s).width;
}

// Подбор размера шрифта под максимальную ширину.
export function fitSize(ctx, s, weight, family, size, maxW) {
  const w = measure(ctx, s, weight, size, family);
  return w <= maxW ? size : Math.floor(size * (maxW / w));
}

// Раскладка слов по строкам с переносом. Координаты слов — относительно центра строки.
// fontOf(token) → {family, weight, italic, k} позволяет задать шрифт отдельному слову (пары шрифтов).
export function layoutWords(ctx, s, weight, family, size, maxW, fontOf = null) {
  const base = { family, weight, italic: false, k: 1 };
  const meas = (t, f) => { ctx.font = fontStr(f.weight, size * (f.k || 1), f.family, f.italic); return ctx.measureText(t).width; };
  const space = meas(' ', base);
  const words = s.split(/\s+/).filter(Boolean).map((t) => {
    const f = (fontOf && fontOf(t)) || base;
    const m = t.match(/^\[([^\[\]\s]+)\]([.,!?:;]*)$/);   // [a|b|c] — слово, которое меняется на бит
    if (m) { const opts = m[1].split('|').map((o) => o + m[2]); return { text: opts[0], cycle: opts, font: f, w: Math.max(...opts.map((o) => meas(o, f))) }; }
    return { text: t, font: f, w: meas(t, f) };
  });
  const lines = [];
  let cur = { words: [], width: 0 };
  for (const w of words) {
    const add = cur.words.length ? space + w.w : w.w;
    if (cur.words.length && cur.width + add > maxW) { lines.push(cur); cur = { words: [], width: 0 }; }
    cur.width += cur.words.length ? space + w.w : w.w;
    cur.words.push(w);
  }
  if (cur.words.length) lines.push(cur);
  let idx = 0;
  for (const ln of lines) {
    let x = -ln.width / 2;
    for (const w of ln.words) { w.x = x; w.cx = x + w.w / 2; w.i = idx++; x += w.w + space; }
  }
  return { lines, space };
}

export function ring(ctx, x, y, r, lw, color, alpha = 1) {
  if (alpha <= 0 || r <= 0) return;
  ctx.save();
  ctx.globalAlpha *= clamp(alpha);
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.lineWidth = lw; ctx.strokeStyle = color; ctx.stroke();
  ctx.restore();
}

export function disc(ctx, x, y, r, color, alpha = 1) {
  if (alpha <= 0 || r <= 0) return;
  ctx.save();
  ctx.globalAlpha *= clamp(alpha);
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color; ctx.fill();
  ctx.restore();
}

// Векторные иконки (вписаны в квадрат size × size вокруг центра).
export function icon(ctx, name, cx, cy, size, color, lw = 6) {
  const s = size / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = color; ctx.fillStyle = color;
  ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  switch (name) {
    case 'search':
      ctx.arc(-s * 0.15, -s * 0.15, s * 0.55, 0, Math.PI * 2); ctx.moveTo(s * 0.25, s * 0.25); ctx.lineTo(s * 0.8, s * 0.8); ctx.stroke(); break;
    case 'map':
      ctx.arc(0, -s * 0.2, s * 0.5, Math.PI * 0.85, Math.PI * 2.15); ctx.lineTo(0, s * 0.85); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -s * 0.2, s * 0.17, 0, Math.PI * 2); ctx.fill(); break;
    case 'bolt':
      ctx.moveTo(s * 0.2, -s * 0.9); ctx.lineTo(-s * 0.5, s * 0.1); ctx.lineTo(-s * 0.05, s * 0.1); ctx.lineTo(-s * 0.2, s * 0.9); ctx.lineTo(s * 0.5, -s * 0.15); ctx.lineTo(s * 0.05, -s * 0.15); ctx.closePath(); ctx.stroke(); break;
    case 'lock':
      rrect(ctx, -s * 0.6, -s * 0.1, s * 1.2, s * 0.9, 8); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -s * 0.15, s * 0.38, Math.PI, 0); ctx.stroke(); break;
    case 'globe':
      ctx.arc(0, 0, s * 0.8, 0, Math.PI * 2); ctx.moveTo(-s * 0.8, 0); ctx.lineTo(s * 0.8, 0);
      ctx.moveTo(0, -s * 0.8); ctx.ellipse(0, 0, s * 0.35, s * 0.8, 0, -Math.PI / 2, Math.PI * 1.5); ctx.stroke(); break;
    case 'spark':
      ctx.moveTo(0, -s * 0.9); ctx.quadraticCurveTo(0, 0, s * 0.9, 0); ctx.quadraticCurveTo(0, 0, 0, s * 0.9);
      ctx.quadraticCurveTo(0, 0, -s * 0.9, 0); ctx.quadraticCurveTo(0, 0, 0, -s * 0.9); ctx.closePath(); ctx.stroke(); break;
    case 'heart':
      ctx.moveTo(0, s * 0.75); ctx.bezierCurveTo(-s * 1.1, -s * 0.1, -s * 0.5, -s * 0.9, 0, -s * 0.3);
      ctx.bezierCurveTo(s * 0.5, -s * 0.9, s * 1.1, -s * 0.1, 0, s * 0.75); ctx.closePath(); ctx.stroke(); break;
    case 'check':
      ctx.moveTo(-s * 0.7, 0); ctx.lineTo(-s * 0.2, s * 0.55); ctx.lineTo(s * 0.75, -s * 0.5); ctx.stroke(); break;
    case 'star': {
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? s * 0.4 : s * 0.9;
        i ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath(); ctx.stroke(); break;
    }
    case 'chat':
      rrect(ctx, -s * 0.85, -s * 0.7, s * 1.7, s * 1.2, 16); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s * 0.3, s * 0.5); ctx.lineTo(-s * 0.5, s * 0.9); ctx.lineTo(s * 0.05, s * 0.5); ctx.stroke(); break;
    case 'image':
      rrect(ctx, -s * 0.85, -s * 0.7, s * 1.7, s * 1.4, 12); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s * 0.85, s * 0.45); ctx.lineTo(-s * 0.25, -s * 0.1); ctx.lineTo(s * 0.2, s * 0.35); ctx.lineTo(s * 0.45, s * 0.1); ctx.lineTo(s * 0.85, s * 0.5); ctx.stroke(); break;
    case 'play':
      ctx.moveTo(-s * 0.45, -s * 0.7); ctx.lineTo(s * 0.7, 0); ctx.lineTo(-s * 0.45, s * 0.7); ctx.closePath(); ctx.stroke(); break;
    case 'mic':
      rrect(ctx, -s * 0.28, -s * 0.8, s * 0.56, s * 1.1, s * 0.28); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -s * 0.05, s * 0.55, 0, Math.PI); ctx.moveTo(0, s * 0.5); ctx.lineTo(0, s * 0.85); ctx.stroke(); break;
    default:
      ctx.arc(0, 0, s * 0.6, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}
export const ICON_NAMES = ['search', 'map', 'bolt', 'lock', 'globe', 'spark', 'heart', 'check', 'star', 'chat', 'image', 'play', 'mic'];

// Фоны сцен. Реагируют на время и (опционально) на «пульсы» — моменты ударов сцены.
export function background(ctx, W, H, kind, pal, t, S, pulses = []) {
  ctx.save();
  ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, W, H);
  const rate = 26 * (S?.P?.ambient ?? 1) * (S?.P?.speed ?? 1); // px/с — фон «живее» при высокой динамичности
  if (kind === 'gradient') {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, mix(pal.bg, pal.accent, 0.22)); g.addColorStop(1, pal.bg);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  } else if (kind === 'grid') {
    const step = 90, off = (t * rate) % step;
    ctx.strokeStyle = rgba(pal.fg, 0.07); ctx.lineWidth = 2; ctx.beginPath();
    for (let x = -step + off; x < W + step; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = -step + off; y < H + step; y += step) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
  } else if (kind === 'dots') {
    const step = 76, off = (t * rate * 0.7) % step;
    ctx.fillStyle = rgba(pal.fg, 0.12);
    for (let y = -step + off; y < H + step; y += step) for (let x = -step + off; x < W + step; x += step) { ctx.beginPath(); ctx.arc(x, y, 3.2, 0, Math.PI * 2); ctx.fill(); }
  } else if (kind === 'rings') {
    const cx = W / 2, cy = H * 0.5;
    for (let i = 0; i < 7; i++) {
      const r = ((i * 190 + t * 40 * (S?.P?.ambient ?? 1) * (S?.P?.speed ?? 1)) % 1330) + 20;
      ring(ctx, cx, cy, r, 3, pal.fg, 0.07 * (1 - r / 1400));
    }
  }
  for (const p of pulses) {  // кольца-пульсы от ударов (графика участвует в том же действии, что и текст)
    const age = t - p.t;
    if (age < 0 || age > 0.9) continue;
    const k = age / 0.9;
    ring(ctx, p.x, p.y, 40 + k * (p.r || 420), 6 * (1 - k) + 1, p.color || pal.accent, (1 - k) * 0.7);
  }
  ctx.restore();
}

// Детерминированная «плёнка»: статичная текстура шума, сдвигаемая по кадрам.
let grainCanvas = null;
export function drawGrain(ctx, W, H, frame, amount, createCanvas) {
  if (!amount) return;
  if (!grainCanvas) {
    grainCanvas = createCanvas(256, 256);
    const g = grainCanvas.getContext('2d'); const id = g.createImageData(256, 256); const r = mulberry32(7);
    for (let i = 0; i < id.data.length; i += 4) { const v = r() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
    g.putImageData(id, 0, 0);
  }
  ctx.save();
  ctx.globalAlpha = amount; ctx.globalCompositeOperation = 'overlay';
  const ox = (frame * 37) % 256, oy = (frame * 91) % 256;
  for (let y = -256 + oy; y < H; y += 256) for (let x = -256 + ox; x < W; x += 256) ctx.drawImage(grainCanvas, x, y);
  ctx.restore();
}

export { clamp, lerp };
