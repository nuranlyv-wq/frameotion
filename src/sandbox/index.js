// Изолированное выполнение кода, сгенерированного моделью (custom_draw).
// Слои защиты (каждый независим):
//  1. статический фильтр опасных конструкций (ранняя обратная связь модели);
//  2. отдельный процесс с ПУСТЫМ окружением (ключи API недоступны);
//  3. macOS sandbox-exec: запрет сети и любой записи в файловую систему;
//  4. Node permission model: нет доступа к fs/child_process/worker;
//  5. vm-контекст без process/require/fetch, eval и new Function запрещены;
//  6. лимиты: CPU на порцию кадров, жёсткий wall-clock kill, heap, потолок вывода, число примитивов.
// Результат — только данные; хост повторно санитизирует их перед рендером.
import { spawn } from 'node:child_process';
import { DEFAULT_TOKENS } from '../render/tokens.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizeFrames } from '../render/prims.js';
import { KIT_SOURCE } from './kit.js';

const RUNNER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'runner.js');
export const SANDBOX_LIMITS = { maxCodeChars: 14000, cpuMs: 6000, wallBaseMs: 15000, wallPerFrameMs: 70, heapMb: 256, maxOutBytes: 110 * 1024 * 1024, maxFrames: 900, chunk: 15 };

const BANNED = [/\bprocess\b/, /\brequire\b/, /\bimport\b/, /\beval\b/, /\bFunction\b/, /\bconstructor\b/, /__proto__/, /\bglobalThis\b/, /\bfetch\b/, /\bXMLHttpRequest\b/, /\bWebSocket\b/, /\bWebAssembly\b/, /\bAtomics\b/, /\bSharedArrayBuffer\b/, /\bReflect\b/, /\bProxy\b/, /\bsetTimeout\b|\bsetInterval\b/];

export function staticCheck(code) {
  if (typeof code !== 'string' || !code.trim()) return 'code is empty';
  if (code.length > SANDBOX_LIMITS.maxCodeChars) return `code too long (${code.length} > ${SANDBOX_LIMITS.maxCodeChars} chars)`;
  for (const re of BANNED) if (re.test(code)) return `forbidden construct: ${re.source.replace(/\\b/g, '')}`;
  return null;
}

const SB_PROFILE = '(version 1)(allow default)(deny network*)(deny file-write*)';
const hasSandboxExec = fs.existsSync('/usr/bin/sandbox-exec');

// Запуск. Возвращает {ok, frames?, texts?, error?, ms, layers}.
// _skipStatic — ТОЛЬКО для тестов: проверяет, что рантайм-изоляция держится даже при обходе статического фильтра.
export function runSandbox({ code, duration, fps = 30, W = 1080, H = 1920, pal = {}, params = {}, tokens = null, limits = {}, _skipStatic = false }) {
  const L = { ...SANDBOX_LIMITS, ...limits };
  const bad = _skipStatic ? null : staticCheck(code);
  if (bad) return Promise.resolve({ ok: false, error: bad, ms: 0 });
  const frames = Math.ceil(duration * fps);
  if (!(frames > 0) || frames > L.maxFrames) return Promise.resolve({ ok: false, error: `duration*fps must be 1..${L.maxFrames} frames (got ${frames}); bake at most ${(L.maxFrames / fps).toFixed(0)} s`, ms: 0 });

  const nodeArgs = ['--experimental-permission', `--allow-fs-read=${RUNNER}`, `--max-old-space-size=${L.heapMb}`, '--disable-proto=delete', RUNNER];
  const [cmd, args] = hasSandboxExec ? ['/usr/bin/sandbox-exec', ['-p', SB_PROFILE, process.execPath, ...nodeArgs]] : [process.execPath, nodeArgs];
  const wallMs = L.wallMs ?? L.wallBaseMs + frames * L.wallPerFrameMs;
  const t0 = Date.now();
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { env: {}, cwd: os.tmpdir(), stdio: ['pipe', 'pipe', 'pipe'] });
    let buf = '', err = '', killed = null, settled = false, bytes = 0;
    const all = [];
    const done = (r) => { if (settled) return; settled = true; clearTimeout(timer); resolve({ ...r, ms: Date.now() - t0, layers: { sandboxExec: hasSandboxExec, permissionModel: true, vmNoCodegen: true, emptyEnv: true } }); };
    const timer = setTimeout(() => { killed = `wall-clock limit ${wallMs} ms exceeded`; child.kill('SIGKILL'); }, wallMs);
    const take = (line) => { if (!line) return; try { for (const f of JSON.parse(line)) all.push(f); } catch (e) { killed = `bad output chunk: ${e.message}`; child.kill('SIGKILL'); } };
    child.stdout.on('data', (d) => {
      bytes += d.length; if (bytes > L.maxOutBytes) { killed = 'output limit exceeded'; child.kill('SIGKILL'); return; }
      buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { take(buf.slice(0, i)); buf = buf.slice(i + 1); }
    });
    child.stderr.on('data', (d) => { err += d; if (err.length > 4000) err = err.slice(0, 4000); });
    child.on('error', (e) => done({ ok: false, error: `spawn failed: ${e.message}` }));
    child.on('close', (codeNum) => {
      if (killed) return done({ ok: false, error: killed });
      if (codeNum !== 0) {
        const why = /heap out of memory|Allocation failed|ERR_WORKER_OUT_OF_MEMORY/i.test(err) ? `memory limit ${L.heapMb} MB exceeded` : (err.trim() || `exit code ${codeNum}`);
        return done({ ok: false, error: why.replace(/\s+/g, ' ').slice(0, 300) });
      }
      take(buf);
      if (all.length !== frames) return done({ ok: false, error: `expected ${frames} frames, got ${all.length}` });
      const { frames: clean, dropped, texts } = sanitizeFrames(all, W, H, fps);
      done({ ok: true, frames: clean, dropped, texts, bytes });
    });
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify({ code, kit: KIT_SOURCE, frames, fps, W, H, pal, params, tokens: tokens || DEFAULT_TOKENS, cpuMs: L.cpuMs, maxOut: L.maxOutBytes, chunk: L.chunk }));
  });
}

// Статистика для модели: помогает заметить пустые кадры, перегруз и «ничего не двигается».
function countPrims(list) { let n = 0; for (const p of list) { n++; if (p.k === 'g') n += countPrims(p.items || []); } return n; }
function kindCounts(list, acc) { for (const p of list) { acc[p.k] = (acc[p.k] || 0) + 1; if (p.k === 'g') kindCounts(p.items || [], acc); } return acc; }
export function frameStats(frames) {
  let maxPrims = 0, empty = 0, changed = 0;
  const kinds = {};
  let prev = null;
  frames.forEach((f, i) => {
    const n = countPrims(f); maxPrims = Math.max(maxPrims, n); if (!f.length) empty++;
    if (i % 10 === 0) kindCounts(f, kinds);
    const sig = JSON.stringify(f).length; if (prev !== null && sig !== prev) changed++; prev = sig;
  });
  return { frames: frames.length, maxPrimsPerFrame: maxPrims, emptyFrames: empty, framesWithChange: changed, motionShare: Number((changed / Math.max(1, frames.length - 1)).toFixed(2)), kinds };
}
