import {characterAnchor,characterBodyOffset} from '../character-studio/characters.js';
import {armJoints,characterHeadPose} from '../character-studio/arms.js';
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
export const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
export function trackPose(base,keys,time,start=0){
  let previous={...base},at=start;
  for(const key of keys??[]){
    if(time<key.at){
      const p=smooth((time-at)/Math.max(.001,key.at-at)),next={...previous,...key},value={...previous};
      const reparent=(key.parent!==undefined&&key.parent!==previous.parent)||(key.anchor!==undefined&&key.anchor!==previous.anchor);
      for(const [name,target]of Object.entries(next))if(typeof target==='number'&&typeof previous[name]==='number'&&!(reparent&&['x','y','w','h','rotation'].includes(name)))value[name]=previous[name]+(target-previous[name])*p;
      return value;
    }
    previous={...previous,...key};at=key.at;
  }
  return previous;
}
export const matrix={
  identity:()=>[1,0,0,1,0,0],
  multiply:(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]],
  translate:(x,y)=>[1,0,0,1,x,y],
  scale:(x,y)=>[x,0,0,y,0,0],
  rotate:angle=>{const a=angle*Math.PI/180;return [Math.cos(a),Math.sin(a),-Math.sin(a),Math.cos(a),0,0];},
};
export function blendMatrix(a,b,p){
  const sx=m=>Math.hypot(m[0],m[1]),angle=m=>Math.atan2(m[1],m[0]);
  const scaleA=sx(a),scaleB=sx(b),syA=(a[0]*a[3]-a[1]*a[2])/Math.max(scaleA,.0001),syB=(b[0]*b[3]-b[1]*b[2])/Math.max(scaleB,.0001);
  let delta=angle(b)-angle(a);while(delta>Math.PI)delta-=2*Math.PI;while(delta<-Math.PI)delta+=2*Math.PI;
  const rotation=angle(a)+delta*p,x=scaleA+(scaleB-scaleA)*p,y=syA+(syB-syA)*p;
  return [Math.cos(rotation)*x,Math.sin(rotation)*x,-Math.sin(rotation)*y,Math.cos(rotation)*y,a[4]+(b[4]-a[4])*p,a[5]+(b[5]-a[5])*p];
}
export function sceneAt(story,time){
  const index=Math.max(0,story.scenes.findLastIndex(s=>s.start<=time));
  return {scene:story.scenes[index],previous:story.scenes[index-1]??null,index};
}
export function cameraAt(scene,time){return trackPose({x:800,y:450,zoom:1},scene.camera,time,scene.start);}
export function characterGesture(pose,time,since,speechGesture=0){
  const enter=smooth((time-since)/(pose==='think'?.95:.4));
  return pose==='carry'?.85*enter:pose==='reach'||pose==='point'?1.05*enter:pose==='think'?1.65*enter:pose==='celebrate'?(1.1+.23*Math.sin(time*7))*enter:speechGesture;
}
export function storyNodeStates(story,scene,time,style,overrides=new Map(),voiceGestures=new Map()){
  const entities=new Map(story.entities.map(e=>[e.id,e])),nodes=new Map(scene.nodes.map(n=>[n.id,n])),states=new Map(),visiting=new Set();
  const endpoints=new Map();
  const previousScene=story.scenes?.[story.scenes.indexOf(scene)-1];let previousStates;
  const poseAt=(node,t)=>trackPose({...node,reveal:1},node.keys,t,scene.start);
  const gestureAt=(node,pose,t)=>{
    const poses=(node.keys??[]).filter(k=>k.at<=t&&k.pose!==undefined),lastPose=poses.at(-1),prior=poses.at(-2);
    const speech=voiceGestures.get(entities.get(node.entity).voice)??0;
    const current=characterGesture(pose.pose,t,lastPose?.at??scene.start,speech);
    if(!lastPose)return current;
    const before=characterGesture(prior?.pose??node.pose,lastPose.at,prior?.at??scene.start,speech);
    return current+before*(1-smooth((t-lastPose.at)/.4));
  };
  function armPhysicalAt(node,t){
    const pose=poseAt(node,t),entity=entities.get(node.entity);
    const physical={actionPose:pose.pose,gesture:gestureAt(node,pose,t),bothHands:pose.pose==='celebrate',bodyOffset:characterBodyOffset(style,t,entity.appearance)};
    if(entity.kind!=='character')return physical;
    const held=[...nodes.values()].map(child=>poseAt(child,t)).filter(child=>child.parent===node.id&&child.anchor?.startsWith('hand-'));
    const hands=new Set(held.map(child=>child.anchor));
    physical.occupiedHands=[...hands].map(hand=>hand==='hand-left'?'left':'right');
    if(hands.size>1)physical.bothHands=true;
    if(hands.size===1)physical.activeHand=pose.pose==='think'?(hands.has('hand-left')?'right':'left'):(hands.has('hand-left')?'left':'right');
    else if(!hands.size&&node.lookAt){
      const target=nodes.get(node.lookAt);
      if(target){const initial=poseAt(target,scene.start);if(!initial.parent)physical.activeHand=initial.x<node.x?'left':'right';}
    }
    let previousPose=node.pose,lastChange,previousAction;
    for(const key of node.keys??[]){if(key.at>t)break;if(key.pose!==undefined&&key.pose!==previousPose){lastChange=key;previousAction=previousPose;previousPose=key.pose;}}
    const poseDuration=pose.pose==='think'||previousAction==='think'?.95:.4;
    if(lastChange&&lastChange.at>scene.start+.00001&&t-lastChange.at<poseDuration){
      const before=armPhysicalAt(node,lastChange.at-.000001);
      physical.fromArms=armJoints(style,before);physical.fromHead=characterHeadPose(style,before);physical.armBlend=smooth((t-lastChange.at)/poseDuration);
      physical.gesture=characterGesture(pose.pose,t,lastChange.at-poseDuration,voiceGestures.get(entity.voice)??0);
    }else if(previousScene&&scene.transition?.kind==='match'){
      const prior=previousScene.nodes.find(p=>p.id===node.id&&p.entity===node.entity);
      if(prior&&(!lastChange||lastChange.at<=scene.start+.00001)){
        physical.gesture=characterGesture(pose.pose,t,scene.start-(pose.pose==='think'?.95:.4),voiceGestures.get(entity.voice)??0);
        const duration=Math.max(pose.pose==='think'||prior.pose==='think'?.95:.4,scene.transition.duration??0);
        if(t-scene.start<duration){
          previousStates??=storyNodeStates(story,previousScene,previousScene.end-.000001,style,new Map(),voiceGestures);
          const before=previousStates.get(node.id).armPhysical;physical.fromArms=armJoints(style,before);physical.fromHead=characterHeadPose(style,before);physical.armBlend=smooth((t-scene.start)/duration);
        }
      }
    }
    return physical;
  }
  function attachedParent(pose,resolveParent){
    if(!pose.parent)return {matrix:matrix.identity(),opacity:1};
    const target=resolveParent(pose.parent);let transform=target.matrix;
    if(target.entity.kind==='character'){
      const offset=characterAnchor(style,pose.anchor,target.armPhysical);
      transform=matrix.multiply(transform,matrix.translate(...offset));
    }
    return {matrix:transform,opacity:target.opacity};
  }
  function localMatrix(pose,entity){
    return matrix.multiply(matrix.translate(pose.x,pose.y),matrix.multiply(matrix.rotate(pose.rotation),matrix.scale(pose.w/(entity.kind==='character'?330:100),pose.h/(entity.kind==='character'?700:100))));
  }
  // Sample an attachment endpoint in its own coordinate space, with no recursive
  // anticipation of later handoffs. Parent trees are already validated.
  function endpoint(id,t,trail=new Set()){
    const key=`${id}:${t}`;if(endpoints.has(key))return endpoints.get(key);
    if(trail.has(id))throw new Error('Story parent cycle');const nextTrail=new Set(trail).add(id);
    const node=nodes.get(id),entity=entities.get(node.entity),pose=poseAt(node,t);
    const parent=attachedParent(pose,parentId=>endpoint(parentId,t,nextTrail));
    const state={entity,pose,matrix:matrix.multiply(parent.matrix,localMatrix(pose,entity)),opacity:clamp(pose.opacity)*parent.opacity,gesture:gestureAt(node,pose,t),bodyOffset:characterBodyOffset(style,t,entity.appearance),armPhysical:armPhysicalAt(node,t)};
    endpoints.set(key,state);return state;
  }
  function resolve(id){
    if(states.has(id))return states.get(id);
    if(visiting.has(id))throw new Error('Story parent cycle');visiting.add(id);
    const node=nodes.get(id),pose=poseAt(node,time),entity=entities.get(node.entity);
    const parent=attachedParent(pose,resolve),opacity=clamp(pose.opacity)*parent.opacity;
    let transform=matrix.multiply(parent.matrix,localMatrix(pose,entity));
    const next=(node.keys??[]).find(k=>k.at>time);
    if(next&&((next.parent!==undefined&&next.parent!==pose.parent)||(next.anchor!==undefined&&next.anchor!==pose.anchor))){
      const since=[...(node.keys??[])].reverse().find(k=>k.at<=time)?.at??scene.start;
      transform=blendMatrix(transform,endpoint(id,next.at).matrix,smooth((time-since)/Math.max(.001,next.at-since)));
    }
    if(overrides.has(id))transform=overrides.get(id);
    const gesture=gestureAt(node,pose,time);
    const state={node,entity,pose,matrix:transform,opacity,gesture,bodyOffset:characterBodyOffset(style,time,entity.appearance),armPhysical:armPhysicalAt(node,time)};states.set(id,state);visiting.delete(id);return state;
  }
  for(const node of scene.nodes)resolve(node.id);
  return states;
}
