// search_to_map — композиция «запрос набирается по буквам → отправка превращает сцену
// в анимированную карту → точки появляются в ритм звука». Ориентир: Google v2.
import { E, prog, clamp, lerp, mix, rgba, mulberry32, hashStr } from '../../util.js';
import { background, text, rrect, ring, disc, icon, fontStr, measure } from '../draw.js';

export const spec = {
  name: 'search_to_map',
  long: true, // составная сцена: допускается более длинная длительность (≈1.7× от верхней границы профиля)
  summary: 'Search box types the query letter by letter; on submit the scene morphs into an animated map; pins pop in rhythm with the music; result cards slide up. Use for search / local / discovery products.',
  props: {
    query: 'string <=36 chars — the text typed into the search box (in the video language)',
    brand: 'string — wordmark above the search box (optional)',
    placeholder: 'string (optional)',
    button: 'string — label of the submit button under the box, from the site UI strings (optional)',
    typing: '{start:number s (0.4), cps:number chars/s (9)}',
    submit_at: 'number seconds in scene (default: right after typing ends)',
    dots: '[{t:number scene-local s (>= map appears), x:0..1, y:0..1, size:"S|M|L"(M), label:string<=22 chars optional}] up to 12; t is snapped to the beat grid',
    cards: '[{t:number, title:string<=30, sub:string<=36}] up to 3, slide up at t',
    map: '{style:"streets|grid"(streets)}',
  },
  events: {
    punch: 'camera scale hit {strength?}',
    shake: 'camera shake {strength?}',
    flash: 'flash {strength?}',
  },
};

export const SNAP_FIELDS = ['dots', 'cards']; // эти t привязываются к биту при нормализации

export function timing(scene, P) {
  const p = scene.props;
  const cps = (p.typing?.cps ?? 9) * clamp(P.speed, 0.9, 1.4);
  const start = p.typing?.start ?? 0.4;
  const typeEnd = start + p.query.length / cps;
  const submit = p.submit_at ?? typeEnd + 0.45 / P.speed;
  const mapAt = submit + 0.12 + (0.7 / P.speed) * 0.55; // карта «видна» примерно с середины морфа
  return { cps, start, typeEnd, submit, mapAt };
}

export function check(scene, plan) {
  const errors = [], warnings = [];
  const p = scene.props || {};
  if (typeof p.query !== 'string' || !p.query.trim()) { errors.push({ path: 'props.query', message: 'query must be a non-empty string' }); return { errors, warnings }; }
  if (p.query.length > 36) errors.push({ path: 'props.query', message: `query too long (${p.query.length} > 36)` });
  const P = plan._P;
  const T = timing(scene, P);
  if (T.submit > scene.duration - 1.0) errors.push({ path: 'props.submit_at', message: `typing+submit end at ${T.submit.toFixed(1)}s, leaving <1s for the map; shorten query, raise typing.cps or lengthen the scene (${scene.duration}s)` });
  const dots = p.dots || [];
  if (dots.length > 12) errors.push({ path: 'props.dots', message: 'max 12 dots' });
  dots.forEach((d, i) => {
    const q = `props.dots[${i}]`;
    if (typeof d.x !== 'number' || d.x < 0 || d.x > 1 || typeof d.y !== 'number' || d.y < 0 || d.y > 1) errors.push({ path: q, message: 'x and y must be numbers in 0..1' });
    if (typeof d.t !== 'number' || d.t < T.mapAt - 0.05 || d.t > scene.duration - 0.15) errors.push({ path: `${q}.t`, message: `t must be within ${T.mapAt.toFixed(2)}..${(scene.duration - 0.15).toFixed(2)} s (map appears at ~${T.mapAt.toFixed(2)}s)` });
    if (d.label && d.label.length > 22) errors.push({ path: `${q}.label`, message: 'label max 22 chars' });
  });
  const cards = p.cards || [];
  if (cards.length > 3) errors.push({ path: 'props.cards', message: 'max 3 cards' });
  cards.forEach((c, i) => {
    if (typeof c.title !== 'string' || !c.title || c.title.length > 30) errors.push({ path: `props.cards[${i}].title`, message: 'title required, max 30 chars' });
    if (c.sub && c.sub.length > 36) errors.push({ path: `props.cards[${i}].sub`, message: 'sub max 36 chars' });
    if (typeof c.t !== 'number' || c.t < T.mapAt || c.t > scene.duration - 0.2) errors.push({ path: `props.cards[${i}].t`, message: `t must be within ${T.mapAt.toFixed(2)}..${(scene.duration - 0.2).toFixed(2)} s` });
  });
  if (dots.length < 3) warnings.push({ path: 'props.dots', message: 'fewer than 3 dots makes the map feel empty' });
  return { errors, warnings };
}

