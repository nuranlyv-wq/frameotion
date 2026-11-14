// Дочерний процесс песочницы. Запускается ТОЛЬКО через src/sandbox/index.js:
//   sandbox-exec (запрет сети и записи) → node --experimental-permission (нет fs/child_process/worker)
//   → пустое окружение → vm-контекст без доступа к process/require/fetch и с запретом eval/Function.
// Код модели получает Math, константы и kit помощников; возвращает ДАННЫЕ (примитивы по кадрам),
// которые отдаются порциями (NDJSON) — память не растёт с длиной сцены.
import vm from 'node:vm';

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { input += d; if (input.length > 400000) { process.stderr.write('input too large'); process.exit(3); } });
process.stdin.on('end', async () => {
  let req;
  try { req = JSON.parse(input); } catch { process.stderr.write('bad request'); process.exit(3); }
  const { code, kit, frames, fps, W, H, pal, params, tokens, cpuMs, maxOut, chunk } = req;
  const ctx = vm.createContext(Object.create(null), { codeGeneration: { strings: false, wasm: false } });
  const prelude = `'use strict';
const __cfg = JSON.parse(${JSON.stringify(JSON.stringify({ W, H, fps, frames, pal, params: params || {}, tokens: tokens || null }))});
const W = __cfg.W, H = __cfg.H, FPS = __cfg.fps, N = __cfg.frames, PAL = __cfg.pal, PARAMS = __cfg.params, TK = __cfg.tokens || { stroke: { hair: 2, base: 4, heavy: 8 }, radius: { xs: 10, chip: 20, panel: 36, card: 44, pill: 999 }, space: { margin: 72 }, type: { title: 'display', emphasis: 'serif-italic', label: 'humanist', data: 'mono' }, ease: { enter: 'out3', exit: 'inOut3', ui: 'inOut3', emphasis: 'outBack' } };
`;
  const driver = `
;var __frameFn = (typeof frame === 'function') ? frame : null;
function __chunk(a, b) {
  if (!__frameFn) throw new Error('define function frame(t, i, N) that returns an array of primitives');
  var out = [];
  for (var i = a; i < b; i++) { var r = __frameFn(i / FPS, i, N); out.push(Array.isArray(r) ? r : (r ? [r] : [])); }
  return JSON.stringify(out);
}`;
  try {
    vm.runInContext(prelude + kit + '\n' + code + driver, ctx, { timeout: cpuMs, filename: 'model-code.js' });
    let total = 0;
    for (let i = 0; i < frames; i += chunk) {
      const s = vm.runInContext(`__chunk(${i}, ${Math.min(frames, i + chunk)})`, ctx, { timeout: cpuMs, filename: 'model-code.js' });
      if (typeof s !== 'string') throw new Error('driver returned non-string');
      total += s.length;
      if (total > maxOut) throw new Error(`output too large (${total} > ${maxOut} bytes)`);
      await new Promise((r) => process.stdout.write(s + '\n', r));
    }
    process.exit(0);
  } catch (e) {
    process.stderr.write(String(e && e.message ? e.message : e).slice(0, 400));
    process.exit(2);
  }
});
