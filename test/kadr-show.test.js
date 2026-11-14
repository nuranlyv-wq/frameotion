import test from 'node:test';
import assert from 'node:assert/strict';
import {compileLaunch, normalizeSemanticTreatment} from '../src/kadr-launch/compile.js';
import {poseAt} from '../src/kadr-launch/kinetic.js';
import {catalogueBrief} from '../src/kadr-launch/techniques.js';
import {directionPlan} from '../src/kadr-launch/direction-plan.js';
import {stageShow} from '../src/kadr-launch/show.js';
import {STORIES} from './fixtures/direction-stories.js';

const lapaSource = STORIES.lapa;

function compiled(name, edit = () => {}, dimensions = {}) {
  const {plan, settings: base, source} = STORIES[name];
  const draft = structuredClone(plan);
  edit(draft);
  const settings = {...base, ...dimensions};
  const treatment = normalizeSemanticTreatment(draft, settings, source);
  return {treatment, settings, score: compileLaunch(treatment, settings, source)};
}
const byId = (score, id) => score.elements.find(element => element.id === id);
const centre = (element, frame) => {
  const pose = element.motion ? poseAt(element.motion, frame) : {x: 0, y: 0};
  return {x: element.box.x + element.box.w / 2 + pose.x, y: element.box.y + element.box.h / 2 + pose.y};
};
const near = (a, b, tolerance) => Math.hypot(a.x - b.x, a.y - b.y) <= tolerance;

test('a journey turns the subject into its carrier and lands it on the place the route ends at', () => {
  const {score} = compiled('smeta');
  const scene = score.scenes[1], token = byId(score, 'token-1'), route = byId(score, 'route-1'), place = byId(score, 'place-1');
  const subject = byId(score, 'subject-1'), carrier = byId(score, 'carrier-1');
  assert.equal(subject.icon, 'doc');
  assert.equal(carrier.icon, 'mail');
  // One disc carries both symbols: the carrier appears where the subject sat, before anything moves.
  assert.ok(near(centre(subject, subject.start), centre(carrier, carrier.start), 1));
  assert.ok(carrier.start < route.start && subject.end <= route.start);
  const arrive = route.start + route.enterFrames;
  assert.ok(near(centre(token, arrive), centre(place, arrive), 2));
  assert.ok(near(centre(carrier, arrive), centre(token, arrive), 2));
  // The token leaves the route's first point as the route starts to draw.
  assert.ok(near(centre(token, route.start), {x: route.box.x, y: route.box.y + route.box.h}, 2));
  assert.equal(byId(score, 'result-1').text, 'Оплачен');
  assert.ok(byId(score, 'result-1').start >= arrive);
  // The camera rides with the token and the scene after it can dive into it.
  assert.ok(score.camera.some(key => key.target === 'token-1' && key.frame > route.start && key.frame < scene.end));
  // A document crosses an empty field; only a physical delivery gets streets.
  assert.equal(score.elements.filter(element => element.id.startsWith('street-')).length, 0);
});

test('a physical delivery rides a street map and hands its token to a dive', {skip: !lapaSource}, () => {
  const {score} = compiled('lapa-delivery', plan => { plan.beats[3].visual.link = 'dive'; });
  assert.ok(score.elements.filter(element => element.id.startsWith('street-')).length >= 6);
  assert.equal(score.scenes[2].transition.kind, 'dive');
  assert.equal(score.scenes[2].transition.target, 'sent-mark-1');
  assert.deepEqual(score.scenes[3].transition.target, 'token-2');
  assert.equal(score.scenes[3].ground, score.scenes[3].transition.fill);
});

