// Процедурный звук: музыкальная подложка по bpm/динамичности + звуковые акценты,
// привязанные к РЕАЛЬНЫМ событиям анимации (набор букв, клик, появление точек, удары, переходы).
import fs from 'node:fs';
import { COMPONENTS } from './components/index.js';
import { mulberry32 } from '../util.js';

const SR = 44100;
const ROOTS = { A: 220, B: 246.94, C: 261.63, D: 293.66, E: 164.81, F: 174.61, G: 196 };
const MINOR = [0, 3, 5, 7, 10], MAJOR = [0, 2, 4, 7, 9];
const semis = (n) => Math.pow(2, n / 12);

function noteFreq(key, mood, idx, oct = 1) {
  const sc = mood === 'bright' ? MAJOR : MINOR;
  const root = (ROOTS[key] || 220) * Math.pow(2, oct - 1);
  return root * semis(sc[idx % 5] + 12 * Math.floor(idx / 5));
}

class Mix {
  constructor(seconds) { this.n = Math.ceil(seconds * SR); this.L = new Float32Array(this.n); this.R = new Float32Array(this.n); this.rnd = mulberry32(1234); }
  add(t0, len, fn, gain = 1, pan = 0) {
    const s0 = Math.max(0, Math.floor(t0 * SR)), n = Math.min(Math.floor(len * SR), this.n - s0);
    const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4), gr = gain * Math.sin(((pan + 1) * Math.PI) / 4);
    for (let i = 0; i < n; i++) { const v = fn(i / SR, i); this.L[s0 + i] += v * gl; this.R[s0 + i] += v * gr; }
  }
}

const exp = (t, k) => Math.exp(-t * k);
function lpNoise(rnd) { let y = 0; return (cut) => { y += cut * ((rnd() * 2 - 1) - y); return y; }; }

const SFX = {
  tick: (m, t0, g, p) => { const f = 1900 * p; m.add(t0, 0.03, (t) => (Math.sin(2 * Math.PI * f * t) * 0.5 + (m.rnd() * 2 - 1) * 0.5) * exp(t, 190), 0.22 * g); },
  click: (m, t0, g) => { m.add(t0, 0.09, (t) => (Math.sin(2 * Math.PI * 1100 * t) * exp(t, 110) + (m.rnd() * 2 - 1) * exp(t, 400) * 0.6), 0.4 * g); m.add(t0, 0.12, (t) => Math.sin(2 * Math.PI * 130 * t) * exp(t, 40), 0.35 * g); },
  pop: (m, t0, g, p, note = 0, key, mood) => {
    const f = noteFreq(key, mood, note, 3) * p;
    m.add(t0, 0.32, (t) => { const fr = f * (1 + 0.5 * exp(t, 38)); return (Math.sin(2 * Math.PI * fr * t) + 0.35 * Math.sin(2 * Math.PI * fr * 2 * t) * exp(t, 20)) * exp(t, 12); }, 0.32 * g, ((note % 5) - 2) * 0.12);
  },
  whoosh: (m, t0, g) => { const lp = lpNoise(m.rnd); m.add(t0, 0.55, (t) => { const k = t / 0.55; return lp(0.02 + 0.55 * Math.sin(Math.PI * Math.min(1, k)) ** 2) * Math.sin(Math.PI * k) * 2.8; }, 0.3 * g); },
  swish: (m, t0, g) => { const lp = lpNoise(m.rnd); m.add(t0, 0.28, (t) => { const k = t / 0.28; return lp(0.1 + 0.6 * k) * Math.sin(Math.PI * k) * 2.2; }, 0.22 * g); },
  hit: (m, t0, g) => { m.add(t0, 0.45, (t) => Math.sin(2 * Math.PI * (48 + 110 * exp(t, 28)) * t) * exp(t, 7), 0.75 * g); m.add(t0, 0.06, (t) => (m.rnd() * 2 - 1) * exp(t, 90), 0.3 * g); },
  thud: (m, t0, g) => { const lp = lpNoise(m.rnd); m.add(t0, 0.35, (t) => (Math.sin(2 * Math.PI * 62 * t) + lp(0.08) * 0.8) * exp(t, 11), 0.55 * g); },
  riser: (m, t0, g) => { const lp = lpNoise(m.rnd); m.add(t0, 0.9, (t) => { const k = t / 0.9; return lp(0.01 + 0.6 * k * k) * k * k * 3.2; }, 0.28 * g); },
  ding: (m, t0, g, p, n, key) => { const f = (ROOTS[key] || 220) * 4 * p; m.add(t0, 1.0, (t) => (Math.sin(2 * Math.PI * f * t) + 0.5 * Math.sin(2 * Math.PI * f * 2.76 * t) * exp(t, 3) + 0.25 * Math.sin(2 * Math.PI * f * 5.4 * t) * exp(t, 6)) * exp(t, 4.2), 0.2 * g); },
  sparkle: (m, t0, g, p, n, key, mood) => { for (let i = 0; i < 3; i++) m.add(t0 + i * 0.045, 0.22, (t) => Math.sin(2 * Math.PI * noteFreq(key, mood, 3 + i * 2, 4) * p * t) * exp(t, 18), 0.14 * g, i - 1); },
};

