import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createCanvas, loadImage} from '@napi-rs/canvas';
import {compileLaunch, normalizeSemanticTreatment, reviewBeatIds, reviseSceneTreatment} from '../src/kadr-launch/compile.js';
import {directionPlan} from '../src/kadr-launch/direction-plan.js';
import {shapePoseAt, shapeTrack, poseAt} from '../src/kadr-launch/kinetic.js';
import {scoreCues, scoreSamples} from '../src/kadr-launch/score.js';
import {diveCamera} from '../src/kadr-launch/spatial.js';
import {STORIES} from './fixtures/direction-stories.js';

function formaScore(edit = () => {}, dimensions = {}) {
  const {plan, settings: base, source} = STORIES.forma;
  const draft = structuredClone(plan);
  edit(draft);
  const settings = {...base, ...dimensions};
  const treatment = normalizeSemanticTreatment(draft, settings, source);
  return {treatment, settings, source, score: compileLaunch(treatment, settings, source)};
}

test('a line keeps its identity through the interface, and a dive grows from the actual press result', () => {
  const {treatment, score, settings} = formaScore();
  const [, input, result, close] = score.scenes;
  const line = score.elements.find(element => element.id === 'line-0');
  assert.equal(line.end, input.end);
  assert.equal(score.elements.filter(element => element.text === line.text).length, 1);
  assert.equal(input.ground, score.scenes[0].ground);
  assert.equal(input.groundStyle, score.scenes[0].groundStyle);
  const before = poseAt(line.motion, input.start - .01), after = poseAt(line.motion, input.start);
  assert.ok(Math.hypot(before.x - after.x, before.y - after.y) < .02);
  assert.ok(Math.abs(before.scale - after.scale) < .02);
  assert.equal(result.transition.target, 'sent-mark-1');
  assert.equal(result.transition.fill, result.ground);
  // The close is not cut to: the mark of the last step holds its place and becomes the rule under the name.
  assert.equal(close.transition, undefined);
  assert.equal(close.link.kind, 'match');
  assert.equal(close.link.anchor, 'node-2-1');
  const report = directionPlan(treatment, score, settings);
  assert.deepEqual(report.links, ['type', 'dive', 'match']);
  assert.deepEqual(report.scenes[1].arrives.actors, [line.id]);
  assert.ok(report.scenes[1].text.some(copy => copy.id === line.id && copy.readableFrames >= copy.neededFrames));
  assert.ok(report.scenes[2].tools.some(action => action.tool === 'sequence' && action.actors.includes('path-2-1')));
});

test('the dive centers an off-axis target before the close-up and keeps tracking it as it moves', () => {
  const width = 1920, height = 1080;
  const detail = {x: 1490, y: 600, w: 104, h: 104};
  assert.deepEqual(diveCamera(detail, width, height, 0), [0, 0, 1]);
  let lastDistance = Infinity;
  for (let index = 0; index <= 100; index++) {
    const progress = index / 100;
    const moving = {...detail, x: detail.x + index * .5, y: detail.y - index * .15};
    const [x, y, zoom] = diveCamera(moving, width, height, progress);
    const dx = x + (moving.x + moving.w / 2) * zoom - width / 2;
    const dy = y + (moving.y + moving.h / 2) * zoom - height / 2;
    const distance = Math.hypot(dx, dy);
    assert.ok(distance <= lastDistance + 1e-8);
    if (zoom >= 2) assert.ok(distance < .01, 'the enlarged target must stay centered');
    lastDistance = distance;
  }
});

test('dynamic pacing tightens actions within the same story and leaves time to read the result', () => {
  const {score: calm} = formaScore();
  const {score: dynamic} = formaScore(undefined, {pace: 'dynamic'});
  assert.deepEqual(dynamic.scenes.map(scene => scene.id), calm.scenes.map(scene => scene.id));
  assert.equal(dynamic.frames, calm.frames);
  assert.ok(dynamic.scenes.at(-1).end - dynamic.scenes.at(-1).start <= calm.scenes.at(-1).end - calm.scenes.at(-1).start);
  for (const score of [calm, dynamic]) {
    const path = score.elements.find(element => element.id === 'path-2-1');
    const node = score.elements.find(element => element.id === 'node-2-1');
    assert.equal(path.start + path.enterFrames, node.start);
  }
  const actor = (score, id) => score.elements.find(element => element.id === id);
  assert.ok(actor(dynamic, 'line-0').enterFrames < actor(calm, 'line-0').enterFrames);
  assert.ok(actor(dynamic, 'sent-mark-1').start < actor(calm, 'sent-mark-1').start);
  assert.equal(actor(dynamic, 'query-1').enterFrames, actor(calm, 'query-1').enterFrames);
  const result = score => actor(score, 'step-title-2-1');
  assert.equal(result(dynamic).text, result(calm).text);
  assert.ok(result(dynamic).end - result(dynamic).start >= result(calm).end - result(calm).start);
});

