import {stageFrame} from './stage-player.js';
import {glassSettings} from './stage-glass.js';
export function auditStageContinuity(score){
  const samples=[],H=1000*score.height/score.width;
  for(const to of score.elements.filter(e=>e.stage))for(const handoff of to.stage.handoffs??[]){
    const from=score.elements.find(e=>e.id===handoff.fromElement),fail=reason=>samples.push({to:to.id,...handoff,ok:false,reason});
    if(!from?.stage||from.end!==to.start){fail('Handoff source must be an adjacent authored stage');continue;}
    const before=stageFrame(from.stage,1-1e-8,H).find(i=>i.node.id===handoff.fromNode),after=stageFrame(to.stage,0,H).find(i=>i.node.id===handoff.toNode);
    if(!before||!after){fail('Carried actors must be visible on both sides of the seam');continue;}
    const errorPixels=Math.max(...before.points.map((p,i)=>Math.hypot(p.x-after.points[i].x,p.y-after.points[i].y)))*score.width/1000;
    const content=handoff.content==='transform'||before.node.assetId===after.node.assetId&&before.node.text===after.node.text&&before.node.icon===after.node.icon;
    const optical=n=>['glass','liquid-glass'].includes(n.material),ga=glassSettings(before.node,before.pose),gb=glassSettings(after.node,after.pose);
    const radius=i=>i.pose.radius??(i.node.material==='phone'?Math.min(i.pose.w,i.pose.h)*.1:24);
    const optics=(before.node.material??'solid')===(after.node.material??'solid')&&(!optical(before.node)||Object.keys(ga).every(k=>Math.abs(ga[k]-gb[k])<.02))&&Math.abs(radius(before)-radius(after))<.05&&(before.node.fill??'surface')===(after.node.fill??'surface')&&(before.node.ink??'foreground')===(after.node.ink??'foreground');
    const opacity=Math.abs(before.opacity-after.opacity)<.025;
    samples.push({from:from.id,to:to.id,...handoff,errorPixels,ok:errorPixels<=(handoff.tolerancePixels??2)&&content&&optics&&opacity,...(!content?{reason:'Carried content changed without content=transform'}:!optics?{reason:'Carried material changes at the cut'}:!opacity?{reason:'Carried opacity changes at the cut'}:{})});
  }
  return {ok:samples.every(s=>s.ok),samples};
}