export function gatherCues(plan) {
  const P = plan._P, S = { P, bpm: plan.audio?.bpm || P.bpm };
  const cues = [];
  plan.scenes.forEach((s, i) => {
    const comp = COMPONENTS[s.component];
    if (plan.audio?.autoSfx !== false && comp?.cues) for (const c of comp.cues(s, S)) cues.push({ ...c, t: s.start + c.t });
    for (const e of s.events || []) {
      const k = e.strength ?? 1;
      if (e.type === 'stop') { const d = e.dur ?? 0.7; cues.push({ t: Math.max(0, s.start + e.t - 0.9), kind: 'riser', gain: 0.6 }, { t: s.start + e.t + d, kind: 'hit', gain: 1.0 }, { t: s.start + e.t + d, kind: 'sparkle', gain: 0.5 }); }
      if (e.type === 'punch') cues.push({ t: s.start + e.t, kind: 'hit', gain: 0.55 * k });
      if (e.type === 'shake') cues.push({ t: s.start + e.t, kind: 'thud', gain: 0.6 * k });
      if (e.type === 'flash') cues.push({ t: s.start + e.t, kind: 'sparkle', gain: 0.6 * k });
    }
    if (i > 0) {
      const tr = s.transition || { type: 'cut', duration: 0 };
      if (tr.type === 'cut' || tr.type === 'flash_cut') cues.push({ t: s.start + (tr.duration || 0) / 2, kind: 'hit', gain: 0.7 });
      else cues.push({ t: s.start + Math.max(0, tr.duration / 2 - 0.15), kind: 'whoosh', gain: 0.55 });
    }
  });
  for (const c of plan.audio?.sfx || []) {
    const s = plan.scenes.find((x) => x.id === c.scene);
    if (s) cues.push({ t: s.start + c.t, kind: c.kind, gain: c.gain ?? 0.8, pitch: c.pitch, note: c.note });
  }
  cues.sort((a, b) => a.t - b.t);
  // «стоп» — это тишина: внутри окна звуковые акценты не играют (удар и искры на выходе стоят ровно на его границе)
  const wins = stopWindows(plan);
  for (let i = cues.length - 1; i >= 0; i--) if (wins.some(([a, b]) => cues[i].t > a + 0.02 && cues[i].t < b - 0.02)) cues.splice(i, 1);
  // слияние почти совпадающих одинаковых звуков
  const out = [];
  for (const c of cues) { const prev = out.findLast((o) => o.kind === c.kind); if (prev && Math.abs(prev.t - c.t) < 0.035) { prev.gain = Math.max(prev.gain, c.gain); continue; } out.push({ ...c }); }
  return out;
}

export function stopWindows(plan) {
  const w = [];
  for (const s of plan.scenes) for (const e of s.events || []) if (e.type === 'stop') w.push([s.start + e.t, s.start + e.t + (e.dur ?? 0.7)]);
  return w;
}

