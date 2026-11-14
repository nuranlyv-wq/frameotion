// Фазы 1 и 5: техника отделена от художественных рекомендаций; камера неподвижна по умолчанию;
// у наездов обязан быть смысл; цель zoom_into никогда не подменяется молча.
import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePlan } from '../src/plan/validate.js';
import { normalizePlan } from '../src/plan/model.js';
import { PROFILES } from '../src/dynamism.js';
import { renderPlan, previewSheet } from '../src/render/engine.js';
import { CAMERA_PURPOSES } from '../src/render/camera.js';
import { googlePlan } from './fixtures/google-plan.js';

const msgs = (r) => r.errors.map((e) => `${e.path}: ${e.message}`).join(' | ');

test('каждая проблема несёт слой, рекомендации не блокируют, пятый слой — без числа', () => {
  const r = validatePlan(googlePlan('medium'));
  assert.ok(r.ok, msgs(r));
  for (const i of [...r.errors, ...r.warnings]) assert.ok(['technical', 'layout', 'consistency', 'narrative', 'artistic'].includes(i.layer), JSON.stringify(i));
  assert.equal(r.layers.human.status, 'pending_human_review');
  assert.ok(!('score' in r) && !('score' in r.layers.human), 'единой оценки качества быть не должно');
  const p = googlePlan('medium'); p.scenes[0].duration = 0.4;
  const bad = validatePlan(p);
  assert.ok(!bad.ok && bad.layers.technical.errors.some((e) => /technical limits/.test(e.message)));
});

test('cut и crossfade разрешены при любой динамичности', () => {
  for (const P of Object.values(PROFILES)) assert.ok(P.transitions.allowed.includes('cut') && P.transitions.allowed.includes('crossfade'), P.id);
  const p = googlePlan('calm'); p.scenes[1].transition_in = { type: 'cut' };
  assert.ok(!validatePlan(p).errors.some((e) => /not allowed/.test(e.message)));
});

test('наезд камеры без смысла отклоняется (режим арт-директора), со смыслом и hold — проходит', () => {
  const p = googlePlan('medium'); p.meta.craftRules = true; p.assets.facts = [];
  p.scenes[1].camera = [{ t0: 0.4, t1: 1.6, z1: 1.8, x: 0.5, y: 0.2 }];
  assert.match(msgs(validatePlan(p)), /semantic purpose/);
  p.scenes[1].camera = [{ t0: 0.4, t1: 1.6, z1: 1.8, x: 0.5, y: 0.2, purpose: 'focus' }];
  assert.match(msgs(validatePlan(p)), /short reason/);
  p.scenes[1].camera = [{ t0: 0.4, t1: 1.6, z1: 1.8, x: 0.5, y: 0.2, purpose: 'focus', reason: 'the search pill is what the viewer must read next' }];
  assert.doesNotMatch(msgs(validatePlan(p)), /purpose|reason/);
  p.scenes[1].camera = [{ t0: 0.2, t1: 1.2, z0: 1, z1: 1.4, purpose: 'hold', reason: 'stay still while the line is read' }];
  assert.match(msgs(validatePlan(p)), /"hold" camera segment must keep the zoom constant/);
  assert.ok(CAMERA_PURPOSES.includes('hold'));
  p.meta.craftRules = false;   // старые планы без арт-директора не обязаны объяснять камеру
  p.scenes[1].camera = [{ t0: 0.4, t1: 1.6, z1: 1.8 }];
  assert.doesNotMatch(msgs(validatePlan(p)), /purpose/);
});

test('zoom_into без явной цели — ошибка валидации', () => {
  const p = googlePlan('medium');
  p.scenes[2].transition_in = { type: 'zoom_into', duration: 0.8, variant: 'portal' };
  assert.match(msgs(validatePlan(p)), /needs an explicit target/);
});

test('камера по умолчанию неподвижна: дрейф и зум на бит включаются только флагом', async () => {
  const mk = (flags) => { const p = googlePlan('high'); Object.assign(p.meta, flags); return p; };
  const frame = async (p, t) => { const r = await renderPlan(p, { stills: [t], stillsDir: '/private/tmp/kadr-cam-test', stillsOnly: true, scale: 0.2 }); return (await import('node:fs')).readFileSync(r.stills[0]); };
  const a = await frame(mk({}), 1.05), b = await frame(mk({}), 1.05), c = await frame(mk({ ambientCamera: true, beatPulse: true }), 1.05);
  assert.ok(a.equals(b), 'без флагов кадр детерминирован');
  assert.ok(!a.equals(c), 'с флагами камера заметно двигается');
});

test('финальный рендер падает на неизвестной цели zoom_into, предпросмотр — нет, но сообщает', async () => {
  const p = googlePlan('medium');
  p.scenes[2].transition_in = { type: 'zoom_into', duration: 0.8, target: 'no-such-anchor', variant: 'portal' };
  const n = normalizePlan(p), tr = n.scenes[2].start + 0.3;
  await assert.rejects(() => renderPlan(p, { stills: [tr], stillsDir: '/private/tmp/kadr-cam-test', stillsOnly: true, scale: 0.2 }), /not an anchor of the previous scene/);
  const pv = await previewSheet(p, [tr]);
  assert.ok(pv.fallbacks.length === 1 && /no-such-anchor/.test(pv.fallbacks[0]));
});
