import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {generateLaunch} from '../src/kadr-launch/index.js';
import {compileLaunch, normalizeSemanticTreatment} from '../src/kadr-launch/compile.js';
import {ANGLES, LAYOUTS, creativeProfile, filmSummary, planVariation, readHistory, recordFilm, repeatedCreativeDirection, sourceKey, variationBrief} from '../src/kadr-launch/variety.js';
import {AUDIENCES, audienceBrief} from '../src/kadr-launch/audiences.js';
import {SHOWS} from '../src/kadr-launch/techniques.js';
import {poseAt} from '../src/kadr-launch/kinetic.js';
import {STORIES} from './fixtures/direction-stories.js';

const seeded = seed => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const compiled = (name, layout) => {
  const {plan, settings: base, source} = STORIES[name];
  const settings = {...base, variation: {angle: 'promise', layout}};
  const treatment = normalizeSemanticTreatment(structuredClone(plan), settings, source);
  return {treatment, score: compileLaunch(treatment, settings, source)};
};
const byId = (score, id) => score.elements.find(element => element.id === id);

test('a product is keyed by its site or its description, not by who asked', () => {
  assert.equal(sourceKey({url: 'https://www.lapa.az/about?x=1'}), sourceKey({url: 'https://lapa.az/'}));
  assert.notEqual(sourceKey({url: 'https://lapa.az/'}), sourceKey({url: 'https://forma.example/'}));
  assert.equal(sourceKey({description: 'Смета —  сервис счетов'}), sourceKey({description: 'смета — сервис счетов '}));
  assert.notEqual(sourceKey({description: 'Смета'}), sourceKey({description: 'Волна'}));
});

test('successive films of one product use every angle, layout and look before any repeats', () => {
  const random = seeded(7), history = [];
  for (let film = 0; film < Object.keys(ANGLES).length; film++) {
    const variation = planVariation(history, {random});
    assert.ok(!history.some(entry => entry.angle === variation.angle), `angle repeats at film ${film + 1}`);
    assert.ok(!history.some(entry => entry.artDirection === (variation.artDirection ?? null)), `look repeats at film ${film + 1}`);
    if (film < LAYOUTS.length) assert.ok(!history.some(entry => entry.layout === variation.layout), `layout repeats at film ${film + 1}`);
    assert.deepEqual(variation.avoid, history.slice(-4).map(entry => entry.summary));
    history.push({angle: variation.angle, layout: variation.layout, artDirection: variation.artDirection ?? null, summary: `film ${film + 1}`});
  }
  // A look the user chose is never overridden.
  assert.equal(planVariation(history, {artDirection: 'clean', random}).artDirection, undefined);
});

test('the same plan is laid out differently in each layout variant', () => {
  const start = (name, layout, id) => {
    const {score} = compiled(name, layout), item = byId(score, id);
    const pose = item.motion ? poseAt(item.motion, item.motion.at(-1).frame) : {x: 0, y: 0};
    return {from: item.box.x, to: item.box.x + pose.x, score};
  };
  // Journey: the trip is mirrored, and its curve changes.
  const [ltr, rtl] = [start('smeta', 0, 'token-1'), start('smeta', 1, 'token-1')];
  assert.ok(ltr.to > ltr.from && rtl.to < rtl.from);
  assert.notDeepEqual(byId(ltr.score, 'route-1').curve.points, byId(start('smeta', 2, 'token-1').score, 'route-1').curve.points);
  // Process: a level row or rising steps; the stages read left to right in both.
  const [level, steps] = [compiled('roastery', 0).score, compiled('roastery', 1).score];
  for (const score of [level, steps]) assert.ok(byId(score, 'stage-label-1-0').box.x < byId(score, 'stage-label-1-3').box.x);
  assert.equal(byId(level, 'stage-1-0').box.y, byId(level, 'stage-1-3').box.y);
  assert.ok(byId(steps, 'stage-1-0').box.y > byId(steps, 'stage-1-3').box.y);
  // Spread: destinations swap sides.
  const [left, right] = [compiled('agency', 0).score, compiled('agency', 1).score];
  assert.ok(byId(left, 'part-1-0').box.x < 960 && byId(right, 'part-1-0').box.x > 960);
});