function music(plan, m, total) {
  const wins = stopWindows(plan);
  const duck = (t) => (wins.some(([a, b]) => t >= a - 0.02 && t < b) ? 0.06 : 1);
  const addM = (t0, len, fn, gain = 1, pan = 0) => m.add(t0, len, fn, gain * duck(t0), pan);
  const P = plan._P, bpm = plan.audio?.bpm || P.bpm, beat = 60 / bpm, key = plan.audio?.key || 'A', mood = plan.audio?.mood || 'warm';
  const I = P.music.intensity;
  const level = P.id; // calm | medium | high
  const nb = Math.floor(total / beat);
  const prog = [0, 5, 3, 4]; // ступени пентатоники по тактам
  for (let b = 0; b < nb; b++) {
    const t0 = b * beat, bar = Math.floor(b / 4), k = b % 4, root = prog[bar % 4];
    // кик
    if (level !== 'calm' || k === 0 || k === 2) addM(t0, 0.3, (t) => Math.sin(2 * Math.PI * (44 + 95 * exp(t, 30)) * t) * exp(t, 9), (level === 'calm' ? 0.2 : 0.42) * I);
    // клап/снейр
    if (level === 'high' && (k === 1 || k === 3)) { const lp = lpNoise(m.rnd); addM(t0, 0.14, (t) => lp(0.6) * exp(t, 28), 0.26 * I); }
    // хэты
    const hats = level === 'high' ? 4 : level === 'medium' ? 2 : 0;
    for (let h = 0; h < hats; h++) { if (level === 'medium' && h === 0) continue; const th = t0 + (h * beat) / hats; addM(th, 0.05, (t) => (m.rnd() * 2 - 1) * exp(t, 110), (h % 2 ? 0.07 : 0.1) * I, 0.25); }
    // бас
    const bf = noteFreq(key, mood, root, 1) / 2;
    if (level !== 'calm') {
      const steps = level === 'high' ? 2 : 1;
      for (let s = 0; s < steps; s++) addM(t0 + (s * beat) / steps, beat / steps * 0.9, (t) => (Math.sin(2 * Math.PI * bf * t) + 0.3 * Math.sin(2 * Math.PI * bf * 2 * t)) * exp(t, 5), 0.2 * I);
    }
    // пэд на каждом такте
    if (k === 0) { const len = beat * 4; for (const iv of [0, 2, 4]) { const f = noteFreq(key, mood, root + iv, 2); addM(t0, len + 0.3, (t) => { const env = Math.min(1, t / 0.4) * Math.min(1, (len + 0.3 - t) / 0.3); return (Math.sin(2 * Math.PI * f * t) + Math.sin(2 * Math.PI * f * 1.004 * t)) * 0.5 * env; }, (level === 'calm' ? 0.07 : 0.045) * I); } }
    // арпеджио/плак
    const sub = level === 'high' ? 4 : level === 'medium' ? 2 : 1;
    const every = level === 'calm' ? 2 : 1;
    if (b % every === 0) for (let s = 0; s < sub; s++) {
      const idx = [0, 2, 1, 3, 2, 4, 3, 1][(b * sub + s) % 8] + root;
      const f = noteFreq(key, mood, idx, 3);
      addM(t0 + (s * beat) / sub, 0.32, (t) => (Math.sin(2 * Math.PI * f * t) + 0.4 * Math.sin(2 * Math.PI * f * 2 * t) * exp(t, 20)) * exp(t, 9), 0.07 * I, ((b + s) % 3) * 0.3 - 0.3);
    }
  }
}

// Синтез: возвращает {L,R,seconds}, пишет WAV (16-бит стерео).
export function renderAudio(plan, wavPath) {
  const total = plan.meta.totalDuration + 0.4;
  const m = new Mix(total);
  music(plan, m, plan.meta.totalDuration);
  const P = plan._P, key = plan.audio?.key || 'A', mood = plan.audio?.mood || 'warm';
  const cues = gatherCues(plan);
  for (const c of cues) { const fn = SFX[c.kind]; if (fn) fn(m, c.t, (c.gain ?? 0.8) * P.sfxGain, c.pitch || 1, c.note || 0, key, mood); }
  // мастер: нормализация с запасом, мягкий клиппер, fade-out
  let peak = 0; for (let i = 0; i < m.n; i++) peak = Math.max(peak, Math.abs(m.L[i]), Math.abs(m.R[i]));
  const g = peak > 0 ? 0.85 / peak : 1, fadeN = Math.floor(0.5 * SR);
  const buf = Buffer.alloc(m.n * 4);
  for (let i = 0; i < m.n; i++) {
    const f = i > m.n - fadeN ? (m.n - i) / fadeN : 1;
    const l = Math.tanh(m.L[i] * g * 1.1) * f, r = Math.tanh(m.R[i] * g * 1.1) * f;
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(l * 32767))), i * 4);
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(r * 32767))), i * 4 + 2);
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + buf.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(buf.length, 40);
  fs.writeFileSync(wavPath, Buffer.concat([h, buf]));
  return { seconds: total, cues };
}
