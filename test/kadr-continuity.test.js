import test from 'node:test';
import assert from 'node:assert/strict';
import {compileLaunch, normalizeSemanticTreatment} from '../src/kadr-launch/compile.js';
import {ART_DIRECTIONS} from '../src/kadr-launch/art-direction.js';
import {poseAt} from '../src/kadr-launch/kinetic.js';
import {validateScore} from '../src/kadr-launch/score.js';
import {STORIES} from './fixtures/direction-stories.js';

const names = ['forma', 'smeta', 'roastery', 'agency', ...(STORIES.lapa ? ['lapa', 'lapa-delivery', 'lapa-monthly', 'lapa-all'] : [])];
function compiled(name, edit = () => {}, extra = {}) {
  const {plan, settings: base, source} = STORIES[name];
  const draft = structuredClone(plan);
  edit(draft);
  const settings = {...base, ...extra};
  const treatment = normalizeSemanticTreatment(draft, settings, source);
  return {treatment, settings, score: compileLaunch(treatment, settings, source)};
}
const byId = (score, id) => score.elements.find(element => element.id === id);

test('a dive cannot target an invisible actor or an invisible parent surface', () => {
  const {score, settings} = compiled('forma');
  const source = STORIES.forma.source;
  const scene = score.scenes.find(item => item.transition?.kind === 'dive');
  const hiddenActor = structuredClone(score);
  const target = byId(hiddenActor, scene.transition.target);
  target.motion = [target.start, target.end - 1].map(frame =>
    ({frame, x: 0, y: 0, scale: 100, rotate: 0, opacity: 0, ease: 'linear'}));
  assert.throws(() => validateScore(hiddenActor, settings, source), /dive target must be visible/);

  const brieflyHidden = structuredClone(score);
  const flicker = byId(brieflyHidden, scene.transition.target);
  const middle = scene.start - Math.floor(scene.transition.frames / 2);
  flicker.motion = [flicker.start, middle, flicker.end - 1].map((frame, index) =>
    ({frame, x: 0, y: 0, scale: 100, rotate: 0, opacity: index === 1 ? 0 : 100, ease: 'linear'}));
  assert.throws(() => validateScore(brieflyHidden, settings, source), /dive target must be visible/);

  const hiddenParent = structuredClone(score);
  const attached = byId(hiddenParent, scene.transition.target);
  assert.ok(attached.attachTo);
  const parent = hiddenParent.shapes.find(shape => shape.id === attached.attachTo);
  for (const state of parent.states) state.opacity = 0;
  assert.throws(() => validateScore(hiddenParent, settings, source), /dive target must be visible/);
});

test('a 15-second film has room for the action and its result without a filler beat', () => {
  const {score} = compiled('smeta', plan => {
    // A real director response nested its headline here instead of putting it on the beat.
    const show = plan.beats[1];
    show.visual.text = show.text;
    delete show.text;
  }, {frames: 450, pace: 'dynamic'});
  assert.equal(score.frames, 450);
  assert.deepEqual(score.scenes.map(scene => scene.id), ['sum', 'send', 'close']);
  assert.deepEqual(score.scenes.slice(1).map(scene => scene.link.kind), ['dive', 'match']);
  assert.equal(byId(score, 'line-1').text, 'Счёт уходит сам');
  const result = byId(score, 'result-1');
  assert.ok(result.end - result.start - result.enterFrames >= 22);
});

test('an explicit word mark survives the handoff into a show', () => {
  const {score} = compiled('smeta', plan => {
    Object.assign(plan.beats[0], {move: 'word-click', text: 'Отправить счёт', visual: {
      scene: 'hero', evidenceId: 'D1', wordClick: {word: 'счёт', shape: 'hexagon', mark: 'search'},
    }});
  }, {frames: 450, pace: 'dynamic'});
  assert.equal(score.scenes[1].transition.target, 'line-0');
  assert.equal(byId(score, 'line-0').wordClick.mark, 'search');
  assert.equal(byId(score, 'subject-1').icon, 'doc');
});

