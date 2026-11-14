import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {generateLaunch, validateLaunchRequest} from '../src/kadr-launch/index.js';
import {compileLaunch, normalizeSemanticTreatment, SceneTreatmentSchema} from '../src/kadr-launch/compile.js';
import {launchReviewContext} from '../src/kadr-launch/director.js';
import {superDynamicCapabilities, SUPERDYNAMIC_DIRECTION} from '../src/kadr-launch/superdynamic-direction.js';
import {SHOW_KINDS} from '../src/kadr-launch/show.js';
import {ACTIONS, LINKS} from '../src/kadr-launch/techniques.js';
import {STORIES} from './fixtures/direction-stories.js';

test('the rapid vocabulary covers the native automatic mechanics and respects available materials', () => {
  const {source, settings} = STORIES.forma;
  const before = structuredClone(source);
  const guide = superDynamicCapabilities(source, settings);
  assert.deepEqual(guide.objects.map(item => item.id).sort(), [...SHOW_KINDS].sort());
  assert.deepEqual(guide.textAndInteraction.map(item => item.id), Object.keys(ACTIONS));
  assert.deepEqual(guide.handoffs.map(item => item.id), Object.keys(LINKS));
  for (const tool of guide.objects) {
    assert.equal(tool.binding.visual.scene, 'show');
    assert.equal(tool.binding.visual.show.kind, tool.id);
    assert.ok(tool.propFields.length);
    assert.ok(tool.useWhen.length);
  }
  assert.equal(guide.objects.find(item => item.id === 'gallery').available, false);
  assert.deepEqual(source, before);
  const assets = [{id: 'brand-aaaaaaaaaaaaaaaaaaaa', kind: 'screenshot', evidenceId: 'D1'},
    {id: 'brand-bbbbbbbbbbbbbbbbbbbb', kind: 'logo', role: 'service-logo', service: 'Example', evidenceId: 'D1'}];
  const supplied = superDynamicCapabilities({...source, assets}, settings);
  assert.equal(supplied.objects.find(item => item.id === 'gallery').available, true);
  assert.deepEqual(supplied.materials.assets.map(item => item.id), assets.map(item => item.id));
  assert.match(SUPERDYNAMIC_DIRECTION, /Do not put every technique in every film/);
});

test('ordinary and rapid creation receive their own directing and review rules', async t => {
  const runsDir = await mkdtemp(path.join(os.tmpdir(), 'kadr-super-director-'));
  t.after(() => rm(runsDir, {recursive: true, force: true}));
  const {source, plan} = STORIES.forma;
  for (const pace of [undefined, 'calm', 'superdynamic']) {
    const seen = [];
    const rapid = pace === 'superdynamic';
    const services = {runtime: () => {},
      render: async (_score, _source, dir) => ({video: path.join(dir, 'video.mp4'), issues: []}),
      inspect: async () => ({ok: true, issues: [], motion: {ok: true, issues: []}, media: {duration: '16.000'}})};
    const requestStage = async args => {
      seen.push(args.name);
      if (args.name === 'launch_treatment') {
        assert.equal(args.schema, SceneTreatmentSchema, 'the ordinary authoring schema remains intact');
        assert.equal(args.input.motionCapabilities.mode, rapid ? 'superdynamic' : 'ordinary');
        assert.equal(args.input.motionCapabilities.timing.maximumReading, 1.2);
        assert.equal(args.input.readingPolicy.maximumSeconds, 1.2);
        assert.match(args.prompt, /at most 1.2 seconds for each pause devoted to reading/);
        assert.equal(args.prompt.includes('Superdynamic directing applies only'), rapid);
        assert.equal(args.prompt.includes('Creative freedom for ordinary motion films'), !rapid);
        assert.equal(args.input.settings.pace, pace ?? 'dynamic');
        if (rapid) {
          assert.equal(args.input.timingGuide.maximumAction, .5);
          assert.equal(args.input.motionCapabilities.camera.binding, 'visual.camera');
          assert.match(args.prompt, /trigger/);
          assert.match(args.prompt, /actual object, contour, direction or text/);
        } else {
          assert.equal(args.input.timingGuide.input, pace === 'calm' ? 4.6 : 3.8);
          assert.equal(args.input.timingGuide.hero, 2.4);
          assert.equal(args.input.timingGuide.maximumAction, undefined);
          assert.equal(args.input.motionCapabilities.timing.maximumAction, undefined);
          assert.equal(args.input.motionCapabilities.textAndInteraction.some(item => item.id === 'object-reveal'), false);
        }
        return {output: {...structuredClone(plan), beats: plan.beats.map(({frames, ...beat}) => structuredClone(beat))}};
      }
      assert.equal(args.name, 'launch_review');
      assert.equal(args.prompt.includes('judge the orchestration'), rapid);
      assert.equal(Boolean(args.input.actionTiming), rapid);
      assert.equal(args.prompt.includes('preserve the accepted smooth Lapa language'), !rapid);
      if (rapid) {
        assert.ok(args.input.score.camera.length);
        assert.ok(args.input.score.elements.some(item => item.motion));
        assert.ok(args.input.score.elements.some(item => item.objectReveal));
        assert.doesNotMatch(args.prompt, /Short half-second shots are intentional/);
      }
      return {output: {verdict: 'pass', issues: []}};
    };
    const result = await generateLaunch({runsDir: path.join(runsDir, pace ?? 'default'), runId: pace ?? 'default', description: source.evidence[0].text,
      seconds: 16, ...(pace && {pace}), visualReview: true, services, requestStage});
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.ok(seen.includes('launch_treatment'));
    assert.ok(seen.includes('launch_review'));
  }
  assert.equal(validateLaunchRequest({description: 'Сервис записи'}).pace, 'dynamic');
});

test('rapid review sees real camera, geometry, folds and object-emitted copy', () => {
  const story = STORIES['roastery-transform'];
  const settings = {...story.settings, pace: 'superdynamic', frames: 360};
  const treatment = normalizeSemanticTreatment(structuredClone(story.plan), settings, story.source);
  const score = compileLaunch(treatment, settings, story.source);
  const context = launchReviewContext({source: story.source, score, treatment, pace: settings.pace});
  assert.equal(context.actionTiming.mode, 'actions');
  assert.deepEqual(context.score.camera, score.camera);
  const transform = score.elements.find(item => item.formTrack);
  assert.deepEqual(context.score.elements.find(item => item.id === transform.id).formTrack, transform.formTrack);
  const label = score.elements.find(item => item.objectReveal);
  assert.deepEqual(context.score.elements.find(item => item.id === label.id).objectReveal, label.objectReveal);
  const foldScore = structuredClone(score);
  foldScore.elements[0].fold = {at: 1, frames: 9, direction: 'open', material: 'paper'};
  const folded = launchReviewContext({source: story.source, score: foldScore, treatment, pace: settings.pace});
  assert.deepEqual(folded.score.elements[0].fold, foldScore.elements[0].fold);
  const ordinary = launchReviewContext({source: story.source, score, treatment, pace: 'dynamic'});
  assert.equal(ordinary.actionTiming, undefined);
  assert.equal(ordinary.motionCapabilities, undefined);
});
