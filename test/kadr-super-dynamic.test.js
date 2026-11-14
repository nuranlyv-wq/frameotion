import test from 'node:test';
import assert from 'node:assert/strict';
import {auditSuperDynamic, compileSuperDynamic} from '../src/kadr-launch/super-dynamic.js';
import {objectRevealAt} from '../src/kadr-launch/object-reveal.js';
import {createCanvas, loadImage} from '@napi-rs/canvas';
import {compileLaunch, normalizeSemanticTreatment} from '../src/kadr-launch/compile.js';
import {scoreSamples, validateScore} from '../src/kadr-launch/score.js';
import {validateLaunchRequest} from '../src/kadr-launch/index.js';
import {generateLaunch} from '../src/kadr-launch/index.js';
import {creationRequest} from '../src/kadr-launch/creation-request.js';
import {directionPlan} from '../src/kadr-launch/direction-plan.js';
import {STORIES} from './fixtures/direction-stories.js';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const box = {x: 20, y: 20, w: 50, h: 50, radius: 0};
const pose = (frame, x = 0) => ({frame, x, y: 0, scale: 100, rotate: 0, opacity: 100});
const basic = () => ({fps: 30, frames: 30,
  scenes: [{id: 'a', start: 0, end: 15}, {id: 'b', start: 15, end: 30}],
  elements: [{id: 'caption', start: 0, end: 15, enterFrames: 10, motion: [pose(0), pose(15, 20)]}],
  shapes: [], camera: []});

test('half a second is accepted, but a 16-frame element or action is reported', () => {
  assert.deepEqual(auditSuperDynamic(basic()), {ok: true, limitFrames: 15, limitSeconds: .5, issues: []});
  const score = basic();
  score.elements[0].end = 16;
  score.elements[0].motion[1].frame = 16;
  const audit = auditSuperDynamic(score);
  assert.equal(audit.ok, false);
  assert.deepEqual(audit.issues.map(({kind, frames}) => [kind, frames]), [['element', 16], ['motion', 16]]);
});

test('persistent shapes, long transitions, and camera moves are not mistaken for short actions', () => {
  const score = basic();
  score.scenes[1].transition = {frames: 10, revealFrames: 6};
  score.shapes.push({id: 'surface', states: [{frame: 0, duration: 0, box, opacity: 100},
    {frame: 15, duration: 0, box, opacity: 100}]});
  score.camera = [{frame: 0, x: 0, y: 0, zoom: 100, rotate: 0}, {frame: 16, x: 50, y: 0, zoom: 100, rotate: 0}];
  const audit = auditSuperDynamic(score);
  assert.deepEqual(audit.issues.map(({kind, frames}) => [kind, frames]), [['transition', 16], ['shape', 30], ['camera', 16]]);
});

test('the frame limit follows the score fps, and held camera keys are not moves', () => {
  const score = basic();
  score.fps = 24;
  score.scenes = [{id: 'a', start: 0, end: 12}];
  score.elements = [];
  score.frames = 12;
  score.camera = [{frame: 0, x: 0, y: 0, zoom: 100, rotate: 0}, {frame: 24, x: 0, y: 0, zoom: 100, rotate: 0}];
  assert.equal(auditSuperDynamic(score).ok, true);
  assert.equal(auditSuperDynamic(score).limitFrames, 12);
});

test('the compiler keeps the story and copy while limiting every action to half a second', () => {
  const story = STORIES.forma;
  for (const frames of [360, 480, 1800]) {
    const settings = {...story.settings, frames, pace: 'superdynamic'};
    const treatment = normalizeSemanticTreatment(structuredClone(story.plan), settings, story.source);
    if (frames === 360) assert.ok(treatment.storyboardFrames > frames);
    const score = compileLaunch(treatment, settings, story.source);
    assert.equal(score.staging, 'superdynamic');
    assert.equal(score.timing, 'actions');
    assert.equal(score.scenes.length, treatment.beats.length);
    assert.equal(auditSuperDynamic(score).ok, true);
    assert.ok(score.scenes.every(scene => treatment.beats.some(beat => beat.id === scene.sourceScene)));
    assert.ok(score.elements.some(element => element.end - element.start > 15));
    assert.ok(score.elements.some(element => element.text?.includes('Вторник')));
    const samples = scoreSamples(score);
    assert.equal(samples[0].scene, score.scenes[0].id);
    assert.equal(samples.at(-1).scene, score.scenes.at(-1).id);
    const report = directionPlan(treatment, score, settings);
    assert.equal(report.scenes.length, score.scenes.length);
    const invalid = structuredClone(score);
    invalid.elements[0].enterFrames = 16;
    assert.throws(() => validateScore(invalid, settings, story.source), /exceeds 15 frames/);
  }
});

