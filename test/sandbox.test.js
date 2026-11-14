import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runSandbox, staticCheck, frameStats } from '../src/sandbox/index.js';

const base = { duration: 1, fps: 10, pal: { fg: '#fff', accent: '#4f8cff' } };

test('честный код выполняется и возвращает примитивы', async () => {
  const r = await runSandbox({ ...base, code: 'function frame(t,i,N){ return [{k:"circle", x: W/2 + Math.sin(t*6)*200, y: H/2, r: 40, fill:"accent"}]; }' });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.frames.length, 10);
  assert.equal(r.frames[0][0].k, 'circle');
  assert.ok(frameStats(r.frames).maxPrimsPerFrame === 1);
  assert.ok(r.texts.length === 0);
});

test('статический фильтр отклоняет явные попытки', () => {
  for (const c of ['process.exit(1)', 'require("fs")', 'import("fs")', 'fetch("http://x")', 'eval("1")', 'new Function("return 1")', '({}).constructor.constructor("return process")()', 'setTimeout(()=>{},1)']) {
    assert.ok(staticCheck(c), `должно быть отклонено: ${c}`);
  }
});

test('бесконечный цикл убивается по таймауту', async () => {
  const r = await runSandbox({ ...base, code: 'function frame(){ while(true){} }', _skipStatic: true, limits: { cpuMs: 1200 } });
  assert.equal(r.ok, false);
  assert.match(r.error, /timed out|limit|Script execution/i);
  assert.ok(r.ms < 6000, `ушло ${r.ms} мс`);
});

test('бомба памяти останавливается лимитом кучи', async () => {
  const r = await runSandbox({ ...base, code: 'function frame(){ const a=[]; for(;;){ a.push(new Array(1e6).fill(1)); } }', _skipStatic: true });
  assert.equal(r.ok, false);
  assert.ok(r.ms < 6000);
});

// Рантайм-изоляция проверяется С ОТКЛЮЧЁННЫМ статическим фильтром (_skipStatic): даже если модель
// его обойдёт, process/require/fetch/eval/Function и ключ из окружения недоступны.
const probe = (expr) => `function frame(){ let r; try { r = String(${expr}); } catch (e) { r = "ERR:" + String(e && e.message).slice(0,60); } return [{k:"text", s: r}]; }`;

test('рантайм: process, require, fetch, import недоступны', async () => {
  for (const [expr, want] of [['typeof process', 'undefined'], ['typeof require', 'undefined'], ['typeof fetch', 'undefined'], ['typeof globalThis.process', 'undefined'], ['typeof module', 'undefined']]) {
    const r = await runSandbox({ ...base, code: probe(expr), _skipStatic: true });
    assert.equal(r.ok, true, `${expr}: ${r.error}`);
    assert.equal(r.frames[0][0].s, want, expr);
  }
});

test('рантайм: eval и new Function запрещены в контексте', async () => {
  for (const expr of ['eval("1+1")', '(()=>{}).constructor("return 1")()', 'new Function("return process")()']) {
    const r = await runSandbox({ ...base, code: probe(expr), _skipStatic: true });
    assert.equal(r.ok, true, `${expr}: ${r.error}`);
    assert.match(r.frames[0][0].s, /^ERR:.*(code generation|disallowed|not allowed|EvalError)/i, `${expr} → ${r.frames[0][0].s}`);
  }
});

test('рантайм: чтение файлов и сеть невозможны (нет API, окружение пустое)', async () => {
  process.env.ANTHROPIC_API_KEY = 'sk-test-should-never-leak';
  for (const expr of ['typeof Buffer', 'typeof XMLHttpRequest', 'typeof WebSocket', 'typeof setTimeout']) {
    const r = await runSandbox({ ...base, code: probe(expr), _skipStatic: true });
    assert.equal(r.ok, true, `${expr}: ${r.error}`);
    assert.equal(r.frames[0][0].s, 'undefined', expr);
  }
  delete process.env.ANTHROPIC_API_KEY;
});

test('слишком много кадров отклоняется', async () => {
  const r = await runSandbox({ ...base, duration: 200, code: 'function frame(){ return []; }' });
  assert.equal(r.ok, false);
});

