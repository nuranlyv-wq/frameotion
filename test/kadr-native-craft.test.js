import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {checkSchema} from '../src/production/contracts.js';
import {StageSchema,CompiledStageSchema,compileStage,stageIssues} from '../src/kadr-launch/stage-contract.js';
import {stageFrame} from '../src/kadr-launch/stage-player.js';
import {stageSafety,insidePolygon} from '../src/kadr-launch/stage-safety.js';
import {prepareStageTypography} from '../src/kadr-launch/stage-fonts.js';
import {measureStageText} from '../src/kadr-launch/stage-typography.js';
import {createBeatClock,retimeStageToBeats} from '../src/kadr-launch/beat-grid.js';
import {auditStageContinuity} from '../src/kadr-launch/stage-continuity.js';

const assetId='brand-aaaaaaaaaaaaaaaaaaaa',source={brand:{fonts:['Comfortaa','Fira Sans']},assets:[{id:assetId}]};
const node=(id,extra={})=>({id,kind:'group',x:500,y:281.25,w:600,h:240,start:0,end:1,...extra});
const fragment=(id,kind,extra={})=>({id,kind,x:500,y:281.25,w:200,h:60,start:0,end:1,...extra});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} versus ${b}`);

test('native controls dock inside resizing 3D UI and the actual cursor tip hits the target',()=>{
  const raw={nodes:[node('ui',{ry:-12,track:[{t:0,w:700,h:300},{t:1,w:450,h:220}]})],fragments:[fragment('send','control',{parent:'ui',x:0,y:0,label:'Göndər',dock:{x:'right',y:'bottom',insetX:20,insetY:18},clickAt:.6})]};
  assert.deepEqual(checkSchema(StageSchema,raw),[]);const stage=compileStage(raw,4);
  assert.deepEqual(checkSchema(CompiledStageSchema,stage),[]);assert.deepEqual(stageIssues(stage,source),[]);assert.equal(stage.fragments,undefined);
  for(let t=0;t<1;t+=.025){const items=stageFrame(stage,t),ui=items.find(v=>v.node.id==='ui'),button=items.find(v=>v.node.id==='send');assert.ok(button.points.every(p=>insidePolygon(ui.points,p)));}
  const exact=stageFrame(stage,.6),pointer=exact.find(v=>v.node.pointer),button=exact.find(v=>v.node.id==='send'),p=pointer.node.pointer;
  assert.ok(insidePolygon(button.points,pointer.point(p.tipX,p.tipY)));assert.equal(stage.events[0].actor,'send');
  assert.ok(stage.nodes.find(n=>n.id==='send_label').fitToParent);
});
test('a focus jump still highlights the intermediate word while the media travels through its slot',()=>{
  const stage=compileStage({nodes:[],fragments:[fragment('reel','focus-reel',{w:400,h:240,items:['Motion','Podcast','Vox'].map(label=>({assetId,label})),focus:[{t:0,index:0},{t:1,index:2}]})]},4);
  const items=stageFrame(stage,.5),label=items.find(v=>v.node.id==='reel_word1'),belt=items.find(v=>v.node.id==='reel_belt');
  near(label.opacity,1);near(belt.pose.y,-264);assert.equal(items.find(v=>v.node.id==='reel_pic1').node.clipTo,'reel');
});
test('the complete phrase reserves its width when a prefix retires',()=>{
  const stage={nodes:[node('line',{layout:{gap:12,align:'center'}}),node('prefix',{kind:'image',assetId,parent:'line',x:0,y:0,w:200,h:50,anchorX:0,advance:180,end:.6}),node('word',{kind:'image',assetId,parent:'line',x:0,y:0,w:160,h:50,anchorX:0,advance:150})]};
  const a=stageFrame(stage,.5).find(v=>v.node.id==='word'),b=stageFrame(stage,.8).find(v=>v.node.id==='word');near(a.point(0,0).x,b.point(0,0).x);
});
test('font preparation covers Azerbaijani/Cyrillic whole runs and measures mixed baselines',()=>{
  const score={elements:[{id:'type',stage:{nodes:[node('line',{layout:{gap:14,align:'center'}}),node('a',{kind:'text',text:'Əla İşıq',font:'heading',fontSize:48,parent:'line',x:0,y:0,w:300,h:70}),node('b',{kind:'text',text:'Движение',font:'body',fontSize:48,parent:'line',x:0,y:0,w:300,h:70})]}}]};
  const p=prepareStageTypography(score,source);assert.equal(p.audit.checkedRuns,2);assert.deepEqual(p.audit.missingGlyphs,[]);
  const items=stageFrame(p.score.elements[0].stage,.5),a=items.find(v=>v.node.id==='a'),b=items.find(v=>v.node.id==='b');near(a.point(a.pose.anchorX,a.pose.anchorY).y,b.point(b.pose.anchorX,b.pose.anchorY).y);
  assert.ok(p.score.elements[0].stage.nodes.find(n=>n.id==='a').advance>100);
});
test('optical centring uses painted glyph bounds, including descenders',()=>{
  const prepared=prepareStageTypography({elements:[{id:'fonts',stage:{nodes:[node('copy',{kind:'text',text:'Şəffaflıq',font:'comfortaa',fontSize:52})]}}]},source),font=prepared.fonts[0];
  const canvas=createCanvas(500,140),c=canvas.getContext('2d'),layout=measureStageText(c,'Şəffaflıq',{w:500,h:140,size:52,weight:font.weight,family:font.family});
  c.fillStyle='#fff';for(const line of layout.lines)c.fillText(line.text,line.x,line.y);
  const d=c.getImageData(0,0,500,140).data;let top=140,bottom=0,left=500,right=0;
  for(let y=0;y<140;y++)for(let x=0;x<500;x++)if(d[(y*500+x)*4+3]>40){top=Math.min(top,y);bottom=Math.max(bottom,y);left=Math.min(left,x);right=Math.max(right,x);}
  assert.ok(Math.abs((left+right+1)/2-250)<1.5);assert.ok(Math.abs((top+bottom+1)/2-70)<1.5);
});
test('a native control used as a word retains its neighbours’ measured baseline and reserved slot',()=>{
  const raw={nodes:[node('line',{y:350,w:820,h:120,layout:{gap:18,align:'center'}}),node('lead',{kind:'text',parent:'line',text:'Сделай заголовок',font:'body',fontSize:42,x:0,y:0,w:300,h:80,end:.8})],fragments:[fragment('word','control',{parent:'line',x:0,y:0,label:'крупнее',w:220,h:60})]},prepared=prepareStageTypography({elements:[{id:'words',stage:compileStage(raw,4)}]},source),stage=prepared.score.elements[0].stage;
  const items=stageFrame(stage,.6),lead=items.find(n=>n.node.id==='lead'),label=items.find(n=>n.node.id==='word_label'),face=prepared.fonts.find(f=>f.font===label.node.font&&f.weight===label.node.weight),c=createCanvas(8,8).getContext('2d'),layout=measureStageText(c,label.node.text,{w:label.pose.w,h:label.pose.h,size:label.node.fontSize,weight:label.node.weight,family:face.family});
  near(lead.point(lead.pose.anchorX,lead.pose.anchorY).y,label.point(.5,layout.lines[0].y/label.pose.h).y);
  const a=stageFrame(stage,.7).find(n=>n.node.id==='word'),b=stageFrame(stage,.9).find(n=>n.node.id==='word');near(a.point(0,0).x,b.point(0,0).x);
});
test('rotated text is checked as painted polygons rather than colliding AABBs',()=>{
  const a=[{x:0,y:0},{x:10,y:10},{x:8,y:12},{x:-2,y:2}],b=a.map(p=>({...p,y:p.y+8})),items=[{node:{id:'a',kind:'text'},opacity:1,blur:0,points:a},{node:{id:'b',kind:'text'},opacity:1,blur:0,points:b}];
  assert.deepEqual(stageSafety(items,new Map([['a',a],['b',b]])),[]);
  assert.equal(stageSafety(items,new Map([['a',a],['b',a.map(p=>({...p,y:p.y+1}))]]))[0].code,'stage_text_collision');
});
test('a control cannot silently outlive its label, but can retire before morphing into a new object',()=>{
  const graph={nodes:[node('button',{kind:'plane',control:{label:'copy'}}),node('copy',{kind:'text',text:'Send',parent:'button',x:0,y:0,end:.7})]};
  assert.match(stageIssues(graph,source).join(' '),/covering the control window/);graph.nodes[0].control.to=.7;assert.deepEqual(stageIssues(graph,source),[]);
});
test('retiming shares one monotone map across camera, nodes, orbit, contacts and sound',()=>{
  const clock=createBeatClock({beats:[0,.4,.9,1.35,1.8,2.3,2.7,3.1,3.6,4],fps:30,confidence:.7}),input={nodes:[node('actor',{kind:'plane',track:[{t:0,x:0},{t:.5,x:500},{t:1,x:900}],orbit:{radiusX:100,radiusY:100,phase:0,turns:1,tiltX:60},contacts:[{target:'target',from:.5,to:.7}]}),node('target')],events:[{t:.5,kind:'pop',actor:'actor'}],camera:[{t:0,z:0},{t:.5,z:100},{t:1,z:0}]};
  const {stage,map}=retimeStageToBeats(input,{clock,startFrame:0,endFrame:120,landmarks:[{at:.5,beat:3}]});
  near(stage.events[0].t,map(.5));near(stage.camera[1].t,map(.5));near(stage.nodes[0].contacts[0].from,map(.5));
  const a=stageFrame(input,.5).find(n=>n.node.id==='actor'),b=stageFrame(stage,map(.5)).find(n=>n.node.id==='actor');for(let i=0;i<4;i++){near(a.points[i].x,b.points[i].x);near(a.points[i].y,b.points[i].y);}
  assert.throws(()=>createBeatClock({beats:[0,.5],confidence:.1}),/reliable/);
  assert.throws(()=>retimeStageToBeats(input,{clock,startFrame:0,endFrame:120,landmarks:[{at:.3,beat:1.001},{at:.4,beat:1.002}]}),/collapses/);
});
test('declared seam continuity catches position, opacity and optical-material jumps',()=>{
  const plane=node('surface',{kind:'plane',fill:'accent',radius:20,material:'liquid-glass'}),a={id:'before',start:0,end:120,stage:{nodes:[plane]}},b={id:'after',start:120,end:240,stage:{nodes:[structuredClone(plane)],handoffs:[{fromElement:'before',fromNode:'surface',toNode:'surface',content:'preserve'}]}},score={width:1920,height:1080,elements:[a,b]};
  assert.equal(auditStageContinuity(score).ok,true);b.stage.nodes[0].x+=10;assert.equal(auditStageContinuity(score).ok,false);b.stage.nodes[0].x-=10;b.stage.nodes[0].glass={refraction:60};assert.equal(auditStageContinuity(score).ok,false);
});

test('a tilted UI surface paints before its attached control and label on the far side',()=>{
  const stage={nodes:[node('ui',{kind:'plane',ry:18}),node('button',{kind:'plane',parent:'ui',x:220,y:40,w:180,h:60,z:1}),node('label',{kind:'text',text:'Send',parent:'button',x:0,y:0,w:160,h:50,z:0})]},items=stageFrame(stage,.5),at=id=>items.findIndex(v=>v.node.id===id);
  assert.ok(items[at('label')].depth<items[at('ui')].depth,'fixture must exercise the misleading average-depth ordering');
  assert.ok(at('ui')<at('button'));assert.ok(at('button')<at('label'));
});
test('backface-hidden surfaces also hide their attached UI, while independent objects remain visible',()=>{
  const stage={nodes:[node('ui',{kind:'plane',ry:180,backface:'hide'}),node('label',{kind:'text',parent:'ui',text:'Front',x:0,y:0,w:200,h:60}),node('other',{kind:'plane',x:200,y:200})]};
  assert.deepEqual(stageFrame(stage,.5).map(v=>v.node.id),['other']);
});
