import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { generateProduction } from '../src/production/index.js';
import { matchProgress, stateAt, valueAt } from '../src/production/motion.js';
import { fitFontSize } from '../src/production/text-fit.js';
import { anthropicStages, STAGES } from '../src/production/stages.js';
import { exampleOutput, productionExamples } from './fixtures/production.js';

function exampleContext(example) {
  const ctx = {
    source: {
      evidence: [{ id: 'D1', source: 'user-description', text: example.description }],
      assets: [], interfaceEvidenceIds: [],
    },
    settings: { fps: 30, width: 1080, height: 1920, frames: example.seconds * 30 },
  };
  for (const stage of STAGES) {
    ctx[stage.name] = exampleOutput(example, stage.name, { input: stage.input(ctx) });
    stage.validate(ctx[stage.name], ctx);
  }
  return ctx;
}

test('оба сценария проходят все четыре контракта и различаются по структуре', () => {
  const task = exampleContext(productionExamples.task);
  const restaurant = exampleContext(productionExamples.restaurant);
  assert.equal(task.narrative.scenes.length, 2);
  assert.equal(restaurant.narrative.scenes.length, 4);
  const board = task.interface.components[0];
  const scene = task.motion.scenes[0];
  assert.equal(stateAt(board, scene, 49).id, 'pointing');
  assert.equal(stateAt(board, scene, 50).id, 'finished');
  assert.equal(valueAt(board, scene, 'meter', 50, stateAt(board, scene, 50)), 33);
  assert.ok(valueAt(board, scene, 'meter', 58, stateAt(board, scene, 58)) > 33);
  assert.equal(valueAt(board, scene, 'meter', 73, stateAt(board, scene, 73)), 67);
});

test('контракты отклоняют неподтверждённый источник, код модели и потерянную цель перехода', () => {
  const ctx = exampleContext(productionExamples.task);
  const forged = structuredClone(ctx.product);
  forged.evidence[0].text = 'An unsupported claim';
  assert.throws(() => STAGES[0].validate(forged, ctx), /evidence D1/);
  const code = { ...ctx.interface, script: 'fetch("https://example.com")' };
  assert.throws(() => STAGES[2].validate(code, ctx), /unknown field/);
  const broken = structuredClone(ctx.motion);
  broken.scenes[1].transition.target = 'missing';
  assert.throws(() => STAGES[3].validate(broken, ctx), /visible target/);
  const discontinuous = structuredClone(ctx.motion);
  discontinuous.scenes[1].states[0].id = 'queued';
  assert.throws(() => STAGES[3].validate(discontinuous, ctx), /preserve its appearance/);
  const silentVersion = structuredClone(ctx.motion);
  delete silentVersion.audio;
  for (const scene of silentVersion.scenes) delete scene.treatment;
  STAGES[3].validate(silentVersion, ctx);
  const invalidScore = structuredClone(ctx.motion);
  invalidScore.audio.cues[0].frame = invalidScore.frames;
  assert.throws(() => STAGES[3].validate(invalidScore, ctx), /beyond the final frame/);
});

test('адаптер Claude передаёт отдельный промпт, совместимый режим выбора инструмента и отключает скрытые повторы SDK', async () => {
  let params, options;
  const client = { messages: { stream: (p, o) => {
    params = p;
    options = o;
    return { finalMessage: async () => ({
      stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'submit_product', input: { version: 1 } }],
      model: 'test-model', usage: { input_tokens: 8, output_tokens: 3 },
    }) };
  } } };
  const request = anthropicStages(client, { model: 'test-model', maxTokens: 1024, timeoutMs: 100 });
  const { name, prompt, schema } = STAGES[0];
  const reply = await request({ name, prompt, schema, input: { evidence: [] }, feedback: ['fix source'] });
  assert.deepEqual(reply.output, { version: 1 });
  assert.ok(params.system[0].text.startsWith(prompt));
  assert.equal(params.system[0].cache_control.type,'ephemeral');
  assert.match(params.system[0].text, /submit_product exactly once/);
  assert.equal(params.tools[0].name, 'submit_product');
  assert.deepEqual(params.tool_choice, { type: 'auto', disable_parallel_tool_use: true });
  assert.deepEqual(JSON.parse(params.messages[0].content).validationFeedback, ['fix source']);
  assert.deepEqual(options, { timeout: 100, maxRetries: 0 });
});

