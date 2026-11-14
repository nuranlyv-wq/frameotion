import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraAt, poseAt } from '../src/production/motion.js';
import { STAGES } from '../src/production/stages.js';
import { motionOutput, motionProducts } from './fixtures/motion-products.js';

test('camera follows the semantic object, including its motion, and returns exactly to wide',()=>{
 const scene={bounds:{x:100,y:100,w:800,h:800},effects:[],poses:[{target:'button',at:0,frames:11,x:100,y:50,scale:100,rotation:0,opacity:100,easing:'linear'}],
 camera:[{at:0,frames:11,target:'button',scale:200,rotation:0,easing:'linear'},{at:30,frames:11,target:'canvas',scale:100,rotation:0,easing:'linear'}]};
 const component={elements:[{id:'button',bounds:{x:250,y:250,w:100,h:100}}]};
 assert.deepEqual(poseAt(scene,'button',0),{x:0,y:0,scale:1,rotation:0,opacity:1});
 assert.deepEqual(cameraAt(scene,component,10),{x:440,y:390,scale:2,rotation:0});
 assert.deepEqual(cameraAt(scene,component,40),{x:500,y:500,scale:1,rotation:0});
 assert.deepEqual(cameraAt(scene,component,10),cameraAt(scene,component,10));
});
test('director rejects overlapping camera moves and discontinuous bridge poses',()=>{
 const e=motionProducts.juniper,ctx={settings:{width:1920,height:1080,fps:30,frames:300,creative:true,motionFirst:true},brief:'',source:{evidence:[{id:'D1',source:'user-description',text:e.description}],assets:[],interfaceEvidenceIds:[]}};
 for(const stage of STAGES)ctx[stage.name]=motionOutput(e,stage.name,{input:stage.input(ctx)});
 const scene=ctx.motion.scenes[0];
 scene.camera=[{at:30,frames:30,target:'time-b',scale:210,rotation:0,easing:'in-out-cubic'},{at:95,frames:30,target:'canvas',scale:100,rotation:0,easing:'in-out-cubic'}];
 assert.doesNotThrow(()=>STAGES[3].validate(ctx.motion,ctx));
 scene.camera[1].at=40;assert.throws(()=>STAGES[3].validate(ctx.motion,ctx),/overlap/);
 scene.camera[1].at=95;scene.camera[1].target='missing';assert.throws(()=>STAGES[3].validate(ctx.motion,ctx),/unknown camera target/);
 scene.camera.pop();assert.throws(()=>STAGES[3].validate(ctx.motion,ctx),/reset previous camera/);
});
