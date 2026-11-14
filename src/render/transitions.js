// Композитинг переходов между двумя уже отрисованными сценами A (уходит) и B (приходит).
import { E, clamp, lerp } from '../util.js';

export function compose(ctx, type, p, A, B, W, H, dir = 'left', opts = {}) {
  const e = E.inOutCubic(clamp(p));
  switch (type) {
    case 'zoom_into': zoomInto(ctx, A, B, clamp(p), W, H, opts); break;
    case 'crossfade':
      ctx.drawImage(A, 0, 0, W, H);
      ctx.globalAlpha = e; ctx.drawImage(B, 0, 0, W, H); ctx.globalAlpha = 1;
      break;
    case 'push': {
      const [vx, vy] = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[dir] || [-1, 0];
      ctx.drawImage(A, vx * W * e, vy * H * e, W, H);
      ctx.drawImage(B, -vx * W * (1 - e), -vy * H * (1 - e), W, H);
      break;
    }
    case 'wipe': {
      ctx.drawImage(A, 0, 0, W, H);
      const skew = W * 0.2;
      ctx.save(); ctx.beginPath();
      if (dir === 'right') { const X = lerp(-skew, W + skew, e); ctx.moveTo(0, 0); ctx.lineTo(X + skew, 0); ctx.lineTo(X, H); ctx.lineTo(0, H); }
      else if (dir === 'up') { const Y = lerp(H + skew, -skew, e); ctx.moveTo(0, Y); ctx.lineTo(W, Y + skew); ctx.lineTo(W, H); ctx.lineTo(0, H); }
      else if (dir === 'down') { const Y = lerp(-skew, H + skew, e); ctx.moveTo(0, 0); ctx.lineTo(W, 0); ctx.lineTo(W, Y + skew); ctx.lineTo(0, Y); }
      else { const X = lerp(W + skew, -skew, e); ctx.moveTo(X + skew, 0); ctx.lineTo(W, 0); ctx.lineTo(W, H); ctx.lineTo(X, H); }
      ctx.closePath(); ctx.clip(); ctx.drawImage(B, 0, 0, W, H); ctx.restore();
      break;
    }
    case 'zoom_through': {
      const s2 = lerp(0.72, 1, E.outCubic(p));
      ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(s2, s2); ctx.translate(-W / 2, -H / 2); ctx.drawImage(B, 0, 0, W, H); ctx.restore();
      const s1 = lerp(1, 2.4, E.inQuad(p));
      ctx.save(); ctx.globalAlpha = clamp(1 - E.inQuad(p) * 1.15); ctx.translate(W / 2, H / 2); ctx.scale(s1, s1); ctx.translate(-W / 2, -H / 2); ctx.drawImage(A, 0, 0, W, H); ctx.restore();
      break;
    }
    case 'iris': {
      ctx.drawImage(A, 0, 0, W, H);
      ctx.save(); ctx.beginPath(); ctx.arc(W / 2, H / 2, e * Math.hypot(W, H) * 0.52, 0, Math.PI * 2); ctx.clip(); ctx.drawImage(B, 0, 0, W, H); ctx.restore();
      break;
    }
    case 'slice': {
      ctx.drawImage(A, 0, 0, W, H);
      const n = 8, h = H / n;
      for (let i = 0; i < n; i++) {
        const k = E.outCubic(clamp(p * 1.6 - (i / n) * 0.6));
        ctx.save(); ctx.beginPath(); ctx.rect(0, i * h, W, h + 1); ctx.clip();
        ctx.drawImage(B, (i % 2 ? 1 : -1) * W * (1 - k), 0, W, H); ctx.restore();
      }
      break;
    }
    case 'flash_cut': {
      ctx.drawImage(p < 0.5 ? A : B, 0, 0, W, H);
      ctx.fillStyle = `rgba(255,255,255,${0.92 * (1 - Math.abs(2 * p - 1))})`; ctx.fillRect(0, 0, W, H);
      break;
    }
    default: // cut
      ctx.drawImage(p >= 0 ? B : A, 0, 0, W, H);
  }
}

