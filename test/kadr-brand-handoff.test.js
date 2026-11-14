import test from 'node:test';
import assert from 'node:assert/strict';
import {compileLaunch, normalizeSemanticTreatment} from '../src/kadr-launch/compile.js';
import {validateScore} from '../src/kadr-launch/score.js';
import {STORIES} from './fixtures/direction-stories.js';
import {generateLaunch} from '../src/kadr-launch/index.js';
import {mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const asset = {id: 'brand-aaaaaaaaaaaaaaaaaaaa', kind: 'illustration'};
function compile(name, edit, options = {}) {
  const story = STORIES[name], source = structuredClone(story.source), plan = structuredClone(story.plan);
  source.assets.push(asset);
  edit(plan, source);
  const settings = {...story.settings, ...options};
  const score = compileLaunch(normalizeSemanticTreatment(plan, settings, source), settings, source);
  return {score, settings, source};
}

test('a captured brand background survives the all-accent look and explicit grounds remain authorable', () => {
  const original = compile('forma', (_plan, source) => {source.brand.paletteSource = 'rendered-interface';}, {artDirection: 'playful'});
  assert.deepEqual(original.score.palette, original.source.brand.interfacePalette);
  assert.equal(original.score.scenes[0].ground, 'background');
  assert.equal(original.score.scenes.find(scene => scene.id === 'result').ground, 'accent', 'the real dive still inherits its detail colour');
  assert.equal(original.score.scenes.at(-1).ground, 'background');
  const explicit = compile('forma', (plan, source) => {
    source.brand.paletteSource = 'rendered-interface'; plan.beats[0].visual.ground = 'foreground';
  }, {artDirection: 'playful'});
  assert.equal(explicit.score.scenes[0].ground, 'foreground');
});

test('a product photograph can hand off to its carrier without exempting unrelated overlaps', () => {
  const {score, settings, source} = compile('smeta', plan => {
    plan.beats[1].visual.show.subject.assetId = asset.id;
    plan.beats[1].visual.show.carrier = 'mail';
  });
  const incoming = score.elements.find(item => item.id === 'carrier-1');
  assert.equal(incoming.handoffFrom, 'subject-1');
  for (const change of [
    item => { item.handoffFrom = 'missing'; },
    item => { item.box.x -= 150; },
  ]) {
    const invalid = structuredClone(score); change(invalid.elements.find(item => item.id === incoming.id));
    assert.throws(() => validateScore(invalid, settings, source), /handoffFrom needs a co-located outgoing subject/);
  }
  const opaque = structuredClone(score);
  opaque.elements.find(item => item.id === 'subject-1').motion.at(-1).opacity = 100;
  assert.throws(() => validateScore(opaque, settings, source), /handoffFrom needs/);
});

test('a travelling copy may become a real destination image only at its shared landing', () => {
  const {score, settings, source} = compile('agency', plan => {plan.beats[1].visual.show.parts[0].assetId = asset.id;});
  const photo = score.elements.find(item => item.id === 'part-icon-1-0');
  assert.equal(photo.handoffFrom, 'copy-1-0');
  assert.equal(score.elements.find(item => item.id === 'part-icon-1-1').handoffFrom, undefined);
  const invalid = structuredClone(score);
  invalid.elements.find(item => item.id === photo.id).handoffFrom = 'copy-1-1';
  assert.throws(() => validateScore(invalid, settings, source), /handoffFrom needs/);
});

test('a source image keeps its informative label beside or below the photograph', () => {
  for (const [width,height] of [[1920,1080],[1080,1920]]) {
    const {score} = compile('forma', plan => {
      plan.beats[2].visual = {scene:'feature',assetId:asset.id,label:'Запись подтверждена',evidenceId:'D1',link:'wipe'};
    }, {width,height});
    const photo = score.elements.find(item => item.id === 'capture-2');
    const copy = score.elements.find(item => item.id === 'capture-label-2');
    assert.equal(copy.text, 'Запись подтверждена');
    assert.equal(copy.attachTo, photo.attachTo);
    assert.ok(width > height ? photo.box.x + photo.box.w < copy.box.x : photo.box.y + photo.box.h < copy.box.y);
  }
});

test('re-export after a failed draft persists the actual recompiled score without a model call', async t => {
  const runsDir = await mkdtemp(path.join(os.tmpdir(), 'kadr-persist-render-'));
  t.after(() => rm(runsDir, {recursive: true, force: true}));
  const story = STORIES.forma;
  let failed = true, rendered;
  const services = {runtime: () => {},
    render: async (score, _source, dir) => { rendered = structuredClone(score); return {video: path.join(dir, 'video.mp4'), issues: []}; },
    inspect: async () => ({ok: !failed, issues: failed ? [{code: 'fixture_failure'}] : []})};
  const first = await generateLaunch({runsDir, runId: 'retry', description: story.source.evidence[0].text, seconds: 16,
    pace: 'calm', visualReview: false, services, requestStage: async () => ({output: {
      ...structuredClone(story.plan), beats: story.plan.beats.map(({frames, ...beat}) => structuredClone(beat)),
    }})});
  assert.equal(first.ok, false);
  const file = path.join(first.dir, 'launch-score.json');
  const old = JSON.parse(await readFile(file, 'utf8'));
  old.elements[0].fill = old.elements[0].fill === 'foreground' ? 'muted' : 'foreground';
  await writeFile(file, JSON.stringify(old));
  failed = false;
  const final = await generateLaunch({runsDir, runId: 'retry', resume: true, renderOnly: true, services,
    requestStage: () => {throw new Error('No model calls for re-export');}});
  assert.equal(final.ok, true);
  assert.deepEqual(JSON.parse(await readFile(path.join(final.dir, final.report.artifacts.score), 'utf8')), rendered);
  assert.ok((await readdir(final.dir)).some(name => name.startsWith('launch-score-before-render-')));
});
