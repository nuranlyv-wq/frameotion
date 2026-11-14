import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {auditLaunch,inspectLaunchGeometry} from '../src/kadr-launch/render.js';
import {auditStageContinuity} from '../src/kadr-launch/stage-continuity.js';
import {insidePolygon} from '../src/kadr-launch/stage-safety.js';
import {nativeCraftBrowserFixture} from './fixtures/native-craft-browser.js';
import {loadImage,createCanvas} from '@napi-rs/canvas';

test('loaded browser fonts, resizing buttons and causal scene seams agree in every format',{skip:process.env.KADR_BROWSER_TESTS!=='1',timeout:120000},async()=>{
  const reports=[];
  for(const language of ['az','en','ru'])for(const [width,height]of [[1920,1080],[1080,1920],[1080,1080]]){
    const {score,source}=nativeCraftBrowserFixture(width,height,language),seams=auditStageContinuity(score);assert.equal(seams.ok,true,JSON.stringify(seams));
    const report=await auditLaunch(score,source,{scale:.3,blur:1,fps:30});
    assert.deepEqual(report.issues,[],JSON.stringify(report.issues));assert.deepEqual(report.composition.issues,[],JSON.stringify(report.composition.issues));
    assert.equal(report.fontAudit.geometryPass,'loaded-browser-canvas');
    const samples=await inspectLaunchGeometry(score,source,[0,72,144,153,179.999,180,240,359],{scale:.5,blur:1,fps:30});let maxBaselineError=0,maxLabelCenterError=0;
    for(const sample of samples){
      const nodes=sample.stages[0].nodes,byId=new Map(nodes.map(n=>[n.id,n])),prefix=byId.get('prefix'),inline=byId.get('inline_label');
      if(prefix&&inline){const error=Math.abs(prefix.baselines[0].y-inline.baselines[0].y);maxBaselineError=Math.max(maxBaselineError,error);assert.ok(error<.01,JSON.stringify({frame:sample.frame,error,prefix:prefix.baselines,inline:inline.baselines}));}
      const send=byId.get('send'),label=byId.get(sample.frame<180?'send_label':sample.frame<216?'oldLabel':'resultLabel');
      if(send&&label&&label.opacity>.2){const a=send.center,b=label.inkCenter,error=Math.hypot(a.x-b.x,a.y-b.y);maxLabelCenterError=Math.max(maxLabelCenterError,error);assert.ok(error<.01,JSON.stringify({frame:sample.frame,error}));assert.ok(label.inkPoints.every(p=>insidePolygon(send.points,p)));}
      const pointer=nodes.find(n=>n.pointer);if(sample.frame===153)assert.ok(insidePolygon(send.points,pointer.pointerTip));
    }
    const before=samples.find(s=>s.frame===179.999).stages[0].nodes,after=samples.find(s=>s.frame===180).stages[0].nodes;
    assert.deepEqual(samples.find(s=>s.frame===179.999).png,samples.find(s=>s.frame===180).png,'The complete held UI must not flash or jump at the scene seam');
    for(const [a,b]of [['ui','receipt'],['send','send']]){const A=before.find(n=>n.id===a),B=after.find(n=>n.id===b);for(let i=0;i<4;i++)assert.ok(Math.hypot(A.points[i].x-B.points[i].x,A.points[i].y-B.points[i].y)<.01);}
    const record={language,width,height,frames:360,issues:report.issues,composition:report.composition.issues,seams,seamPixelsIdentical:true,maxBaselineError,maxLabelCenterError,fontAudit:report.fontAudit};reports.push(record);
    if(process.env.FRAMEOTION_TEST_ARTIFACTS){const dir=path.join(process.env.FRAMEOTION_TEST_ARTIFACTS,language,`${width}x${height}`);await mkdir(dir,{recursive:true});for(const sample of samples){await writeFile(path.join(dir,`frame-${sample.frame}.png`),sample.png);}await writeFile(path.join(dir,'geometry.json'),JSON.stringify(samples.map(({png,...s})=>s),null,2));await writeFile(path.join(dir,'audit.json'),JSON.stringify(record,null,2));}
  }
  if(process.env.FRAMEOTION_TEST_ARTIFACTS)await writeFile(path.join(process.env.FRAMEOTION_TEST_ARTIFACTS,'native-browser-report.json'),JSON.stringify(reports,null,2));
});

