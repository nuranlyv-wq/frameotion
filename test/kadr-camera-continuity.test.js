import test from 'node:test';
import assert from 'node:assert/strict';
import {stageFrame} from '../src/kadr-launch/stage-player.js';
import {framingAudit} from '../src/kadr-launch/framing-audit.js';
import {motionAudit} from '../src/kadr-launch/motion-audit.js';
import {depthAt} from '../src/kadr-launch/stage-depth.js';
const node=(id,kind,x,y,w,h,p={})=>({id,kind,x,y,w,h,start:0,end:1,...p});

test('independent glass below a text plane paints first under a yawed camera, regardless of average depth',()=>{
  const stage={camera:[{t:0,x:200,y:281.25,ry:8},{t:1,x:200,y:281.25,ry:8}],nodes:[node('type','text',200,250,700,130,{text:'İdeya',z:20}),node('glass','plane',360,280,160,240,{z:2,material:'liquid-glass'})]},items=stageFrame(stage,.5),type=items.find(i=>i.node.id==='type'),glass=items.find(i=>i.node.id==='glass');
  assert.ok(glass.depth>type.depth,'the old average-depth painter would cover type');assert.ok(items.indexOf(glass)<items.indexOf(type));
  const centre=glass.point(.5,.5);assert.ok(depthAt(type,centre)>depthAt(glass,centre));
});

test('projected depth ordering retains structural labels and remains finite for crossing planes',()=>{
  const stage={nodes:[node('a','plane',500,281,500,240,{ry:35}),node('b','plane',500,281,500,240,{ry:-35}),node('label','text',0,0,200,60,{parent:'a',z:1,text:'Label'})]},items=stageFrame(stage,.5);
  assert.equal(items.length,3);assert.ok(items.findIndex(i=>i.node.id==='a')<items.findIndex(i=>i.node.id==='label'));
});

test('framing evidence distinguishes a moving subject inside a fixed panel from an open camera move',()=>{
  const audit=framingAudit(),pane=node('panel','plane',500,281,800,400),word=node('word','text',500,250,300,60,{text:'Same project'});
  for(let frame=0;frame<30;frame++){
    const items=stageFrame({nodes:[pane,{...word,x:500+frame}]},.5),text=items.find(i=>i.node.id==='word');audit.sample(frame,'fixed',{x:500,y:281,scale:1},items,new Map([['word',text.points]]),562.5);
  }
  const fixed=audit.report();assert.equal(fixed.framedFraction,1);assert.equal(fixed.camera.motionFraction,0);assert.ok(fixed.advisories.some(a=>a.code==='persistent_enclosure'));
  const open=framingAudit();for(let frame=0;frame<30;frame++){const items=stageFrame({nodes:[{...word,x:500+frame}]},.5);open.sample(frame,'open',{x:500+frame,y:281,scale:1+frame/100},items,new Map([['word',items[0].points]]),562.5);}const result=open.report();assert.equal(result.framedFraction,0);assert.ok(result.camera.motionFraction>.9);assert.ok(result.camera.translationWorld>20);
});

test('readability stitches only geometrically preserved native text and does not demand a new hold for its tail',()=>{
  const make=(id,start,end,handoff)=>({id,start,end,stage:{nodes:[node('word','text',500,281,300,60,{text:'Same idea'})],...(handoff?{handoffs:[{fromElement:'a',fromNode:'word',toNode:'word',content:'preserve'}]}:{})}});
  const score={width:1000,height:562,fps:24,elements:[make('a',0,30),make('b',30,35,true)],scenes:[{id:'a',start:0,end:30},{id:'b',start:30,end:35}]};
  function report(score){const audit=motionAudit(score);for(let f=0;f<35;f++)audit.sample(f,f<30?'a':'b',[{id:(f<30?'a':'b')+'-word',bounds:{left:350,right:650,top:250,bottom:310},readable:true}]);return audit.report();}
  const carried=report(score);assert.deepEqual(carried.issues,[]);assert.equal(carried.readings.length,1);assert.equal(carried.readings[0].continuedActors.length,2);
  const unrelated=structuredClone(score);delete unrelated.elements[1].stage.handoffs;assert.ok(report(unrelated).issues.some(i=>i.target==='b-word'));
  const changed=structuredClone(score);changed.elements[1].stage.nodes[0].x+=100;assert.ok(report(changed).issues.some(i=>i.target==='b-word'));
});
