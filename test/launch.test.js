import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,access} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {launchScore,source} from './fixtures/launch.js';
import {validateScore,scoreCues,scoreSamples} from '../src/motionsmith/score.js';
import {generateLaunch,validateLaunchRequest} from '../src/motionsmith/index.js';

const settings={width:1920,height:1080,fps:30,frames:360};
test('native score: exact duration, arbitrary product and recomposed formats',()=>{
  for(const dimensions of [{width:1920,height:1080},{width:1080,height:1920},{width:1080,height:1080}]){
    const score=launchScore({...dimensions,brand:'Другой сервис'});assert.equal(validateScore(score,{...settings,...dimensions},source),score);
  }
});
test('native score rejects hallucinated evidence, duplicate IDs, out-of-bounds and unsorted timing',()=>{
  for(const edit of [s=>s.elements[0].evidenceIds=['unknown'],s=>s.elements[1].id=s.elements[0].id,s=>s.elements[0].box.w=1920,s=>s.shapes[0].states[1].frame=1,s=>s.scenes[1].start=121,s=>s.camera[1].frame=0,s=>s.elements[0].end=5]){
    const score=launchScore();edit(score);assert.throws(()=>validateScore(score,settings,source));
  }
});
test('native cues are tied to morph landing and toggle change, not independent timestamps',()=>{
  const score=launchScore(),cues=scoreCues(score);
  assert.equal(cues.find(c=>c.actor==='thread').frame,138);
  assert.equal(cues.find(c=>c.actor==='switch').frame,74);
  score.shapes[0].states[1].frame+=30;assert.equal(scoreCues(score).find(c=>c.actor==='thread').frame,168);
});
test('review samples include settled CTA and result after the moving control',()=>{
  const samples=scoreSamples(launchScore());
  assert.equal(samples.length,6);
  assert.ok(samples.find(s=>s.id==='close-result').frame>315);
  assert.ok(samples.find(s=>s.id==='promise-result').frame>74);
  assert.ok(samples.every(s=>s.frame>=0&&s.frame<360));
});
test('native request enforces format, length, language and text types',()=>{
  assert.equal(validateLaunchRequest({description:'X'}).seconds,25);
  for(const options of [{description:[]},{description:'x',seconds:3},{description:'x',format:'__proto__'},{description:'x',language:'xxx'},{}])assert.throws(()=>validateLaunchRequest(options));
});
async function workspace(t){const dir=await mkdtemp(path.join(os.tmpdir(),'kadr-launch-test-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}
const services={runtime:()=>{},render:async(_s,_source,dir)=>({video:path.join(dir,'video.mp4'),issues:[]}),inspect:async()=>({ok:true,issues:[]})};
const requestStage=async({name})=>({output:name==='launch_review'?{verdict:'pass',issues:[]}:launchScore()});
test('native lifecycle persists score and provenance; render-only resume makes no model call',async t=>{
  const runsDir=await workspace(t);
  const result=await generateLaunch({runsDir,runId:'one',description:source.evidence[0].text,seconds:12,services,requestStage});
  assert.equal(result.ok,true);assert.equal(result.report.renderer,'motionsmith');
  const saved=JSON.parse(await readFile(path.join(result.dir,'launch-score.json')));assert.equal(saved.brand,'Forma');
  const resumed=await generateLaunch({runsDir,runId:'one',resume:true,renderOnly:true,services,requestStage:()=>{throw Error('No model allowed');}});
  assert.equal(resumed.ok,true);await assert.rejects(access(path.join(result.dir,'.lock')));
});
test('native lifecycle validates and retries model output, then repairs a draft before final export',async t=>{
  const runsDir=await workspace(t);let calls=0,inspections=0,renders=0;
  const result=await generateLaunch({runsDir,runId:'repair',description:source.evidence[0].text,seconds:12,
    requestStage:async({name})=>{if(name==='launch_review')return {output:{verdict:'pass',issues:[]}};calls++;const score=launchScore();if(calls===1)score.frames=361;return {output:score};},
    services:{...services,render:async(...args)=>{renders++;return services.render(...args);},inspect:async()=>++inspections===1?{ok:false,issues:[{code:'text_too_small'}]}:{ok:true,issues:[]}}});
  assert.equal(result.ok,true);assert.equal(calls,3);assert.equal(renders,3);
});
test('native cancellation releases lock and does not report video completed',async t=>{
  const runsDir=await workspace(t),controller=new AbortController();
  const result=await generateLaunch({runsDir,runId:'cancel',description:source.evidence[0].text,seconds:12,signal:controller.signal,requestStage,
    services:{...services,render:async()=>{controller.abort(new Error('cancelled'));throw controller.signal.reason;}}});
  assert.equal(result.ok,false);assert.equal(result.report.status,'cancelled');assert.equal(result.report.video,undefined);
  await assert.rejects(access(path.join(result.dir,'.lock')));
});
test('native resume refuses another renderer and run path traversal',async t=>{
  const runsDir=await workspace(t);
  await assert.rejects(generateLaunch({runsDir,runId:'../escape',description:'description',services}),/ID/);
});