test('the click, traced confirmation and list entrances follow the action in either pace', () => {
  for (const pace of ['calm', 'dynamic']) {
    const {score} = formaScore(undefined, {pace});
    const actor = id => score.elements.find(element => element.id === id);
    const cursor = actor('cursor-1'), button = actor('button-1'), check = actor('sent-check-1');
    const {start, transition} = score.scenes[2];
    assert.equal(cursor.clickAt, button.motion[1].frame);
    assert.deepEqual(scoreCues(score).filter(cue => cue.kind === 'click').map(cue => cue.frame), [cursor.clickAt]);
    assert.equal(check.start, button.end);
    assert.equal(check.icon, 'circle-check');
    assert.equal(check.enter, 'draw');
    assert.ok(check.start + check.enterFrames <= start - transition.frames);
    const first = actor('step-title-2-0'), second = actor('step-title-2-1');
    assert.ok(first.start < second.start);
    for (const label of [first, second]) {
      const [from, to] = label.motion;
      assert.ok(from.x > 0);
      assert.equal(to.ease, 'spring');
      assert.equal(poseAt(label.motion, to.frame).x, 0);
    }
  }
});

test('an impossible match to an open sequence records the fallback instead of claiming a morph', () => {
  const {treatment, score, settings} = formaScore(plan => { plan.beats[2].visual.link = 'match'; });
  assert.equal(score.scenes[2].transition.kind, 'portal');
  const [fallback] = directionPlan(treatment, score, settings).substitutions;
  assert.equal(fallback.asked, 'match');
  assert.equal(fallback.used, 'portal');
  assert.match(fallback.why, /no surface/);
});

test('a match hands the exact mark box to one actor at the cut, then interpolates its contour', () => {
  const {score} = formaScore(plan => {
    const beat = plan.beats[2];
    beat.visual = {scene: 'feature', label: 'Запись подтверждена', link: 'match'};
  });
  const scene = score.scenes[2];
  const mark = score.elements.find(element => element.id === scene.link.anchor);
  const shape = score.shapes.find(actor => actor.id === mark.attachTo);
  const track = shapeTrack(shape.states);
  const before = shapePoseAt(track, scene.start - .01);
  const cut = shapePoseAt(track, scene.start);
  const landed = shapePoseAt(track, scene.start + 29);
  assert.equal(mark.end, scene.start);
  assert.equal(mark.exit, 'cut');
  assert.equal(score.elements.find(element => element.id === `match-mark-${scene.start}`).icon,
    score.elements.find(element => element.id === 'sent-check-1').icon);
  assert.equal(cut.box.x, before.box.x + mark.box.x);
  assert.equal(cut.box.y, before.box.y + mark.box.y);
  assert.equal(cut.box.w, mark.box.w);
  assert.equal(cut.box.h, mark.box.h);
  assert.equal(shape.states.find(state => state.frame === scene.start).contour, 'ellipse');
  assert.equal(shape.states.find(state => state.frame === scene.start + 7).contour, 'roundRect');
  assert.ok(landed.box.w > cut.box.w);
  assert.deepEqual(shapePoseAt(track, scene.start), cut);
});

test('the ordered composition has no cards and fits four labelled stops in every format', () => {
  for (const [width, height] of [[1920, 1080], [1080, 1920], [1080, 1080]]) {
    const {score} = formaScore(plan => {
      plan.beats[2].visual.items.push({title: 'Визит', subtitle: 'В выбранное время'}, {title: 'Готово', badge: 'Итог'});
    }, {width, height, frames: 600});
    const {start, end} = score.scenes[2];
    const local = score.elements.filter(element => element.start >= start && element.start < end);
    assert.ok(local.every(element => element.kind !== 'card'));
    const nodes = local.filter(element => element.id.startsWith('node-'));
    const paths = local.filter(element => element.id.startsWith('path-'));
    assert.equal(nodes.length, 4);
    assert.equal(paths.length, 3);
    for (const [index, segment] of paths.entries()) {
      assert.equal(segment.start + segment.enterFrames, nodes[index + 1].start);
    }
  }
});

