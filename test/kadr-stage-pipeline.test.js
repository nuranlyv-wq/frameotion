import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {generateLaunch,validateLaunchRequest} from '../src/kadr-launch/index.js';
import {stageFixture} from './fixtures/authored-stage.js';

test('a saved source supports new authored directing and two targeted repair passes',async t=>{
 const runsDir=await mkdtemp(path.join(os.tmpdir(),'kadr-authored-flow-'));t.after(()=>rm(runsDir,{recursive:true,force:true}));
 const {source,treatment}=stageFixture();await mkdir(path.join(runsDir,'snapshot'));await writeFile(path.join(runsDir,'snapshot/source.json'),JSON.stringify(source));
 let plans=0,reviews=0,inspections=0,imports=0;
 const plan=structuredClone(treatment);plan.beats.forEach(beat=>delete beat.frames);
 const result=await generateLaunch({runsDir,runId:'authored',description:source.evidence[0].text,sourceRun:'snapshot',seconds:12,format:'portrait',outputFps:30,
 services:{runtime:()=>{},importer:()=>{imports++;throw Error('Do not fetch a saved source');},
 render:async(_score,_source,dir,options)=>{assert.equal(options.fps,30);return {video:path.join(dir,'video.mp4'),issues:[]};},
 inspect:async()=>({ok:++inspections>1,issues:inspections===1?[{code:'reading_window',scene:'ask',target:'stage-0-copy'}]:[],motion:{ok:inspections>1},media:{duration:'12.000'}})},
 requestStage:async args=>{
  if(args.name==='launch_treatment'){plans++;assert.ok(args.input.motionCapabilities.composition.authored);assert.equal(args.modelEffort,'high');return {output:structuredClone(plan)};}
  if(args.name==='launch_review'){reviews++;return {output:reviews===1?{verdict:'revise',issues:['[ask] Move the named label clear of its incoming subject.']}:{verdict:'pass',issues:[]}};}
  throw Error(args.name);
 }});
 assert.equal(result.ok,true);assert.equal(imports,0);assert.equal(plans,3);assert.equal(reviews,2);
 assert.equal(result.report.reviewPasses.length,2);assert.equal(result.report.quality.artistic,'sampled_frames_review_passed');
 assert.equal(result.report.sourceSnapshot.runId,'snapshot');
});

test('source snapshots reject paths and output cadence is explicit',()=>{
 const base={description:'Сервис онлайн-записи для клиентов',seconds:12};
 assert.throws(()=>validateLaunchRequest({...base,sourceRun:'../escape'}),/снимок/);
 assert.throws(()=>validateLaunchRequest({...base,outputFps:120}),/30 или 60/);
 assert.equal(validateLaunchRequest({...base,sourceRun:'saved-site',outputFps:30}).outputFps,30);
});