// ───────── «приблизиться к объекту»: камера въезжает в элемент сцены A, и внутри него оказывается сцена B ─────────
// opts: { target:{x,y,w,h} в пикселях (центр+размер, в координатах A), variant:'portal'|'open'|'roll', roll:градусы, r:скругление }
// Мир = сцена A; сцена B вложена в целевой прямоугольник; камера (масштаб + смещение к цели) въезжает так, что к p=1
// сцена B занимает весь кадр. portal — просто въезд; open — «дверцы» цели раскрываются; roll — цель переворачивается как карточка.
function zoomInto(ctx, A, B, p, W, H, o) {
  const tg = o.target || { x: W / 2, y: H / 2, w: W * 0.5, h: H * 0.2 };
  const variant = o.variant || 'portal', r = o.r ?? 28;
  // Камера въезжает до тех пор, пока цель не заполнит кадр (Zc). Сцена B живёт «в окне» цели: её масштаб в мире подбирается так,
  // что на экране она плавно растёт от cover-размера k до полного кадра (k^(1-e)), пока окно расширяется — это и есть «нырок».
  const k = Math.max(tg.w / W, tg.h / H), Zc = Math.max(W / tg.w, H / tg.h);
  const e = E.inOutQuart(p), z = Math.pow(Zc, e), kB = Math.pow(k, 1 - e) * Math.pow(1 / Zc, e);
  const cx = lerp(W / 2, tg.x, e), cy = lerp(H / 2, tg.y, e);              // центр камеры ползёт к цели
  const rollRad = ((o.roll || 0) * Math.PI) / 180 * Math.sin(Math.PI * e);
  ctx.save();
  ctx.translate(W / 2, H / 2); if (rollRad) ctx.rotate(rollRad); ctx.scale(z, z); ctx.translate(-cx, -cy);
  const rect = { x: tg.x - tg.w / 2, y: tg.y - tg.h / 2, w: tg.w, h: tg.h };
  // видимая в мире область — чтобы к концу клип B раскрылся на весь кадр
  const view = { x: cx - W / (2 * z) - 4, y: cy - H / (2 * z) - 4, w: W / z + 8, h: H / z + 8 };
  const grow = clamp((e - 0.55) / 0.4), clip = { x: lerp(rect.x, view.x, grow), y: lerp(rect.y, view.y, grow), w: lerp(rect.w, view.w, grow), h: lerp(rect.h, view.h, grow), r: lerp(r, 0, grow) };
  const drawB = () => { ctx.save(); ctx.translate(tg.x, tg.y); ctx.scale(kB, kB); ctx.drawImage(B, -W / 2, -H / 2, W, H); ctx.restore(); };
  const clipTo = (c) => { ctx.beginPath(); const rr = Math.max(0, Math.min(c.r, c.w / 2, c.h / 2)); ctx.moveTo(c.x + rr, c.y); ctx.arcTo(c.x + c.w, c.y, c.x + c.w, c.y + c.h, rr); ctx.arcTo(c.x + c.w, c.y + c.h, c.x, c.y + c.h, rr); ctx.arcTo(c.x, c.y + c.h, c.x, c.y, rr); ctx.arcTo(c.x, c.y, c.x + c.w, c.y, rr); ctx.closePath(); ctx.clip(); };
  const holeClip = () => { ctx.beginPath(); ctx.rect(view.x - W, view.y - H, view.w + 2 * W, view.h + 2 * H); ctx.rect(rect.x, rect.y, rect.w, rect.h); ctx.clip('evenodd'); };

  if (variant === 'portal') {
    ctx.drawImage(A, 0, 0, W, H);
    ctx.save(); clipTo(clip); drawB(); ctx.restore();
  } else if (variant === 'open') {
    // сначала B внутри цели, затем A: снаружи цели — как есть, внутри — две половинки, раздвигающиеся в стороны
    ctx.save(); clipTo(clip); drawB(); ctx.restore();
    const open = E.outCubic(clamp((e - 0.1) / 0.5)), slide = (rect.w / 2 + 6) * open;
    ctx.save(); holeClip(); ctx.drawImage(A, 0, 0, W, H); ctx.restore();
    ctx.save(); ctx.translate(-slide, 0); ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.w / 2, rect.h); ctx.clip(); ctx.drawImage(A, 0, 0, W, H); ctx.restore();
    ctx.save(); ctx.translate(slide, 0); ctx.beginPath(); ctx.rect(rect.x + rect.w / 2, rect.y, rect.w / 2, rect.h); ctx.clip(); ctx.drawImage(A, 0, 0, W, H); ctx.restore();
  } else { // roll — карточка переворачивается: сначала сжимается по ширине содержимое A, затем разворачивается B
    ctx.save(); holeClip(); ctx.drawImage(A, 0, 0, W, H); ctx.restore();
    const f = clamp((e - 0.08) / 0.6), ang = f * Math.PI, sx = Math.abs(Math.cos(ang)), front = ang < Math.PI / 2;
    ctx.save(); ctx.translate(tg.x, tg.y); ctx.scale(Math.max(0.001, sx), 1 + 0.08 * Math.sin(ang)); ctx.translate(-tg.x, -tg.y);
    ctx.save(); clipTo({ ...rect, r }); if (front) ctx.drawImage(A, 0, 0, W, H); else drawB(); ctx.restore(); ctx.restore();
    if (grow > 0) { ctx.save(); clipTo(clip); drawB(); ctx.restore(); }
  }
  ctx.restore();
  // страховка: у самого конца сцена A растворяется, чтобы не осталось «каёмок»
  if (p > 0.94) { ctx.save(); ctx.globalAlpha = clamp((p - 0.94) / 0.06); ctx.drawImage(B, 0, 0, W, H); ctx.restore(); }
}
