import test from 'node:test';
import assert from 'node:assert/strict';
import {readingBudget} from '../src/kadr-launch/reading.js';
import {stageWordClick, WORD_CLICK_ENTRY} from '../src/kadr-launch/word-click.js';
import {normalizeSemanticTreatment} from '../src/kadr-launch/compile.js';
import {motionAudit} from '../src/kadr-launch/motion-audit.js';
import {pacingAudit} from '../src/kadr-launch/pacing.js';
import {STORIES} from './fixtures/direction-stories.js';

test('reading budgets and a delayed word click never reserve more than 1.2 seconds', () => {
  const text = 'Это длинная фраза которую надо разделить на несколько коротких содержательных частей';
  for (const fps of [24,30,60]) assert.ok(readingBudget(text,{fps}) / fps <= 1.2);
  assert.equal(readingBudget('Готово'),22);
  const click = stageWordClick({word:'фраза',replace:'мысль'},text,90,390);
  assert.ok(click.at - 90 - WORD_CLICK_ENTRY <= 36,'a long shot must not delay its click for a long reading pause');
});

test('both creation paces reject an authored reading hold above 1.2 seconds', () => {
  const story = STORIES.forma;
  for (const pace of ['calm','dynamic','superdynamic']) {
    const plan = structuredClone(story.plan);
    plan.beats.at(-1).visual.holdSeconds = 1.21;
    assert.throws(() => normalizeSemanticTreatment(plan,{...story.settings,pace},story.source),/holdSeconds.*1.2/);
    plan.beats.at(-1).visual.holdSeconds = 1.2;
    assert.doesNotThrow(() => normalizeSemanticTreatment(plan,{...story.settings,pace},story.source));
  }
});

test('the reading cap does not falsely approve long copy or forbid copy persisting through new action', () => {
  const score = {width:1920,height:1080,fps:30,frames:36,shapes:[],camera:[],
    elements:[{id:'copy',text:'Эту длинную информацию нужно раскрыть по частям сохранив все важные условия',start:0,end:36,enter:'none',enterFrames:0}],
    scenes:[{id:'a',start:0,end:36}]};
  const audit = motionAudit(score);
  for (let frame=0;frame<36;frame+=.5) audit.sample(frame,'a',[{id:'copy',bounds:{left:100,top:100,right:900,bottom:300}}]);
  assert.equal(audit.report().issues[0].code,'reading_window');
  assert.ok(audit.report().readings[0].neededFrames > 36);
  score.frames = score.scenes[0].end = score.elements[0].end = 90;
  assert.equal(pacingAudit(score).issues[0].code,'long_reading_hold');
  score.elements.push({id:'subject',start:0,end:90,enter:'none',enterFrames:0,
    motion:[{frame:0,x:0,y:0,scale:100,rotate:0},{frame:70,x:300,y:0,scale:100,rotate:0}]});
  assert.equal(pacingAudit(score).issues.length,0);
});
