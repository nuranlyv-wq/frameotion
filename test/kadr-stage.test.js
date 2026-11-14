import test from 'node:test';
import assert from 'node:assert/strict';
import {compileLaunch,normalizeSemanticTreatment} from '../src/kadr-launch/compile.js';
import {validateScore,scoreCues,scoreSamples} from '../src/kadr-launch/score.js';
import {compileStage,stageActionSpans,stageIssues} from '../src/kadr-launch/stage-contract.js';
import {stageFrame,stagePose} from '../src/kadr-launch/stage-player.js';
import {auditSuperDynamic} from '../src/kadr-launch/super-dynamic.js';
import {imageAssetIds} from '../src/kadr-launch/media.js';
import {stageFixture} from './fixtures/authored-stage.js';

test('authored compositions compile through the ordinary and rapid pipeline without losing geometry',()=>{
 const normal=stageFixture(),rapid=stageFixture('superdynamic');
 for(const fixture of [normal,rapid]){
  validateScore(fixture.score,fixture.settings,fixture.source);
  assert.equal(fixture.score.elements.filter(el=>el.stage).length,3);
  assert.equal(fixture.score.palette.accent,fixture.source.brand.interfacePalette.accent);
  assert.ok(scoreSamples(fixture.score,{includeTransitions:true}).some(sample=>sample.phase==='authored motion'));
  assert.ok(scoreCues(fixture.score).some(cue=>cue.actor==='stage-0-panel'));
 }
 assert.equal(auditSuperDynamic(rapid.score).ok,true);
 assert.ok(stageActionSpans(normal.stage).some(span=>(span.to-span.from)*4>.5));
 assert.ok(stageActionSpans(rapid.score.elements[0].stage).every(span=>(span.to-span.from)*4<=.50001));
 assert.equal(normal.score.frames,rapid.score.frames);
});
test('perspective, parent rotations and camera tracks change actual projected corners',()=>{
 const {stage}=stageFixture();
 const frame=stageFrame(stage,.3,1777.78),panel=frame.find(item=>item.node.id==='panel'),copy=frame.find(item=>item.node.id==='copy');
 assert.ok(Math.abs(panel.points[0].y-panel.points[1].y)>.01);
 assert.ok(copy.points[0].x>panel.points[0].x&&copy.points[2].x<panel.points[2].x);
 const pushed=structuredClone(stage);pushed.camera=[{t:0,z:0},{t:1,z:450}];
 const a=stageFrame(stage,.3,1777.78).find(item=>item.node.id==='panel');
 const b=stageFrame(pushed,.3,1777.78).find(item=>item.node.id==='panel');
 assert.ok(b.points[1].x-b.points[0].x>a.points[1].x-a.points[0].x);
 const pose=stagePose(stage.nodes[0],.7);assert.ok(pose.rx<15&&pose.rx>-15);
});
test('a hinge keeps its edge fixed and matte faces respond to their orientation',()=>{
 const face={id:'lid',kind:'plane',material:'matte',x:500,y:800,w:400,h:200,start:0,end:1,pivotY:1,
   track:[{t:0,rx:0},{t:1,rx:75}]};
 const a=stageFrame({nodes:[face]},0,1777.78)[0],b=stageFrame({nodes:[face]},.9,1777.78)[0];
 assert.deepEqual(a.points[3],b.points[3]);assert.deepEqual(a.points[2],b.points[2]);
 assert.notEqual(a.points[0].y,b.points[0].y);assert.notEqual(a.light,b.light);
 const back={...face,pivotY:.5,backface:'hide',track:[{t:0,ry:180},{t:1,ry:180}]};
 assert.equal(stageFrame({nodes:[back]},.5,1777.78).length,0);
 assert.equal(stageFrame({nodes:[{...back,backface:'show'}]},.5,1777.78).length,1);
});
test('stage contracts reject unsafe references, cycles and out-of-order keys',()=>{
 const {stage,source}=stageFixture();
 const bad=structuredClone(stage);bad.nodes[0].parent='copy';bad.nodes[1].assetId='brand-aaaaaaaaaaaaaaaaaaaa';
 bad.nodes[0].track[1].t=0;
 const issues=stageIssues(bad,source).join(' ');
 assert.match(issues,/cyclic parent/);assert.match(issues,/image outside source/);assert.match(issues,/times must increase/);
 const good=structuredClone(stage);good.nodes.push({id:'photo',kind:'image',assetId:'brand-aaaaaaaaaaaaaaaaaaaa',x:500,y:500,w:200,h:200,start:0,end:1});
 assert.deepEqual(imageAssetIds({elements:[{stage:good}]}),['brand-aaaaaaaaaaaaaaaaaaaa']);
});
test('rapid retiming preserves event order and remaps the sound to its real landing',()=>{
 const {stage}=stageFixture();const rapid=compileStage(stage,4,true);
 assert.equal(rapid.events[0].t,.075);
 assert.equal(rapid.nodes[0].track[1].t,rapid.events[0].t);
 assert.equal(rapid.nodes[1].start,stage.nodes[1].start);
});

