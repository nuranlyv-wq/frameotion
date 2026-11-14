import { ease } from './motion.js';

export function cubicProgress(curve,t){
 t=Math.max(0,Math.min(1,t));if(t===0||t===1)return t;
 const [x1,y1,x2,y2]=curve,bezier=(u,a,b)=>3*(1-u)**2*u*a+3*(1-u)*u*u*b+u**3;
 let lo=0,hi=1;for(let i=0;i<18;i++){const mid=(lo+hi)/2;if(bezier(mid,x1,x2)<t)lo=mid;else hi=mid;}
 return bezier((lo+hi)/2,y1,y2);
}
export function keyedAt(base, keys, frame,curves={}) {
  let previous={...base}, from=0;
  for(const key of keys){
    const next={...previous,...key};
    if(frame>=key.at){previous=next;from=key.at;continue;}
    const fraction=(frame-from)/Math.max(1,key.at-from);
    const p=key.curveId&&curves[key.curveId]?cubicProgress(curves[key.curveId],fraction):ease(key.easing,fraction);
    return Object.fromEntries(Object.entries(previous).map(([k,v])=>[k,typeof v==='number'&&typeof next[k]==='number'?v+(next[k]-v)*p:v]));
  }
  return previous;
}
function poseAt(node,frame,curves){
  const sampledFrame = node.step > 1 ? Math.floor(frame / node.step) * node.step : frame;
  return keyedAt({blur:0,rotateX:0,rotateY:0,originX:500,originY:500,draw:100,characters:140,tracking:0,maskSize:100,depth:0,...node.pose,reveal:100,fill:node.fill},node.keys,sampledFrame,curves);
}
// Rotation follows distance, including the selected easing. Sampling any frame is
// independent of previous frames. Completed rolls retain their orientation.
export function rollAngleAt(node,frame,curves){
 return (node.rolls||[]).reduce((angle,roll)=>{
  if(frame<=roll.from)return angle;
  const start=poseAt(node,roll.from,curves),now=poseAt(node,Math.min(frame,roll.to),curves);
  const radius=start.w*start.scale/200;
  let rotation=(now.x-start.x)/radius*180/Math.PI;
  if(roll.settleFrames&&frame>roll.to){
   const p=ease('out-cubic',(frame-roll.to)/roll.settleFrames);
   rotation+=(Math.round((angle+rotation)/360)*360-angle-rotation)*p;
  }
  return angle+rotation;
 },0);
}
export function actorAt(node,frame,curves){
 const p=poseAt(node,frame,curves);if(node.rolls?.length)p.rotate+=rollAngleAt(node,frame,curves);
 // Back/spring curves can overshoot. Geometry and CSS filters still need valid values.
 for(const k of ['w','h','scale'])if(Number.isFinite(p[k]))p[k]=Math.max(.001,p[k]);
 for(const k of ['radius','blur','maskSize','depth'])p[k]=Math.max(0,p[k]);
 p.opacity=Math.max(0,Math.min(100,p.opacity));return p;
}
export function worldCameraAt(world,frame,curves){return keyedAt({x:500,y:500,zoom:100,rotate:0},world.camera,frame,curves);}

export function worldMetrics(film){
 const moving=film.world.nodes.filter(n=>n.kind!=='text'&&n.keys.some(k=>Object.keys(k).some(p=>['x','y','w','h','scale','rotate'].includes(p)&&k[p]!==n.pose[p])));
 const zooms=film.world.camera.map(k=>k.zoom);
 const sizes=film.world.nodes.filter(n=>!['text','group','cursor'].includes(n.kind)).map(n=>{
  const poses=[n.pose,...n.keys.map(k=>actorAt(n,k.at))];
  return Math.max(...['w','h','scale'].map(k=>Math.max(...poses.map(p=>p[k]))/Math.min(...poses.map(p=>p[k]))));
 });
 const carried=film.scenes.slice(1).map(s=>({frame:s.start,actors:film.world.nodes.filter(n=>n.kind!=='text'&&actorAt(n,s.start-1).opacity>50&&actorAt(n,s.start).opacity>50&&n.keys.length).map(n=>n.id)}));
 return {movingObjectCount:moving.length,cameraScaleRatio:Math.max(...zooms)/Math.min(...zooms),objectScaleRatio:Math.max(1,...sizes),carried};
}
