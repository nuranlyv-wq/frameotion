// Compact, declarative building blocks. Expanded nodes remain freely editable scene geometry.
import {focusReelTracks} from './focus-reel.js';
const n=(minimum,maximum)=>({type:'number',minimum,maximum});
const e=(...values)=>({type:'string',enum:values});
const obj=(properties,optional={})=>({type:'object',properties:{...properties,...optional},required:Object.keys(properties),additionalProperties:false});
const id={type:'string',pattern:'^[a-zA-Z][a-zA-Z0-9_-]{0,13}$'},nodeId={type:'string',pattern:'^[a-zA-Z][a-zA-Z0-9_-]{0,23}$'};
const role=e('background','foreground','surface','muted','accent','onAccent');
export const StageFontSchema=e('brand','heading','body','inter','display','comfortaa','fira-sans');
export const StageDockSchema=obj({x:e('left','center','right'),y:e('top','center','bottom')},{insetX:n(0,400),insetY:n(0,400)});
const key=obj({t:n(0,1)},Object.fromEntries([...['x','y','z','rx','ry','rz','w','h','radius'].map(f=>[f,n(-3000,4000)]),['scale',n(.01,8)],['opacity',n(0,1)],['ease',e('linear','smooth','spring','glide','expo','fluid')]]));
export const StageFragmentSchema=obj({id,kind:e('control','orbit-ring','focus-reel','hinge'),x:n(-2000,3000),y:n(-2000,4000),w:n(16,2000),h:n(16,2000),start:n(0,1),end:n(0,1)}, {
  parent:nodeId,z:n(-1000,1000),radius:n(0,500),fill:role,ink:role,font:StageFontSchema,fontSize:n(16,160),
  label:{type:'string',minLength:1,maxLength:80},dock:StageDockSchema,clickAt:n(0,1),
  track:{type:'array',items:key,minItems:2,maxItems:32},
  items:{type:'array',items:obj({assetId:{type:'string',pattern:'^brand-[a-f0-9]{20}$'}},{label:{type:'string',minLength:1,maxLength:48}}),minItems:2,maxItems:8},
  radiusX:n(1,1200),radiusY:n(1,1200),tiltX:n(-180,180),tiltZ:n(-180,180),turns:n(-8,8),phase:n(-360,360),depthBlur:n(0,16),
  focus:{type:'array',items:obj({t:n(0,1),index:n(0,7)},{ease:e('linear','smooth','glide','fluid')}),minItems:2,maxItems:32},
  gap:n(0,160),labelOffsetX:n(-2000,2000),labelOffsetY:n(-2000,2000),labelWidth:n(40,1000),labelStep:n(24,180),fit:e('contain','cover'),
  edge:e('left','right','top','bottom'),fromAngle:n(-180,180),toAngle:n(-180,180),material:e('solid','matte','glass','liquid-glass'),
});
const base=f=>({id:f.id,x:f.x,y:f.y,w:f.w,h:f.h,start:f.start,end:f.end,...(f.parent?{parent:f.parent}:{}),...(f.z!==undefined?{z:f.z}:{}),...(f.track?{track:structuredClone(f.track)}:{})});
const child=(f,id,kind,props={})=>({id,kind,x:0,y:0,w:f.w,h:f.h,start:f.start,end:f.end,parent:f.id,z:1,...props});
const ordered=keys=>keys.every((k,i)=>Number.isFinite(k.t)&&(!i||k.t>keys[i-1].t));
function expand(f){
  if(!(f.start<f.end))throw Error(`${f.id}: fragment lifetime is empty`);
  if(f.track&&(!ordered(f.track)||f.track.some(k=>k.t<f.start||k.t>f.end)))throw Error(`${f.id}: fragment keys must increase inside its lifetime`);
  const nodes=[],events=[];
  const text=(id,label,w=f.w,h=f.h,parent=f.id,extra={})=>({id,kind:'text',text:label,parent,x:0,y:0,z:1,w,h,start:f.start,end:f.end,font:f.font??'body',fontSize:f.fontSize??32,weight:500,ink:f.ink??'foreground',...extra});
  if(f.kind==='control'){
    if(!f.label)throw Error(`${f.id}: control needs its exact label`);
    nodes.push({...base(f),kind:'plane',fill:f.fill??'accent',radius:f.radius??f.h/2,...(f.dock?{dock:f.dock}:{}),control:{label:f.id+'_label',padding:4}});
    nodes.push(text(f.id+'_label',f.label,Math.max(16,f.w-16),Math.max(16,f.h-8),f.id,{z:0,ink:f.ink??'onAccent',fitToParent:{x:8,y:4}}));
    if(f.clickAt!==undefined){
      const t=f.clickAt,a=Math.max(f.start,t-.12),b=Math.min(f.end,t+.05);
      if(!(t>f.start+.005&&t<f.end-.005&&a<t&&t<b))throw Error(`${f.id}: click must leave room for approach and release`);
      // Native cursor silhouette tip: (-25,-38) in a .7*min(w,h) coordinate system.
      const w=22,h=28,tipX=(w/2-25*.7*w/100)/w,tipY=(h/2-38*.7*w/100)/h;
      nodes.push(child(f,f.id+'_pointer','icon',{icon:'cursor',w,h,start:a,end:b,z:8,ink:'foreground',anchorX:tipX,anchorY:tipY,pointer:{target:f.id,tipX,tipY},contacts:[{target:f.id+'_label',from:a,to:b}],track:[{t:a,x:32,y:24,opacity:0},{t,x:0,y:0,opacity:1},{t:b,x:0,y:0,opacity:0}]}));
      events.push({t,kind:'click',actor:f.id});
    }
  }else if(f.kind==='orbit-ring'){
    if(!f.items?.length||!f.radiusX||!f.radiusY)throw Error(`${f.id}: orbit-ring needs items and both radii`);
    nodes.push({...base(f),kind:'group'});
    f.items.forEach((item,i)=>nodes.push(child(f,f.id+'_item'+i,'image',{assetId:item.assetId,fit:'contain',orbit:{radiusX:f.radiusX,radiusY:f.radiusY,phase:(f.phase??0)+i*360/f.items.length,turns:f.turns??1,tiltX:f.tiltX??65,tiltZ:f.tiltZ??0,depthBlur:f.depthBlur??3}})));
  }else if(f.kind==='focus-reel'){
    if(!f.items?.length||!f.focus?.length||!ordered(f.focus)||f.focus.some(k=>k.t<f.start||k.t>f.end||k.index>f.items.length-1))throw Error(`${f.id}: focus-reel needs ordered in-lifetime focus keys and supplied items`);
    if(f.items.some(i=>!i.label))throw Error(`${f.id}: every focus-reel item needs a word label`);
    if(f.focus[0].t!==f.start||f.focus.at(-1).t!==f.end)throw Error(`${f.id}: focus curve must span the complete reel lifetime`);
    const step=f.h+(f.gap??24),labelStep=f.labelStep??72,reel=focusReelTracks(f.focus,{mediaStep:step,labelStep}),phaseId=f.id+'_phase',belt=f.id+'_belt',words=f.id+'_words',wordBelt=f.id+'_labels';
    nodes.push({...base(f),kind:'group',radius:f.radius??18},child(f,f.id+'_ground','plane',{fill:f.fill??'surface',radius:f.radius??18,z:0}),child(f,phaseId,'group',{track:f.focus.map(({t,index,ease})=>({t,value:index,...(ease?{ease}:{})}))}),child(f,belt,'group',{h:step*f.items.length,track:reel.media}),child(f,words,'group',{x:f.labelOffsetX??-f.w*.9,y:f.labelOffsetY??0,w:f.labelWidth??f.w*.65,h:labelStep*3}),{...child(f,wordBelt,'group',{h:labelStep*f.items.length,track:reel.labels}),parent:words});
    f.items.forEach((item,i)=>{
      nodes.push({...child(f,f.id+'_pic'+i,'image',{y:i*step,assetId:item.assetId,fit:f.fit??'contain',clipTo:f.id,z:2}),parent:belt});
      nodes.push(text(f.id+'_word'+i,item.label,f.labelWidth??f.w*.65,labelStep,wordBelt,{y:i*labelStep,fontSize:f.fontSize??54,clipTo:words,focus:{target:phaseId,index:i,dim:.3}}));
    });
  }else if(f.kind==='hinge'){
    const edge=f.edge??'left',horizontal=['left','right'].includes(edge),field=horizontal?'ry':'rx';
    nodes.push({...base(f),kind:'plane',fill:f.fill??'surface',material:f.material??'matte',radius:f.radius??12,backface:'hide',pivotX:horizontal?(edge==='left'?0:1):.5,pivotY:horizontal?.5:edge==='top'?0:1,
      track:f.track??[{t:f.start,[field]:f.fromAngle??(edge==='left'||edge==='bottom'?100:-100)},{t:f.start+(f.end-f.start)*.7,[field]:f.toAngle??0,ease:'fluid'},{t:f.end,[field]:f.toAngle??0}]});
    if(f.label)nodes.push(text(f.id+'_label',f.label,f.w,f.h,f.id,{backface:'hide'}));
  }
  return {nodes,events};
}
export function expandStageFragments(input){
  if(!input?.fragments?.length)return structuredClone(input);
  const {fragments,...stage}=structuredClone(input);stage.nodes??=[];stage.events??=[];
  for(const f of fragments){const result=expand(f);stage.nodes.push(...result.nodes);stage.events.push(...result.events);}
  if(stage.nodes.length>96)throw Error('Composition fragments exceed 96 expanded nodes; split the scene or reduce the fragment');
  const ids=stage.nodes.map(n=>n.id);if(new Set(ids).size!==ids.length)throw Error('Composition fragment IDs collide with authored node IDs');
  stage.events.sort((a,b)=>a.t-b.t);return stage;
}
