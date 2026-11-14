import test from 'node:test';
import assert from 'node:assert/strict';
import {compileLaunch, normalizeSemanticTreatment} from '../src/kadr-launch/compile.js';
import {previewLaunchFrames} from '../src/kadr-launch/render.js';
import {STORIES} from './fixtures/direction-stories.js';

test('the isolated browser player loads its imports and keeps shutter sampling in both paces', {
  skip:process.env.KADR_BROWSER_TESTS !== '1',
}, async () => {
  for (const pace of ['dynamic','superdynamic']) {
    const story = STORIES.forma, settings = {...story.settings,pace};
    const score = compileLaunch(normalizeSemanticTreatment(structuredClone(story.plan),settings,story.source),settings,story.source);
    const frames = [7.25,12.25], options = {scale:.2};
    const defaults = await previewLaunchFrames(score,story.source,frames,options);
    const sampled = await previewLaunchFrames(score,story.source,frames,{...options,blur:6});
    const sharp = await previewLaunchFrames(score,story.source,frames,{...options,blur:1});
    assert.ok(defaults.every(bytes => bytes.subarray(1,4).toString() === 'PNG'));
    assert.deepEqual(defaults,sampled,`${pace}: the default retains the sampled shutter`);
    assert.notDeepEqual(defaults,sharp,`${pace}: moving frames must actually average subframes`);
  }
});

test('subframe averaging retains 8-bit gradient precision on GPU and CPU fallback',{
 skip:process.env.KADR_BROWSER_TESTS!=='1',
},async()=>{
 const {chromium}=await import('playwright');const {CONFIG}=await import('../src/config.js');const {readFile}=await import('node:fs/promises');
 const browser=await chromium.launch({headless:true,executablePath:CONFIG.chromePath});
 try{
  const page=await browser.newPage();await page.setContent('<html></html>');
  const source=await readFile(new URL('../src/kadr-launch/shutter.js',import.meta.url),'utf8');
  await page.addScriptTag({type:'module',content:source+'\nwindow.createTestShutter=createShutter;'});
  await page.waitForFunction(()=>typeof window.createTestShutter==='function');
  for(const cpu of[false,true]){
   const result=await page.evaluate(cpu=>{
    const original=HTMLCanvasElement.prototype.getContext;
    if(cpu)HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl'?null:original.call(this,type,...args);};
    const width=512,input=document.createElement('canvas');input.width=width;input.height=2;
    const c=input.getContext('2d'),gradient=c.createLinearGradient(0,0,width,0);gradient.addColorStop(0,'#dcdcdc');gradient.addColorStop(1,'#fafafa');c.fillStyle=gradient;c.fillRect(0,0,width,2);
    const before=c.getImageData(0,0,width,1).data;
    const shutter=window.createTestShutter(width,2,6);HTMLCanvasElement.prototype.getContext=original;
    for(let i=0;i<6;i++)shutter.sample(input,i);shutter.finish();
    const output=document.createElement('canvas');output.width=width;output.height=2;const out=output.getContext('2d');out.drawImage(shutter.canvas,0,0);
    const after=out.getImageData(0,0,width,1).data;let error=0;const values=new Set();
    for(let i=0;i<before.length;i+=4){error=Math.max(error,Math.abs(before[i]-after[i]));values.add(after[i]);}
    return {error,values:values.size,mode:shutter.mode};
   },cpu);
   assert.ok(result.error<=1,JSON.stringify(result));assert.ok(result.values>=28,JSON.stringify(result));
   assert.equal(result.mode,cpu?'cpu-integer-average':'gpu-float-average');
  }
 }finally{await browser.close();}
});

test('authored projected surfaces pass the actual browser audit in both paces',{
 skip:process.env.KADR_BROWSER_TESTS!=='1',
},async()=>{
 const {stageFixture}=await import('./fixtures/authored-stage.js');const {auditLaunch}=await import('../src/kadr-launch/render.js');
 for(const pace of['dynamic','superdynamic']){
  const {score,source}=stageFixture(pace);const report=await auditLaunch(score,source,{scale:.2});
  assert.equal(report.stageProjection,'webgl');assert.equal(report.shutterMode,'gpu-float-average');
  assert.deepEqual(report.issues,[]);assert.deepEqual(report.composition.issues,[]);assert.deepEqual(report.motionAudit.issues,[]);
 }
});
test('a morph keeps circular capsule ends and audits the actual outer camera transform',{
 skip:process.env.KADR_BROWSER_TESTS!=='1',
},async()=>{
 const {stageFixture}=await import('./fixtures/authored-stage.js');const {auditLaunch}=await import('../src/kadr-launch/render.js');
 const {loadImage,createCanvas}=await import('@napi-rs/canvas');
 const {score,source}=stageFixture('superdynamic');
 score.scenes.forEach(scene=>{scene.ground='background';scene.groundStyle='flat';delete scene.transition;});
 score.elements=[{...score.elements[0],start:0,end:360,stage:{nodes:[{
  id:'capsule',kind:'plane',x:500,y:888.888889,w:600,h:600,start:0,end:1,fill:'accent',radius:60,
  track:[{t:0,w:600,h:600,radius:60},{t:.5,w:600,h:120,radius:60},{t:1,w:600,h:120,radius:60}],
 }]}}];
 score.camera=[{frame:0,x:540,y:960,zoom:100,rotate:0},{frame:360,x:540,y:960,zoom:100,rotate:0}];
 const [png]=await previewLaunchFrames(score,source,[200],{scale:.2,blur:1});
 const img=await loadImage(png),canvas=createCanvas(img.width,img.height),c=canvas.getContext('2d');c.drawImage(img,0,0);
 const rgb=(x,y)=>[...c.getImageData(x,y,1,1).data].slice(0,3),background=rgb(10,10);
 assert.ok(rgb(46,181).every((v,i)=>Math.abs(v-background[i])<3),'corner should be outside the circular capsule end');
 assert.notDeepEqual(rgb(108,192),background,'the centre must still contain the surface');
 delete score.elements[0].space;
 score.camera.forEach(key=>{key.x=0;key.y=0;});
 const report=await auditLaunch(score,source,{scale:.2,blur:1});
 assert.ok(report.composition.issues.some(issue=>issue.code==='composition_crop'),'outer camera crop must be measured where the pixels are painted');
 score.camera.forEach(key=>{key.x=540;key.y=960;});
 score.elements[0].stage.nodes=[{id:'route',kind:'path',x:500,y:888.888889,w:600,h:120,start:0,end:1,
  points:[{x:0,y:60},{x:600,y:60}],ink:'accent',lineWidth:20,
  track:[{t:0,reveal:0},{t:.5,reveal:1},{t:1,reveal:1}]}];
 const sequence=await previewLaunchFrames(score,source,[0,200],{scale:.2,blur:1});
 const jumped=await previewLaunchFrames(score,source,[200],{scale:.2,blur:1});
 assert.deepEqual(sequence[1],jumped[0],'drawing a path from its empty first frame must match seeking directly to its end');
});