test('editing one treatment scene keeps the other scenes and their shot timings', () => {
  const story = STORIES.forma, settings = {...story.settings, pace: 'superdynamic'};
  const treatment = normalizeSemanticTreatment(structuredClone(story.plan), settings, story.source);
  const before = compileLaunch(treatment, settings, story.source);
  const edited = structuredClone(treatment);
  edited.beats[1].visual.label = 'Среда, 10:00';
  const after = compileLaunch(edited, settings, story.source);
  assert.deepEqual(after.scenes.map(({id, start, end, sourceScene}) => ({id, start, end, sourceScene})),
    before.scenes.map(({id, start, end, sourceScene}) => ({id, start, end, sourceScene})));
  const untouched = score => score.elements.filter(element =>
    score.scenes.find(scene => scene.start <= element.start && scene.end > element.start)?.sourceScene !== edited.beats[1].id);
  assert.deepEqual(untouched(after), untouched(before));
});

test('a long conceptual storyboard survives revision of a shorter rapid film', () => {
  const story = STORIES.forma, settings = {...story.settings, frames: 360, pace: 'superdynamic'};
  const original = normalizeSemanticTreatment(structuredClone(story.plan), settings, story.source);
  assert.ok(original.storyboardFrames > settings.frames);
  const updated = structuredClone(original);
  updated.beats[1].visual.label = 'Среда, 10:00';
  const fixedTimings = new Map(original.beats.map(beat => [beat.id, beat.frames]));
  updated.beats = updated.beats.map(({frames, ...beat}) => beat);
  const revised = normalizeSemanticTreatment(updated, settings, story.source, {fixedTimings});
  assert.equal(revised.storyboardFrames, original.storyboardFrames);
  assert.equal(auditSuperDynamic(compileLaunch(revised, settings, story.source)).ok, true);
});

test('a delivery retains the actual courier, route and direction with fast travel', {skip: !STORIES.lapa}, () => {
  const story = STORIES['lapa-delivery'];
  for (const layout of [0, 1]) {
    const settings = {...story.settings, frames: 450, pace: 'superdynamic', variation: {layout}};
    const treatment = normalizeSemanticTreatment(structuredClone(story.plan), settings, story.source);
    assert.ok(treatment.storyboardFrames > settings.frames);
    const score = compileLaunch(treatment, settings, story.source);
    const route = score.elements.find(element => element.id.startsWith('route-'));
    assert.ok(route, 'delivery route');
    const courier = score.elements.find(element => element.icon === 'courier' && element.start < route.end && element.end > route.start);
    assert.ok(courier);
    assert.equal(Math.sign(courier.motion.at(-1).x), layout === 0 ? 1 : -1);
    assert.ok(courier.end <= route.end);
    assert.equal(auditSuperDynamic(score).ok, true);
  }
});

test('a requested word-to-calendar transformation retains its outcome in the rapid montage', () => {
  const story = STORIES.forma, settings = {...story.settings, pace: 'superdynamic'};
  const plan = structuredClone(story.plan);
  plan.beats[0].move = 'word-click';
  delete plan.beats[0].visual.keyPhrase;
  plan.beats[0].visual.wordClick = {word: 'время', shape: 'ellipse', mark: 'calendar'};
  const treatment = normalizeSemanticTreatment(plan, settings, story.source);
  const score = compileLaunch(treatment, settings, story.source);
  const opening = score.scenes.filter(scene => scene.sourceScene === plan.beats[0].id);
  assert.ok(score.elements.some(element => element.wordClick?.mark === 'calendar' &&
    opening.some(scene => element.start >= scene.start && element.start < scene.end)));
  assert.equal(auditSuperDynamic(score).ok, true);
});

