import {insidePolygon,clipPolygon} from './stage-safety.js';
const area=p=>Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a.x*b.y-b.x*a.y;},0))/2;

// Descriptive evidence, not a taste gate. A legitimate UI or a requested locked
// shot must remain possible. Report the enclosure and camera separately.
export function framingAudit(){
  const samples=new Map();
  function sample(frame,stage,camera,items,painted,height){
    const viewport=[{x:0,y:0},{x:1000,y:0},{x:1000,y:height},{x:0,y:height}],visible=items.filter(i=>i.opacity>=.85&&i.blur<=1);
    const content=visible.filter(i=>['text','image','logo','icon','counter'].includes(i.node.kind)&&i.node.role!=='decoration').map(i=>({item:i,points:painted.get(i.node.id)??i.points})).map(v=>({...v,weight:area(clipPolygon(v.points,viewport))})).filter(v=>v.weight>1);
    const total=content.reduce((s,c)=>s+c.weight,0);let dominant=null;
    for(const pane of visible.filter(i=>i.node.kind==='plane'&&i.node.role!=='decoration')){
      const fraction=area(clipPolygon(pane.points,viewport))/(1000*height);if(fraction<.12||fraction>.95)continue;
      const inside=content.filter(c=>c.points.every(p=>insidePolygon(pane.points,p))).reduce((s,c)=>s+c.weight,0),share=total?inside/total:0;
      if(share>=.65&&(!dominant||share>dominant.share))dominant={node:pane.node.id,share,viewportFraction:fraction};
    }
    samples.set(stage+':'+frame.toFixed(4),{frame,stage,camera:{x:camera.x,y:camera.y,z:camera.z??0,rx:camera.rx??0,ry:camera.ry??0,rz:camera.rz??0,scale:camera.scale??1},hasContent:total>1,dominant});
  }
  function report(){
    const rows=[...samples.values()].sort((a,b)=>a.frame-b.frame||a.stage.localeCompare(b.stage)),content=rows.filter(r=>r.hasContent),framed=content.filter(r=>r.dominant),counts=new Map();
    let translation=0,rotation=0,moving=0,steps=0;
    for(const [i,r]of rows.entries()){
      if(r.dominant)counts.set(r.dominant.node,(counts.get(r.dominant.node)??0)+1);
      if(!i)continue;const a=rows[i-1].camera,b=r.camera,d=Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z),turn=Math.abs(b.rx-a.rx)+Math.abs(b.ry-a.ry)+Math.abs(b.rz-a.rz),zoom=Math.abs(b.scale-a.scale);steps++;translation+=d;rotation+=turn;if(d>.001||turn>.001||zoom>.00001)moving++;
    }
    const framedFraction=content.length?framed.length/content.length:0,cameraMotionFraction=steps?moving/steps:0,scales=rows.map(r=>r.camera.scale),advisories=[];
    if(content.length&&framedFraction>.3)advisories.push({code:'persistent_enclosure',fraction:framedFraction,message:'A substantial share of visible content stays inside a large surface. Review against the requested open composition; moving its contents is not a scene transformation.'});
    if(rows.length>1&&cameraMotionFraction<.05)advisories.push({code:'locked_stage_camera',fraction:cameraMotionFraction,message:'Native stage cameras are largely locked. Review only if the user requested camera travel; no movement quota is imposed.'});
    return {basis:'Actual browser-projected native surfaces and painted text polygons; sampled stage exposures, not semantic judgement',samples:rows.length,contentSamples:content.length,framedSamples:framed.length,framedFraction,camera:{movingSamples:moving,steps,motionFraction:cameraMotionFraction,translationWorld:translation,rotationDegrees:rotation,zoomRatio:scales.length?Math.max(...scales)/Math.min(...scales):1},containers:[...counts].map(([node,samples])=>({node,samples})),advisories};
  }
  return {sample,report};
}
