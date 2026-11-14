import test from 'node:test';
import assert from 'node:assert/strict';
import {compileLaunch, normalizeSemanticTreatment} from '../src/kadr-launch/compile.js';
import {pacingAudit} from '../src/kadr-launch/pacing.js';
import {scoreCues, validateScore} from '../src/kadr-launch/score.js';
import {STORIES} from './fixtures/direction-stories.js';

const sweepPlan = () => structuredClone(STORIES['forma-wipes'].plan);

test('the same wipe band reverses across a local run of new states in all formats', () => {
  for (const [width,height] of [[1920,1080],[1080,1920],[1080,1080]]) {
    const story = STORIES.forma, settings = {...story.settings,width,height,frames:450,pace:'dynamic'};
    const score = compileLaunch(normalizeSemanticTreatment(sweepPlan(),settings,story.source),settings,story.source);
    const passes = score.scenes.slice(1).map(scene => scene.transition);
    assert.deepEqual(passes.map(pass => pass.direction), ['left','right','left']);
    assert.ok(passes.every(pass => pass.frames === 8 && pass.revealFrames === 8 && pass.fill === passes[0].fill));
    assert.deepEqual(scoreCues(score).filter(cue => cue.actor?.startsWith('confirmed') || cue.actor === 'reminder' || cue.actor === 'close').map(cue => cue.kind), ['whoosh','whoosh','whoosh']);
    validateScore(score,settings,story.source);
  }
});

test('an explicit direction starts the return sequence and wipe controls require a wipe', () => {
  const story = STORIES.forma, settings = {...story.settings,frames:450};
  const plan = sweepPlan(); plan.beats[1].visual.wipeDirection = 'right';
  const score = compileLaunch(normalizeSemanticTreatment(plan,settings,story.source),settings,story.source);
  assert.deepEqual(score.scenes.slice(1).map(scene => scene.transition.direction), ['right','left','right']);
  plan.beats[1].visual.link = 'cut';
  assert.throws(() => normalizeSemanticTreatment(plan,settings,story.source), /wipe controls need/);
});

test('timeline pacing limits static reading even with long copy or a legacy requested hold', () => {
  const score = {fps:30,frames:90,scenes:[{id:'a',start:0,end:90}],shapes:[],camera:[],
    elements:[{id:'copy',kind:'text',text:'Запись подтверждена',start:0,end:90,enter:'none',enterFrames:1}]};
  assert.equal(pacingAudit(score).issues[0].code, 'long_reading_hold');
  assert.equal(pacingAudit(score,{beats:[{id:'a',visual:{holdSeconds:3}}]}).issues[0].code, 'long_reading_hold');
  score.elements[0].text = 'Клиент выбирает удобное время и получает напоминание перед своим визитом';
  assert.equal(pacingAudit(score).issues[0].code, 'long_reading_hold', 'long copy must be split rather than extend the pause');
  score.elements[0].text = 'Подтверждено';
  score.elements.push({id:'subject',kind:'icon',start:0,end:90,enter:'none',enterFrames:1,
    motion:[{frame:30,x:0,y:0,scale:100,rotate:0},{frame:65,x:300,y:0,scale:100,rotate:0}]});
  assert.equal(pacingAudit(score).issues.length, 0);
});

test('quick input staging reserves less empty time while preserving the click and confirmation order', () => {
  const story = STORIES.forma, settings = {...story.settings,pace:'dynamic'};
  const slow = structuredClone(story.plan), quick = structuredClone(story.plan);
  quick.beats[1].visual.rhythm = 'quick';
  const a = normalizeSemanticTreatment(slow,settings,story.source), b = normalizeSemanticTreatment(quick,settings,story.source);
  assert.ok(b.beats[1].frames < a.beats[1].frames);
  const score = compileLaunch(b,settings,story.source);
  assert.ok(score.elements.find(item => item.id === 'sent-mark-1').start > score.elements.find(item => item.id === 'cursor-1').clickAt);
});

test('a dynamic close reveals its destination after the message lands and leaves time to read it', () => {
  const story = STORIES.forma, source = {...structuredClone(story.source),url:'https://forma.example/'};
  const compile = pace => {
    const settings = {...story.settings,pace};
    const treatment = normalizeSemanticTreatment(structuredClone(story.plan),settings,source);
    const score = compileLaunch(treatment,settings,source);
    validateScore(score,settings,source);
    return score;
  };
  const dynamic = compile('dynamic'), calm = compile('calm');
  const address = dynamic.elements.find(item => item.id === 'address-3');
  const message = dynamic.elements.find(item => item.id === 'line-3');
  assert.ok(address.start >= message.start + message.enterFrames);
  assert.ok(address.end - address.start - address.enterFrames >= 22);
  const calmAddress = calm.elements.find(item => item.id === 'address-3');
  assert.ok(address.end - address.start - address.enterFrames <= 36);
  assert.ok(calmAddress.end - calmAddress.start - calmAddress.enterFrames <= 36);
  assert.equal(pacingAudit(dynamic).scenes.at(-1).excessive,false);
});
