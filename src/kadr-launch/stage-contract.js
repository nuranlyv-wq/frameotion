// Declarative scene graph: authored data, never executable model code.
import {StageFragmentSchema,StageDockSchema,StageFontSchema,expandStageFragments} from './stage-fragments.js';
const n=(minimum,maximum)=>({type:'number',minimum,maximum});
const s=maxLength=>({type:'string',minLength:1,maxLength});
const e=(...values)=>({type:'string',enum:values});
const id={type:'string',pattern:'^[a-zA-Z][a-zA-Z0-9_-]{0,23}$'};
const obj=(properties,optional={})=>({type:'object',properties:{...properties,...optional},required:Object.keys(properties),additionalProperties:false});
const arr=(items,minItems,maxItems)=>({type:'array',items,minItems,maxItems});
export const STAGE_ROLES=['background','foreground','surface','muted','accent','onAccent'];
export const STAGE_FIELDS=['x','y','z','rx','ry','rz','scale','opacity','blur','w','h','radius','reveal','value','layoutWeight','glassStrength'];
export const StageKeySchema=obj({t:n(0,1)}, {
  x:n(-4000,5000),y:n(-4000,6000),z:n(-2500,1200),rx:n(-180,180),ry:n(-180,180),rz:n(-720,720),
  scale:n(.01,8),opacity:n(0,1),blur:n(0,60),w:n(1,4000),h:n(1,4000),radius:n(0,500),reveal:n(0,1),value:n(-100000,100000),
  layoutWeight:n(0,1),
  glassStrength:n(0,2),
  ease:e('linear','smooth','spring','glide','expo','fluid'),
});
export const StageSchema=obj({nodes:arr(obj({id,kind:e('group','text','image','logo','plane','icon','glow','path','counter'),
  x:n(-2000,3000),y:n(-2000,4000),w:n(1,3000),h:n(1,3000),start:n(0,1),end:n(0,1)}, {
    parent:id,clipToParent:{type:'boolean'},clipTo:id,text:s(100),assetId:{type:'string',pattern:'^brand-[a-f0-9]{20}$'},
    anchorX:n(0,1),anchorY:n(0,1),advance:n(0,3000),layoutWeight:n(0,1),
    role:e('content','background','decoration'),
    revealDirection:e('left','right','up','down'),
    inkBox:obj({x:n(0,3000),y:n(0,3000),w:n(0,3000),h:n(0,3000)}),
    layout:obj({gap:n(0,200),align:e('left','center','right')},{reserve:e('group','active')}),
    dock:StageDockSchema,
    fitToParent:obj({x:n(0,400),y:n(0,400)}),
    font:StageFontSchema,textMode:e('box','baseline'),
    control:obj({label:id},{padding:n(0,100),from:n(0,1),to:n(0,1)}),
    pointer:obj({target:id,tipX:n(0,1),tipY:n(0,1)}),
    focus:obj({target:id,index:n(0,7)},{dim:n(0,1)}),
    orbit:obj({radiusX:n(1,1500),radiusY:n(1,1500),phase:n(-720,720),turns:n(-8,8)}, {
      tiltX:n(-180,180),tiltY:n(-180,180),tiltZ:n(-180,180),depthBlur:n(0,16),
      timing:arr(obj({t:n(0,1),progress:n(0,1)}),2,64),
    }),
    contacts:arr(obj({target:id,from:n(0,1),to:n(0,1)}),1,4),
    icon:e('paw','check','arrow','lock','calendar','pause','box','heart','cart','clock','cursor'),crop:e('allow','contain'),
    material:e('solid','glass','liquid-glass','phone','none','matte'),fill:e(...STAGE_ROLES),ink:e(...STAGE_ROLES),radius:n(0,500),
    glassStrength:n(0,2),glass:obj({}, {blur:n(0,24),refraction:n(0,80),dispersion:n(0,5),tint:n(0,.5),edge:n(2,100),shine:n(0,1)}),
    pivotX:n(0,1),pivotY:n(0,1),backface:e('show','hide'),
    fontSize:n(16,240),weight:n(400,800),fit:e('contain','cover'),suffix:s(8),lineWidth:n(.5,30),
    points:arr(obj({x:n(-2000,3000),y:n(-2000,4000)}),2,24),
    track:arr(StageKeySchema,2,64),
    ...Object.fromEntries(['z','rx','ry','rz','scale','opacity','blur','reveal','value'].map(field=>[field,StageKeySchema.properties[field]])),
  }),0,96)}, {
    fragments:arr(StageFragmentSchema,1,12),
    handoffs:arr(obj({fromElement:{type:'string',pattern:'^[a-zA-Z][a-zA-Z0-9_-]{0,47}$'},fromNode:id,toNode:id,content:e('preserve','transform')},{tolerancePixels:n(.5,10)}),1,12),
    camera:arr(StageKeySchema,2,64),perspective:n(1200,4000),
    events:arr(obj({t:n(0,1),kind:e('click','whoosh','pop','ding'),actor:id}),0,48),
});

