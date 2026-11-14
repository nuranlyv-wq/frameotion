// Графический словарь v2: то, что код модели (в песочнице) может нарисовать. Это ДАННЫЕ, не код:
// группы с трансформациями, градиенты, свечение, режимы смешивания, пунктир, обрезка, кривые, текст с ролями шрифтов.
// Хост санитизирует всё, что вернула песочница (sanitizeFrames), и сам рисует (drawPrims).
import { isHex, clamp } from '../util.js';
import { rrect } from './draw.js';
import { fontFor, FONT_ROLE_NAMES, DEFAULT_FAMILY } from './fonts.js';

export const PRIM_LIMITS = { maxPrimsPerFrame: 900, maxPoints: 240, maxTextLen: 80, maxDepth: 4, maxStops: 6, maxCoord: 9000 };
const KINDS = new Set(['rect', 'circle', 'ellipse', 'arc', 'line', 'path', 'poly', 'star', 'text', 'g']);
const BLENDS = new Set(['lighter', 'screen', 'multiply', 'overlay', 'source-over']);
const PAL = new Set(['fg', 'bg', 'accent', 'accent2', 'muted']);
const RGBA = /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\)$/;
const HEX8 = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

const okColor = (c) => typeof c === 'string' && (PAL.has(c) || HEX8.test(c) || RGBA.test(c));

// ───────── рисование ─────────
function colorOf(c, pal) { return PAL.has(c) ? pal[c] : c; }

function paint(ctx, spec, pal) {
  if (spec == null) return null;
  if (typeof spec === 'string') return colorOf(spec, pal);
  if (spec.g === 'lin' || spec.g === 'rad') {
    const g = spec.g === 'lin' ? ctx.createLinearGradient(spec.x0, spec.y0, spec.x1, spec.y1) : ctx.createRadialGradient(spec.x0, spec.y0, spec.r0 || 0, spec.x1 ?? spec.x0, spec.y1 ?? spec.y0, spec.r1 || 1);
    for (const [o, c] of spec.stops || []) g.addColorStop(clamp(o), colorOf(c, pal));
    return g;
  }
  return null;
}

function applyStyle(ctx, p, pal, fillDefault) {
  const f = paint(ctx, p.fill, pal), s = paint(ctx, p.stroke, pal);
  if (p.glow) { ctx.shadowColor = colorOf(p.glow, pal); ctx.shadowBlur = p.glowR ?? 24; }
  return { f: f ?? fillDefault ?? null, s };
}
function finish(ctx, p, st) {
  if (st.f) { ctx.fillStyle = st.f; ctx.fill(); }
  if (st.s) {
    ctx.lineWidth = p.lw ?? 4; ctx.strokeStyle = st.s; ctx.lineCap = p.cap || 'round'; ctx.lineJoin = p.join || 'round';
    if (p.dash) { ctx.setLineDash(p.dash); ctx.lineDashOffset = p.dashOffset || 0; }
    ctx.stroke(); ctx.setLineDash([]);
  }
}

function smoothPath(ctx, pts, close) {
  if (pts.length < 3) { pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); return; }
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    ctx.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
  }
  if (close) ctx.closePath();
}

