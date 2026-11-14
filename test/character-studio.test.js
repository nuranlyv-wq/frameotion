import test from 'node:test';
import assert from 'node:assert/strict';
import {CHARACTER_STYLES,characterStyle} from '../src/character-studio/styles.js';
import {demoScore,validateScore,assignTurn,planCamera,sampleScene} from '../src/character-studio/score.js';
import {analyseAudio,audioLevel} from '../src/character-studio/audio.js';

test('three distinct 2D styles share one score without modifying it',()=>{
  assert.deepEqual(CHARACTER_STYLES.map(s=>s.id),['flat-2d','notion-doodle','minimal-stickman']);
  assert.equal(characterStyle('drawn-2d').id,'notion-doodle');
  assert.equal(characterStyle('geometric-2d').id,'flat-2d');
  assert.equal(characterStyle('cartoon-2d').id,'minimal-stickman');
  assert.equal(new Set(CHARACTER_STYLES.map(s=>s.gesture)).size,3);
  assert.throws(()=>characterStyle('unknown'));
  const score=demoScore(),copy=structuredClone(score);
  for(const style of CHARACTER_STYLES){characterStyle(style.id);sampleScene(score,2,{demonstration:true});}
  assert.deepEqual(score,copy);
});
test('speaker reassignment splits the old interval and keeps unaffected speech',()=>{
  const score={...demoScore(),duration:12,turns:[{speaker:'anna',start:0,end:12}]};
  const next=assignTurn(score,{speaker:'mira',start:3,end:7});
  assert.deepEqual(next.turns,[{speaker:'anna',start:0,end:3},{speaker:'mira',start:3,end:7},{speaker:'anna',start:7,end:12}]);
  assert.equal(score.turns.length,1);
  assert.throws(()=>assignTurn(score,{speaker:'lev',start:11,end:13}));
  assert.throws(()=>assignTurn(score,{speaker:'unknown',start:1,end:2}));
});
test('turn intervals are half-open and listeners never articulate',()=>{
  const score={...demoScore(),duration:6,turns:[{speaker:'anna',start:0,end:3},{speaker:'lev',start:3,end:6}]};
  assert.equal(sampleScene(score,3,{level:.8}).characters.find(p=>p.id==='anna').speaking,false);
  const state=sampleScene(score,4,{level:.8});
  assert.ok(state.characters.find(p=>p.id==='lev').mouth>.5);
  assert.ok(state.characters.filter(p=>p.id!=='lev').every(p=>p.mouth===0));
  assert.ok(sampleScene(score,4,{level:0}).characters.every(p=>p.mouth===0));
  assert.throws(()=>sampleScene(score,NaN));
});
test('explicit overlapping turns animate both speakers and use a wide shot',()=>{
  const score={...demoScore(),duration:9,turns:[{speaker:'anna',start:0,end:9},{speaker:'lev',start:3,end:7}]};
  assert.equal(sampleScene(score,5,{level:.8}).characters.filter(p=>p.mouth>.1).length,2);
  assert.equal(planCamera(score).find(s=>s.at===3)?.kind,'wide');
});
test('absolute scene time reproduces character and camera poses after arbitrary seeks',()=>{
  const score=demoScore(),expected=sampleScene(score,5.7,{demonstration:true});
  for(const t of [17,0,8,.4])sampleScene(score,t,{demonstration:true});
  assert.deepEqual(sampleScene(score,5.7,{demonstration:true}),expected);
  for(let t=0;t<score.duration;t+=.1){const {camera}=sampleScene(score,t);assert.ok(Object.values(camera).every(Number.isFinite));}
});
test('single-speaker audio can move from an establishing shot to its speaker',()=>{
  const score={...demoScore(),duration:12,turns:[{speaker:'anna',start:0,end:12}]};
  assert.ok(planCamera(score).some(s=>s.subject==='anna'));
});
test('invalid participants and intervals are rejected',()=>{
  assert.throws(()=>validateScore({...demoScore(),duration:0}));
  assert.throws(()=>validateScore({...demoScore(),cast:[]}));
  assert.throws(()=>validateScore({...demoScore(),cast:[demoScore().cast[0],demoScore().cast[0]]}));
  assert.throws(()=>validateScore({...demoScore(),turns:[{speaker:'anna',start:3,end:2}]}));
});
test('opposite-phase stereo is measured without cancellation and silence closes the mouth',()=>{
  const first=Float32Array.from({length:1000},(_,i)=>i<500?Math.sin(i*.8)*.3:0);
  const second=Float32Array.from(first,v=>-v);
  const analysis=analyseAudio([first,second],1000,.02);
  assert.ok(audioLevel(analysis,.2)>.5);
  assert.equal(audioLevel(analysis,.8),0);
  assert.equal(audioLevel(analysis,-1),0);assert.equal(audioLevel(analysis,1),0);
  assert.equal(analysis.duration,1);
});
test('empty and silent audio are finite; invalid channel layouts fail clearly',()=>{
  assert.deepEqual(analyseAudio([new Float32Array(0)],1000).levels,[]);
  const silence=analyseAudio([new Float32Array(1000)],1000);
  assert.ok(silence.levels.every(v=>v===0));
  assert.throws(()=>analyseAudio([],1000));assert.throws(()=>analyseAudio([new Float32Array(1)],0));
  assert.throws(()=>analyseAudio([new Float32Array(1),new Float32Array(2)],1000));
});