test('process and spread stage every prop, in order, and end on the token', () => {
  const roast = compiled('roastery', 0).score;
  const lands = [0, 1, 2, 3].map(stage => byId(roast, `stage-${stage === 0 ? '1-0' : `1-${stage}`}`).start);
  assert.deepEqual(lands, [...lands].sort((a, b) => a - b));
  assert.deepEqual([0, 1, 2, 3].map(stage => byId(roast, `stage-1-${stage}`).icon), ['bean', 'flame', 'bag', 'courier']);
  const token = byId(roast, 'token-1'), last = byId(roast, 'stage-1-3');
  const end = poseAt(token.motion, token.motion.at(-1).frame);
  assert.ok(Math.abs(token.box.x + token.box.w / 2 + end.x - (last.box.x + last.box.w / 2)) <= 2);
  assert.ok(byId(roast, 'result-1').start >= last.start);

  const post = compiled('agency', 0).score;
  for (const part of [0, 1, 2]) {
    const copy = byId(post, `copy-1-${part}`), place = byId(post, `part-1-${part}`), fly = copy.motion[1];
    assert.ok(Math.abs(copy.box.x + copy.box.w / 2 + fly.x - (place.box.x + place.box.w / 2)) <= 2);
    assert.equal(place.start, fly.frame);
  }
});

test('every kind of customer maps to show mechanics the engine has', () => {
  assert.ok(AUDIENCES.length >= 12);
  for (const audience of AUDIENCES) for (const kind of audience.shows) assert.ok(SHOWS[kind], `${audience.id}: ${kind}`);
  assert.ok(new Set(AUDIENCES.map(audience => audience.shows[0])).size >= 4);
  for (const id of ['roastery', 'venue', 'shop', 'dev-studio', 'creative', 'smm']) assert.match(audienceBrief(), new RegExp(`- ${id}:`));
});

test('a second film of the same product gets another angle and is told what the first one was', async t => {
  const runsDir = await mkdtemp(path.join(os.tmpdir(), 'kadr-variety-'));
  t.after(() => rm(runsDir, {recursive: true, force: true}));
  const {plan, source} = STORIES.smeta, description = source.evidence[0].text, seen = [];
  const services = {runtime: () => {}, render: async (_score, _source, dir) => ({video: path.join(dir, 'video.mp4'), issues: []}),
    inspect: async () => ({ok: true, issues: []}), random: seeded(11)};
  const requestStage = async args => {
    if (args.name === 'launch_review') return {output: {verdict: 'pass', issues: []}};
    seen.push(args.input.variation);
    const output = {...structuredClone(plan), beats: plan.beats.map(({frames, ...beat}) => structuredClone(beat))};
    if (seen.length > 1) output.beats[1].visual.show = {kind: seen.length === 2 ? 'transform' : 'process',
      stages: [{label:'Счёт',icon:'doc',form:'tile'},{label:'Письмо',icon:'mail',form:'box'},
        {label:'Оплачен',icon:'check',form:'tile'}], result:'Клиент получил счёт'};
    return {output};
  };
  const films = [];
  for (const runId of ['first', 'second', 'third']) {
    films.push(await generateLaunch({runsDir, runId, description, seconds: 16, pace: 'calm', visualReview: false, services, requestStage}));
  }
  const variations = films.map(film => film.report.variation);
  assert.equal(new Set(variations.map(variation => variation.angle)).size, 3);
  assert.equal(new Set(variations.map(variation => variation.layout)).size, 3);
  assert.equal(new Set(variations.map(variation => variation.artDirection ?? 'base')).size, 3);
  assert.equal(seen[0].earlierFilmsOfThisProduct, undefined);
  assert.equal(seen[0].suggestedOpening, ANGLES[variations[0].angle]);
  assert.equal(seen[1].earlierFilmsOfThisProduct.length, 1);
  assert.equal(seen[2].earlierFilmsOfThisProduct.length, 2);
  assert.match(seen[2].earlierFilmsOfThisProduct[0], /show\(journey: Счёт\)/);
  assert.equal(seen[2].earlierCreativeDirections.length, 2);
  assert.equal(seen[2].earlierCreativeDirections[0].subject, plan.directions.find(item => item.id === plan.selected).creative.subject);
  const history = await readHistory(runsDir, sourceKey({description}));
  assert.deepEqual(history.map(entry => entry.runId), ['first', 'second', 'third']);
  assert.equal(filmSummary(plan), history[0].summary);
  // Another product starts with an empty history.
  assert.deepEqual(await readHistory(runsDir, sourceKey({description: 'Другой продукт'})), []);
  await recordFilm(runsDir, 'k', {runId: 'a'});
  assert.equal((await recordFilm(runsDir, 'k', {runId: 'a', angle: 'word'})).length, 1);
});