export const countEvents = (scene) => 2 + (scene.props.dots || []).length + (scene.props.cards || []).length + (scene.events || []).length; // набор + отправка + точки + карточки

export function readSpans(scene, S) {
  const T = timing(scene, S.P), p = scene.props, out = [];
  out.push({ path: 'props.query', text: p.query, from: T.typeEnd, weight: 0.6 });
  (p.dots || []).forEach((d, i) => { if (d.label) out.push({ path: `props.dots[${i}].label`, text: d.label, from: d.t + 0.4, weight: 0.7 }); });
  (p.cards || []).forEach((c, i) => out.push({ path: `props.cards[${i}]`, text: `${c.title} ${c.sub || ''}`.trim(), from: c.t + 0.55, weight: 0.9 }));
  return out;
}

export function cues(scene, S) {
  const T = timing(scene, S.P);
  const out = [];
  for (let i = 0; i < scene.props.query.length; i++) out.push({ t: T.start + i / T.cps, kind: 'tick', gain: 0.5, pitch: 0.92 + ((i * 7) % 5) * 0.04 });
  out.push({ t: T.submit, kind: 'click', gain: 0.9 });
  out.push({ t: T.submit + 0.1, kind: 'whoosh', gain: 0.7 });
  (scene.props.dots || []).forEach((d, i) => out.push({ t: d.t, kind: 'pop', gain: 0.75, note: i }));
  (scene.props.cards || []).forEach((c) => out.push({ t: c.t, kind: 'swish', gain: 0.6 }));
  return out;
}

function buildMap(seed, W, H) {
  const r = mulberry32(seed);
  const x0 = 0, x1 = W, y0 = H * 0.2, y1 = H * 0.9;
  const roads = [];
  const nV = 5, nH = 6;
  for (let i = 0; i < nV; i++) { const x = lerp(x0 + 60, x1 - 60, (i + r() * 0.5) / nV); const j = (r() - 0.5) * 120; roads.push({ pts: [[x, y0], [x + j, (y0 + y1) / 2], [x - j * 0.5, y1]], w: i % 2 ? 5 : 3, main: i % 2 === 0 }); }
  for (let i = 0; i < nH; i++) { const y = lerp(y0 + 40, y1 - 40, (i + r() * 0.5) / nH); const j = (r() - 0.5) * 90; roads.push({ pts: [[x0, y], [W / 2, y + j], [x1, y - j * 0.4]], w: i % 2 ? 3 : 5, main: i % 2 === 1 }); }
  roads.push({ pts: [[x0, y1 - 80], [W * 0.35, H * 0.55], [W * 0.7, H * 0.42], [x1, y0 + 30]], w: 8, main: true });
  roads.push({ pts: [[W * 0.15, y0], [W * 0.5, H * 0.5], [W * 0.9, y1]], w: 4, main: false });
  const blocks = [];
  for (let i = 0; i < 26; i++) blocks.push([r() * W, y0 + r() * (y1 - y0), 60 + r() * 150, 40 + r() * 120]);
  return { roads, blocks, area: { x0, x1, y0, y1 } };
}

const iconFont = (s) => fontStr(500, s);

