import { test } from 'node:test';
import assert from 'node:assert/strict';
import { googlePlan } from './fixtures/google-plan.js';
import { validatePlan } from '../src/plan/validate.js';
import { normalizePlan, layoutScenes } from '../src/plan/model.js';
import { PROFILES } from '../src/dynamism.js';

test('валидный план проходит, невалидные случаи дают понятные ошибки', () => {
  const p = googlePlan('medium');
  p.scenes[0].events.push({ t: 0.5, type: 'flash' }, { t: 1.2, type: 'punch' }, { t: 2.0, type: 'shake' });
  p.scenes[2].events.push({ t: 0.6, type: 'punch' }, { t: 1.4, type: 'punch' });
  const ok = validatePlan(p); assert.equal(ok.ok, true, JSON.stringify(ok.errors));
  const bad = googlePlan('medium'); bad.scenes[1].component = 'nope'; bad.scenes[0].props.lines[0].text = 'Привет мир';
  const r = validatePlan(bad);
  assert.ok(r.errors.some((e) => /unknown component/.test(e.message)));
  assert.ok(r.errors.some((e) => /Cyrillic/.test(e.message)));
});

test('профиль запрещает недопустимые переходы и длительности', () => {
  const p = googlePlan('calm'); p.scenes[1].transition_in = { type: 'flash_cut', duration: 0.2 }; p.scenes[0].duration = 1;
  const r = validatePlan(p);
  assert.ok(r.errors.some((e) => /not allowed at dynamism=calm/.test(e.message)));
  // темп профиля — рекомендация, а не ошибка; ошибкой остаётся только выход за технические пределы
  assert.ok(!r.errors.some((e) => /scene range|usual/.test(e.message)));
  assert.ok(r.layers.artistic.recommendations.some((e) => /usual calm pace/.test(e.message)));
  p.scenes[0].duration = 0.4;
  assert.ok(validatePlan(p).errors.some((e) => /technical limits/.test(e.message)));
});

test('нормализация: старты на бите, события привязаны к сетке', () => {
  for (const dyn of ['calm', 'medium', 'high']) {
    const n = normalizePlan(googlePlan(dyn));
    const grid = 60 / PROFILES[dyn].bpm / PROFILES[dyn].music.snapDiv;
    n.scenes.slice(1).forEach((s) => { const k = s.start / grid; assert.ok(Math.abs(k - Math.round(k)) < 1e-6, `${dyn}: старт ${s.start} не на сетке ${grid}`); });
    const dots = n.scenes[1].props.dots.map((d) => (n.scenes[1].start + d.t) / grid);
    dots.forEach((k) => assert.ok(Math.abs(k - Math.round(k)) < 1e-6, `${dyn}: точка не на бите`));
    assert.ok(n.meta.totalDuration > 8);
  }
});

test('динамичность меняет параметры плана: профили упорядочены calm < medium < high', () => {
  const k = ['calm', 'medium', 'high'].map((d) => PROFILES[d]);
  for (const f of ['bpm', 'speed', 'amp']) assert.ok(k[0][f] < k[1][f] && k[1][f] < k[2][f], f);
  assert.ok(k[0].stagger > k[1].stagger && k[1].stagger > k[2].stagger);
  assert.ok(k[0].sceneSec[1] < 5.1 && k[2].sceneSec[1] < k[1].sceneSec[1]);
});