test('rapid actions use native transformations, optical movement and a real text origin, then hold', () => {
  const story = STORIES.forma, settings = {...story.settings, pace: 'superdynamic'};
  const score = compileLaunch(normalizeSemanticTreatment(structuredClone(story.plan), settings, story.source), settings, story.source);
  assert.ok(score.shapes.some(shape => new Set(shape.states.map(state => JSON.stringify(state.box))).size > 1));
  assert.ok(score.shapes.every(shape => shape.states.every(state => state.duration <= 15)));
  assert.ok(score.scenes.some(scene => scene.transition?.kind === 'dive'));
  const headline = score.elements.find(item => item.id === 'line-0');
  assert.equal(headline.motion[1].x, headline.motion[0].x, 'the headline holds before becoming the interface');
  assert.equal(headline.motion[1].scale, headline.motion[0].scale);
  const texts = score.elements.filter(item => item.objectReveal);
  assert.ok(texts.length);
  for (const item of texts) {
    const origin = score.elements.find(actor => actor.id === item.objectReveal.target);
    assert.ok(origin && origin.start <= item.start && origin.end >= item.end);
    const landing = objectRevealAt(item, origin, item.start + item.enterFrames);
    assert.equal(landing.progress, 1);
    assert.equal(Math.abs(landing.x) + Math.abs(landing.y), 0);
  }
  assert.ok(score.camera.some((key, index, keys) => index && key.zoom !== keys[index - 1].zoom));
  assert.ok(score.camera.every((key, index, keys) => !index || key.frame > keys[index - 1].frame));
  assert.equal(auditSuperDynamic(score).ok, true);
  const invalid = structuredClone(score);
  invalid.elements.find(item => item.objectReveal).objectReveal.target = 'missing';
  assert.throws(() => validateScore(invalid, settings, story.source), /visible unrotated object/);
});

test('a text aperture starts behind the object edge and lands exactly for all directions', () => {
  const target = {box: {x: 100, y: 100, w: 80, h: 80}};
  const item = {box: {x: 220, y: 220, w: 200, h: 80}, start: 10, enterFrames: 6};
  for (const direction of ['up', 'down', 'left', 'right']) {
    item.objectReveal = {target: 'origin', direction};
    const start = objectRevealAt(item, target, 10);
    const middle = objectRevealAt(item, target, 12.5);
    const end = objectRevealAt(item, target, 16);
    assert.ok(Math.abs(start.x) + Math.abs(start.y) > Math.abs(middle.x) + Math.abs(middle.y));
    assert.equal(Math.abs(end.x) + Math.abs(end.y), 0);
    assert.deepEqual(start, objectRevealAt(item, target, 10), 'reverse seeking is stateless');
  }
});

test('single-subject scenes stay continuous and invalid frame rates cannot enter compilation', () => {
  const story = STORIES.forma;
  const settings = {...story.settings, pace: 'superdynamic'};
  const ordinary = compileLaunch(normalizeSemanticTreatment(structuredClone(story.plan), story.settings, story.source), story.settings, story.source);
  const input = {...ordinary, frames: 361, scenes: [{id: 'only', purpose: 'Название продукта', start: 0, end: 180}, {id: 'close', purpose: 'Название продукта', start: 180, end: 361}],
    elements: [{...ordinary.elements.find(item => item.text), id: 'only-copy', text: 'Запись', start: 0, end: 361}]};
  const score = compileSuperDynamic(input);
  assert.equal(score.scenes.at(-1).end, 361);
  assert.ok(score.elements.every(item => item.text === 'Запись'));
  assert.equal(auditSuperDynamic(score).ok, true);
  for (const fps of [0, 1, NaN, Infinity]) assert.throws(() => compileSuperDynamic({...input, fps}), /finite frame timeline/);
});

test('the timing audit includes native volume rotation', () => {
  const score = basic();
  score.elements[0].mesh = {keys: [{frame: 0, rx: 0, ry: 0}, {frame: 16, rx: 0, ry: 90}]};
  assert.deepEqual(auditSuperDynamic(score).issues.map(item => item.kind), ['mesh']);
});

