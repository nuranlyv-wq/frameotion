// Движок: исполняет нормализованный план покадрово → raw RGBA → ffmpeg (H.264 + AAC).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { COMPONENTS } from './components/index.js';
import { compose } from './transitions.js';
import { drawPrims } from './prims.js';
import { drawGrain } from './draw.js';
import { normalizePlan } from '../plan/model.js';
import { gatherCues } from './audio.js';
import { mixSoundLibrary } from '../production/sound-library.js';
import { runSandbox } from '../sandbox/index.js';
import { camAt, applyCam, mapRect } from './camera.js';
import { clamp, round, mix } from '../util.js';
import { tokensFor } from './tokens.js';

// Камера сцены. По умолчанию камера НЕподвижна: никакого декоративного дрейфа и зума на бит.
// Включаются только явным флагом плана (meta.ambientCamera / meta.beatPulse) — решение режиссёра, а не автомат.
// Удары/тряска/вспышки — только из явных событий сцены. Интенсивность задаёт профиль динамичности.
function camera(scene, t, P, bpm, meta = {}) {
  let s = 1, dx = 0, dy = 0, flash = 0;
  if (meta.ambientCamera) s += P.camera.drift * Math.sin(t * 0.9);
  if (meta.beatPulse && P.camera.beat) { const beat = 60 / bpm, ph = ((scene.start + t) % beat) / beat; s += P.camera.beat * Math.exp(-ph * 6); }
  for (const e of scene.events || []) {
    const age = t - e.t; if (age < 0 || age > 1.2) continue;
    const k = e.strength ?? 1, env = (1 - Math.exp(-age * 120));
    if (e.type === 'punch') s += 0.05 * P.camera.punch * k * env * Math.exp(-age * 9);
    if (e.type === 'shake') { const a = 18 * P.camera.shake * k * env * Math.exp(-age * 7); dx += a * Math.sin(age * 83 + e.t * 7); dy += a * Math.cos(age * 71 + e.t * 3); }
    if (e.type === 'flash') flash = Math.max(flash, 0.55 * k * (0.35 + 0.65 * P.camera.punch) * Math.exp(-age * 10));
  }
  return { s, dx, dy, flash };
}

// Инверсия цветового поля на склейке (светлое ↔ тёмное), как в референсе: фон и текст меняются местами.
function invertPalette(p) { return { ...p, bg: p.fg, fg: p.bg, muted: mix(p.fg, p.bg, 0.5) }; }

// plan.style + токены фильма: fontFor(role, st) разворачивает семантические роли (title/emphasis/label/data) через st.tk.
const styleCache = new WeakMap();
function styleWithTokens(plan) {
  const tk = tokensFor(plan); let s = styleCache.get(plan.style);
  if (!s || s.tk !== tk) { s = Object.assign({}, plan.style, { tk }); styleCache.set(plan.style, s); }
  return s;
}

function drawScene(ctx, scene, tLocal, shared) {
  const { plan, W, H, assets } = shared;
  const comp = COMPONENTS[scene.component];
  const S = {
    t: tLocal, dur: scene.duration, W, H, P: plan._P, pal: scene.invert ? invertPalette(plan.palette) : plan.palette, st: styleWithTokens(plan), tk: tokensFor(plan), props: scene.props || {}, events: scene.events || [],
    scene, assets, fps: plan.meta.fps, bpm: plan.audio?.bpm || plan._P.bpm, cache: scene._cache || (scene._cache = {}),
    anim: (b) => b / plan._P.speed, stg: (b) => b * plan._P.stagger, amp: plan._P.amp,
  };
  const cam = camera(scene, tLocal, plan._P, plan.audio?.bpm || plan._P.bpm, plan.meta);
  ctx.save();
  ctx.translate(W / 2 + cam.dx, H / 2 + cam.dy); ctx.scale(cam.s, cam.s); ctx.translate(-W / 2, -H / 2);
  applyCam(ctx, camAt(scene, tLocal, W, H));   // запланированные наезды камеры на элемент
  comp.render(ctx, S);
  if (scene.overlay_fn && assets.baked?.[scene.overlay_fn]) {
    const b = assets.baked[scene.overlay_fn];
    drawPrims(ctx, b.frames[Math.min(b.frames.length - 1, Math.max(0, Math.floor(tLocal * b.fps)))], plan.palette);
  }
  ctx.restore();
  if (cam.flash > 0.01) { ctx.fillStyle = `rgba(255,255,255,${clamp(cam.flash)})`; ctx.fillRect(0, 0, W, H); }
}