test('authored backgrounds can grow behind content while foreground occlusion stays checked',async()=>{
 const {compositionAudit}=await import('../src/kadr-launch/composition.js');
 const bounds=(x,y,w,h)=>({left:x,top:y,right:x+w,bottom:y+h,points:[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}]});
 const surface={id:'field',background:true,underlay:true,bounds:bounds(200,200,300,100)};
 const text={id:'copy',content:true,bounds:bounds(180,225,200,50)};
 const below=compositionAudit(1000,1000);below.sample(0,'a',[surface,text]);assert.equal(below.report().issues.length,0);
 const above=compositionAudit(1000,1000);above.sample(0,'a',[text,surface]);assert.equal(above.report().issues[0].code,'composition_overlap');
 const photo=compositionAudit(1000,1000);photo.sample(0,'a',[{...surface,background:false,underlay:false,content:true},text]);assert.equal(photo.report().issues[0].code,'composition_overlap');
});

test('product matte removal preserves enclosed white artwork and ignores a non-neutral border',async()=>{
 const {productSubject}=await import('../src/kadr-launch/product-subject.js');
 const size=20,data=new Uint8ClampedArray(size*size*4).fill(255);
 for(let y=5;y<15;y++)for(let x=5;x<15;x++){const i=(y*size+x)*4;data[i]=30;data[i+1]=70;data[i+2]=100;}
 const white=(10*size+10)*4;data[white]=data[white+1]=data[white+2]=255;
 const result=productSubject(data,size,size);assert.deepEqual(result.bounds,{x:5,y:5,w:10,h:10});assert.equal(result.data[white+3],255);assert.equal(result.data[3],0);assert.equal(data[3],255);
 const coloured=new Uint8ClampedArray(data);for(let i=0;i<coloured.length;i+=4)coloured[i+1]=100;
 assert.equal(productSubject(coloured,size,size),null);
});

test('scene graph contacts are bounded and group masks have a projected plane',()=>{
 const {stage,source}=stageFixture();
 stage.nodes[0].contacts=[{target:'copy',from:.2,to:.3}];assert.deepEqual(stageIssues(stage,source),[]);
 stage.nodes[0].contacts[0].to=1.1;assert.match(stageIssues(stage,source).join(' '),/contact needs/);
 stage.nodes[0].kind='group';delete stage.nodes[0].contacts;
 const frame=stageFrame(stage,.3,1777.78);assert.equal(frame.find(item=>item.node.id==='panel').points.length,4);
});

test('a short authored idle tail uses a bounded handoff without rewriting the scene graph',async()=>{
 const {fitStagePauses}=await import('../src/kadr-launch/stage-pacing.js');
 const {pacingAudit}=await import('../src/kadr-launch/pacing.js');
 const {score}=stageFixture('superdynamic');
 delete score.scenes[1].transition;score.scenes[1].link={kind:'cut',why:'Fixture source cut'};
 score.elements[0].stage={nodes:[
  {id:'label',kind:'text',text:'Готово',x:500,y:400,w:500,h:100,start:0,end:1},
  {id:'subject',kind:'plane',x:500,y:800,w:300,h:300,start:0,end:1,
   track:[{t:0,x:300},{t:.55,x:300},{t:.625,x:500},{t:1,x:500}]},
 ]};
 const fitted=fitStagePauses(score);
 assert.deepEqual(fitted.elements,score.elements);
 assert.equal(fitted.frames,score.frames);assert.deepEqual(fitted.scenes.map(s=>[s.start,s.end]),score.scenes.map(s=>[s.start,s.end]));
 assert.equal(fitted.scenes[1].transition.kind,'wipe');assert.equal(fitted.scenes[1].link.asked,'cut');
 assert.ok(fitted.scenes[1].transition.frames+fitted.scenes[1].transition.revealFrames<=15);
 assert.equal(auditSuperDynamic(fitted).ok,true);
 assert.ok(pacingAudit(fitted).scenes[0].readingHoldSeconds<=1.2);
});
