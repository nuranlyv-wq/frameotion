// Continuous procedural paths and measured inline layout, shared by authoring and rendering.
const rad = value => value * Math.PI / 180;
export function orbitPose(node, pose, t) {
  if (!node.orbit) return pose;
  const o=node.orbit,elapsed=Math.max(0,Math.min(1,(t-node.start)/(node.end-node.start)));
  let progress=elapsed;
  if(o.timing?.length){const i=o.timing.findIndex(k=>k.t>t);if(i===0)progress=o.timing[0].progress;else if(i<0)progress=o.timing.at(-1).progress;else {const a=o.timing[i-1],b=o.timing[i];progress=a.progress+(b.progress-a.progress)*(t-a.t)/(b.t-a.t);}}
  const angle=rad(o.phase)+2*Math.PI*o.turns*progress;
  let x=Math.cos(angle)*o.radiusX,y=Math.sin(angle)*o.radiusY,z=0;
  const rotate=(a,b,degrees)=>[a*Math.cos(rad(degrees))-b*Math.sin(rad(degrees)),a*Math.sin(rad(degrees))+b*Math.cos(rad(degrees))];
  [y,z]=rotate(y,z,o.tiltX??0);[z,x]=rotate(z,x,o.tiltY??0);[x,y]=rotate(x,y,o.tiltZ??0);
  return {...pose,x:pose.x+x,y:pose.y+y,z:pose.z+z,
    blur:Math.max(pose.blur,(o.depthBlur??0)*Math.max(0,-z)/Math.max(o.radiusX,o.radiusY))};
}

export function inlinePositions(children, poses, layout, t) {
  // Reserve the complete phrase by default. Removing a fading prefix must not
  // instantly recenter its highlighted word. Explicit layoutWeight animates reflow.
  const active=children.map(node=>({node,pose:poses.get(node.id)})).filter(({node})=>layout.reserve!=='active'||t>=node.start&&t<node.end);
  const weights=active.map(({pose})=>Math.max(0,Math.min(1,pose.layoutWeight??1)));
  const widths=active.map(({node,pose},i)=>(node.advance??pose.w)*pose.scale*weights[i]);
  const gaps=weights.map((weight,i)=>i?layout.gap*Math.min(weight,weights[i-1]):0);
  const total=widths.reduce((sum,width,i)=>sum+width+gaps[i],0);
  let cursor=layout.align==='center'?-total/2:layout.align==='right'?-total:0;
  return new Map(active.map(({node,pose},i)=>{
    cursor+=gaps[i];const x=cursor;cursor+=widths[i];
    // The anchor marks the beginning of the measured advance; padding stays outside it.
    return [node.id,{...pose,x:x+pose.x}];
  }));
}

export function dockPose(node,pose,parent){
  if(!node.dock||!parent)return pose;
  const axis=(name,size,anchor,inset)=>{
    const psize=parent[size],pa=parent[anchor]??.5,own=pose[size]*pose.scale,a=pose[anchor]??.5;
    const side=node.dock[name];
    return side==='left'||side==='top'?-pa*psize+inset+a*own:
      side==='right'||side==='bottom'?(1-pa)*psize-inset-(1-a)*own:(.5-pa)*psize+(a-.5)*own;
  };
  return {...pose,x:axis('x','w','anchorX',node.dock.insetX??12),y:axis('y','h','anchorY',node.dock.insetY??12)};
}