export function render(ctx, S) {
  const { t, W, H, P, pal, tk, props } = S;
  const T = timing(S.scene, P);
  const brand = props.brand;
  const q = props.query;
  const n = clamp(Math.floor((t - T.start) * T.cps) + 1, 0, q.length) * (t >= T.start ? 1 : 0);
  const morphD = S.anim(0.7);
  const pm = prog(t, T.submit + 0.12, morphD, E.inOutCubic);
  const enter = prog(t, 0, S.anim(0.5), E.outBack);
  const mapSeed = hashStr(q);
  const map = (S.cache.map ||= buildMap(mapSeed, W, H));
  const mapBg = mix(pal.bg, pal.accent, 0.1);
  const pulses = [];
  if (t >= T.submit) pulses.push({ t: T.submit, x: W / 2, y: H * 0.5, r: 700, color: pal.accent });

  // ── Фон + (при морфе) карта ──
  background(ctx, W, H, 'gradient', pal, t, S, pulses);

  // карта открывается кругом из центра поля поиска
  if (pm > 0) {
    ctx.save();
    const R = pm * Math.hypot(W, H);
    const cy = lerp(H * 0.5, H * 0.115, pm);
    ctx.beginPath(); ctx.arc(W / 2, cy, R, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = mapBg; ctx.fillRect(0, 0, W, H);
    // кварталы
    for (const b of map.blocks) { ctx.fillStyle = rgba(pal.fg, 0.045); rrect(ctx, b[0], b[1], b[2], b[3], tk.radius.xs); ctx.fill(); }
    // дороги — прорисовываются
    const dr = prog(t, T.submit + 0.3, S.anim(1.1), E.outCubic);
    for (const rd of map.roads) {
      let len = 0; for (let i = 1; i < rd.pts.length; i++) len += Math.hypot(rd.pts[i][0] - rd.pts[i - 1][0], rd.pts[i][1] - rd.pts[i - 1][1]);
      ctx.beginPath(); rd.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.setLineDash([len, len]); ctx.lineDashOffset = len * (1 - dr);
      ctx.lineWidth = rd.w * (rd.main ? 1.4 : 1); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = rd.main ? rgba(pal.accent2, 0.55) : rgba(pal.fg, 0.2); ctx.stroke();
    }
    ctx.setLineDash([]);

    // точки (пины) — появляются на биты
    const dots = props.dots || [];
    const area = map.area;
    const pos = (d) => [lerp(W * 0.1, W * 0.9, d.x), lerp(area.y0 + 80, area.y1 - 160, d.y)];
    const beat = 60 / S.bpm;
    dots.forEach((d, i) => {
      if (t < d.t) return;
      const [x, y] = pos(d);
      const R0 = ({ S: 14, M: 22, L: 32 }[d.size || 'M']) * (0.8 + 0.2 * P.amp);
      const pr = prog(t, d.t, S.anim(0.4), E.outBack);
      // дуга-связь с предыдущей точкой
      if (i > 0) {
        const [px, py] = pos(dots[i - 1]);
        const lp = prog(t, d.t, S.anim(0.45), E.outCubic);
        const mx = (px + x) / 2, my = Math.min(py, y) - 90 * P.amp - 20;
        ctx.save(); ctx.beginPath(); ctx.moveTo(px, py);
        const steps = 24;
        for (let k = 1; k <= steps * lp; k++) { const u = k / steps; const bx = (1 - u) * (1 - u) * px + 2 * (1 - u) * u * mx + u * u * x; const by = (1 - u) * (1 - u) * py + 2 * (1 - u) * u * my + u * u * y; ctx.lineTo(bx, by); }
        ctx.lineWidth = tk.stroke.base; ctx.strokeStyle = rgba(pal.accent2, 0.7); ctx.setLineDash([2, 14]); ctx.lineCap = 'round'; ctx.stroke(); ctx.restore();
      }
      // пульс на бит
      const phase = ((t - d.t) % beat) / beat;
      const beatPulse = Math.exp(-phase * 5) * 0.28 * P.amp;
      ring(ctx, x, y, R0 * (1.8 + (t - d.t) * 3.2) * 1.0, 5, pal.accent, clamp(1 - (t - d.t) * 1.6) * 0.8);
      disc(ctx, x, y, R0 * 2.0 * pr * (1 + beatPulse), rgba(pal.accent, 0.22));
      disc(ctx, x, y, R0 * pr * (1 + beatPulse * 0.6), pal.accent);
      disc(ctx, x, y, R0 * 0.42 * pr, '#ffffff');
      if (d.label) {
        const lp = prog(t, d.t + 0.12, S.anim(0.35), E.outExpo);
        if (lp > 0) {
          ctx.font = fontStr(600, 34); const w = ctx.measureText(d.label).width + 44;
          const lx = x > W * 0.55 ? x - R0 * 1.6 - w : x + R0 * 1.6;
          ctx.save(); ctx.globalAlpha = lp; ctx.translate(0, (1 - lp) * 16);
          ctx.fillStyle = 'rgba(255,255,255,0.96)'; rrect(ctx, lx, y - 34, w, 68, tk.radius.pill); ctx.fill();
          text(ctx, d.label, lx + 22, y + 12, { size: 34, weight: 600, fill: '#16181d' });
          ctx.restore();
        }
      }
    });

    // карточки результатов
    const cards = props.cards || [];
    cards.forEach((c, i) => {
      const cp = prog(t, c.t, S.anim(0.55), E.outExpo);
      if (cp <= 0) return;
      const ch = 150, cw = W * 0.88, cx = (W - cw) / 2;
      const slot = cards.length - 1 - i;
      const cyTarget = H - 70 - ch - slot * (ch + 18);
      const cy = lerp(H + 40, cyTarget, cp);
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 32; ctx.shadowOffsetY = 10;
      ctx.fillStyle = 'rgba(255,255,255,0.97)'; rrect(ctx, cx, cy, cw, ch, tk.radius.panel); ctx.fill();
      ctx.shadowColor = 'transparent';
      disc(ctx, cx + 62, cy + ch / 2, 30, pal.accent);
      icon(ctx, 'map', cx + 62, cy + ch / 2, 34, '#fff', 4);
      text(ctx, c.title, cx + 120, cy + ch / 2 - 6, { size: 42, weight: 700, fill: '#14161a' });
      if (c.sub) text(ctx, c.sub, cx + 120, cy + ch / 2 + 40, { size: 30, weight: 500, fill: '#5d6470' });
      ctx.restore();
    });
    ctx.restore();
  }

  // ── Бренд и поле поиска ──
  const fadeOut = 1 - clamp(pm * 1.6);
  if (brand && fadeOut > 0) {
    const letters = [...brand];
    const colors = [pal.accent, pal.accent2, pal.fg, pal.accent, pal.accent2, pal.fg];
    const size = 150;
    ctx.font = fontStr(800, size);
    const ws = letters.map((c) => ctx.measureText(c).width);
    const tot = ws.reduce((a, b) => a + b, 0);
    let x = W / 2 - tot / 2;
    const by = lerp(H * 0.33, H * 0.12, pm) - pm * 80;
    letters.forEach((c, i) => {
      const pr = prog(t, 0.05 + i * 0.06 * P.stagger, S.anim(0.5), E.outBack);
      text(ctx, c, x + ws[i] / 2, by + (1 - pr) * 60 * P.amp, { size, weight: 800, fill: colors[i % colors.length], align: 'center', alpha: clamp(pr * 1.4) * fadeOut });
      x += ws[i];
    });
  }
  const pillW = lerp(W * 0.84, W * 0.88, pm), pillH = 136;
  const pcy = lerp(H * 0.5, H * 0.115, pm);
  const sub = prog(t, T.submit, S.anim(0.18), E.outQuad) * (1 - prog(t, T.submit + 0.18, S.anim(0.25), E.outQuad));
  const squish = 1 - 0.05 * sub * P.amp;
  ctx.save();
  ctx.translate(W / 2, pcy); ctx.scale(squish * lerp(0.9, 1, enter), squish * lerp(0.9, 1, enter));
  ctx.globalAlpha = clamp(enter * 1.5);
  ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 12;
  ctx.fillStyle = '#ffffff'; rrect(ctx, -pillW / 2, -pillH / 2, pillW, pillH, tk.radius.pill); ctx.fill();
  ctx.shadowColor = 'transparent';
  icon(ctx, 'search', -pillW / 2 + 70, 0, 46, '#5f6368', 6);
  const typed = q.slice(0, n);
  const maxTextW = pillW - 250;
  let ts = 50; while (measure(ctx, typed || ' ', 500, ts) > maxTextW && ts > 26) ts -= 2;
  if (!typed && props.placeholder) text(ctx, props.placeholder, -pillW / 2 + 128, ts * 0.35, { size: 46, weight: 400, fill: '#9aa0a6' });
  text(ctx, typed, -pillW / 2 + 128, ts * 0.35, { size: ts, weight: 500, fill: '#16181d' });
  if (t < T.submit + 0.1) {
    const tw = measure(ctx, typed, 500, ts);
    const blink = typed.length < q.length ? 1 : (Math.floor(t * 2.4) % 2 ? 0 : 1);
    if (blink) { ctx.fillStyle = pal.accent; ctx.fillRect(-pillW / 2 + 128 + tw + 4, -ts * 0.6, 4, ts * 1.15); }
  }
  icon(ctx, 'mic', pillW / 2 - 70, 0, 44, pal.accent, 5);
  ctx.restore();
  // кнопка отправки
  if (props.button && pm < 1) {
    const bp = prog(t, T.typeEnd - 0.2, S.anim(0.4), E.outBack) * (1 - clamp(pm * 2));
    if (bp > 0) {
      ctx.save(); ctx.translate(W / 2, H * 0.5 + 150); const bs = (1 - 0.07 * sub * P.amp) * lerp(0.8, 1, bp); ctx.scale(bs, bs); ctx.globalAlpha = clamp(bp);
      ctx.font = fontStr(600, 38); const bw = ctx.measureText(props.button).width + 90;
      ctx.fillStyle = sub > 0.05 ? pal.accent : 'rgba(255,255,255,0.14)'; rrect(ctx, -bw / 2, -42, bw, 84, tk.radius.chip); ctx.fill();
      text(ctx, props.button, 0, 13, { size: 38, weight: 600, fill: '#fff', align: 'center' });
      ctx.restore();
    }
  }
}

// Якоря (доли холста, центр+размер) в КОНЦЕ сцены: поле поиска сверху, пины карты, карточки результатов.
export function anchors(scene, S) {
  const { W, H } = S, p = scene.props, out = { pill: { x: 0.5, y: 0.115, w: 0.88, h: 136 / H } };
  (p.dots || []).forEach((d, i) => { const y = lerp(H * 0.2 + 80, H * 0.9 - 160, d.y); out[`dot${i}`] = { x: lerp(0.1, 0.9, d.x), y: y / H, w: 0.16, h: 0.09 }; });
  const cards = p.cards || [];
  cards.forEach((c, i) => { const slot = cards.length - 1 - i, cy = H - 70 - 150 - slot * 168 + 75; out[`card${i}`] = { x: 0.5, y: cy / H, w: 0.88, h: 150 / H }; });
  return out;
}
