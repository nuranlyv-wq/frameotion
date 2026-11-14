import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PlanBuilder } from '../src/director/tools.js';
import { getStyle } from '../src/styles/presets.js';
import { validatePlan } from '../src/plan/validate.js';

const imp = { brand: 'Test', title: 'Test', description: '', headings: [], paragraphs: [], uiStrings: [], colors: [], textSample: '' };

const CODE = `function frame(t){ return [R(0,0,W,H,{fill:'bg'})].concat(skyline(t,{y:1200}), road(t,{y:1200}), [car(200+t*180,1330,1.2,{spin:t*9}), T('Sadəcə axtarın', 540, 300, {size:84, align:'center', font:'condensed'})]); }`;

test('preview_plan возвращает картинку (контактный лист), счётчик ограничен тремя', async () => {
  const b = new PlanBuilder({ imp, style: getStyle('clean'), dynamism: 'medium', mode: 'silent', length: 'short' });
  const r1 = await b.exec('run_sandbox_draw', { fn_id: 'world', code: CODE, duration: 3 });
  assert.equal(JSON.parse(r1.content).ok, true, r1.content);
  const j = JSON.parse(r1.content);
  assert.ok(j.texts_found.some((x) => x.s === 'Sadəcə axtarın'), 'тексты из кода извлечены для проверки времени чтения');
  await b.exec('add_scene', { id: 'w', component: 'custom_draw', duration: 3, props: { fn: 'world', beats: [0.5, 1.5, 2.5] } });
  await b.exec('add_scene', { id: 'c', component: 'cta_end', duration: 2.8, transition_in: { type: 'push', duration: 0.4 }, props: { headline: 'İndi axtarın', button: 'Başla', url: 'google.com' } });
  const p = await b.exec('preview_plan', {});
  assert.equal(p.isError, false);
  assert.ok(Array.isArray(p.content), 'контент — массив блоков');
  const img = p.content.find((x) => x.type === 'image');
  assert.ok(img && img.source.media_type === 'image/jpeg' && img.source.data.length > 2000, 'есть JPEG');
  assert.match(p.content[0].text, /contact sheet 1\/3/);
  await b.exec('preview_plan', { scene: 'w' }); await b.exec('preview_plan', { times: [0.5, 2] });
  const over = await b.exec('preview_plan', {});
  assert.equal(over.isError, true); assert.match(over.content, /limit/);
});

test('custom_draw: время чтения текста внутри кода проверяется валидатором; кириллица отклоняется', async () => {
  const b = new PlanBuilder({ imp, style: getStyle('clean'), dynamism: 'medium', mode: 'silent', length: 'short' });
  b.plan.meta.craftRules = false;
  // текст появляется только в последнюю секунду 3-секундной сцены
  const late = `function frame(t){ return [T('Çox gec görünən mətn', 540, 400, {size:60, align:'center', a: t>2.5?1:0})]; }`;
  await b.exec('run_sandbox_draw', { fn_id: 'late', code: late, duration: 3 });
  await b.exec('add_scene', { id: 'a', component: 'custom_draw', duration: 3, props: { fn: 'late' } });
  await b.exec('add_scene', { id: 'b', component: 'cta_end', duration: 3, transition_in: { type: 'push', duration: 0.4 }, props: { headline: 'Salam', button: 'Başla', url: 'a.az' } });
  const v = validatePlan(b.plan);
  assert.ok(v.errors.some((e) => /props\.fn\.text\[0\]/.test(e.path) && /to be read/.test(e.message)), JSON.stringify(v.errors.map((e) => e.message)));
  const ru = `function frame(t){ return [T('Привет мир', 540, 400, {size:60, align:'center'})]; }`;
  await b.exec('run_sandbox_draw', { fn_id: 'ru', code: ru, duration: 3 });
  b.scene('a').props.fn = 'ru';
  assert.ok(validatePlan(b.plan).errors.some((e) => /Cyrillic/.test(e.message)));
});
