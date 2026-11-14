import test from 'node:test';
import assert from 'node:assert/strict';
import {orbitPose} from '../src/kadr-launch/stage-motion.js';
import {stageFrame} from '../src/kadr-launch/stage-player.js';
import {createStageHandoff} from '../src/kadr-launch/stage-handoff.js';
import {stageIssues,CompiledStageSchema} from '../src/kadr-launch/stage-contract.js';
import {checkSchema} from '../src/production/contracts.js';
import {focusReelTracks} from '../src/kadr-launch/focus-reel.js';
import {stagePose} from '../src/kadr-launch/stage-player.js';

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const node=(id,extra={})=>({id,kind:'image',assetId:'brand-aaaaaaaaaaaaaaaaaaaa',x:500,y:280,w:100,h:80,start:0,end:1,...extra});
test('an inclined ring exchanges front/back depth and closes without a spline shortcut',()=>{
 const actor=node('tool',{orbit:{radiusX:300,radiusY:300,phase:0,turns:1,tiltX:65,tiltZ:-12,depthBlur:5}});
 const base={x:500,y:280,z:0,blur:0},a=orbitPose(actor,base,0),b=orbitPose(actor,base,1);
 for(const key of ['x','y','z'])near(a[key],b[key]);
 const front=orbitPose(actor,base,.25),back=orbitPose(actor,base,.75);
 assert.ok(front.z>250&&back.z< -250);assert.equal(front.blur,0);assert.ok(back.blur>4);
 for(let i=0;i<24;i++){
  const p=orbitPose(actor,base,i/24);near(Math.hypot(p.x-500,p.y-280,p.z),300);
 }
 const frame=t=>stageFrame({nodes:[actor]},t)[0];
 assert.ok(frame(.25).points[1].x-frame(.25).points[0].x>frame(.75).points[1].x-frame(.75).points[0].x);
});
test('baseline anchors align unlike rasters and an inserted run never overlaps its neighbours',()=>{
 const group=node('line',{kind:'group',x:500,y:300,z:100,layout:{gap:12,align:'center'}});delete group.assetId;
 const children=[node('sans',{parent:'line',x:0,y:0,z:0,w:140,h:60,anchorX:0,anchorY:.75,advance:130}),
  node('italic',{parent:'line',x:0,y:0,z:0,w:120,h:84,anchorX:0,anchorY:.8,advance:110,track:[{t:0,layoutWeight:0,opacity:0},{t:.5,layoutWeight:1,opacity:1}]}),
  node('suffix',{parent:'line',x:0,y:0,z:0,w:180,h:60,anchorX:0,anchorY:.75,advance:170})];
 for(const t of [.1,.25,.5,.8]){
  const frame=stageFrame({nodes:[group,...children]},t),find=id=>frame.find(item=>item.node.id===id);
  near(find('sans').point(0,.75).y,find('italic').point(0,.8).y);
  near(find('italic').point(0,.8).y,find('suffix').point(0,.75).y);
  const left=find('sans').point(0,.75).x,right=find('suffix').point(170/180,.75).x;near((left+right)/2,500);
 }
 const final=stageFrame({nodes:[group,...children]},.8),a=final.find(n=>n.node.id==='sans'),b=final.find(n=>n.node.id==='italic');
 assert.ok(b.point(0,.8).x>a.point(130/140,.75).x+11);
});
test('carried images match projected endpoints across different cameras and keep sound inside lifetimes',()=>{
 const from={id:'before',start:0,end:120,stage:{camera:[{t:0,z:100},{t:1,z:100}],nodes:[node('window',{z:150})],events:[]}};
 const to={id:'after',start:120,end:240,stage:{camera:[{t:0,z:-100},{t:1,z:-100}],nodes:[node('card',{x:250,y:120,w:200,h:100,z:-50})],events:[{t:.05,actor:'card',kind:'pop'}]}};
 const before=structuredClone(from),after=structuredClone(to);
 const bridge=createStageHandoff({id:'bridge',from,fromNode:'window',to,toNode:'card',start:100,end:140,width:1920,height:1080});
 const a=stageFrame(before.stage,100/120)[0],b=stageFrame(after.stage,20/120)[0];
 const start=stageFrame(bridge.stage,0).find(n=>n.node.id==='departing'),end=stageFrame(bridge.stage,1-1e-9).find(n=>n.node.id==='arriving');
 for(let i=0;i<4;i++){near(a.points[i].x,start.points[i].x);near(a.points[i].y,start.points[i].y);assert.ok(Math.abs(b.points[i].x-end.points[i].x)<1e-5);assert.ok(Math.abs(b.points[i].y-end.points[i].y)<1e-5);}
 const source={assets:[{id:'brand-aaaaaaaaaaaaaaaaaaaa'}]};
 assert.deepEqual(stageIssues(from.stage,source),[]);assert.deepEqual(stageIssues(to.stage,source),[]);assert.deepEqual(stageIssues(bridge.stage,source),[]);
 for(const stage of [from.stage,to.stage,bridge.stage])assert.deepEqual(checkSchema(CompiledStageSchema,stage),[]);
 assert.equal(to.stage.events[0].t,to.stage.nodes[0].start);
});

