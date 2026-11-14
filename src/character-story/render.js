import {DEFAULT_CAST} from '../character-studio/score.js';
import {walkingMotion} from '../character-studio/locomotion.js';
import {trackPose,matrix,blendMatrix,sceneAt,cameraAt,storyNodeStates,smooth,characterGesture} from './timeline.js';
const paths=new Map();
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const colors={red:'#c85855',orange:'#df9556',yellow:'#e5bf60',green:'#6b9876',blue:'#527bc7',purple:'#9477ad',pink:'#d897ac',brown:'#9c7557',black:'#34343b',white:'#fffdf5',gray:'#999da5'};
function path(d){if(!paths.has(d)){if(paths.size>1200)paths.delete(paths.keys().next().value);paths.set(d,new Path2D(d));}return paths.get(d);}
function palette(style){return {paper:style.surface,ink:style.ink,soft:style.soft,accent:style.accent,support:style.support,skin:style.monochrome?'#fff':'#eeb392',none:null};}
function transform(c,m){c.transform(...m);}
function parts(c,entity,node,time,scene,style){
  const roles=palette(style),pencil=style.monochrome,flat=new Map(entity.parts.map(p=>[p.id,p])),cache=new Map();
  function partState(id){
    if(cache.has(id))return cache.get(id);
    const base=flat.get(id),keys=node.parts?.find(track=>track.target===id)?.keys;
    const p=trackPose({...base,rotation:base.rotation??0,opacity:1,reveal:1},keys,time,scene.start);
    let m=matrix.translate(p.x,p.y),opacity=p.opacity;
    m=matrix.multiply(m,matrix.scale(p.w/100,p.h/100));
    m=matrix.multiply(m,matrix.multiply(matrix.translate(p.pivotX??50,p.pivotY??50),matrix.multiply(matrix.rotate(p.rotation),matrix.translate(-(p.pivotX??50),-(p.pivotY??50)))));
    if(p.parent){const parent=partState(p.parent);m=matrix.multiply(parent.matrix,m);opacity*=parent.opacity;}
    const state={pose:p,matrix:m,opacity};cache.set(id,state);return state;
  }
  for(const base of entity.parts){
    const {pose:p,matrix:m,opacity}=partState(base.id);if(p.kind==='group')continue;
    c.save();transform(c,m);c.globalAlpha*=clamp(opacity);
    if(p.reveal<1){c.beginPath();c.rect(-3,-3,106*clamp(p.reveal),106);c.clip();}
    let geometry;
    if(p.kind==='path')geometry=path(p.d);
    else if(p.kind==='rect'){geometry=new Path2D();geometry.roundRect(0,0,100,100,p.radius??3);}
    else if(p.kind==='ellipse'){geometry=new Path2D();geometry.ellipse(50,50,50,50,0,0,Math.PI*2);}
    const fill=!pencil&&p.color&&p.fill!=='none'?colors[p.color]:roles[p.fill],stroke=pencil?roles[p.stroke==='none'?'none':p.stroke==='soft'?'soft':'ink']:roles[p.stroke];
    if(p.kind==='text'){
      c.fillStyle=roles.ink;c.textAlign='center';c.textBaseline='middle';let size=24;c.font=`500 ${size}px 'Fira Sans',sans-serif`;
      while(c.measureText(p.text).width>94&&size>3){size-=1;c.font=`500 ${size}px 'Fira Sans',sans-serif`;}
      c.fillText(p.text,50,50);
    }else if(geometry){
      if(fill){c.fillStyle=fill;c.fill(geometry);}
      if(stroke){
        const t=c.getTransform(),scale=Math.sqrt(Math.max(.00001,Math.abs(t.a*t.d-t.b*t.c)));
        c.strokeStyle=stroke;c.lineWidth=style.line*(p.strokeWidth??1)/scale;
        c.lineCap='round';c.lineJoin='round';c.stroke(geometry);
      }
    }
    c.restore();
  }
}
function actor(state,voices,style,time,scene){
  const {entity,pose}=state,appearance=DEFAULT_CAST[entity.appearance]??DEFAULT_CAST[0];
  const voice=voices.find(p=>p.voiceId===entity.voice);
  const phase=(time+entity.appearance*1.7)%4.9;
  const physical={...appearance,appearance:entity.appearance,outfit:entity.outfit,bodyOffset:state.bodyOffset,...(entity.outfit?{color:colors[entity.outfit]}:{}),name:entity.label,mouth:voice?.mouth??0,viseme:voice?.viseme??null,speaking:voice?.speaking??false,
    blink:voice?.blink??(phase>4.7?Math.sin((phase-4.7)/.2*Math.PI):0),breathe:Math.sin(time*1.55+entity.appearance),nod:Math.sin(time*2.3+entity.appearance)*.13,gaze:0,
    gesture:characterGesture(pose.pose,time,scene.start,voice?.gesture??0),bothHands:pose.pose==='celebrate'};
  // The same gesture is used for the physical hand and its attached prop.
  physical.gesture=state.gesture;physical.actionPose=pose.pose;physical.armPhysical=state.armPhysical;
  return physical;
}
function drawWorld(c,story,scene,time,style,voices,paintActor,{alpha=1,offset=0,lens,overrides=new Map(),exclude=new Set(),fadeNodes=null,fadeProgress=1}={}){
  const gestures=new Map(voices.map(v=>[v.voiceId,v.gesture]));
  const nodes=storyNodeStates(story,scene,time,style,overrides,gestures),camera=lens??cameraAt(scene,time);
  c.save();c.globalAlpha*=alpha;c.translate(offset+800,450);c.scale(camera.zoom,camera.zoom);c.translate(-camera.x,-camera.y);
  for(const node of scene.nodes){
    if(exclude.has(node.id))continue;
    const state=nodes.get(node.id);if(state.opacity<=0)continue;
    c.save();transform(c,state.matrix);c.globalAlpha*=state.opacity*(fadeNodes&&!fadeNodes.has(node.id)?fadeProgress:1);
    if(state.entity.kind==='character'){
      const p=actor(state,voices,style,time,scene),target=nodes.get(state.pose.lookAt);
      if(target)p.gaze=Math.sign(target.matrix[4]-state.matrix[4]);
      paintActor(c,p,{x:0,foot:0,scale:1,fullBody:true,locomotion:walkingMotion(node,time,scene.start)});
    }else{
      c.translate(-50,-50);
      if(state.pose.reveal<1){c.beginPath();c.rect(-3,-3,106*clamp(state.pose.reveal),106);c.clip();}
      parts(c,state.entity,node,time,scene,style);
    }
    c.restore();
  }
  c.restore();return nodes;
}
export function renderStoryScene(ctx,score,state,{style,time,paintActor}){
  const story=score.story,{scene,previous,index}=sceneAt(story,time);
  if(!scene)return state;
  const voices=state.characters.map(person=>({...person,voiceId:score.speech?.speakers?.find(s=>s.character===person.id)?.id??''}));
  const d=scene.transition?.duration??0,p=previous&&d>0?smooth((time-scene.start)/d):1;
  const lens=cameraAt(scene,time),oldLens=previous?cameraAt(previous,previous.end-.0001):lens;
  const blended={x:oldLens.x+(lens.x-oldLens.x)*p,y:oldLens.y+(lens.y-oldLens.y)*p,zoom:oldLens.zoom+(lens.zoom-oldLens.zoom)*p};
  ctx.save();ctx.setTransform(ctx.canvas.width/1600,0,0,ctx.canvas.height/900,0,0);
  ctx.fillStyle=style.background;ctx.fillRect(0,0,1600,900);
  if(p<1&&scene.transition.kind==='match'){
    const old=storyNodeStates(story,previous,previous.end-.0001,style),next=storyNodeStates(story,scene,time,style),shared=new Set(),overrides=new Map();
    for(const node of scene.nodes){const prior=old.get(node.id);if(prior&&prior.entity.id===node.entity){shared.add(node.id);if(!node.parent||!old.has(node.parent))overrides.set(node.id,blendMatrix(prior.matrix,next.get(node.id).matrix,p));}}
    drawWorld(ctx,story,previous,previous.end-.0001,style,voices,paintActor,{alpha:1-p,lens:blended,exclude:shared});
    // Carried subjects stay opaque; surrounding subjects develop into the next shot.
    drawWorld(ctx,story,scene,time,style,voices,paintActor,{lens:blended,overrides,fadeNodes:shared,fadeProgress:p});
  }else if(p<1&&scene.transition.kind==='pan'){
    const sign=scene.transition.direction==='right'?-1:1;
    drawWorld(ctx,story,previous,previous.end-.0001,style,voices,paintActor,{offset:-1600*p*sign});
    drawWorld(ctx,story,scene,time,style,voices,paintActor,{offset:1600*(1-p)*sign});
  }else if(p<1&&scene.transition.kind==='wipe'){
    drawWorld(ctx,story,previous,previous.end-.0001,style,voices,paintActor,{});
    ctx.save();ctx.beginPath();ctx.rect(scene.transition.direction==='right'?1600*(1-p):0,0,1600*p,900);ctx.clip();
    ctx.fillStyle=style.background;ctx.fillRect(0,0,1600,900);drawWorld(ctx,story,scene,time,style,voices,paintActor,{});ctx.restore();
  }else drawWorld(ctx,story,scene,time,style,voices,paintActor,{});
  ctx.restore();return {...state,storyScene:scene.id,storyAction:scene.action,storyNodes:scene.nodes.map(n=>n.id)};
}