function drawOne(ctx, p, pal, depth, counter) {
  if (counter.n++ > PRIM_LIMITS.maxPrimsPerFrame) return;
  ctx.save();
  try {
    if (p.a != null) ctx.globalAlpha *= clamp(p.a);
    if (p.blend) ctx.globalCompositeOperation = p.blend;
    switch (p.k) {
      case 'g': {
        ctx.translate(p.x || 0, p.y || 0); if (p.rot) ctx.rotate(p.rot); if (p.sx != null || p.sy != null) ctx.scale(p.sx ?? 1, p.sy ?? p.sx ?? 1);
        if (p.clip) { ctx.beginPath(); if (p.clip.r != null && p.clip.w == null) ctx.arc(p.clip.x, p.clip.y, p.clip.r, 0, Math.PI * 2); else rrect(ctx, p.clip.x, p.clip.y, p.clip.w, p.clip.h, p.clip.rad || 0); ctx.clip(); }
        if (depth < PRIM_LIMITS.maxDepth) for (const it of p.items || []) drawOne(ctx, it, pal, depth + 1, counter);
        break;
      }
      case 'rect': {
        const st = applyStyle(ctx, p, pal, p.stroke ? null : '#ffffff');
        if (p.rot) { ctx.translate(p.x + p.w / 2, p.y + p.h / 2); ctx.rotate(p.rot); ctx.translate(-(p.x + p.w / 2), -(p.y + p.h / 2)); }
        rrect(ctx, p.x, p.y, p.w, p.h, p.r || 0); finish(ctx, p, st); break;
      }
      case 'circle': { const st = applyStyle(ctx, p, pal, p.stroke ? null : '#ffffff'); ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0, p.r), 0, Math.PI * 2); finish(ctx, p, st); break; }
      case 'ellipse': { const st = applyStyle(ctx, p, pal, p.stroke ? null : '#ffffff'); ctx.beginPath(); ctx.ellipse(p.x, p.y, Math.max(0, p.rx), Math.max(0, p.ry), p.rot || 0, 0, Math.PI * 2); finish(ctx, p, st); break; }
      case 'arc': { const st = applyStyle(ctx, p, pal, null); ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0, p.r), p.a0 ?? 0, p.a1 ?? Math.PI * 2); if (p.fill) ctx.closePath(); finish(ctx, p, { f: st.f, s: st.s || (st.f ? null : '#ffffff') }); break; }
      case 'line': { const st = applyStyle(ctx, p, pal, null); ctx.beginPath(); ctx.moveTo(p.x1, p.y1); ctx.lineTo(p.x2, p.y2); finish(ctx, { ...p, fill: null }, { f: null, s: st.s || '#ffffff' }); break; }
      case 'path': {
        const st = applyStyle(ctx, p, pal, null); ctx.beginPath();
        if (p.d) for (const c of p.d) { const [op, ...a] = c; if (op === 'M') ctx.moveTo(a[0], a[1]); else if (op === 'L') ctx.lineTo(a[0], a[1]); else if (op === 'C') ctx.bezierCurveTo(a[0], a[1], a[2], a[3], a[4], a[5]); else if (op === 'Q') ctx.quadraticCurveTo(a[0], a[1], a[2], a[3]); else if (op === 'Z') ctx.closePath(); }
        else if (p.smooth) smoothPath(ctx, p.pts || [], p.close); else { (p.pts || []).forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); if (p.close) ctx.closePath(); }
        finish(ctx, p, { f: st.f, s: st.s || (st.f ? null : '#ffffff') }); break;
      }
      case 'poly': case 'star': {
        const st = applyStyle(ctx, p, pal, p.stroke ? null : '#ffffff'); const n = Math.max(3, Math.min(24, Math.round(p.n || 5))); ctx.beginPath();
        const m = p.k === 'star' ? n * 2 : n;
        for (let i = 0; i < m; i++) { const a = (p.rot || 0) - Math.PI / 2 + (i * Math.PI * 2) / m, r = p.k === 'star' ? (i % 2 ? (p.r2 ?? p.r * 0.45) : p.r) : p.r; const x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.closePath(); finish(ctx, p, st); break;
      }
      case 'text': {
        const f = fontFor(p.font, { family: DEFAULT_FAMILY, weight: 800 }), size = (p.size || 48) * f.k, wt = p.weight || f.weight;
        const st = applyStyle(ctx, p, pal, '#ffffff'); ctx.font = `${f.italic ? 'italic ' : ''}${wt} ${Math.round(size)}px "${f.family}"`; ctx.textBaseline = 'alphabetic';
        const s = String(p.s); const tr = p.tracking || 0, al = p.align || 'left';
        if (!tr) { ctx.textAlign = al; if (st.s) { ctx.lineWidth = p.lw ?? 4; ctx.strokeStyle = st.s; ctx.lineJoin = 'round'; ctx.strokeText(s, p.x, p.y); } if (st.f) { ctx.fillStyle = st.f; ctx.fillText(s, p.x, p.y); } }
        else { // трекинг вручную
          ctx.textAlign = 'left'; const ws = [...s].map((ch) => ctx.measureText(ch).width + tr), tot = ws.reduce((a, b) => a + b, 0) - tr;
          let x = al === 'center' ? p.x - tot / 2 : al === 'right' ? p.x - tot : p.x;
          [...s].forEach((ch, i) => { if (st.f) { ctx.fillStyle = st.f; ctx.fillText(ch, x, p.y); } x += ws[i]; });
        }
        break;
      }
      default: break;
    }
  } catch { /* повреждённый примитив пропускаем */ }
  ctx.restore();
}

export function drawPrims(ctx, prims, pal) {
  if (!Array.isArray(prims)) return;
  const counter = { n: 0 };
  for (const p of prims) drawOne(ctx, p, pal, 0, counter);
}

// ───────── санитизация (хост не доверяет данным песочницы) ─────────
const C = PRIM_LIMITS.maxCoord;
const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? Math.max(-C, Math.min(C, v)) : d);
const numOpt = (v) => (typeof v === 'number' && isFinite(v) ? Math.max(-C, Math.min(C, v)) : undefined);

function cleanPaint(v) {
  if (okColor(v)) return v;
  if (v && typeof v === 'object' && (v.g === 'lin' || v.g === 'rad')) {
    const stops = (Array.isArray(v.stops) ? v.stops : []).slice(0, PRIM_LIMITS.maxStops).filter((s) => Array.isArray(s) && okColor(s[1])).map((s) => [clamp(num(s[0])), s[1]]);
    if (stops.length < 2) return undefined;
    return v.g === 'lin' ? { g: 'lin', x0: num(v.x0), y0: num(v.y0), x1: num(v.x1), y1: num(v.y1), stops } : { g: 'rad', x0: num(v.x0), y0: num(v.y0), r0: Math.max(0, num(v.r0)), x1: num(v.x1 ?? v.x0), y1: num(v.y1 ?? v.y0), r1: Math.max(0.01, num(v.r1, 1)), stops };
  }
  return undefined;
}

