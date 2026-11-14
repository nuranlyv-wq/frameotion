// KADR's own data contract. No executable model output enters the renderer.
import { checkSchema } from '../production/contracts.js';
const obj=(properties,optional={})=>({type:'object',properties:{...properties,...optional},required:Object.keys(properties),additionalProperties:false});
const str=(maxLength,minLength=1)=>({type:'string',minLength,maxLength});
const num=(minimum,maximum)=>({type:'integer',minimum,maximum});
const list=(items,minItems,maxItems)=>({type:'array',items,minItems,maxItems});
const choice=(...values)=>({type:'string',enum:values});
const id={type:'string',pattern:'^[a-zA-Z][a-zA-Z0-9_-]{0,47}$'};
const color={type:'string',pattern:'^#[0-9a-fA-F]{6}$'};
export const ROLES=['background','foreground','surface','muted','accent','onAccent'];
const box=obj({x:num(0,1920),y:num(0,1920),w:num(12,1920),h:num(12,1920),radius:num(0,960)});
export const ScoreSchema=obj({
  version:choice(1), style:choice('saas-launch'), concept:str(400),
  brand:str(64), width:num(320,1920),height:num(320,1920),fps:choice(30),frames:num(360,1800),
  palette:obj(Object.fromEntries(ROLES.map(r=>[r,color]))),
  scenes:list(obj({id,start:num(0,1799),end:num(1,1800),purpose:str(200)}),3,12),
  shapes:list(obj({id,states:list(obj({frame:num(0,1799),duration:num(1,60),box,fill:choice(...ROLES)}),2,16)}),1,5),
  elements:list(obj({id,kind:choice('text','rect','pill','icon','toggle','logo'),start:num(0,1799),end:num(1,1800),
    box,fill:choice(...ROLES),enter:choice('hero-rise','word-blur','rise','pop','resolve','none'),enterFrames:num(1,45),
    sound:choice('none','click','pop','whoosh','ding'),evidenceIds:list(str(48),0,8)}, {
    text:str(160,0),fontSize:num(24,240),weight:num(400,800),align:choice('left','center','right'),
    icon:choice('check','arrow','lock','calendar','pause','plus','paw','box','bolt','heart','search'),
    changeAt:num(0,1799),on:{type:'boolean'},
  }),5,90),
  camera:list(obj({frame:num(0,1800),x:num(-1920,3840),y:num(-1920,3840),zoom:num(90,130),rotate:num(-3,3)}),2,30),
});
// Number enums use the same strict integer checker as the other service contracts.
ScoreSchema.properties.version.type='integer';
ScoreSchema.properties.fps.type='integer';
export function validateScore(score,settings,source){
  const issues=checkSchema(ScoreSchema,score);
  if(issues.length)throw new Error(issues.slice(0,16).join('\n'));
  for(const k of ['width','height','fps','frames'])if(score[k]!==settings[k])issues.push(`${k} must be ${settings[k]}`);
  const evidence=new Set(source?.evidence?.map(e=>e.id)||[]),ids=new Set();
  const identify=id=>{if(ids.has(id))issues.push(`Duplicate id ${id}`);ids.add(id);};
  score.scenes.forEach((s,i)=>{
    identify(s.id);
    if(s.start!==(score.scenes[i-1]?.end??0)||s.end<=s.start||s.end-s.start<45)issues.push(`Scene ${s.id}: contiguous scenes need at least 45 frames`);
  });
  if(score.scenes.at(-1).end!==score.frames)issues.push('Scenes must cover the whole film');
  const bounds=(b,name)=>{if(b.x+b.w>score.width||b.y+b.h>score.height)issues.push(`${name}: box outside canvas`);};
  let shared=false;
  for(const shape of score.shapes){
    identify(shape.id);
    if(shape.states[0].frame!==0)issues.push(`${shape.id}: first shape state must be at frame 0`);
    shape.states.forEach((s,i)=>{
      bounds(s.box,shape.id);
      if(i&&(s.frame<=shape.states[i-1].frame||s.frame<shape.states[i-1].frame+shape.states[i-1].duration))issues.push(`${shape.id}: shape changes overlap or are unsorted`);
      if(s.frame+s.duration>=score.frames)issues.push(`${shape.id}: shape does not settle before the end`);
      if(i&&score.scenes.some(sc=>sc.start===s.frame))shared=true;
    });
  }
  if(!shared)issues.push('Carry one shape across a scene boundary with a state at that scene start');
  for(const el of score.elements){
    identify(el.id);bounds(el.box,el.id);
    if(el.end>score.frames||el.end-el.start<el.enterFrames+12)issues.push(`${el.id}: too little time to settle`);
    if(['text','pill'].includes(el.kind)){
      if(!el.text?.trim()||!el.fontSize)issues.push(`${el.id}: text and fontSize required`);
      const words=(el.text||'').trim().split(/\s+/).length;
      if(el.end-el.start-el.enterFrames<Math.max(22,words*6))issues.push(`${el.id}: insufficient reading time`);
    }
    if(el.kind==='icon'&&!el.icon)issues.push(`${el.id}: icon required`);
    if(el.kind==='toggle'&&(el.changeAt===undefined||el.changeAt<el.start+el.enterFrames||el.changeAt+8>el.end))issues.push(`${el.id}: toggle changeAt must occur after entry and before exit`);
    if(source)for(const ref of el.evidenceIds)if(!evidence.has(ref))issues.push(`${el.id}: unknown evidence ${ref}`);
  }
  if(score.camera[0].frame!==0)issues.push('Camera must begin at 0');
  for(let i=0;i<score.camera.length;i++){
    const k=score.camera[i];
    if(k.frame>score.frames||(i&&k.frame<=score.camera[i-1].frame))issues.push('Camera frames must be sorted and inside film');
  }
  if(issues.length)throw new Error(issues.slice(0,20).join('\n'));
  return score;
}

export function scoreCues(score){
  const cues=[];
  for(const shape of score.shapes)for(const s of shape.states.slice(1))cues.push({frame:s.frame+s.duration,kind:'whoosh',gain:38,sync:'peak',actor:shape.id});
  for(const el of score.elements){
    if(el.sound!=='none')cues.push({frame:el.start+Math.round(el.enterFrames*.7),kind:el.sound,gain:el.kind==='text'?18:42,actor:el.id});
    if(el.kind==='toggle')cues.push({frame:el.changeAt+8,kind:'click',gain:48,actor:el.id});
  }
  return cues.filter(c=>c.frame<score.frames).sort((a,b)=>a.frame-b.frame);
}

// Include both an in-progress action and a settled result. A midpoint alone can
// accidentally show a blank button just before its label or a half-switched toggle.
export function scoreSamples(score){
  return score.scenes.flatMap(scene=>{
    const local=score.elements.filter(el=>el.start>=scene.start&&el.start<scene.end);
    const last=Math.max(scene.start,...local.map(el=>Math.max(el.start+el.enterFrames+12,(el.changeAt??0)+14)));
    return [
      {id:scene.id+'-action',scene:scene.id,phase:'action',frame:Math.floor(scene.start+(scene.end-scene.start)*.4)},
      {id:scene.id+'-result',scene:scene.id,phase:'result',frame:Math.min(scene.end-8,Math.max(last,Math.floor(scene.start+(scene.end-scene.start)*.8)))},
    ];
  });
}
