import test from 'node:test';
import assert from 'node:assert/strict';
import { actorAt,worldCameraAt,rollAngleAt } from '../src/production/world.js';
import { validateDirectedFilm } from '../src/production/world-stage.js';
import { reviewFrames } from '../src/production/visual-review.js';
const pose={x:500,y:500,w:400,h:200,scale:100,rotate:0,opacity:100,radius:20};
function fixture(){
 const settings={fps:30,width:1920,height:1080,frames:90};
 const film={version:1,...settings,scenes:[{id:'demo',start:0,end:90,focus:'panel',action:'form changes'}],world:{background:'background',nodes:['panel','cursor','frame'].map((id,i)=>({id,kind:'rect',parent:'',pose:{...pose,x:200+i*200},fill:'accent',keys:[{at:50,x:500+i*100,easing:'out-cubic'}]})),camera:[{at:0,x:500,y:500,zoom:100,rotate:0,easing:'linear'},{at:45,x:500,y:500,zoom:180,rotate:0,easing:'out-cubic'}]},audio:{bpm:120,mood:'warm',key:'A',intensity:'medium',cues:[10,30,60].map(frame=>({frame,kind:'click',gain:50}))}};
 return {film,ctx:{settings,narrative:{scenes:[{id:'demo',frames:90,requiredStates:[]}]},interface:{components:[]}}};
}
test('persistent actor sparse keys preserve holds and seek deterministically',()=>{
 const n={pose,fill:'accent',keys:[{at:20,x:500,easing:'linear'},{at:40,x:800,radius:100,easing:'linear'}]};
 assert.equal(actorAt(n,10).x,500);assert.equal(actorAt(n,30).x,650);assert.equal(actorAt(n,40).radius,100);assert.equal(actorAt(n,500).x,800);
 const {film}=fixture();assert.equal(worldCameraAt(film.world,45).zoom,180);
});
test('persistent actors sample fractional positions while explicit stepping holds them',()=>{
 const actor={pose:{...pose,x:0},fill:'accent',keys:[{at:10,x:100,easing:'linear'}]};
 assert.equal(actorAt(actor,3.5).x,35);
 assert.equal(actorAt({...actor,step:2},3.5).x,20);
});
test('rolling has no slip under easing, retains orientation, and can unfold after landing',()=>{
 const n={pose:{...pose,x:0,w:100,h:100,radius:50},fill:'accent',rolls:[{from:10,to:40}],keys:[
  {at:10,x:0,easing:'linear'},{at:40,x:314,easing:'out-cubic'},
  {at:50,w:100,h:100,easing:'linear'},{at:70,w:500,h:220,radius:12,easing:'out-cubic'},
 ]};
 assert.equal(rollAngleAt(n,5),0);
 for(const frame of [39,15,40,25,11,39]){
  const p=actorAt(n,frame);assert.ok(Math.abs(p.rotate*Math.PI/180*50-p.x)<1e-9);
 }
 assert.equal(rollAngleAt(n,90),rollAngleAt(n,40));assert.equal(actorAt(n,70).w,500);
 assert.equal(actorAt(n,70).originX,500);
 const hinged={...n,rolls:[],pose:{...n.pose,originX:0,rotateY:-90},keys:[{at:30,rotateY:0,easing:'linear'}]};
 assert.equal(actorAt(hinged,15).originX,0);assert.equal(actorAt(hinged,15).rotateY,-45);
 const settling=structuredClone(n);settling.keys[1].x=220;settling.rolls[0].settleFrames=12;
 assert.ok(Math.abs(rollAngleAt(settling,40)-220/50*180/Math.PI)<1e-9,'contact rotation is unchanged');
 assert.equal(rollAngleAt(settling,52),360);assert.equal(rollAngleAt(settling,100),360);
 const middle=rollAngleAt(settling,46);assert.ok(middle>rollAngleAt(settling,40)&&middle<360);
 const repeated={...settling,rolls:[{from:10,to:25},{from:25,to:40,settleFrames:12}]};
 assert.equal(rollAngleAt(repeated,52),360,'settling aligns accumulated orientation, including earlier partial turns');
});
test('rolling validation rejects slipping geometry and overlapping intervals',()=>{
 const {film,ctx}=fixture(),n=film.world.nodes[0];
 n.rolls=[{from:0,to:50}];assert.doesNotThrow(()=>validateDirectedFilm(film,ctx));
 n.keys[0].w=600;assert.throws(()=>validateDirectedFilm(film,ctx),/ground height/);delete n.keys[0].w;
 n.rolls.push({from:40,to:60});assert.throws(()=>validateDirectedFilm(film,ctx),/non-overlapping/);
});
test('world contract rejects cycles, timeline overflow, missing assets and camera without shot contrast',()=>{
 const {film,ctx}=fixture();assert.doesNotThrow(()=>validateDirectedFilm(film,ctx));
 const endpoint=structuredClone(film);endpoint.world.nodes[0].keys[0].at=endpoint.frames;assert.doesNotThrow(()=>validateDirectedFilm(endpoint,ctx));
 const cycle=structuredClone(film);cycle.world.nodes[0].parent='cursor';cycle.world.nodes[1].parent='panel';assert.throws(()=>validateDirectedFilm(cycle,ctx),/cycle/);
 const bad=structuredClone(film);bad.world.nodes[0].keys[0].at=200;assert.throws(()=>validateDirectedFilm(bad,ctx),/out-of-range/);
 const flat=structuredClone(film);flat.world.camera[1].zoom=100;assert.throws(()=>validateDirectedFilm(flat,ctx),/shot scales/);
 flat.world.nodes[0].keys[0].w=800;assert.doesNotThrow(()=>validateDirectedFilm(flat,ctx),'object metamorphosis can create shot contrast without forcing a camera zoom');
 const sound=structuredClone(film);sound.audio.cues[0].assetId='missing';assert.throws(()=>validateDirectedFilm(sound,ctx),/unknown asset/);
});
test('visual review includes a brief demonstrated state instead of missing it between fixed samples',()=>{
 const {film}=fixture();film.world.nodes.push({id:'ui',kind:'component',parent:'',pose,fill:'surface',keys:[],states:[{at:0,id:'empty'},{at:31,id:'entered'},{at:40,id:'done'}]});
 const frames=reviewFrames({motion:film});assert.ok(frames.some(f=>f>=31&&f<40));assert.equal(frames[0],0);
});
test('visual review keeps the ending and all story beats when early states fill the sample budget',()=>{
 const {film}=fixture();film.frames=540;film.scenes=Array.from({length:5},(_,i)=>({id:'s'+i,start:i*100,end:i===4?540:(i+1)*100}));
 film.world.demonstrations=Array.from({length:16},(_,i)=>({start:5+i*5,end:9+i*5,actors:['panel']}));
 const frames=reviewFrames({motion:film});assert.ok(frames.includes(539));assert.ok(frames.includes(0));assert.ok(frames.length<=12);
 for(const scene of film.scenes)assert.ok(frames.some(f=>f>=scene.start&&f<scene.end));
});
test('independent actors can demonstrate a required state without a fixed component layout',()=>{
 const {film,ctx}=fixture();ctx.interface.components=[{id:'form',states:[{id:'entered'}]}];ctx.narrative.scenes[0].requiredStates=['entered'];
 film.world.nodes.push({id:'name',kind:'text',parent:'panel',pose,fill:'foreground',text:'Sample name',font:'sans',fontSize:40,align:'left',keys:[]});
 assert.throws(()=>validateDirectedFilm(film,ctx),/required state/);
 film.world.demonstrations=[{componentId:'form',stateId:'entered',start:30,end:60,actors:['panel','name']}];
 assert.doesNotThrow(()=>validateDirectedFilm(film,ctx));
 film.world.demonstrations[0].actors=['panel','cursor'];assert.doesNotThrow(()=>validateDirectedFilm(film,ctx),'a parent actor includes its visible text children');
 const invisible=structuredClone(film);invisible.world.nodes[0].pose.opacity=0;
 assert.throws(()=>validateDirectedFilm(invisible,ctx),/must exist and be visible/);
 assert.ok(reviewFrames({motion:film}).includes(44));
});
