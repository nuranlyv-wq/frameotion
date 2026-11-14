import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runDirector } from '../src/director/agent.js';
import { CostTracker, priceUsage } from '../src/director/cost.js';
import { getStyle } from '../src/styles/presets.js';
import { mockClient } from './helpers/mock-client.js';

const imp = { finalUrl: 'https://www.google.com/?hl=az', host: 'google.com', brand: 'Google', lang: 'az', title: 'Google', description: '', headings: [], paragraphs: [], uiStrings: ['Google Axtarış', 'Mən şanslıyam'], colors: ['#4d90fe'], logo: null, textSample: 'Axtarış', via: 'fetch' };

test('цикл режиссёра: ошибки валидации → исправление моделью → finalize', async () => {
  const client = mockClient({ dynamism: 'medium' });
  const r = await runDirector({ imp, style: getStyle('clean'), dynamism: 'medium', client, craftRules: false });
  assert.equal(r.finalized, true, JSON.stringify(r.validation.errors));
  assert.equal(r.stopReason, 'finalized');
  // был хотя бы один validate_plan с ошибками и последующее исправление
  const valSteps = r.trace.flatMap((s) => s.tools).filter((t) => t.name === 'validate_plan');
  assert.ok(valSteps.length >= 2, 'ожидалось ≥2 validate_plan (ошибка → исправление)');
  assert.ok(valSteps[0].errors > 0 && valSteps.at(-1).errors === 0);
  assert.ok(r.turns >= 4);
});

test('ходы кончились, а план уже валиден → принимается автоматически (работа не пропадает)', async () => {
  const client = mockClient({ dynamism: 'medium', breakIt: false });
  const r = await runDirector({ imp, style: getStyle('clean'), dynamism: 'medium', client, craftRules: false, maxTurns: 2 });
  assert.equal(r.stopReason, 'auto_finalized');
  assert.equal(r.autoFinalized, true);
  assert.equal(r.finalized, true, JSON.stringify(r.validation.errors));
  // невалидный план при исчерпании ходов по-прежнему НЕ принимается
  const bad = mockClient({ dynamism: 'medium' });
  const r2 = await runDirector({ imp, style: getStyle('clean'), dynamism: 'medium', client: bad, craftRules: false, maxTurns: 2 });
  assert.equal(r2.finalized, false);
  assert.equal(r2.stopReason, 'max_turns');
});

test('стоимость считается по токенам каждого вызова (арифметика)', async () => {
  const t = new CostTracker();
  t.record('claude-opus-5-5', { input_tokens: 1000, output_tokens: 500, cache_creation_input_tokens: 2000, cache_read_input_tokens: 4000 });
  // 1000*4 + 2000*5 + 4000*0.2 + 500*20 = 4000+10000+800+10000 = 24800 /1e6
  assert.equal(Number(t.usd.toFixed(6)), 0.0248);
  assert.equal(priceUsage('claude-opus-5-5', { input_tokens: 1_000_000 }).usd, 4);
  assert.equal(priceUsage('claude-opus-5-5', { output_tokens: 1_000_000 }).usd, 20);
});

test('потолок расхода останавливает цикл', async () => {
  const client = mockClient({ dynamism: 'medium' });
  const r = await runDirector({ imp, style: getStyle('clean'), dynamism: 'medium', client, budgetUSD: 0.00001, craftRules: false });
  assert.equal(r.stopReason, 'budget_exceeded');
  assert.equal(r.finalized, false);
});

test('кэш: системный промпт и хвост диалога помечены cache_control', async () => {
  const client = mockClient({ dynamism: 'calm' });
  await runDirector({ imp, style: getStyle('clean'), dynamism: 'calm', client, craftRules: false });
  const p = client.calls[0];
  assert.deepEqual(p.cache_control, { type: 'ephemeral' });
  assert.equal(p.system[0].cache_control.type, 'ephemeral');
  assert.ok(!('temperature' in p) && !('thinking' in p), 'Opus 5.5: без temperature и без явного thinking');
  assert.ok(!p.tool_choice, 'Opus 5.5: форсированный tool_choice запрещён');
});