test('creative memory distinguishes a new causal staging from a cosmetic rewrite', () => {
  const plan = structuredClone(STORIES.smeta.plan), profile = creativeProfile(plan);
  const cosmetic = structuredClone(plan);
  cosmetic.beats[0].text = 'Новая подпись';
  cosmetic.beats[0].visual.layout = 'right';
  assert.match(repeatedCreativeDirection(cosmetic, [profile]), /changing colours, layout or wording/);
  const changed = structuredClone(plan);
  changed.beats[1].visual.show = {kind: 'transform', stages: [{label: 'Счёт', icon: 'doc'}, {label: 'Письмо', icon: 'mail'}]};
  assert.equal(repeatedCreativeDirection(changed, [profile]), null);
  const variation = planVariation([{summary: filmSummary(plan), pace: 'calm', creative: profile}], {random: seeded(2)});
  assert.deepEqual(variationBrief(variation).earlierCreativeDirections, [{pace: 'calm', ...profile}]);
  assert.equal(planVariation([{summary: 'older history entry'}], {random: seeded(2)}).creativeHistory, undefined);
});

test('an automatic ordinary film retries a repeated idea while an explicit remake keeps its direction', async t => {
  const runsDir = await mkdtemp(path.join(os.tmpdir(), 'kadr-creative-memory-'));
  t.after(() => rm(runsDir, {recursive: true, force: true}));
  const {plan, source} = STORIES.smeta, description = source.evidence[0].text;
  const services = {runtime: () => {}, random: seeded(5),
    render: async (_score, _source, dir) => ({video: path.join(dir, 'video.mp4'), issues: []}),
    inspect: async () => ({ok: true, issues: []})};
  await recordFilm(runsDir, sourceKey({description}), {runId: 'earlier', summary: filmSummary(plan), creative: creativeProfile(plan), pace: 'calm'});
  let attempts = 0;
  const requestStage = async args => {
    attempts++;
    const output = {...structuredClone(plan), beats: plan.beats.map(({frames, ...beat}) => structuredClone(beat))};
    if (attempts === 2) {
      assert.match(args.feedback.join(' '), /repeats an earlier film/);
      output.beats[1].visual.show = {kind:'transform',stages:[{label:'Счёт',icon:'doc'},{label:'Письмо',icon:'mail'}]};
    }
    return {output};
  };
  const fresh = await generateLaunch({runsDir, runId: 'fresh', description, seconds: 16, pace: 'calm', visualReview: false, services, requestStage});
  assert.equal(fresh.ok, true, JSON.stringify(fresh.report.error));
  assert.equal(attempts, 2);
  attempts = 0;
  const remake = await generateLaunch({runsDir, runId: 'remake', description, brief: 'Повтори прежнюю постановку.',
    seconds: 16, pace: 'calm', visualReview: false, services, requestStage});
  assert.equal(remake.ok, true);
  assert.equal(attempts, 1);
});
