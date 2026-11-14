import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { generateProduction, research, outputAllowance } from '../src/production/index.js';
import { CostTracker } from '../src/director/cost.js';
import { motionProducts, motionOutput } from './fixtures/motion-products.js';
const example = motionProducts.relay;
const ok = { ok: true, issues: [] };
const services = { stills: async () => {}, render: async () => ({ video: 'fixture', issues: [] }), inspect: async () => ok };
const requestStage = async (r) => ({ output: motionOutput(example, r.name, r) });
const withDir = async (fn) => { const dir = await mkdtemp(path.join(os.tmpdir(), 'kadr-lifecycle-')); try { await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); } };
test('combined input preserves both provenance types and safely falls back when website fails', async () => {
  const args = { description: example.description, url: 'https://example.com', dir: '/tmp', importer: async () => ({ facts: [{ id: 'F1', text: 'A sourced workflow', url: 'https://example.com' }], pages: [], identity: {} }) };
  const combined = await research(args); assert.deepEqual(combined.evidence.map((e) => e.id), ['D1', 'WF1']);
  const unavailable = { ...args, importer: async () => { throw new Error('HTTP 503'); } };
  const fallback = await research(unavailable); assert.equal(fallback.evidence.length, 1); assert.match(fallback.warnings[0], /503/);
  await assert.rejects(research({ ...unavailable, description: undefined }), /Сайт недоступен/);
  await assert.rejects(research({ description: 'app', dir: '/tmp' }), /Недостаточно данных/);
});
test('cancel interrupts a hanging model; resume reuses completed analysis and keeps cost history', async () => withDir(async (runsDir) => {
  const controller = new AbortController(); const called = [];
  const result = await generateProduction({ description: example.description, seconds: example.seconds, runsDir, runId: 'cancel-test', signal: controller.signal, services,
    requestStage: async (r) => { called.push(r.name); if (r.name === 'narrative') { setTimeout(() => controller.abort(new Error('User cancelled')), 20); return new Promise(() => {}); } return requestStage(r); } });
  assert.equal(result.report.status, 'cancelled');
  const resumedCalls = [];
  const resumed = await generateProduction({ runsDir, runId: result.runId, resume: true, services, requestStage: async (r) => { resumedCalls.push(r.name); return requestStage(r); } });
  assert.equal(resumed.ok, true); assert.deepEqual(resumedCalls, ['narrative', 'interface', 'motion']);
  const cached = await generateProduction({ runsDir, runId: result.runId, resume: true, services, requestStage: async () => { throw new Error('No stage call expected'); } });
  assert.equal(cached.ok, true);
}));
test('draft failures trigger one repair and never publish a final render on unresolved issues', async () => withDir(async (runsDir) => {
  let renders = 0; const calls = [];
  const result = await generateProduction({ description: example.description, seconds: example.seconds, runsDir,
    requestStage: async (r) => { calls.push(r); return requestStage(r); },
    services: { ...services, render: async () => { renders++; return {}; }, inspect: async () => ({ ok: false, issues: [{ code: 'text_clipping', timecode: '1.20', problem: 'clipped', impact: 'unreadable', fix: 'enlarge' }] }) } });
  assert.equal(result.report.status, 'needs_revision'); assert.equal(renders, 2); assert.equal(result.video, undefined);
  assert.equal(calls.filter((r) => r.name === 'motion').length, 2); assert.match(calls.at(-1).feedback[0], /1.20/);
}));
test('missing resource, deadline and malformed output fail with persisted reports', async () => withDir(async (runsDir) => {
  const missing = await generateProduction({ description: example.description, seconds: example.seconds, runsDir, requestStage,
    services: { ...services, stills: async () => { throw Object.assign(new Error('Missing local font'), { code: 'missing_resource' }); } } });
  assert.equal(missing.report.error.code, 'missing_resource'); assert.equal(missing.video, undefined);
  const timed = await generateProduction({ description: example.description, seconds: example.seconds, runsDir, timeoutMs: 20, requestStage: async () => new Promise(() => {}), services });
  assert.equal(timed.report.error.code, 'run_timeout');
  const malformed = await generateProduction({ description: example.description, seconds: example.seconds, runsDir, services, requestStage: async () => ({ output: 'not JSON object' }) });
  assert.equal(malformed.report.error.code, 'contract_validation');
  assert.equal(JSON.parse(await readFile(path.join(malformed.dir, 'report.json'))).status, 'failed');
}));
test('scene regeneration preserves unrelated timeline entries and reserves model output cost', async () => withDir(async (runsDir) => {
  const original = await generateProduction({ description: example.description, seconds: example.seconds, runsDir, services, requestStage });
  const before = JSON.parse(await readFile(path.join(original.dir, 'motion-timeline.json')));
  const revised = await generateProduction({ runsDir, runId: original.runId, resume: true, sceneId: 'momentum', services,
    requestStage: async (r) => { assert.equal(r.name, 'motion'); const output = motionOutput(example, r.name, r); output.scenes[0].bounds.x = 999; return { output }; } });
  assert.equal(revised.ok, true);
  assert.deepEqual(JSON.parse(await readFile(path.join(original.dir, 'motion-timeline.json'))).scenes[0], before.scenes[0]);
  assert.throws(() => outputAllowance({}, new CostTracker({ budgetUSD: 0.0001 })), /Бюджета/);
  assert.throws(() => outputAllowance({}, new CostTracker({ budgetUSD: 2 }), 'unknown-model'), /тарифа/);
}));