test('one focus curve keeps the word list and media ribbon aligned throughout a move',()=>{
 const keys=[{t:0,index:0},{t:.2,index:0},{t:.4,index:1},{t:.55,index:1},{t:.75,index:2},{t:1,index:2}];
 const reel=focusReelTracks(keys,{mediaStep:354,labelStep:72});
 for(let t=0;t<=1;t+=.025){
  const media=stagePose({track:reel.media},t),labels=stagePose({track:reel.labels},t);
  near(media.y/354,labels.y/72);
 }
 for(const index of [0,1,2]){
  const t=[.1,.5,.9][index];near(stagePose({track:reel.media},t).y+index*354,0);
  near(stagePose({track:reel.labels},t).y+index*72,0);
  near(stagePose({track:reel.emphasis(index)},t).opacity,1);
 }
});

test('a moving reel clips to its fixed ancestor viewport and rejects unrelated masks',()=>{
 const nodes=[node('window',{kind:'group',w:540,h:330}),node('belt',{kind:'group',x:0,y:0,parent:'window',track:[{t:0,y:0},{t:1,y:-354}]}),node('panel',{parent:'belt',x:0,y:354,clipTo:'window'})];
 delete nodes[0].assetId;delete nodes[1].assetId;
 const source={assets:[{id:'brand-aaaaaaaaaaaaaaaaaaaa'}]};
 assert.deepEqual(stageIssues({nodes},source),[]);
 const a=stageFrame({nodes},0),b=stageFrame({nodes},.9);
 assert.deepEqual(a.find(n=>n.node.id==='window').points,b.find(n=>n.node.id==='window').points);
 assert.ok(b.find(n=>n.node.id==='panel').point(.5,.5).y<a.find(n=>n.node.id==='panel').point(.5,.5).y);
 nodes[2].clipTo='unrelated';assert.match(stageIssues({nodes},source).join(' '),/ancestor viewport/);
});

test('a button carried from a moving UI uses its inherited camera and parent pose',()=>{
 const from={id:'ide',start:0,end:120,stage:{nodes:[node('ui',{kind:'group',x:450,y:270,z:150,scale:1.12}),node('submit',{parent:'ui',x:280,y:220,z:8,w:218,h:61})]}};delete from.stage.nodes[0].assetId;
 const to={id:'result',start:120,end:240,stage:{nodes:[node('result',{w:250,h:75})]}};
 const before=structuredClone(from),bridge=createStageHandoff({id:'bridge',from,fromNode:'submit',to,toNode:'result',start:100,end:140,width:1920,height:1080});
 const a=stageFrame(before.stage,100/120).find(n=>n.node.id==='submit'),b=stageFrame(bridge.stage,0).find(n=>n.node.id==='departing');
 for(let i=0;i<4;i++){near(a.points[i].x,b.points[i].x);near(a.points[i].y,b.points[i].y);}
});