test('intermediate keys cannot disguise a long continuous action', () => {
  const score = {...basic(), timing: 'actions'};
  score.elements[0].motion = [pose(0), pose(10, 20), pose(20, 40)];
  assert.deepEqual(auditSuperDynamic(score).issues.map(({kind, frames}) => [kind, frames]), [['motion', 20]]);
  score.elements[0].motion = [pose(0), pose(10, 20), pose(12, 20), pose(22, 40)];
  assert.equal(auditSuperDynamic(score).ok, true, 'a real hold separates two actions');
});

test('rapid compilation preserves the copy and native spatial mechanics without mutating the source', () => {
  const variants = [
    {kind: 'transform', stages: [{label: 'Зерно', icon: 'bean', form: 'tile'}, {label: 'Пачка', icon: 'bag', form: 'box'}, {label: 'Доставка', icon: 'courier', form: 'tile'}]},
    {kind: 'fold', subject: {label: 'Пачка', icon: 'bag'}, whole: {label: 'Коробка', icon: 'box'}},
    {kind: 'assemble', parts: [{label: 'Зерно', icon: 'bean'}, {label: 'Пачка', icon: 'bag'}], whole: {label: 'Коробка', icon: 'box'}},
  ];
  for (const show of variants) {
    const story = STORIES.roastery, plan = structuredClone(story.plan);
    plan.beats[1].visual.show = show;
    const settings = {...story.settings, frames: 480, pace: 'calm'};
    const ordinary = compileLaunch(normalizeSemanticTreatment(plan, settings, story.source), settings, story.source);
    const before = structuredClone(ordinary);
    const rapid = compileSuperDynamic(ordinary);
    assert.deepEqual(ordinary, before);
    assert.deepEqual(rapid.elements.map(item => item.text), ordinary.elements.map(item => item.text));
    assert.ok(rapid.elements.some(item => show.kind === 'fold' ? item.fold : item.formTrack));
    assert.equal(auditSuperDynamic(rapid).ok, true);
    validateScore(rapid, {...settings, pace: 'superdynamic'}, story.source);
  }
});

test('rapid shots remain valid when recomposed for portrait and square', () => {
  const story = STORIES.forma;
  for (const [width, height] of [[1080, 1920], [1080, 1080]]) {
    const settings = {...story.settings, width, height, pace: 'superdynamic'};
    const treatment = normalizeSemanticTreatment(structuredClone(story.plan), settings, story.source);
    const score = compileLaunch(treatment, settings, story.source);
    assert.equal(auditSuperDynamic(score).ok, true);
    assert.ok(score.elements.every(({box}) => box.x >= 0 && box.y >= 0 && box.x + box.w <= width && box.y + box.h <= height));
  }
});

test('super-dynamic is accepted for the automatic brand flow and rejects unsupported recipes', () => {
  const options = {description: 'Сервис записи', pace: 'superdynamic'};
  assert.equal(validateLaunchRequest(options).pace, 'superdynamic');
  assert.throws(() => validateLaunchRequest({...options, style: 'product-demo'}), /Супердинамичный/);
  assert.throws(() => validateLaunchRequest({...options, directionMode: 'detailed'}), /Супердинамичный/);
  assert.throws(() => validateLaunchRequest({...options, motionRecipe: 'connected-story'}), /Супердинамичный/);
});

test('both public form input modes carry the selected pace to the generator', () => {
  for (const body of [{mode: 'prompt', input: 'Сервис записи'}, {mode: 'url', input: 'example.com'}]) {
    const request = creationRequest({...body, pace: 'superdynamic'});
    assert.equal(request.launchPace, 'superdynamic');
    assert.equal(validateLaunchRequest({...request, pace: request.launchPace}).pace, 'superdynamic');
    assert.equal(creationRequest(body).launchPace, 'dynamic');
    assert.throws(() => creationRequest({...body, pace: 'invalid'}), /ритм/);
  }
  assert.throws(() => creationRequest({mode: 'url', input: 'https://user:pass@example.com', pace: 'superdynamic'}), /ссылку/);
});