test('scene films record each join and do not manufacture cards or decorative transition dots', () => {
  for (const name of names) {
    for (const [width, height] of [[1920, 1080], [1080, 1920], [1080, 1080]]) {
      const {score} = compiled(name, () => {}, {width, height, frames: 600});
      assert.ok(score.scenes.slice(1).every(scene => scene.link?.kind), `${name} ${width}x${height}: missing join`);
      assert.ok(score.elements.every(element => element.kind !== 'card'), `${name}: card`);
      assert.ok(score.elements.every(element => !element.id.startsWith('dot-')), `${name}: decorative transition dot`);
    }
  }
  for (const artDirection of Object.keys(ART_DIRECTIONS)) {
    const {score} = compiled('forma', plan => { delete plan.beats[2].visual.presentation; }, {artDirection});
    assert.ok(score.elements.every(element => element.kind !== 'card'), artDirection);
    assert.ok(score.elements.some(element => element.id === 'item-name-2-0' && element.kind === 'text'));
  }
});

test('the director can choose a deliberate cut even when the scenes share a mark', () => {
  const linked = compiled('smeta', plan => { plan.beats[2].visual.link = 'cut'; }).score.scenes[2];
  assert.equal(linked.link.kind, 'cut');
  const hard = compiled('smeta', plan => { delete plan.beats[2].visual.link; plan.beats[2].visual.transition = 'cut'; }).score.scenes[2];
  assert.equal(hard.link.kind, 'cut');
});

test('the token of a show holds its place across the cut and becomes the mark of the close', () => {
  const {score} = compiled('smeta');
  const [, show, close] = score.scenes, token = byId(score, 'token-1'), surface = score.shapes[0];
  const rest = poseAt(token.motion, show.end - 1);
  const held = surface.states.find(state => state.frame === close.start);
  for (const [a, b] of [[held.box.x, token.box.x + rest.x], [held.box.y, token.box.y + rest.y], [held.box.w, token.box.w]]) assert.ok(Math.abs(a - b) <= 1);
  assert.equal(held.fill, token.fill);
  // The camera is back on the plain framing before the cut, so the mark does not jump.
  const last = score.camera.findLast(key => key.frame < close.start);
  assert.deepEqual([last.zoom, last.x, last.y, last.target], [100, score.width / 2, score.height / 2, undefined]);
  // The name waits for the mark to settle.
  const grown = surface.states.findLast(state => state.frame >= close.start);
  assert.ok(byId(score, 'wordmark-2').start >= grown.frame + grown.duration);
});

test('the camera pushes in only on something that is there, and never into letters', () => {
  for (const name of names) {
    const {score, treatment} = compiled(name);
    for (const [index, scene] of score.scenes.entries()) {
      if (scene.transition?.kind === 'dive') {
        const target = byId(score, scene.transition.target);
        assert.ok(target.kind !== 'text' || target.wordClick?.shape, `${name}: dive into ${target.id}`);
      }
      if (treatment.beats[index].visual.scene !== 'show') continue;
      const token = byId(score, `token-${index}`);
      const push = score.camera.find(key => key.frame > scene.start && key.frame < scene.end && key.zoom > 100);
      const before = score.camera.findLast(key => key.frame < push.frame);
      // The move towards the subject starts when the subject appears, not before.
      assert.ok(before.frame >= token.start || name === 'lapa-all', `${name}: camera leaves at ${before.frame}, token appears at ${token.start}`);
      assert.equal(before.zoom, 100);
    }
  }
  // Plain type has nothing for the camera to dive into. The fallback must not invent a mark just to make a transition.
  const {score} = compiled('forma', plan => { plan.beats[1].text = 'Запись'; plan.beats[1].visual.link = 'dive'; });
  assert.notEqual(score.scenes[1].link.kind, 'dive');
  assert.notEqual(score.scenes[1].link.kind, 'match');
  assert.equal(score.scenes[1].link.asked, 'dive');
  assert.equal(byId(score, 'dot-0'), undefined);
  assert.equal(byId(score, 'line-0').emphasis.text, 'время');
});
