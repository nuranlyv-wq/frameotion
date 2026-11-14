// Полный прогон: импорт сайта → режиссура (Opus) → валидный план → рендер → отчёт со стоимостью.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { CONFIG } from './config.js';
import { importSite } from './import/index.js';
import { runDirector } from './director/agent.js';
import { renderPlan } from './render/engine.js';
import { normalizePlan } from './plan/model.js';
import { getStyle } from './styles/presets.js';
import { synthesizeVoice } from './voice.js';
import { probeVideo } from './qa.js';
import { pickAngle, avoidBrief, recordRun } from './director/angles.js';

export function newRunId(prefix = 'run') {
  return `${prefix}-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 6)}`;
}

// В JSON плана кадры не пишутся (десятки МБ): остаются код, тексты и статистика; кадры перепекаются из кода (ensureBaked).
export function stripBaked(plan) {
  return { ...plan, assets: { ...plan.assets, baked: Object.fromEntries(Object.entries(plan.assets?.baked || {}).map(([k, b]) => { const { frames, ...rest } = b; return [k, { ...rest, frameCount: frames?.length ?? 0 }]; })) } };
}
const write = (file, obj) => fs.writeFileSync(file, typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2));

// params: {url, dynamism, styleId | style, mode, brief, runId, client?, scale?, onEvent?, reuseImport?}
export async function generateVideo(params) {
  const { url, dynamism = 'medium', mode = 'silent', brief, length = 'short', onEvent = () => {}, scale = 1 } = params;
  const style = params.style || getStyle(params.styleId || 'clean');
  const runId = params.runId || newRunId();
  const dir = path.join(CONFIG.runsDir, runId);
  fs.mkdirSync(dir, { recursive: true });
  const t0 = Date.now(), timings = {};
  const stage = (name) => { onEvent({ type: 'stage', name }); return Date.now(); };

  // 1. Импорт
  let s = stage('import');
  const imp = params.reuseImport || await importSite(url, { lang: 'az', workDir: path.join(dir, 'import') });
  timings.importMs = Date.now() - s;
  write(path.join(dir, 'import.json'), { ...imp, screenshot: imp.screenshot ? path.basename(imp.screenshot) : null });

  // 2. Режиссёр
  s = stage('director');
  const angle = pickAngle(imp.host, { preferred: params.angle, seed: params.seed }), avoid = avoidBrief(imp.host);
  const dir_ = await runDirector({ imp, style, dynamism, mode, brief, length, angle, avoid, paletteMode: params.paletteMode || 'brand', client: params.client, craftRules: params.craftRules, onEvent });
  timings.directorMs = Date.now() - s;
  write(path.join(dir, 'cost.json'), dir_.cost);
  write(path.join(dir, 'director-trace.json'), { stopReason: dir_.stopReason, error: dir_.error, turns: dir_.turns, trace: dir_.trace, fallback: dir_.fallback, sandbox: dir_.sandbox });
  write(path.join(dir, 'plan.json'), stripBaked(dir_.plan));
  const report = { runId, url, dynamism, mode, length, library: dir_.library, style: { id: style.id, name: style.name }, finalized: dir_.finalized, stopReason: dir_.stopReason, error: dir_.error, cost: dir_.cost, validation: { ok: dir_.validation.ok, errors: dir_.validation.errors, warnings: dir_.validation.warnings, metrics: dir_.validation.metrics }, import: { via: imp.via, ms: imp.ms, warnings: imp.warnings, brand: imp.brand }, timings };
  report.angle = angle.id; report.library = dir_.library;
  if (!dir_.finalized) { write(path.join(dir, 'report.json'), report); return { ok: false, runId, dir, report, plan: dir_.plan }; }
  // память по сайту: следующие ролики не повторяют ракурс, идею и зачины
  const texts = (sc) => { const out = []; const w = (o) => { if (Array.isArray(o)) o.forEach(w); else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { if (['text', 'title', 'headline', 'query', 'label'].includes(k) && typeof v === 'string') out.push(v); else w(v); } }; w(sc.props); return out; };
  recordRun(imp.host, { angle: angle.id, concept: dir_.plan.meta.concept, openers: dir_.plan.scenes.slice(0, 2).flatMap(texts).slice(0, 3), facts: [...new Set(dir_.plan.scenes.flatMap((s) => s.facts || []))], runId });

  // 3. Рендер
  s = stage('render');
  const outFile = path.join(dir, 'video.mp4');
  const r = await renderPlan(dir_.plan, { outFile, scale, onProgress: (p) => onEvent({ type: 'render', progress: p }) });
  timings.renderMs = Date.now() - s;
  report.render = { seconds: r.seconds, frames: r.frames, metrics: r.metrics, sfxCues: r.audio?.cues ?? 0 };
  write(path.join(dir, 'plan.normalized.json'), stripBaked(r.plan));
  report.qa = await probeVideo(outFile);   // измерение готового файла

  // 4. Озвучка (режим voice)
  if (mode === 'voice') {
    s = stage('voice');
    const v = await synthesizeVoice(r.plan, outFile, dir);
    report.voice = v;
    timings.voiceMs = Date.now() - s;
  }
  report.timings = { ...timings, totalMs: Date.now() - t0 };
  report.video = path.relative(CONFIG.runsDir, outFile);
  write(path.join(dir, 'report.json'), report);
  return { ok: true, runId, dir, video: outFile, report, plan: r.plan };
}

// Стоп-кадры из готового mp4 (для проверки/превью).
export function extractFrame(mp4, t, out) {
  return new Promise((res, rej) => { const p = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(t), '-i', mp4, '-frames:v', '1', out]); p.on('close', (c) => (c === 0 ? res(out) : rej(new Error('ffmpeg frame'))));});
}