test('ошибки возвращаются модели один раз, валидный этап сохраняется, последующие не запускаются', async () => {
  const runsDir = await mkdtemp(path.join(os.tmpdir(), 'kadr-production-test-'));
  const example = productionExamples.task;
  const calls = [];
  try {
    const result = await generateProduction({
      description: example.description, seconds: example.seconds, runsDir,
      requestStage: async (request) => {
        calls.push(request);
        if (request.name === 'product' && request.feedback.length) return { output: exampleOutput(example, 'product', request) };
        return { output: { version: 99 } };
      },
    });
    assert.deepEqual(calls.map(({ name }) => name), ['product', 'product', 'narrative', 'narrative']);
    assert.match(calls[1].feedback[0], /version/);
    assert.equal(result.report.error.code, 'contract_validation');
    assert.equal(result.report.error.stage, 'narrative');
    assert.ok((await readdir(result.dir)).includes('product-blueprint.json'));
    assert.ok(!(await readdir(result.dir)).includes('narrative-blueprint.json'));
    const log = (await readFile(path.join(result.dir, 'events.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
    assert.ok(log.some((row) => row.stage === 'product' && row.attempt === 2 && row.status === 'validated'));
  } finally {
    await rm(runsDir, { recursive: true, force: true });
  }
});

test('text fitting keeps the largest size that fits and reports a box below the readability floor', () => {
  assert.deepEqual(fitFontSize(52, 18, (size) => size <= 42.9), { size: 42.75, fits: true });
  assert.deepEqual(fitFontSize(20, 18, (size) => size <= 17), { size: 18, fits: false });
  assert.deepEqual(fitFontSize(22.1, 18, () => true), { size: 22.1, fits: true });
});

test('a named visible pin carries across different React components and disallows an unlinked cut', () => {
  const ctx = exampleContext(productionExamples.task);
  ctx.settings.linkScenes = true;
  assert.throws(() => STAGES[1].validate(ctx.narrative, ctx), /define a continuity motif/);
  ctx.narrative.continuity = { id: 'pin', kind: 'pin', role: 'accent', label: '', purpose: 'Follow the result' };
  STAGES[1].validate(ctx.narrative, ctx);
  const old = ctx.interface.components[0];
  const next = structuredClone(old);
  next.id = 'new-board';
  for (const [i, component] of [old, next].entries()) {
    component.elements.push({ id: 'pin', kind: 'pin', bounds: { x: 80 + i * 360, y: 60, w: 50, h: 70 }, fontSize: 30, align: 'center' });
    for (const state of component.states) state.props.push({ target: 'pin', role: 'accent', text: '', value: 0, visible: true });
  }
  ctx.interface.components.push(next);
  STAGES[2].validate(ctx.interface, ctx);
  const shot = ctx.motion.scenes[1];
  shot.componentId = next.id;
  shot.transition = { type: 'cut', target: '', frames: 0 };
  assert.throws(() => STAGES[3].validate(ctx.motion, ctx), /use a match transition/);
  shot.transition = { type: 'match', target: 'pin', frames: 17 };
  STAGES[3].validate(ctx.motion, ctx);
  assert.equal(matchProgress(shot.transition, 0), 0);
  assert.equal(matchProgress(shot.transition, 8), 0.5);
  assert.equal(matchProgress(shot.transition, 16), 1);
  next.states[0].props.at(-1).visible = false;
  assert.throws(() => STAGES[2].validate(ctx.interface, ctx), /keep continuity layer pin visible/);
});
