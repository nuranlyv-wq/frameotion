import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSemanticTreatment,compileLaunch,reviseSceneTreatment} from '../src/kadr-launch/compile.js';
import {validateScore,scoreSamples} from '../src/kadr-launch/score.js';
import {clickIntoShow} from '../src/kadr-launch/show.js';
import {wordHighlightRange} from '../src/kadr-launch/kinetic.js';
import {foldFaces} from '../src/kadr-launch/fold.js';
import {motionAudit,audioTimingAudit} from '../src/kadr-launch/motion-audit.js';
import {STORIES} from './fixtures/direction-stories.js';

function fixture(kind='transform',dimensions={}) {
  const {source,settings:base,plan:original}=STORIES.forma;
  const settings={...base,frames:450,pace:'dynamic',...dimensions};
  const plan=structuredClone(original);
  plan.directions=plan.directions.slice(0,1);
  plan.signatureBeat=plan.beats[0].id;
  const shows={
    transform:{kind,stages:[{label:'Выбор времени',icon:'clock',form:'tile'},{label:'Запись',icon:'doc',form:'box'},{label:'Forma',icon:'check',form:'logo'}],result:'Запись подтверждена'},
    fold:{kind,subject:{label:'Запись',icon:'doc'},whole:{label:'Подтверждение',icon:'check'},direction:'open',material:'paper',result:'Время выбрано'},
    assemble:{kind,parts:[{label:'Клиент',icon:'person'},{label:'Время',icon:'clock'}],whole:{label:'Запись',icon:'check',form:'box'},result:'Подтверждено'},
  };
  plan.beats=plan.beats.slice(0,2).map(({text,...beat},i)=>({...beat,move:'keyframes',visual:{scene:'show',evidenceId:'D1',show:structuredClone(shows[kind]),camera:'locked',...(i&&{link:'match'})}}));
  const treatment=normalizeSemanticTreatment(plan,settings,source);
  return {source,settings,plan,treatment,score:compileLaunch(treatment,settings,source)};
}

test('one direction and two repeated show scenes compile with an optional brand close',()=>{
  const {score,settings,source,treatment}=fixture();
  assert.equal(treatment.directions.length,1);
  assert.equal(score.scenes.length,2);
  assert.equal(score.frames,450);
  assert.equal(score.scenes[1].link.kind,'match');
  assert.doesNotThrow(()=>validateScore(score,settings,source));
  const incoming=score.elements.find(el=>el.id==='token-1');
  assert.equal(incoming.formTrack.keys[0].frame,incoming.start);
});

test('fold and assembly stage in landscape and reflow in portrait',()=>{
  for(const kind of ['fold','assemble']) {
    const wide=fixture(kind),tall=fixture(kind,{width:1080,height:1920});
    assert.doesNotThrow(()=>validateScore(tall.score,tall.settings,tall.source));
    const id=kind==='fold'?'token-0':'part-0-0';
    const a=wide.score.elements.find(el=>el.id===id),b=tall.score.elements.find(el=>el.id===id);
    assert.notEqual(a.box.y/wide.score.height,b.box.y/tall.score.height);
    if(kind==='fold') assert.ok(scoreSamples(tall.score).some(sample=>sample.phase==='panels hinge'));
  }
});

test('panel edges remain hinged and package faces settle into volume',()=>{
  const box={x:100,y:100,w:200,h:200};
  const open=foldFaces(box,0,'paper'),mid=foldFaces(box,.5,'paper'),closed=foldFaces(box,1,'package');
  assert.deepEqual(open[1].points[0],mid[1].points[0]);
  assert.deepEqual(open[1].points[3],mid[1].points[3]);
  assert.ok(open[1].points[1][0]<mid[1].points[1][0]);
  assert.ok(closed.some(face=>face.front));
  assert.ok(closed.every(face=>face.points.flat().every(Number.isFinite)));
});

test('a scene revision keeps other scenes and their allotted time even if the model changes them',()=>{
  const {treatment,settings,source}=fixture('fold');
  const candidate=structuredClone(treatment);
  candidate.beats.forEach(beat=>delete beat.frames);
  candidate.beats[0].visual.show.result='Новое время';
  candidate.beats[0].visual.holdSeconds=1.2;
  candidate.beats[1].visual.show.result='Посторонняя правка';
  const revised=reviseSceneTreatment(treatment,candidate,new Set([treatment.beats[0].id]),settings,source);
  assert.equal(revised.beats[0].visual.show.result,'Новое время');
  assert.deepEqual(revised.beats[1],treatment.beats[1]);
  assert.deepEqual(revised.beats.map(beat=>beat.frames),treatment.beats.map(beat=>beat.frames));
});

test('reading inspection uses actual visible frames and sound inspection uses the recorded sync point',()=>{
  const score={width:1920,height:1080,elements:[{id:'price',text:'0 ₼',start:0,end:90,enterFrames:10}],scenes:[{id:'payoff',start:0,end:90}]};
  const audit=motionAudit(score);
  for(let frame=0;frame<90;frame+=.5) audit.sample(frame,'payoff',frame>=65?[{id:'price',bounds:{left:500,top:500,right:900,bottom:600}}]:[]);
  assert.equal(audit.report().issues.length,0);
  const clipped=motionAudit(score);
  for(let frame=0;frame<90;frame+=.5) clipped.sample(frame,'payoff',[{id:'price',bounds:{left:-20,top:500,right:900,bottom:600}}]);
  assert.equal(clipped.report().issues[0].code,'reading_window');
  const cue={actor:'price',frame:60,start:1.8,syncOffset:.3,trimStart:.1};
  assert.equal(audioTimingAudit([cue],30).length,0);
  assert.equal(audioTimingAudit([{...cue,start:2.1}],30)[0].code,'sound_sync');
});


test('a highlighted phrase matches the words beside punctuation without changing copy',()=>{
  assert.deepEqual(wordHighlightRange('Корм по десяти магазинам?','по десяти магазинам'),{start:1,end:4});
  assert.equal(wordHighlightRange('Корм по десяти магазинам?','по одному магазину'),null);
});


test('an explicit clicked mark and its colour stay authored, while an omitted mark follows the next prop',()=>{
  const click={word:'Корм',shape:'burst',mark:'paw',fill:'accent'};
  const show={kind:'gather',parts:[{label:'Корм',icon:'bean'}]};
  assert.equal(clickIntoShow(click,show,'dive'),click);
  assert.equal(clickIntoShow({word:'Корм',shape:'burst'},show,'dive').mark,'bean');
});