test('a cycle brings the token back to its start and lights each stop as it passes', {skip: !lapaSource}, () => {
  const {score} = compiled('lapa-monthly');
  const token = byId(score, 'token-1'), first = centre(token, byId(score,'subject-1').start), last = token.motion.at(-1).frame;
  assert.ok(near(centre(token, last), first, 2));
  for (const mark of [0, 1, 2]) {
    const lit = byId(score, `lit-1-${mark}`);
    assert.ok(near(centre(token, lit.start), centre(lit, lit.start), token.box.w * .45), `stop ${mark}`);
    assert.equal(byId(score, `stop-label-1-${mark}`), undefined);
  }
  assert.ok(byId(score, 'result-1').start >= last);
});

test('a cycle without a headline still fits the frame in every format', {skip: !lapaSource}, () => {
  for (const [width, height] of [[1920, 1080], [1080, 1920], [1080, 1080]]) {
    const {score} = compiled('lapa-monthly', plan => { delete plan.beats[1].text; }, {width, height});
    assert.equal(byId(score, 'line-1'), undefined);
    assert.ok(score.elements.every(item => item.box.x >= 0 && item.box.y >= 0 && item.box.x + item.box.w <= width && item.box.y + item.box.h <= height));
  }
});

test('a gather flies every part into one object that grows to full size', {skip: !lapaSource}, () => {
  const {score} = compiled('lapa-all');
  const whole = byId(score, 'token-1');
  assert.equal(whole.motion.at(-1).scale, 100);
  assert.ok(whole.motion[0].scale < 100);
  for (const part of [0, 1, 2, 3]) {
    const disc = byId(score, `part-1-${part}`), arrive = disc.motion.at(-1);
    assert.ok(near(centre(disc, arrive.frame), centre(whole, arrive.frame), 2));
    assert.equal(arrive.opacity, 0);
    assert.ok(byId(score, `part-label-1-${part}`).end <= arrive.frame);
  }
  assert.ok(byId(score, 'whole-label-1').start >= Math.max(...[0, 1, 2, 3].map(part => byId(score, `part-1-${part}`).motion.at(-1).frame)));
});

test('every show mechanic composes in landscape, portrait and square', {skip: !lapaSource}, () => {
  for (const name of ['smeta', 'lapa-delivery', 'lapa-monthly', 'lapa-all']) {
    for (const [width, height] of [[1920, 1080], [1080, 1920], [1080, 1080]]) {
      const {score, treatment, settings} = compiled(name, () => {}, {width, height, frames: 540});
      const show = treatment.beats.findIndex(beat => beat.visual.scene === 'show');
      // Dynamic pace shortens every move; each actor must still have time to land.
      const beat = treatment.beats[show];
      const staged = stageShow({beat, index: show, start: 0, end: beat.frames, W: width, H: height, portrait: width <= height, ground: 'background',
        ink: 'foreground', strong: 'accent', strongInk: 'onAccent', motionFrames: frames => Math.round(frames * .75), evidenceIds: []});
      for (const item of staged.elements) assert.ok(item.end - item.start >= item.enterFrames + 12 && item.end <= beat.frames, `${name}: ${item.id}`);
      assert.equal(score.staging, 'scenes');
      const tools = directionPlan(treatment, score, settings).scenes[show].tools.map(tool => tool.tool);
      assert.ok(tools.includes(treatment.beats[show].visual.show.kind), `${name} ${width}x${height}`);
    }
  }
});

test('a show needs the props of its mechanic and is offered to the director by what the product does', () => {
  assert.throws(() => compiled('smeta', plan => { delete plan.beats[1].visual.show.to; }), /journey needs show.subject .* and show.to/);
  assert.throws(() => compiled('smeta', plan => { plan.beats[1].visual.show = {kind: 'cycle', marks: ['Счёт', 'Письмо']}; }), /cycle needs/);
  assert.throws(() => compiled('smeta', plan => { plan.beats[0].visual.show = plan.beats[1].visual.show; }), /visual.show belongs to a show scene/);
  const brief = catalogueBrief();
  for (const kind of ['journey', 'cycle', 'gather']) assert.match(brief, new RegExp(`- ${kind}: `));
});
