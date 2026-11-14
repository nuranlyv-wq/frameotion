import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {generateProduction} from '../src/production/index.js';
import {finalizeProduction} from '../src/production/finalize.js';
import {motionOutput,motionProducts} from './fixtures/motion-products.js';

test('cinematic path invokes director and visual critic, repairs automatically, retains model provenance',async()=>{
 const runsDir=await mkdtemp(path.join(os.tmpdir(),'kadr-world-test-'));const calls=[];let reviews=0,renders=0;
 try{
  const result=await generateProduction({description:motionProducts.juniper.description,seconds:10,format:'landscape',motionMode:'cinematic',runsDir,
   requestStage:async r=>{
    calls.push(r.name);
    if(r.name==='visual-review')return {output:++reviews===1?{verdict:'revise',summary:'Improve framing',issues:[{frame:30,problem:'Small UI',fix:'Frame the product larger'}]}:{verdict:'pass',summary:'Readable composition',issues:[]}};
    if(r.name==='motion-patch'){
     assert.ok(r.input.film.world,'repair needs the score it is correcting');
     if(calls.filter(n=>n==='motion-patch').length===1)return {output:{}};
     assert.match(r.feedback.join(' '),/Small UI/,'a schema retry must retain the visual critique');
     return {output:{reason:'Improve framing',actors:[{id:'shape0',pose:{y:490}}]}};
    }
    if(r.name!=='motion')return {output:motionOutput(motionProducts.juniper,r.name,r)};
    const {settings,narrative,kit}=r.input;
    const pose={x:500,y:500,w:400,h:500,scale:100,rotate:0,opacity:100,radius:20};
    let end=0;
    return {output:{version:1,...Object.fromEntries(['width','height','fps','frames'].map(k=>[k,settings[k]])),
     scenes:narrative.scenes.map(s=>{const start=end;end+=s.frames;return {id:s.id,start,end,focus:'shape0',action:'Transform product surface'};}),
     world:{background:'background',nodes:[...Array.from({length:3},(_,i)=>({id:'shape'+i,kind:'rect',parent:'',pose,fill:'accent',keys:[{at:60,x:300+i*50,easing:'out-cubic'}]})),
      ...kit.components.map((c,i)=>({id:'ui'+i,kind:'component',parent:'',pose,fill:'surface',componentId:c.id,states:c.states.map((s,j)=>({at:j*40,id:s.id})),keys:[]}))],
      camera:[{at:0,x:500,y:500,zoom:100,rotate:0,easing:'linear'},{at:90,x:500,y:500,zoom:160,rotate:0,easing:'out-cubic'}]},
     audio:{bpm:120,mood:'warm',key:'A',intensity:'medium',cues:[10,60,120].map(frame=>({frame,kind:'click',gain:50}))}}};
   },services:{stills:async()=>{},render:async()=>{renders++;return {video:'test-only.mp4'};},inspect:async()=>({ok:true,issues:[]}),prepareReview:async()=>({frames:[0],images:[]})}});
  assert.equal(result.ok,true,JSON.stringify(result.report.error));assert.equal(renders,3);
  assert.deepEqual(calls,['product','narrative','interface','motion','visual-review','motion-patch','motion-patch','visual-review']);
  assert.equal(result.report.quality.artistic,'sampled_frames_review_passed');
  const proof=JSON.parse(await readFile(path.join(result.dir,'generation-proof.json'),'utf8'));
  assert.equal(proof.exactModelOutput,false);assert.equal(proof.verifiedModelDerivation,true);assert.equal(proof.modelMode,'injected');assert.equal(proof.usesFixedFilmRecipe,false);
  assert.equal(result.report.repairAttempts,1);
  const resumed=await generateProduction({runsDir,runId:result.runId,resume:true,
   requestStage:async r=>{assert.equal(r.name,'visual-review');return {output:{verdict:'revise',summary:'Still small',issues:[{frame:0,problem:'Small UI',fix:'Reframe'}]}};},
   services:{stills:async()=>{},render:async()=>({video:'test-only.mp4'}),inspect:async()=>({ok:true,issues:[]}),prepareReview:async()=>({frames:[0],images:[]})}});
  assert.equal(resumed.report.status,'needs_revision');
  assert.equal(resumed.report.draft,'draft-2/video.mp4');
  assert.equal(resumed.report.video,'video.mp4','technically valid review copy is exported with an honest revision status');
  assert.equal(resumed.report.repairAttempts,1,'resume must not restart the paid repair allowance');
  const polished=await generateProduction({runsDir,runId:result.runId,resume:true,polish:true,
   requestStage:async r=>({output:r.name==='motion-patch'?{reason:'Adjust focal position',actors:[{id:'shape0',pose:{y:480}}]}:{verdict:'pass',summary:'Readable',issues:[]}}),
   services:{stills:async()=>{},render:async()=>({video:'test-only.mp4'}),inspect:async()=>({ok:true,issues:[]}),prepareReview:async()=>({frames:[0],images:[]})}});
  assert.equal(polished.ok,true);
  const patchProof=JSON.parse(await readFile(path.join(result.dir,'generation-proof.json'),'utf8'));
  assert.equal(patchProof.exactModelOutput,false);assert.equal(patchProof.verifiedModelDerivation,true);assert.equal(patchProof.patchChain.length,2);
  const budgetLimited=await generateProduction({runsDir,runId:result.runId,resume:true,
   requestStage:async r=>{assert.equal(r.name,'visual-review');throw Object.assign(new Error('No review budget'),{code:'model_budget'});},
   services:{stills:async()=>{},render:async()=>({video:'test-only.mp4'}),inspect:async()=>({ok:true,issues:[]}),prepareReview:async()=>({frames:[0],images:[]})}});
  assert.equal(budgetLimited.report.status,'needs_review');assert.equal(budgetLimited.report.video,'video.mp4');
  assert.equal(budgetLimited.report.quality.technical,'passed');assert.equal(budgetLimited.report.quality.artistic,'requires_human_review');
  const before=await readFile(path.join(result.dir,'motion-timeline.json'),'utf8'),cost=await readFile(path.join(result.dir,'cost.json'),'utf8');
  const exported=await finalizeProduction({runsDir,runId:result.runId,services:{render:async(_ctx,dir)=>({video:path.join(dir,'video.mp4')}),inspect:async()=>({ok:true,issues:[]})}});
  assert.equal(exported.report.localExport.modelCalls,0);assert.match(exported.report.video,/^exports\/final-/);
  assert.equal(await readFile(path.join(result.dir,'motion-timeline.json'),'utf8'),before);
  assert.equal(await readFile(path.join(result.dir,'cost.json'),'utf8'),cost);
 }finally{await rm(runsDir,{recursive:true,force:true});}
});