test('the ordinary generation pipeline persists the rapid score and its editable treatment', async t => {
  const runsDir = await mkdtemp(path.join(os.tmpdir(), 'kadr-super-'));
  t.after(() => rm(runsDir, {recursive: true, force: true}));
  const {plan, source} = STORIES.forma;
  const services = {runtime: () => {}, render: async (_score, _source, dir) => ({video: path.join(dir, 'video.mp4'), issues: []}),
    inspect: async () => ({ok: true, issues: []})};
  const requestStage = async args => {
    assert.equal(args.input.settings.pace, 'superdynamic');
    assert.match(args.prompt, /at most 0\.5 seconds/);
    const output = {...structuredClone(plan), beats: plan.beats.map(({frames, ...beat}) => structuredClone(beat))};
    if (args.input.previous) output.beats[1].visual.label = 'Среда, 10:00';
    return {output};
  };
  const result = await generateLaunch({runsDir, runId: 'rapid', description: source.evidence[0].text, seconds: 16,
    pace: 'superdynamic', visualReview: false, services, requestStage});
  assert.equal(result.ok, true);
  const read = async name => JSON.parse(await readFile(path.join(runsDir, 'rapid', `${name}.json`), 'utf8'));
  const [score, request, treatment, direction] = await Promise.all(['launch-score', 'request', 'treatment', 'direction-plan'].map(read));
  assert.equal(request.pace, 'superdynamic');
  assert.equal(auditSuperDynamic(score).ok, true);
  assert.equal(treatment.beats.length, plan.beats.length);
  assert.equal(direction.scenes.length, score.scenes.length);
  assert.ok(direction.scenes.every(scene => treatment.beats.some(beat => beat.id === scene.sourceScene)));
  const shot = score.scenes.find(scene => scene.sourceScene === treatment.beats[1].id);
  const revised = await generateLaunch({runsDir, runId: 'rapid', resume: true, services, requestStage,
    sceneRevision: {sceneId: shot.id, instruction: 'Изменить выбранное время'}});
  assert.equal(revised.ok, true);
  assert.equal(revised.report.sceneRevision.sceneId, treatment.beats[1].id);
  const revisionScore = JSON.parse(await readFile(path.join(runsDir, 'rapid', revised.report.artifacts.score), 'utf8'));
  assert.equal(auditSuperDynamic(revisionScore).ok, true);
  assert.deepEqual(revisionScore.scenes.map(scene => [scene.start, scene.end, scene.sourceScene]),
    score.scenes.map(scene => [scene.start, scene.end, scene.sourceScene]));
});

test('rapid preview agrees with export when frames are requested in reverse order', {skip: !process.env.KADR_SUPER_RENDER_CHECK}, async () => {
  const dir = process.env.KADR_SUPER_RENDER_CHECK;
  const read = async name => JSON.parse(await readFile(path.join(dir, `${name}.json`), 'utf8'));
  const [score, source, metadata] = await Promise.all(['launch-score', 'source', 'render-metadata'].map(read));
  const samples = scoreSamples(score);
  const chosen = [samples.at(-1), samples[Math.floor(samples.length / 2)], samples[0]];
  const {previewLaunchFrames} = await import('../src/kadr-launch/render.js');
  const images = await previewLaunchFrames(score, source, [...chosen.map(sample => sample.frame), chosen[0].frame],
    {scale: metadata.width / score.width, blur: metadata.shutterSamples, fps: metadata.fps});
  assert.deepEqual(images[0], images.at(-1));
  const pixels = async bytes => {
    const image = await loadImage(bytes), canvas = createCanvas(image.width, image.height), ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    return ctx.getImageData(0, 0, image.width, image.height).data;
  };
  for (let index = 0; index < chosen.length; index++) {
    const preview = await pixels(images[index]);
    const exported = await pixels(await readFile(path.join(dir, 'keyframes', chosen[index].id + '.png')));
    assert.equal(preview.length, exported.length);
    let changed = 0, maximum = 0;
    for (let i = 0; i < preview.length; i += 4) {
      const delta = Math.max(...[0, 1, 2, 3].map(channel => Math.abs(preview[i + channel] - exported[i + channel])));
      if (delta) changed++;
      maximum = Math.max(maximum, delta);
    }
    assert.ok(maximum <= 3 && changed <= preview.length / 4 * .0001, `${chosen[index].id}: ${changed} pixels, delta ${maximum}`);
  }
});