function cleanPrim(p, depth, counter) {
  if (!p || typeof p !== 'object' || !KINDS.has(p.k) || counter.n >= PRIM_LIMITS.maxPrimsPerFrame) { counter.dropped++; return null; }
  counter.n++;
  const o = { k: p.k };
  for (const key of ['x', 'y', 'w', 'h', 'r', 'r2', 'rx', 'ry', 'x1', 'y1', 'x2', 'y2', 'lw', 'rot', 'size', 'weight', 'a0', 'a1', 'sx', 'sy', 'n', 'tracking', 'glowR', 'dashOffset']) if (p[key] != null) { const v = numOpt(Number(p[key])); if (v !== undefined) o[key] = v; }
  if (p.a != null) o.a = clamp(Number(p.a) || 0);
  for (const key of ['fill', 'stroke']) if (p[key] != null) { const c = cleanPaint(p[key]); if (c !== undefined) o[key] = c; }
  if (p.glow != null && okColor(p.glow)) o.glow = p.glow;
  if (p.blend && BLENDS.has(p.blend)) o.blend = p.blend;
  if (p.align && ['left', 'center', 'right'].includes(p.align)) o.align = p.align;
  if (p.cap && ['round', 'butt', 'square'].includes(p.cap)) o.cap = p.cap;
  if (p.join && ['round', 'miter', 'bevel'].includes(p.join)) o.join = p.join;
  if (p.close) o.close = true;
  if (p.smooth) o.smooth = true;
  if (Array.isArray(p.dash)) o.dash = p.dash.slice(0, 4).map((v) => Math.max(0, num(v)));
  if (p.k === 'text') { o.s = String(p.s ?? '').slice(0, PRIM_LIMITS.maxTextLen); if (p.font && FONT_ROLE_NAMES.includes(p.font)) o.font = p.font; }
  if (p.k === 'path') {
    if (Array.isArray(p.pts)) o.pts = p.pts.slice(0, PRIM_LIMITS.maxPoints).map((q) => [num(q?.[0]), num(q?.[1])]);
    if (Array.isArray(p.d)) o.d = p.d.slice(0, PRIM_LIMITS.maxPoints).filter((c) => Array.isArray(c) && ['M', 'L', 'C', 'Q', 'Z'].includes(c[0])).map((c) => [c[0], ...c.slice(1, 7).map((v) => num(v))]);
  }
  if (p.k === 'g') {
    if (p.clip && typeof p.clip === 'object') o.clip = p.clip.w != null ? { x: num(p.clip.x), y: num(p.clip.y), w: Math.max(0, num(p.clip.w)), h: Math.max(0, num(p.clip.h)), rad: Math.max(0, num(p.clip.rad)) } : { x: num(p.clip.x), y: num(p.clip.y), r: Math.max(0, num(p.clip.r)) };
    o.items = depth < PRIM_LIMITS.maxDepth && Array.isArray(p.items) ? p.items.map((it) => cleanPrim(it, depth + 1, counter)).filter(Boolean) : [];
  }
  return o;
}

// Тексты, которые в кадре видны «по-настоящему» (alpha ≥ 0.85, внутри холста): из них строится проверка времени чтения.
function visibleTexts(prims, W, H, accA = 1, out = []) {
  for (const p of prims) {
    const a = accA * (p.a == null ? 1 : p.a);
    if (p.k === 'g') visibleTexts(p.items || [], W, H, a, out);
    else if (p.k === 'text' && a >= 0.85 && (p.size || 48) >= 22 && String(p.s).trim()) out.push(p);
  }
  return out;
}

export function sanitizeFrames(frames, W = 1080, H = 1920, fps = 30) {
  const counter = { n: 0, dropped: 0 };
  const clean = frames.map((f) => { counter.n = 0; return (Array.isArray(f) ? f : []).map((p) => cleanPrim(p, 0, counter)).filter(Boolean); });
  // интервалы видимости текстов
  const runs = new Map();
  clean.forEach((f, i) => { for (const tx of visibleTexts(f, W, H)) { const r = runs.get(tx.s) || { first: i, last: i }; r.last = i; runs.set(tx.s, r); } });
  const all = [...runs.entries()];
  // «печатный» эффект: строка, являющаяся началом более длинной строки, которая появляется сразу следом, — не отдельный текст
  const isTyping = (s, r) => all.some(([s2, r2]) => s2 !== s && s2.length > s.length && s2.startsWith(s) && r2.first <= r.last + 3 && r2.first >= r.first);
  const texts = all.filter(([s, r]) => s.trim().length >= 3 && !isTyping(s, r)).map(([s, r]) => ({ s, from: r.first / fps, to: (r.last + 1) / fps })).sort((a, b) => a.from - b.from).slice(0, 40);
  return { frames: clean, dropped: counter.dropped, texts };
}