// Рисует кадр глобального времени t на ctx. Возвращает nothing.
// Якоря объектов сцены (доли холста) — куда можно наехать камерой / в какой объект войти.
export function anchorsFor(scene, plan) {
  const comp = COMPONENTS[scene.component];
  try { return comp?.anchors ? comp.anchors({ ...scene, props: scene.props || {}, events: scene.events || [] }, { W: plan.meta.width, H: plan.meta.height, P: plan._P, st: plan.style, bpm: plan.audio?.bpm || plan._P.bpm }) || {} : {}; } catch { return {}; }
}
// Цель перехода zoom_into в пикселях: якорь предыдущей сцены, пропущенный через её камеру на конец сцены.
// strict (финальный рендер): неизвестная или отсутствующая цель — ошибка, а не молчаливая подмена «первым якорем».
// В режиме предпросмотра (strict=false) подмена допустима, но попадает в shared.fallbacks и видна режиссёру.
function resolveTarget(a, b, shared) {
  const { plan, W, H } = shared, spec = b.transition.target, an = anchorsFor(a, plan);
  let r = typeof spec === 'string' ? an[spec] : (spec && typeof spec === 'object' ? spec : null);
  if (!r) {
    const msg = `zoom_into into scene "${b.id}": target ${JSON.stringify(spec ?? null)} is not an anchor of the previous scene "${a.id}" (anchors: ${Object.keys(an).join(', ') || 'none'})`;
    if (shared.strict !== false) throw new Error(msg);
    (shared.fallbacks ||= []).push(msg);
    r = an[Object.keys(an)[0]] || { x: 0.5, y: 0.5, w: 0.5, h: 0.2 };
  }
  const m = mapRect(r, camAt(a, a.duration, W, H), W, H);
  return { x: m.x * W, y: m.y * H, w: Math.min(W * 0.98, Math.max(60, m.w * W)), h: Math.min(H * 0.98, Math.max(60, m.h * H)) };
}

function drawFrame(ctx, t, shared, bufs) {
  const { plan, W, H } = shared;
  const sc = plan.scenes;
  const active = sc.filter((s) => t >= s.start - 1e-9 && t < s.start + s.duration - 1e-9);
  if (!active.length) { drawScene(ctx, sc[sc.length - 1], sc[sc.length - 1].duration - 1e-3, shared); return; }
  if (active.length === 1) { drawScene(ctx, active[0], t - active[0].start, shared); return; }
  const a = active[0], b = active[1];
  drawScene(bufs.A.ctx, a, t - a.start, shared);
  drawScene(bufs.B.ctx, b, t - b.start, shared);
  const p = (t - b.start) / Math.max(1e-6, b.transition.duration);
  const opts = b.transition.type === 'zoom_into' ? { target: resolveTarget(a, b, shared), variant: b.transition.variant, roll: b.transition.roll } : {};
  compose(ctx, b.transition.type, p, bufs.A.canvas, bufs.B.canvas, W, H, b.transition.dir, opts);
}

function makeBuf(w, h, scale) {
  const canvas = createCanvas(Math.round(w * scale), Math.round(h * scale));
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  return { canvas, ctx };
}

export async function loadAssets(plan) {
  const assets = { baked: plan.assets?.baked || {} };
  const lp = plan.assets?.logoPath;
  if (lp && fs.existsSync(lp)) { try { assets.logoImage = await loadImage(lp); } catch { /* логотип необязателен */ } }
  return assets;
}