test('хост санитизирует мусорные примитивы', async () => {
  const r = await runSandbox({ ...base, code: 'function frame(){ return [{k:"evil", x:1}, {k:"rect", x: 1e12, y: NaN, w: 10, h: 10, fill: "<script>"}]; }' });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.frames[0].length, 1);
  assert.ok(Math.abs(r.frames[0][0].x) <= 9000);
  assert.ok(!r.frames[0][0].fill, 'невалидный цвет отброшен');
});

test('kit доступен модели: skyline, car, rays, grid3d, pixel, hud, cam; группы и градиенты доходят до хоста', async () => {
  const code = `function frame(t){ return cam([].concat(skyline(t,{y:1100}), road(t,{y:1100}), [car(300+t*200, 1180, 1.2, {spin:t*9})], rays(540,600,10,40,900,t,{}), grid3d(t,{}), [pixel(SPRITES.invader, 100, 200, 12, 'accent2'), hud(60,60,400,260,{label:'REC'}), T('Salam', 540, 300, {size:90, align:'center', font:'serif-italic'})]), {zoom:1+t*0.05}); }`;
  const r = await runSandbox({ ...base, duration: 1, fps: 10, code });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.frames.length, 10);
  const st = frameStats(r.frames);
  assert.ok(st.maxPrimsPerFrame > 40 && st.maxPrimsPerFrame <= 900, JSON.stringify(st));
  assert.ok(st.kinds.g >= 1 && st.kinds.path >= 1 && st.kinds.text >= 1, JSON.stringify(st.kinds));
  assert.ok(r.texts.some((x) => x.s === 'Salam' && x.from === 0), JSON.stringify(r.texts));
});

test('санитайзер: чужие цвета, вложенность и лишние примитивы отсекаются', async () => {
  const code = `function frame(){ var deep = {k:'g', items:[{k:'g', items:[{k:'g', items:[{k:'g', items:[{k:'g', items:[{k:'circle',x:1,y:1,r:5}]}]}]}]}]};
    var many = []; for (var i=0;i<1500;i++) many.push({k:'circle',x:i,y:i,r:2});
    return [deep, {k:'rect',x:0,y:0,w:10,h:10,fill:'url(javascript:alert(1))', stroke:'#00ff00'}, {k:'evil',x:1}].concat(many); }`;
  const r = await runSandbox({ ...base, duration: 0.2, fps: 10, code });
  assert.equal(r.ok, true, r.error);
  const f = r.frames[0];
  const rect = f.find((p) => p.k === 'rect');
  assert.ok(!rect.fill && rect.stroke === '#00ff00', 'вредоносный fill отброшен');
  assert.ok(!f.some((p) => p.k === 'evil'));
  let count = 0; const walk = (l) => { for (const p of l) { count++; if (p.k === 'g') walk(p.items); } }; walk(f);
  assert.ok(count <= 900, `примитивов ${count}`);
});

test('длинная сцена запекается порциями: 12 секунд при 30 fps', async () => {
  const r = await runSandbox({ ...base, duration: 12, fps: 30, code: 'function frame(t){ return skyline(t,{}); }' });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.frames.length, 360);
});

test('kit: ringText, radar, bubble, menu, reveal, curve, scan работают и доходят до хоста', async () => {
  const code = `function frame(t){ var hw=[[100,300],[200,260],[300,340],[420,280]];
    return [].concat(ringText('QUERY • RESULT • ', 540, 700, 300, t, {size:40}), radar(540, 700, t%1, {r:260}), [bubble(120, 1200, 560, 'Salam', {side:'left'}), bubble(300, 1320, 640, 'Yaxın kafe haradadır?', {}), menu(520, 1500, 460, ['Kopyala','Yapışdır','Sil'], 1), PATH(reveal(hw, t/1), {smooth:true, stroke:'accent', lw:6}), curve(100,100,900,400,{})], scan(100, 1000, 500, 160, t/1, {label:'SCAN'})); }`;
  const r = await runSandbox({ ...base, duration: 1, fps: 10, code });
  assert.equal(r.ok, true, r.error);
  const st = frameStats(r.frames);
  assert.ok(st.maxPrimsPerFrame > 40 && st.maxPrimsPerFrame <= 900, JSON.stringify(st));
  assert.ok(r.texts.some((x) => /Yaxın kafe/.test(x.s)));
});