test('liquid glass refracts painted graphics while its native text stays sharp',{skip:process.env.KADR_BROWSER_TESTS!=='1',timeout:60000},async()=>{
  const {score,source}=nativeCraftBrowserFixture(),nodes=[];
  for(let i=0;i<6;i++)nodes.push({id:'stripe'+i,kind:'plane',x:240+i*100,y:281.25,w:55,h:420,start:0,end:1,z:-30,fill:i%2?'muted':'accent',radius:10});
  nodes.push({id:'lens',kind:'plane',x:500,y:281.25,w:620,h:250,start:0,end:1,z:10,fill:'background',material:'liquid-glass',radius:50,glass:{blur:3,refraction:36,dispersion:1,tint:.08,edge:32,shine:.35},track:[{t:0,glassStrength:0},{t:.5,glassStrength:1},{t:1,glassStrength:0}]},
    {id:'glassLabel',kind:'text',parent:'lens',x:0,y:0,w:500,h:80,z:0,start:0,end:1,text:'Şəffaflıq',font:'body',weight:500,fontSize:64,ink:'foreground'});
  score.elements=[{...score.elements[0],end:360,stage:{nodes}}];
  const report=await auditLaunch(score,source,{scale:.3,blur:1,fps:30});assert.equal(report.glassMode,'webgl-refraction');assert.deepEqual(report.issues,[]);
  const samples=await inspectLaunchGeometry(score,source,[0,180],{scale:.5,blur:1,fps:30}),pixels=[];
  for(const s of samples){const im=await loadImage(s.png),cv=createCanvas(im.width,im.height),c=cv.getContext('2d');c.drawImage(im,0,0);pixels.push({width:im.width,height:im.height,data:c.getImageData(0,0,im.width,im.height).data});}
  const label=samples[0].stages[0].nodes.find(n=>n.id==='glassLabel'),scale=pixels[0].width/1000,left=Math.floor(Math.min(...label.inkPoints.map(p=>p.x))*scale),right=Math.ceil(Math.max(...label.inkPoints.map(p=>p.x))*scale),top=Math.floor(Math.min(...label.inkPoints.map(p=>p.y))*scale),bottom=Math.ceil(Math.max(...label.inkPoints.map(p=>p.y))*scale);
  let changed=0,whiteUnion=0,whiteIntersection=0;const [a,b]=pixels;
  for(let y=0;y<a.height;y++)for(let x=0;x<a.width;x++){
    const i=(y*a.width+x)*4;if(Math.max(...[0,1,2].map(k=>Math.abs(a.data[i+k]-b.data[i+k])))>8)changed++;
    if(x<left||x>right||y<top||y>bottom)continue;
    const A=[0,1,2].every(k=>a.data[i+k]>=235),B=[0,1,2].every(k=>b.data[i+k]>=235);if(A||B)whiteUnion++;if(A&&B)whiteIntersection++;
  }
  assert.ok(changed>1000,`No visible refraction: ${changed} changed pixels`);assert.ok(whiteUnion>200);assert.ok(whiteIntersection/whiteUnion>.98,`Glyph edges changed with glass: ${whiteIntersection}/${whiteUnion}`);
  if(process.env.FRAMEOTION_TEST_ARTIFACTS){const dir=path.join(process.env.FRAMEOTION_TEST_ARTIFACTS,'glass');await mkdir(dir,{recursive:true});for(const s of samples)await writeFile(path.join(dir,`strength-${s.frame===0?0:1}.png`),s.png);await writeFile(path.join(dir,'audit.json'),JSON.stringify({changedPixels:changed,glyphCoreStability:whiteIntersection/whiteUnion,glassMode:report.glassMode,issues:report.issues},null,2));}
});