// Метрики движения по кадрам (для проверки, что динамичность меняет саму анимацию).
class MotionMeter {
  constructor(W, H) { this.W = W; this.H = H; this.prev = null; this.energy = []; }
  push(rgba, W, H) {
    const step = 12, cur = [];
    for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) { const i = (y * W + x) * 4; cur.push(rgba[i] * 0.3 + rgba[i + 1] * 0.59 + rgba[i + 2] * 0.11); }
    if (this.prev) { let s = 0; for (let i = 0; i < cur.length; i++) s += Math.abs(cur[i] - this.prev[i]); this.energy.push(s / cur.length / 255); } else this.energy.push(0);
    this.prev = cur;
  }
  summary() {
    const e = this.energy.slice(1); if (!e.length) return { mean: 0, p95: 0, hardCuts: 0 };
    const sorted = [...e].sort((a, b) => a - b);
    const mean = e.reduce((a, b) => a + b, 0) / e.length;
    return { mean: round(mean, 4), p95: round(sorted[Math.floor(sorted.length * 0.95)], 4), peak: round(sorted[sorted.length - 1], 4), hardCuts: e.filter((v) => v > 0.12).length, frames: e.length };
  }
}

// Если у запечённой функции нет кадров (план загружен с диска), но есть код — печём заново в песочнице.
export async function ensureBaked(plan) {
  for (const [fn, b] of Object.entries(plan.assets?.baked || {})) {
    if (b.frames?.length || !b.code) continue;
    const r = await runSandbox({ code: b.code, duration: b.duration, fps: b.fps || plan.meta.fps, W: plan.meta.width, H: plan.meta.height, pal: plan.palette });
    if (!r.ok) throw new Error(`re-bake of "${fn}" failed: ${r.error}`);
    b.frames = r.frames; b.texts = r.texts;
  }
}

// Контактный лист кадров для самопроверки режиссёра: возвращает JPEG и список времён.
export async function previewSheet(planIn, times, { cols = 3, frameScale = 0.25 } = {}) {
  const plan = normalizePlan(planIn);
  await ensureBaked(plan);
  const W = plan.meta.width, H = plan.meta.height, total = plan.meta.totalDuration;
  const assets = await loadAssets(plan), shared = { plan, W, H, assets, strict: false, fallbacks: [] };
  const main = makeBuf(W, H, frameScale), bufs = { A: makeBuf(W, H, frameScale), B: makeBuf(W, H, frameScale) };
  let ts = times && times.length ? times : plan.scenes.map((s) => s.start + Math.min(s.duration * 0.72, s.duration - 0.25));
  if (ts.length > 6) ts = Array.from({ length: 6 }, (_, i) => ts[Math.round((i * (ts.length - 1)) / 5)]);
  ts = ts.map((t) => Math.max(0, Math.min(total - 1e-3, t)));
  const w = main.canvas.width, h = main.canvas.height, rows = Math.ceil(ts.length / cols), gap = 6, cap = 20;
  const sheet = createCanvas(cols * w + (cols + 1) * gap, rows * (h + cap) + gap);
  const sx = sheet.getContext('2d'); sx.fillStyle = '#1b1c20'; sx.fillRect(0, 0, sheet.width, sheet.height);
  ts.forEach((t, i) => {
    main.ctx.clearRect(0, 0, W, H); drawFrame(main.ctx, t, shared, bufs);
    const x = gap + (i % cols) * (w + gap), y = gap + Math.floor(i / cols) * (h + cap);
    sx.drawImage(main.canvas, x, y + cap);
    const sc = plan.scenes.find((s) => t >= s.start && t < s.start + s.duration) || plan.scenes[plan.scenes.length - 1];
    sx.fillStyle = '#d7dae0'; sx.font = '13px "Inter"'; sx.fillText(`t=${t.toFixed(1)}s · ${sc.id}`, x + 2, y + 14);
  });
  return { jpeg: sheet.toBuffer('image/jpeg', 72), times: ts.map((t) => Number(t.toFixed(2))), total: Number(total.toFixed(2)), fallbacks: [...new Set(shared.fallbacks)] };
}

