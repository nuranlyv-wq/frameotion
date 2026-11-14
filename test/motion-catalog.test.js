import test from 'node:test';
import assert from 'node:assert/strict';
import { MOTION_SKILLS, TRANSITION_SKILLS, visualAt, bridgeAt, valueAt, stateAt, searchMotionSkills } from '../src/production/motion.js';
import { STAGES } from '../src/production/stages.js';
import { motionProducts, motionOutput } from './fixtures/motion-products.js';
export function context(example = motionProducts.relay, format = 'portrait') {
  const ctx = { settings: { width: format === 'portrait' ? 1080 : 1920, height: format === 'portrait' ? 1920 : 1080,
    fps: 30, frames: example.seconds * 30, creative: true, motionFirst: true }, brief: '',
    source: { evidence: [{ id: 'D1', source: 'user-description', text: example.description }], assets: [], interfaceEvidenceIds: [] } };
  for (const stage of STAGES) {
    ctx[stage.name] = motionOutput(example, stage.name, { input: stage.input(ctx) }); stage.validate(ctx[stage.name], ctx);
  }
  return ctx;
}
test('different products and formats retain actions, two directions and object bridges', () => {
  const a = context(), b = context(motionProducts.juniper), wide = context(motionProducts.relay, 'landscape');
  assert.equal(a.motion.scenes[1].transition.type, 'zoom-through');
  assert.equal(b.motion.scenes[1].transition.type, 'morph');
  assert.notDeepEqual(a.motion.scenes[0].bounds, wide.motion.scenes[0].bounds);
  assert.notEqual(a.narrative.artDirection.typography, b.narrative.artDirection.typography);
  assert.equal(a.narrative.creative.directions.length, 2);
});
test('object bridges have exact endpoints and monotonic finite geometry', () => {
  const from = { x: 600, y: 650, w: 80, h: 30 }, to = { x: 100, y: 100, w: 800, h: 700 };
  for (const type of ['morph', 'zoom-through']) {
    assert.deepEqual(bridgeAt(from, to, 0, 30, type).area, from);
    assert.deepEqual(bridgeAt(from, to, 29, 30, type).area, to);
    let last = 0;
    for (let f = 0; f < 30; f++) { const result = bridgeAt(from, to, f, 30, type); assert.ok(result.progress >= last); last = result.progress; assert.ok(Object.values(result.area).every(Number.isFinite)); }
  }
});
test('catalog operations are bounded and deterministic, clicks settle and numbers reach their result', () => {
  for (const skill of MOTION_SKILLS) {
    assert.ok(skill.license && skill.version && skill.example && skill.test);
    const scene = { effects: [{ skill: skill.id, target: 'object', from: 10, frames: 30, amount: skill.maxAmount, easing: 'out-cubic' }] };
    for (const f of [0, 10, 24, 39, 60]) assert.deepEqual(visualAt(scene, 'object', f), visualAt(scene, 'object', f));
    assert.equal(visualAt(scene, 'object', 60).focus, 0);
    if (skill.id === 'cursor-click') { assert.ok(visualAt(scene, 'object', 18).scale < 1); assert.equal(visualAt(scene, 'object', 39).scale, 1); }
  }
  assert.equal(TRANSITION_SKILLS.length, 4);
  const ctx = context(), shot = ctx.motion.scenes[1], component = ctx.interface.components[1];
  assert.equal(valueAt(component, shot, 'total', 62, stateAt(component, shot, 62)), 1);
  assert.equal(valueAt(component, shot, 'total', 95, stateAt(component, shot, 95)), 2);
  assert.ok(searchMotionSkills('движение курсора и клик', false).slice(0, 5).some((x) => x.id === 'cursor-click'));
});
test('invalid bridge targets, claims and text-only movie are rejected', () => {
  const ctx = context();
  const bad = structuredClone(ctx.motion); bad.scenes[1].transition.sourceTarget = 'missing';
  assert.throws(() => STAGES[3].validate(bad, ctx), /visible panel\/badge/);
  const changed = structuredClone(ctx.motion); changed.scenes[1].states[1].at = 10;
  assert.throws(() => STAGES[3].validate(changed, ctx), /state change during bridge/);
  const story = structuredClone(ctx.narrative); story.scenes[0].claims = [{ text: 'Saves 80%', evidenceIds: ['invented'] }];
  assert.throws(() => STAGES[1].validate(story, ctx), /unsupported claim/);
  const slides = structuredClone(ctx.motion); for (const scene of slides.scenes) { scene.componentId = ''; scene.states = []; scene.effects = []; scene.transition = { type: 'cut', frames: 0, target: '' }; }
  assert.throws(() => STAGES[3].validate(slides, ctx), /65%/);
});