test('review applies only addressed scenes and retains durations and the chosen direction', () => {
  const {treatment, settings, source} = formaScore();
  const draft = structuredClone(STORIES.forma.plan);
  draft.beats[0].text = 'Не меняй эту строку';
  draft.beats[2].text = 'Сервис всё сделает сам';
  draft.beats[2].visual.keyPhrase = 'сам';
  draft.rationale = 'New direction';
  const allowed = reviewBeatIds(['[result] Explain the result.', '[unknown] Ignore.'], treatment);
  const result = reviseSceneTreatment(treatment, draft, allowed, settings, source);
  assert.deepEqual(result.beats[0], treatment.beats[0]);
  assert.deepEqual(result.beats[3], treatment.beats[3]);
  assert.equal(result.beats[2].text, draft.beats[2].text);
  assert.equal(result.rationale, treatment.rationale);
  assert.deepEqual(result.beats.map(beat => beat.frames), treatment.beats.map(beat => beat.frames));
  draft.beats.reverse();
  assert.throws(() => reviseSceneTreatment(treatment, draft, allowed, settings, source), /scene IDs and order/);
});

const renderedRuns = process.env.KADR_DIRECTION_RENDER_CHECK;
async function pixels(png) {
  const image = await loadImage(png);
  const context = createCanvas(image.width, image.height).getContext('2d');
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, image.width, image.height).data;
}

async function assertSameFrame(actual, expected, label) {
  if (actual.equals(expected)) return;
  const [a, b] = await Promise.all([pixels(actual), pixels(expected)]);
  assert.equal(a.length, b.length, label);
  let different = 0, maxDelta = 0;
  for (let i = 0; i < a.length; i += 4) {
    const delta = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]),
      Math.abs(a[i + 2] - b[i + 2]), Math.abs(a[i + 3] - b[i + 3]));
    if (delta) different++;
    maxDelta = Math.max(maxDelta, delta);
  }
  // Independent Chromium canvases round a few blended edge pixels differently. Keep both
  // the channel difference and the affected area bounded (0.01% of the frame).
  assert.ok(maxDelta <= 3 && different <= a.length / 4 * .0001, `${label}: ${different} pixels, delta ${maxDelta}`);
}

test('export and random-access preview agree at the handoff frames', {skip: !renderedRuns}, async () => {
  const {previewLaunchFrames} = await import('../src/kadr-launch/render.js');
  for (const dir of renderedRuns.split(path.delimiter)) {
    const json = async name => JSON.parse(await readFile(path.join(dir, name + '.json'), 'utf8'));
    const score = await json('launch-score');
    const source = await json('source').catch(async error=>{
      if(error.code!=='ENOENT'||path.basename(path.dirname(dir))!=='exports')throw error;
      return JSON.parse(await readFile(path.resolve(dir,'../../source.json'),'utf8'));
    });
    const metadata = await json('render-metadata');
    const report = await json('inspection');
    assert.equal(report.ok, true);
    assert.ok(report.textFits.every(item => !item.truncated));
    const samples = scoreSamples(score, {includeTransitions: true}).filter(sample => /motion-(dive|match|type|carry)-/.test(sample.id) ||
      /^(cursor click rays|confirmation (ring|tick) draws|confirmation settles)$/.test(sample.phase));
    assert.ok(samples.length >= 6);
    const ordered = [...samples].reverse();
    const frames = [...ordered.map(sample => sample.frame), ordered[0].frame];
    const pictures = await previewLaunchFrames(score, source, frames, {
      scale: metadata.width / score.width, blur: metadata.shutterSamples, fps: metadata.fps,
    });
    assert.deepEqual(pictures[0], pictures.at(-1));
    for (const [index, sample] of ordered.entries()) {
      await assertSameFrame(pictures[index], await readFile(path.join(dir, 'keyframes', sample.id + '.png')), sample.id);
    }
  }
});
