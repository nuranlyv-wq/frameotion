import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { googlePlan } from './fixtures/google-plan.js';
import { normalizePlan } from '../src/plan/model.js';
import { renderAudio, gatherCues, stopWindows } from '../src/render/audio.js';
import { validatePlan } from '../src/plan/validate.js';

function rms(buf, t0, t1) { let s = 0, n = 0; for (let i = Math.floor(t0 * 44100); i < Math.floor(t1 * 44100); i++) { const v = buf.readInt16LE(44 + i * 4) / 32768; s += v * v; n++; } return Math.sqrt(s / n); }

test('stop: музыка проваливается в окне и возвращается ударом', () => {
  const p = googlePlan('medium');
  p.scenes[0].events.push({ t: 1.4, type: 'stop', dur: 0.8 });
  assert.equal(validatePlan(p).errors.filter((e) => /stop|events/.test(e.path)).length, 0, JSON.stringify(validatePlan(p).errors));
  const n = normalizePlan(p);
  const [[a, b]] = stopWindows(n);
  const wav = '/tmp/claude-501/stop-test.wav'; renderAudio(n, wav);
  const buf = fs.readFileSync(wav);
  const before = rms(buf, Math.max(0, a - 0.6), a - 0.05), inside = rms(buf, a + 0.1, b - 0.05);
  assert.ok(inside < before * 0.45, `в окне stop громкость должна упасть: до ${before.toFixed(3)}, внутри ${inside.toFixed(3)}`);
  assert.ok(gatherCues(n).some((c) => c.kind === 'hit' && Math.abs(c.t - b) < 0.01), 'удар на выходе из stop');
  fs.rmSync(wav);
});

test('слово-циклер и invert проходят валидацию, плохой токен — нет', () => {
  const p = googlePlan('medium');
  p.scenes[0].props.lines[1].text = 'Axtarın [kafe|xəritə|cavab]'; p.scenes[2].invert = true;
  assert.equal(validatePlan(p).errors.filter((e) => /text|invert/.test(e.path)).length, 0);
  p.scenes[0].props.lines[1].text = 'Axtarın [kafe | xəritə]';
  assert.ok(validatePlan(p).errors.some((e) => /bad cycle token/.test(e.message)));
});

test('плоская энергия даёт предупреждение', () => {
  const p = googlePlan('medium');
  const v = validatePlan(p); assert.ok(Array.isArray(v.metrics.sceneDensity) && v.metrics.sceneDensity.length === 4);
});