export const stageTracks=stage=>[...(stage.camera?[{id:'camera',keys:stage.camera}]:[]),...stage.nodes.map(node=>({id:node.id,keys:node.track??[]}))];
export const CompiledStageSchema=structuredClone(StageSchema);
delete CompiledStageSchema.properties.fragments;
CompiledStageSchema.properties.nodes.minItems=1;
CompiledStageSchema.properties.nodes.items.properties.track.maxItems=128;
CompiledStageSchema.properties.camera.maxItems=128;
CompiledStageSchema.properties.nodes.items.properties.orbit.properties.timing.maxItems=128;
export function stageIssues(stage,source) {
  if (!stage) return ['composition needs visual.stage'];
  try{stage=expandStageFragments(stage);}catch(error){return [error.message];}
  if(!stage.nodes?.length)return ['composition needs nodes or supported fragments'];
  const issues=[],ids=new Set(stage.nodes.map(node=>node.id));
  const assets=new Set((source?.assets??[]).map(asset=>asset.id));
  if(ids.size!==stage.nodes.length)issues.push('stage node IDs must be unique');
  for(const node of stage.nodes) {
    if(node.start>=node.end)issues.push(`${node.id}: start must precede end`);
    if(node.kind==='text'&&!node.text)issues.push(`${node.id}: text required`);
    if(node.kind==='image'&&!assets.has(node.assetId))issues.push(`${node.id}: use a supplied assetId`);
    if(node.material==='phone'&&node.kind==='image'){
      const asset=source?.assets.find(asset=>asset.id===node.assetId);
      if(asset?.kind!=='screenshot'||asset?.role==='product-photo')issues.push(`${node.id}: a phone frame needs a real screenshot, not a product photograph`);
    }
    if(node.assetId&&!assets.has(node.assetId))issues.push(`${node.id}: image outside source`);
    if(node.kind==='icon'&&!node.icon)issues.push(`${node.id}: icon required`);
    if(node.kind==='path'&&!node.points)issues.push(`${node.id}: path points required`);
    if(node.parent&&!ids.has(node.parent))issues.push(`${node.id}: unknown parent`);
    if(node.clipToParent&&!node.parent)issues.push(`${node.id}: clipping needs a parent`);
    if(node.clipTo){
      const ancestors=new Set();let current=node.parent;
      while(current&&ids.has(current)&&!ancestors.has(current)){ancestors.add(current);current=stage.nodes.find(item=>item.id===current).parent;}
      if(!ancestors.has(node.clipTo))issues.push(`${node.id}: clipTo must name an ancestor viewport`);
    }
    if(node.layout&&node.kind!=='group')issues.push(`${node.id}: inline layout requires a group`);
    if(node.dock&&(!node.parent||stage.nodes.find(item=>item.id===node.parent)?.layout))issues.push(`${node.id}: docking needs a non-inline parent surface`);
    if(node.dock&&node.track?.some(key=>key.x!==undefined||key.y!==undefined))issues.push(`${node.id}: dock owns local x/y; animate the parent or use explicit position tracks without dock`);
    if(node.fitToParent&&(!node.parent||stage.nodes.find(item=>item.id===node.parent)?.layout||node.textMode==='baseline'))issues.push(`${node.id}: fitToParent needs a non-inline parent and box layout`);
    if(node.textMode==='baseline'&&node.kind!=='text')issues.push(`${node.id}: baseline mode is for native text`);
    for(const [kind,target]of [['control',node.control?.label],['pointer',node.pointer?.target],['focus',node.focus?.target]]){
      if(!target)continue;
      const other=stage.nodes.find(item=>item.id===target);
      if(!other||other===node)issues.push(`${node.id}: ${kind} needs another existing node`);
      if(kind==='control'&&other&&(other.kind!=='text'||other.parent!==node.id||other.start>(node.control.from??node.start)||other.end<(node.control.to??node.end)))issues.push(`${node.id}: control label must be a text child covering the control window; fade their shared parent or retire control.to before transforming its surface`);
      if(kind==='control'&&node.control&&((node.control.from??node.start)<node.start||(node.control.to??node.end)>node.end||(node.control.from??node.start)>=(node.control.to??node.end)))issues.push(`${node.id}: control window must fit its lifetime`);
      if(kind==='focus'&&other&&!(other.track?.some(key=>key.value!==undefined)||other.value!==undefined))issues.push(`${node.id}: focus target needs a continuous value track`);
    }
    if(node.advance!==undefined&&!stage.nodes.find(item=>item.id===node.parent)?.layout)issues.push(`${node.id}: advance requires an inline layout parent`);
    if(node.orbit?.timing?.some((key,i)=>key.t<node.start||key.t>node.end||i&&key.t<=node.orbit.timing[i-1].t))issues.push(`${node.id}: orbit timing must increase inside its lifetime`);
    if(node.kind==='text'&&node.crop==='allow')issues.push(`${node.id}: keep text inside the viewport; crop=allow is for imagery`);
    for(const contact of node.contacts??[])if(!ids.has(contact.target)||contact.target===node.id||contact.from>=contact.to||contact.from<node.start||contact.to>node.end)issues.push(`${node.id}: contact needs another existing target and a window inside its lifetime`);
    const visited=new Set([node.id]);let parent=node.parent;
    while(parent&&ids.has(parent)) {
      if(visited.has(parent)){issues.push(`${node.id}: cyclic parent`);break;}
      visited.add(parent);parent=stage.nodes.find(item=>item.id===parent).parent;
    }
  }
  for(const {id,keys} of stageTracks(stage)) {
    if(keys.some((key,i)=>i&&key.t<=keys[i-1].t))issues.push(`${id}: track times must increase`);
    const node=stage.nodes.find(node=>node.id===id);
    if(node&&keys.some(key=>key.t<node.start||key.t>node.end))issues.push(`${id}: keys outside node lifetime`);
  }
  for(const event of stage.events??[]){
    const actor=stage.nodes.find(node=>node.id===event.actor);
    if(!actor)issues.push(`event: unknown actor ${event.actor}`);
    else if(event.t<actor.start||event.t>actor.end)issues.push(`event: ${event.actor} is not present at its sound`);
  }
  return issues;
}