// Основной рендер. opts: {outFile, scale=1, withAudio=true, onProgress, stills:[секунды], stillsDir, metricsOnly}
export async function renderPlan(planIn, opts = {}) {
  const plan = normalizePlan(planIn);
  await ensureBaked(plan);
  const { scale = 1, withAudio = true, onProgress } = opts;
  const W = plan.meta.width, H = plan.meta.height, fps = plan.meta.fps;
  const total = plan.meta.totalDuration;
  const nFrames = Math.round(total * fps);
  const assets = await loadAssets(plan);
  const shared = { plan, W, H, assets, strict: true };
  const main = makeBuf(W, H, scale), bufs = { A: makeBuf(W, H, scale), B: makeBuf(W, H, scale) };
  const grainAmt = plan.style?.grain ?? 0;
  const meter = new MotionMeter(Math.round(W * scale), Math.round(H * scale));
  const result = { plan, frames: nFrames, seconds: total, metrics: null, stills: [] };

  // стоп-кадры для визуальной проверки
  if (opts.stills?.length) {
    fs.mkdirSync(opts.stillsDir, { recursive: true });
    for (const ts of opts.stills) {
      main.ctx.clearRect(0, 0, W, H); drawFrame(main.ctx, Math.min(ts, total - 1e-3), shared, bufs);
      const f = path.join(opts.stillsDir, `t${String(ts).replace('.', '_')}.png`);
      fs.writeFileSync(f, main.canvas.toBuffer('image/png')); result.stills.push(f);
    }
  }
  if (opts.stillsOnly) return result;

  let ff = null, wav = null;
  if (opts.outFile) {
    fs.mkdirSync(path.dirname(opts.outFile), { recursive: true });
    const args = ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${main.canvas.width}x${main.canvas.height}`, '-framerate', String(fps), '-i', 'pipe:0'];
    if (withAudio) {
      wav = opts.outFile + '.audio.wav';
      const cues = gatherCues(plan).map(({t, kind, gain = .8}) => ({
        frame: Math.round(t * fps), kind, gain: Math.round(gain * 100),
      }));
      const used = await mixSoundLibrary({output: wav, cues, fps, seconds: total});
      result.audio = { cues: used.length, seconds: total, cueList: used };
      args.push('-i', wav);
    }
    args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart');
    if (withAudio) args.push('-ar', '48000', '-c:a', 'aac', '-b:a', '192k', '-shortest');
    args.push(opts.outFile);
    ff = spawn('ffmpeg', args, { stdio: ['pipe', 'inherit', 'pipe'] });
    let errTxt = ''; ff.stderr.on('data', (d) => { errTxt += d; });
    ff.on('error', (e) => { errTxt += String(e); });
    result._ffDone = new Promise((res, rej) => ff.on('close', (code) => (code === 0 ? res() : rej(new Error(`ffmpeg exit ${code}: ${errTxt.slice(-400)}`)))));
  }

  for (let f = 0; f < nFrames; f++) {
    const t = f / fps;
    main.ctx.clearRect(0, 0, W, H);
    drawFrame(main.ctx, t, shared, bufs);
    if (grainAmt) drawGrain(main.ctx, W, H, f, grainAmt, createCanvas);
    const raw = main.canvas.data();
    meter.push(raw, main.canvas.width, main.canvas.height);
    if (ff) { if (!ff.stdin.write(raw)) await new Promise((r) => ff.stdin.once('drain', r)); }
    if (onProgress && f % 10 === 0) onProgress(f / nFrames);
  }
  result.metrics = meter.summary();
  result.energy = meter.energy;
  if (ff) { ff.stdin.end(); await result._ffDone; delete result._ffDone; if (wav) fs.rmSync(wav, { force: true }); }
  return result;
}
