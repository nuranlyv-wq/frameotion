// Камера сцены: наезды на конкретный элемент. Сегменты задаются в долях холста и идут подряд:
//   scene.camera = [{ t0, t1, z0, z1, x, y, center, ease }]   (x,y — точка интереса, 0..1; center 0..1 — насколько
//   тянуть её к центру кадра по мере наезда). Между сегментами камера держит последнее состояние.
import { E, clamp, lerp } from '../util.js';

const EASES = { out: E.outCubic, inout: E.inOutCubic, in: E.inQuad, linear: E.linear, expo: E.outExpo };
export const CAMERA_EASES = Object.keys(EASES);
// Каждый наезд обязан объяснить, зачем он: «hold» — осознанно неподвижная камера для чтения.
export const CAMERA_PURPOSES = ['focus', 'reveal', 'context', 'follow', 'emphasis', 'setup', 'hold'];

// Состояние камеры в момент t (сцен.-локальный): масштаб z и экранная привязка точки интереса.
export function camAt(scene, t, W, H) {
  const segs = scene.camera;
  if (!Array.isArray(segs) || !segs.length) return { z: 1, fx: W / 2, fy: H / 2, sx: W / 2, sy: H / 2 };
  let st = { z: segs[0].z0 ?? 1, fx: (segs[0].x ?? 0.5) * W, fy: (segs[0].y ?? 0.5) * H, sx: (segs[0].x ?? 0.5) * W, sy: (segs[0].y ?? 0.5) * H };
  for (const s of segs) {
    const fx = (s.x ?? 0.5) * W, fy = (s.y ?? 0.5) * H, cb = clamp(s.center ?? 0.6);
    if (t < s.t0) break;
    const e = (EASES[s.ease] || E.inOutCubic)(clamp((t - s.t0) / Math.max(1e-6, s.t1 - s.t0)));
    st = { z: lerp(s.z0 ?? 1, s.z1 ?? 1, e), fx, fy, sx: lerp(fx, W / 2, cb * e), sy: lerp(fy, H / 2, cb * e) };
  }
  return st;
}

// Применить камеру к контексту (перед рисованием содержимого сцены).
export function applyCam(ctx, st) {
  if (st.z === 1 && st.fx === st.sx && st.fy === st.sy) return;
  ctx.translate(st.sx, st.sy); ctx.scale(st.z, st.z); ctx.translate(-st.fx, -st.fy);
}

// Прямоугольник {x,y,w,h} в долях холста (центр + размеры) → то же самое после камеры.
export function mapRect(r, st, W, H) {
  const cx = st.sx + (r.x * W - st.fx) * st.z, cy = st.sy + (r.y * H - st.fy) * st.z;
  return { x: cx / W, y: cy / H, w: r.w * st.z, h: r.h * st.z };
}

export const hasZoom = (scene) => Array.isArray(scene.camera) && scene.camera.some((s) => Math.max(s.z0 ?? 1, s.z1 ?? 1) / Math.min(s.z0 ?? 1, s.z1 ?? 1) >= 1.5);
