// Видеореференс → «отпечаток» стиля: палитра, темп монтажа, энергия движения (без LLM, только ffmpeg).
// Из отпечатка собирается пресет (saveStyle) или собственный стиль клиента (buildCustomStyle).
import { spawn } from 'node:child_process';
import { hexToRgb, mix, luminance, contrast, round } from '../util.js';

function run(cmd, args, { collect = 'stdout', maxBytes = 200 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const out = [], err = []; let size = 0;
    p.stdout.on('data', (d) => { size += d.length; if (size > maxBytes) { p.kill('SIGKILL'); return; } out.push(d); });
    p.stderr.on('data', (d) => err.push(d));
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve({ out: Buffer.concat(out), err: Buffer.concat(err).toString() }) : reject(new Error(`${cmd} exit ${code}: ${Buffer.concat(err).toString().slice(-200)}`))));
  });
}

const sat = (hex) => { const [r, g, b] = hexToRgb(hex).map((v) => v / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx === 0 ? 0 : (mx - mn) / mx; };
const hue = (hex) => { const [r, g, b] = hexToRgb(hex).map((v) => v / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return 0; const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return ((h * 60) + 360) % 360; };
const toHex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

// opts.crop — ffmpeg-фильтр обрезки, например 'crop=1040:366:0:970' (для экранных записей: анализируем сам ролик, а не интерфейс).
export async function analyzeReference(file, { crop } = {}) {
  const pre = crop ? `${crop},` : '';
  const cm = crop ? crop.match(/crop=(\d+):(\d+)/) : null;
  const probe = JSON.parse((await run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_entries', 'format=duration:stream=codec_type,width,height,r_frame_rate', file])).out.toString());
  const duration = Number(probe.format?.duration || 0);
  const v0 = (probe.streams || []).find((s) => s.codec_type === 'video');
  if (!v0 || !duration) throw new Error('Не удалось прочитать видео');
  const v = cm ? { ...v0, width: Number(cm[1]), height: Number(cm[2]) } : v0;
  const dur = Math.min(duration, 60); // анализируем первые 60 с

  // 1) монтаж: количество склеек по детектору сцен
  const sc = await run('ffmpeg', ['-hide_banner', '-t', String(dur), '-i', file, '-an', '-vf', `${pre}select='gt(scene,0.28)',showinfo`, '-f', 'null', '-']).catch((e) => ({ err: e.message, out: Buffer.alloc(0) }));
  const cuts = (sc.err.match(/pts_time:/g) || []).length;

  // 2) энергия движения: серые кадры 64 px, 8 fps
  const W = 64;
  const gray = (await run('ffmpeg', ['-v', 'error', '-t', String(dur), '-i', file, '-an', '-vf', `${pre}fps=8,scale=${W}:-2,format=gray`, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'])).out;
  const hgt = Math.round((v.height / v.width) * W / 2) * 2, fs = W * hgt, nF = Math.floor(gray.length / fs);
  const energy = [];
  for (let f = 1; f < nF; f++) { let s = 0; for (let i = 0; i < fs; i++) s += Math.abs(gray[f * fs + i] - gray[(f - 1) * fs + i]); energy.push(s / fs / 255); }
  const motion = energy.length ? energy.reduce((a, b) => a + b, 0) / energy.length : 0;

  // 3) палитра: цвета кадров (24 px, 2 fps), квантование 4 бита
  const rw = 24, rgb = (await run('ffmpeg', ['-v', 'error', '-t', String(dur), '-i', file, '-an', '-vf', `${pre}fps=2,scale=${rw}:-2`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])).out;
  const counts = new Map(); let lum = 0, n = 0;
  for (let i = 0; i + 2 < rgb.length; i += 3) {
    const q = [rgb[i], rgb[i + 1], rgb[i + 2]].map((x) => (x >> 4) * 16 + 8);
    const key = q.join(','); counts.set(key, (counts.get(key) || 0) + 1);
    lum += 0.3 * rgb[i] + 0.59 * rgb[i + 1] + 0.11 * rgb[i + 2]; n++;
  }
  const ranked = [...counts.entries()].map(([k, c]) => ({ hex: toHex(k.split(',').map(Number)), c })).sort((a, b) => b.c - a.c);
  const total = ranked.reduce((a, b) => a + b.c, 0);
  const bg = ranked[0].hex;
  const fg = contrast(bg, '#ffffff') >= contrast(bg, '#111111') ? '#ffffff' : '#111111';
  const chroma = ranked.filter((r) => sat(r.hex) > 0.35 && luminance(r.hex) > 0.04 && contrast(r.hex, bg) > 1.8 && r.c / total > 0.002);
  chroma.sort((a, b) => b.c * (0.4 + sat(b.hex)) - a.c * (0.4 + sat(a.hex)));
  const accent = chroma[0]?.hex || '#4f8cff';
  const accent2 = chroma.find((r) => { const d = Math.abs(hue(r.hex) - hue(accent)); return Math.min(d, 360 - d) > 40; })?.hex || '#ffd166';
  const cutsPerSec = cuts / dur;
  const suggestedDynamism = cutsPerSec < 0.25 && motion < 0.02 ? 'calm' : cutsPerSec < 0.55 && motion < 0.05 ? 'medium' : 'high';
  return {
    durationSec: round(duration, 2), analyzedSec: round(dur, 2), width: v.width, height: v.height, cuts, cutsPerSec: round(cutsPerSec, 3), motionEnergy: round(motion, 4),
    meanLuma: round(lum / n / 255, 3), suggestedDynamism,
    palette: { bg, fg, accent, accent2, muted: mix(bg, fg, 0.55) },
    topColors: ranked.slice(0, 6).map((r) => r.hex),
  };
}

// Пресет на основе референса (название и описание задаёт человек при утверждении подборки).
export function presetFromFingerprint(fp, { id, name, description }) {
  return {
    id, name, source: 'reference', status: 'draft',
    description: description || `Стиль из видеореференса: ${fp.suggestedDynamism}-темп (${fp.cutsPerSec} склеек/с), палитра по кадрам.`,
    palette: fp.palette, typography: { family: 'Inter', weight: 800 }, bg: fp.meanLuma > 0.5 ? 'dots' : 'grid', music: { mood: fp.meanLuma > 0.5 ? 'bright' : 'warm', key: 'A' },
    reference: { cutsPerSec: fp.cutsPerSec, motionEnergy: fp.motionEnergy, durationSec: fp.durationSec, suggestedDynamism: fp.suggestedDynamism },
  };
}