export function expandStageTrack(keys,defaults={}) {
  let current={...defaults};
  return keys.map(key=>(current={...current,...key}));
}
export function stageActionSpans(stage) {
  const authored=stageTracks(stage).flatMap(({id,keys})=>{
    const full=expandStageTrack(keys);const spans=[];let from=null;
    for(let i=1;i<full.length;i++) {
      const changed=STAGE_FIELDS.some(field=>(full[i][field]??0)!==(full[i-1][field]??0));
      if(changed&&from===null)from=full[i-1].t;
      if(from!==null&&(!changed||i===full.length-1)) {
        spans.push({id,from,to:changed?full[i].t:full[i-1].t});from=null;
      }
    }
    return spans;
  });
  const procedural=stage.nodes.filter(node=>node.orbit?.turns).flatMap(node=>{
    const timing=node.orbit.timing??[{t:node.start,progress:0},{t:node.end,progress:1}],spans=[];let from=null;
    for(let i=1;i<timing.length;i++){
      const changed=timing[i].progress!==timing[i-1].progress;if(changed&&from===null)from=timing[i-1].t;
      if(from!==null&&(!changed||i===timing.length-1)){spans.push({id:node.id,from,to:changed?timing[i].t:timing[i-1].t,procedural:'orbit'});from=null;}
    }
    return spans;
  });
  return [...authored,...procedural];
}
export function compileStage(input,seconds,rapid=false) {
  const stage=expandStageFragments(input);
  if(!rapid)return stage;
  for(const {id,keys} of stageTracks(stage)) {
    if(!keys.length)continue;
    const full=expandStageTrack(keys),result=[full[0]],landings=new Map();
    for(let i=1;i<full.length;) {
      const from=full[i-1];
      const changed=(a,b)=>STAGE_FIELDS.some(field=>(a[field]??0)!==(b[field]??0));
      if(!changed(from,full[i])){result.push(full[i++]);continue;}
      let end=i;while(end+1<full.length&&changed(full[end],full[end+1]))end++;
      const span=full[end].t-from.t,ratio=Math.min(1,.3/(span*seconds));
      for(let j=i;j<=end;j++){
        const key={...full[j],t:from.t+(full[j].t-from.t)*ratio};
        result.push(key);landings.set(full[j].t,key.t);
      }
      if(ratio<1)result.push(full[end]);
      i=end+1;
    }
    if(id==='camera')stage.camera=result;else stage.nodes.find(node=>node.id===id).track=result;
    const moving=stage.nodes.find(node=>node.id===id);
    for(const event of stage.events??[])if((event.actor===id||moving?.pointer?.target===event.actor)&&landings.has(event.t))event.t=landings.get(event.t);
  }
  for(const node of stage.nodes.filter(n=>n.orbit?.turns)){
    const timing=node.orbit.timing??[{t:node.start,progress:0},{t:node.end,progress:1}],span=node.end-node.start,ratio=Math.min(1,.3/(span*seconds));
    node.orbit.timing=timing.map(k=>({...k,t:node.start+(k.t-node.start)*ratio}));
    if(ratio<1)node.orbit.timing.push({...node.orbit.timing.at(-1),t:node.end});
  }
  return stage;
}
