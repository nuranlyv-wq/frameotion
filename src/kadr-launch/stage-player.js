import {motionProgress} from './kinetic.js';
import {expandStageTrack} from './stage-contract.js';
import {projectivePainter} from './stage-gpu.js';
import {orbitPose,inlinePositions,dockPose} from './stage-motion.js';
import {glassPainter,glassSettings} from './stage-glass.js';
import {measureStageText} from './stage-typography.js';
import {stageSafety,insidePolygon} from './stage-safety.js';
import {surfaceDepthEdges} from './stage-depth.js';

const tracks=new WeakMap(),textures=new WeakMap();
const defaults={x:0,y:0,z:0,rx:0,ry:0,rz:0,scale:1,opacity:1,blur:0,reveal:1,value:0,layoutWeight:1,glassStrength:1};
const rad=degrees=>degrees*Math.PI/180;
const identity=()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
export function multiply(a,b){return Array.from({length:16},(_,i)=>{const r=Math.floor(i/4),c=i%4;return [0,1,2,3].reduce((sum,k)=>sum+a[r*4+k]*b[k*4+c],0);});}
const transform=(m,[x,y,z])=>[m[0]*x+m[1]*y+m[2]*z+m[3],m[4]*x+m[5]*y+m[6]*z+m[7],m[8]*x+m[9]*y+m[10]*z+m[11]];
export function stagePose(item,t,fallback={}) {
  const base={...defaults,...fallback,...item};delete base.track;
  if(!item.track?.length)return base;
  if(!tracks.has(item))tracks.set(item,expandStageTrack(item.track,base));
  const keys=tracks.get(item),right=keys.findIndex(key=>key.t>t);
  if(right===0)return {...keys[0]};if(right<0)return {...keys.at(-1)};
  const a=keys[right-1],b=keys[right],p=motionProgress((t-a.t)/(b.t-a.t),b.ease??'fluid');
  const value={...a};
  for(const field of Object.keys(defaults).concat(['w','h','radius']))if(typeof a[field]==='number'&&typeof b[field]==='number')value[field]=a[field]+(b[field]-a[field])*p;
  return value;
}
function matrix(p) {
  const x=rad(p.rx),y=rad(p.ry),z=rad(p.rz),sx=Math.sin(x),cx=Math.cos(x),sy=Math.sin(y),cy=Math.cos(y),sz=Math.sin(z),cz=Math.cos(z);
  const rx=[1,0,0,0,0,cx,-sx,0,0,sx,cx,0,0,0,0,1];
  const ry=[cy,0,sy,0,0,1,0,0,-sy,0,cy,0,0,0,0,1];
  const rz=[cz,-sz,0,0,sz,cz,0,0,0,0,1,0,0,0,0,1];
  const s=p.scale,place=[s,0,0,p.x,0,s,0,p.y,0,0,s,p.z,0,0,0,1];
  const rotate=multiply(rz,multiply(ry,rx));
  const px=((p.pivotX??p.anchorX??.5)-(p.anchorX??.5))*(p.w??0),py=((p.pivotY??p.anchorY??.5)-(p.anchorY??.5))*(p.h??0);
  if(!px&&!py)return multiply(place,rotate);
  const before=identity(),after=identity();before[3]=px;before[7]=py;after[3]=-px;after[7]=-py;
  return multiply(place,multiply(before,multiply(rotate,after)));
}
function surfacePaintOrder(items,byId){
  const available=new Map(items.map(item=>[item.node.id,item])),incoming=new Map(items.map(item=>[item.node.id,0])),after=new Map();
  for(const child of items){
    let id=child.node.parent;while(id&&(!available.has(id)||available.get(id).node.kind==='group'))id=byId.get(id)?.parent;
    const parent=available.get(id);if(!parent)continue;
    const p=parent.matrix,q=child.matrix,normal=[p[2],p[6],p[10]],distance=(q[3]-p[3])*normal[0]+(q[7]-p[7])*normal[1]+(q[11]-p[11])*normal[2];
    // A label on a tilted surface can have a smaller average camera depth
    // than that whole surface. It still belongs on the surface's visible side.
    const front=distance*parent.facing>=-1e-7,[first,last]=front?[parent,child]:[child,parent];
    if(!after.has(first.node.id))after.set(first.node.id,[]);after.get(first.node.id).push(last.node.id);incoming.set(last.node.id,incoming.get(last.node.id)+1);
  }
  // Preserve hierarchy constraints. Add only consistent geometric dependencies;
  // crossing planes/cyclic occlusions still require per-pixel depth compositing.
  const reaches=(from,to,seen=new Set())=>from===to||!seen.has(from)&&(seen.add(from),(after.get(from)??[]).some(id=>reaches(id,to,seen)));
  for(const edge of surfaceDepthEdges(items)){
    if(reaches(edge.from,edge.to)||reaches(edge.to,edge.from))continue;
    if(!after.has(edge.from))after.set(edge.from,[]);after.get(edge.from).push(edge.to);incoming.set(edge.to,incoming.get(edge.to)+1);
  }
  const pending=[...items].sort((a,b)=>a.depth-b.depth),ordered=[];
  while(pending.length){const index=pending.findIndex(item=>incoming.get(item.node.id)===0);if(index<0)throw Error('Cyclic surface paint order');const [item]=pending.splice(index,1);ordered.push(item);for(const id of after.get(item.node.id)??[])incoming.set(id,incoming.get(id)-1);}
  return ordered;
}
export function stageFrame(stage,t,height=562.5) {
  const camera=stagePose({track:stage.camera},t,{x:500,y:height/2});
  const view=matrix({...camera,x:0,y:0,z:0,scale:1,rx:-camera.rx,ry:-camera.ry,rz:-camera.rz});
  const focal=stage.perspective??1800,byId=new Map(stage.nodes.map(node=>[node.id,node])),cache=new Map();
  const poses=new Map(stage.nodes.map(node=>[node.id,orbitPose(node,stagePose(node,t,{z:node.kind==='glow'?-600:node.parent?1:0}),t)]));
  const fitted=new Set();
  const fitParent=node=>{if(fitted.has(node.id))return;fitted.add(node.id);const parent=byId.get(node.parent);if(parent)fitParent(parent);if(node.fitToParent&&parent){const p=poses.get(node.id),q=poses.get(parent.id);poses.set(node.id,{...p,w:Math.max(1,q.w-2*node.fitToParent.x),h:Math.max(1,q.h-2*node.fitToParent.y)});}};
  for(const node of stage.nodes)fitParent(node);
  for(const node of stage.nodes){
    if(node.dock)poses.set(node.id,dockPose(node,poses.get(node.id),poses.get(node.parent)));
    if(node.focus){const p=poses.get(node.id),phase=poses.get(node.focus.target)?.value??0,dim=node.focus.dim??.3;poses.set(node.id,{...p,opacity:p.opacity*(dim+(1-dim)*Math.max(0,1-Math.abs(phase-node.focus.index)))});}
  }
  for(const group of stage.nodes.filter(node=>node.layout))for(const [id,pose] of inlinePositions(stage.nodes.filter(node=>node.parent===group.id),poses,group.layout,t))poses.set(id,pose);
  const world=node=>{
    if(cache.has(node.id))return cache.get(node.id);
    const pose=poses.get(node.id),parent=node.parent&&world(byId.get(node.parent));
    const m=multiply(parent?.matrix??identity(),matrix(pose)),normal=transform(view,[m[2],m[6],m[10]]),culled=parent?.culled||node.backface==='hide'&&normal[2]<=0;
    const result={pose,matrix:m,culled,opacity:pose.opacity*(parent?.opacity??1)*(t>=node.start&&t<node.end?1:0),blur:Math.max(pose.blur,parent?.blur??0)};
    cache.set(node.id,result);return result;
  };
  const project=point=>{
    const v=transform(view,[point[0]-camera.x,point[1]-camera.y,point[2]+camera.z]);
    if(v[2]>focal-100)return null;
    const scale=focal/(focal-v[2])*camera.scale;
    return {x:500+v[0]*scale,y:height/2+v[1]*scale,z:v[2]};
  };
  const items=stage.nodes.filter(node=>t>=node.start&&t<node.end).flatMap(node=>{
    const w=world(node);if(w.opacity<.002||w.culled)return [];
    const {pose,matrix:m}=w;
    const point=(u,v)=>project(transform(m,[(u-(pose.anchorX??.5))*pose.w,(v-(pose.anchorY??.5))*pose.h,0]));
    const points=[[0,0],[1,0],[1,1],[0,1]].map(([u,v])=>point(u,v));
    if(points.some(p=>!p))return [];
    const normal=transform(view,[m[2],m[6],m[10]]),length=Math.hypot(...normal)||1;
    if(node.backface==='hide'&&normal[2]<=0)return [];
    const light=.68+.36*Math.max(0,(-.34*normal[0]-.48*normal[1]+.81*normal[2])/length);
    return [{node,...w,points,point,focal,facing:normal[2],light:Math.min(1,light),depth:points.reduce((sum,p)=>sum+p.z,0)/4}];
  });
  return surfacePaintOrder(items,byId);
}
const rgba=(hex,alpha)=>`rgba(${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)},${alpha})`;
const rounded=(c,x,y,w,h,r)=>{c.beginPath();c.roundRect(x,y,w,h,Math.max(0,Math.min(r??0,w/2,h/2)));};
function icon(c,name,w,h,color,body=color) {
  c.save();c.translate(w/2,h/2);const s=Math.min(w,h)*.7;c.scale(s/100,s/100);c.lineWidth=5;c.lineCap='round';c.lineJoin='round';c.strokeStyle=color;c.fillStyle=body;c.beginPath();
  if(name==='check'){c.moveTo(-30,0);c.lineTo(-6,24);c.lineTo(34,-27);c.stroke();}
  else if(name==='paw'){for(const [x,y,r]of[[-25,-20,10],[-8,-33,10],[13,-31,10],[31,-15,10],[0,15,23]]){c.moveTo(x+r,y);c.ellipse(x,y,r,r*1.15,0,0,Math.PI*2);}c.fill();}
  else if(name==='lock'){c.roundRect(-30,-8,60,48,9);c.fill();c.stroke();c.beginPath();c.arc(0,-8,20,Math.PI,0);c.stroke();}
  else if(name==='box'){c.rect(-32,-30,64,60);c.fill();c.moveTo(-32,-12);c.lineTo(32,-12);c.moveTo(0,-30);c.lineTo(0,7);c.stroke();}
  else if(name==='calendar'){c.roundRect(-33,-30,66,64,8);c.fill();c.moveTo(-33,-10);c.lineTo(33,-10);c.moveTo(-17,-40);c.lineTo(-17,-22);c.moveTo(17,-40);c.lineTo(17,-22);c.stroke();}
  else if(name==='pause'){c.roundRect(-23,-30,14,60,3);c.roundRect(9,-30,14,60,3);c.fill();}
  else if(name==='arrow'){c.moveTo(-38,0);c.lineTo(35,0);c.moveTo(10,-25);c.lineTo(35,0);c.lineTo(10,25);c.stroke();}
  else if(name==='clock'){c.arc(0,0,35,0,Math.PI*2);c.moveTo(0,-22);c.lineTo(0,0);c.lineTo(19,12);c.stroke();}
  else if(name==='heart'){c.moveTo(0,32);c.bezierCurveTo(-65,-5,-25,-60,0,-24);c.bezierCurveTo(25,-60,65,-5,0,32);c.fill();}
  else if(name==='cart'){c.moveTo(-42,-32);c.lineTo(-29,-32);c.lineTo(-18,18);c.lineTo(29,18);c.lineTo(39,-15);c.lineTo(-25,-15);c.stroke();for(const x of[-12,25]){c.beginPath();c.arc(x,32,5,0,Math.PI*2);c.fill();}}
  else if(name==='cursor'){c.moveTo(-25,-38);c.lineTo(-20,32);c.lineTo(-3,15);c.lineTo(14,43);c.lineTo(27,35);c.lineTo(10,8);c.lineTo(35,5);c.closePath();c.fill();c.strokeStyle='#777777';c.lineWidth=2;c.stroke();}
  c.restore();
}
function texture(node,pose,resources) {
  // A resizing image plane must refit its content at the current aspect ratio.
  // Stretching a cached natural-size texture bends type during UI handoffs.
  const resize=['plane','image','logo','text','counter'].includes(node.kind);
  const w=resize?pose.w:node.w,h=resize?pose.h:node.h;
  const factor=Math.min(2,Math.max(.6,resources.resolution??1),(node.kind==='glow'?700:2400)/Math.max(w,h),Math.sqrt(2_000_000/(w*h)));
  const shade=node.material==='matte'?Math.round((resources.surfaceLight??1)*32)/32:1;
  const signature=[factor,w,h,node.kind==='counter'?Math.round(pose.value):'',node.kind==='path'||node.revealDirection?pose.reveal:'',pose.radius,shade].join(':');
  const cached=textures.get(node);if(cached?.signature===signature)return cached;
  const canvas=resources.makeCanvas(Math.ceil(w*factor),Math.ceil(h*factor)),c=canvas.getContext('2d');c.scale(factor,factor);
  const P=resources.palette,fill=P[node.fill??'surface'],ink=P[node.ink??'foreground'],r=pose.radius??node.radius??(node.material==='phone'?Math.min(w,h)*.1:24);
  let inkBox={x:0,y:0,w,h},paintedFont,textLayout;
  if(node.kind==='glow') {
    c.save();c.scale(1,h/w);const gradient=c.createRadialGradient(w/2,w/2,0,w/2,w/2,w/2);
    gradient.addColorStop(0,rgba(fill,.8));gradient.addColorStop(.25,rgba(fill,.35));gradient.addColorStop(1,rgba(fill,0));c.fillStyle=gradient;c.fillRect(0,0,w,w);c.restore();
  } else {
    const glass=['glass','liquid-glass'].includes(node.material),surface=node.kind==='plane'||glass||node.material==='phone';
    if(surface){
      rounded(c,1,1,w-2,h-2,r);
      if(glass){
        const g=c.createLinearGradient(0,0,w,h);g.addColorStop(0,rgba(ink,.15));g.addColorStop(.45,rgba(fill,.08));g.addColorStop(1,rgba(ink,.04));c.fillStyle=g;
      } else c.fillStyle=fill;
      c.fill();c.strokeStyle=rgba(ink,glass?.4:.14);c.lineWidth=1.5;c.stroke();
      if(glass) {rounded(c,4,4,w-8,h-8,r-2);c.strokeStyle=rgba(ink,.1);c.stroke();}
    }
    if(['image','logo'].includes(node.kind)){
      const asset=resources.images.get(node.assetId);
      const image=node.kind==='logo'?resources.logo:node.fit!=='cover'&&node.material!=='phone'?(asset?.subject??asset?.image):asset?.image;
      if(image){
        const inset=node.material==='phone'?Math.max(5,w*.025):0;
        c.save();rounded(c,inset,inset,w-2*inset,h-2*inset,Math.max(0,r-inset));c.clip();
        if(node.revealDirection){
          const r=Math.max(0,Math.min(1,pose.reveal));c.beginPath();
          if(node.revealDirection==='right')c.rect(w*(1-r),0,w*r,h);
          else if(node.revealDirection==='up')c.rect(0,0,w,h*r);
          else if(node.revealDirection==='down')c.rect(0,h*(1-r),w,h*r);
          else c.rect(0,0,w*r,h);
          c.clip();
        }
        const scale=(node.fit==='cover'?Math.max:Math.min)((w-2*inset)/image.width,(h-2*inset)/image.height);
        const iw=image.width*scale,ih=image.height*scale;c.drawImage(image,(w-iw)/2,(h-ih)/2,iw,ih);c.restore();
        if(node.fit!=='cover'&&node.material!=='phone')inkBox={x:(w-iw)/2,y:(h-ih)/2,w:iw,h:ih};
        if(node.material==='phone') {c.fillStyle='#101014';rounded(c,w*.34,h*.018,w*.32,Math.max(4,h*.014),9);c.fill();}
      }
    }
    if(node.kind==='icon')icon(c,node.icon,w,h,ink,node.fill?fill:ink);
    if(node.kind==='path'){
      c.save();c.beginPath();c.rect(0,0,w*pose.reveal,h);c.clip();c.beginPath();
      node.points.forEach((point,i)=>i?c.lineTo(point.x,point.y):c.moveTo(point.x,point.y));
      c.strokeStyle=ink;c.lineWidth=node.lineWidth??3;c.lineCap='round';c.lineJoin='round';c.stroke();c.restore();
    }
    if(['text','counter'].includes(node.kind)){
      const text=node.kind==='counter'?Math.round(pose.value)+(node.suffix??''):node.text;
      const family=resources.fontFamilies?.[node.font]??resources.fontFamily??'Inter';
      const layout=measureStageText(c,text,{w,h,size:node.fontSize??64,weight:node.weight??600,family,mode:node.textMode??'box',baseline:(node.anchorY??.75)*h,padding:(node.anchorX??0)*w});
      c.fillStyle=ink;paintedFont=layout.fontSize;textLayout=layout;
      layout.lines.forEach(line=>c.fillText(line.text,line.x,line.y));inkBox=layout.inkBox;
    }
  }
  if(shade<1){c.globalCompositeOperation='source-atop';c.fillStyle=`rgba(0,0,0,${1-shade})`;c.fillRect(0,0,w,h);c.globalCompositeOperation='source-over';}
  const value={canvas,inkBox:['text','counter'].includes(node.kind)?inkBox:node.inkBox??inkBox,width:w,height:h,fontSize:paintedFont,textLayout,signature};textures.set(node,value);return value;
}
function triangle(c,image,source,dest) {
  const [a,b,d]=source,[p,q,r]=dest,det=a.x*(b.y-d.y)+b.x*(d.y-a.y)+d.x*(a.y-b.y);
  if(Math.abs(det)<.0001)return;
  const solve=field=>[(p[field]*(b.y-d.y)+q[field]*(d.y-a.y)+r[field]*(a.y-b.y))/det,
    (p[field]*(d.x-b.x)+q[field]*(a.x-d.x)+r[field]*(b.x-a.x))/det,
    (p[field]*(b.x*d.y-d.x*b.y)+q[field]*(d.x*a.y-a.x*d.y)+r[field]*(a.x*b.y-b.x*a.y))/det];
  const x=solve('x'),y=solve('y');c.save();c.beginPath();
  const center={x:(p.x+q.x+r.x)/3,y:(p.y+q.y+r.y)/3};
  [p,q,r].forEach((point,i)=>{const dx=point.x-center.x,dy=point.y-center.y,len=Math.hypot(dx,dy)||1;const X=point.x+dx/len*.35,Y=point.y+dy/len*.35;i?c.lineTo(X,Y):c.moveTo(X,Y);});
  c.closePath();c.clip();c.transform(x[0],y[0],x[1],y[1],x[2],y[2]);c.drawImage(image,0,0);c.restore();
}
function polygon(c,points){c.beginPath();points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();}
function viewportPath(c,item){
  const {points:p,pose}=item,r=Math.max(0,Math.min(pose.radius??0,pose.w/2,pose.h/2));
  if(!r)return polygon(c,p);
  const lerp=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
  c.beginPath();
  for(let i=0;i<4;i++){
    const corner=p[i],prev=p[(i+3)%4],next=p[(i+1)%4];
    const start=lerp(corner,prev,r/(i%2?pose.w:pose.h));
    const end=lerp(corner,next,r/(i%2?pose.h:pose.w));
    if(i)c.lineTo(start.x,start.y);else c.moveTo(start.x,start.y);
    c.quadraticCurveTo(corner.x,corner.y,end.x,end.y);
  }
  c.closePath();
}
function mesh(c,image,frame) {
  const p=frame.points;
  const affine=Math.hypot(p[0].x+p[2].x-p[1].x-p[3].x,p[0].y+p[2].y-p[1].y-p[3].y)<.05;
  if(affine){c.save();c.transform((p[1].x-p[0].x)/image.width,(p[1].y-p[0].y)/image.width,(p[3].x-p[0].x)/image.height,(p[3].y-p[0].y)/image.height,p[0].x,p[0].y);c.drawImage(image,0,0);c.restore();return;}
  const grid=6;
  for(let row=0;row<grid;row++)for(let col=0;col<grid;col++){
    const uv=[[col/grid,row/grid],[(col+1)/grid,row/grid],[(col+1)/grid,(row+1)/grid],[col/grid,(row+1)/grid]];
    const dst=uv.map(([u,v])=>frame.point(u,v));if(dst.some(p=>!p))continue;
    const src=uv.map(([u,v])=>({x:u*image.width,y:v*image.height}));
    triangle(c,image,[src[0],src[1],src[2]],[dst[0],dst[1],dst[2]]);triangle(c,image,[src[0],src[2],src[3]],[dst[0],dst[2],dst[3]]);
  }
}
export function paintStage(c,element,frame,resources) {
  const width=resources.width,height=resources.height,unit=width/1000,H=height/unit;
  const t=(frame-element.start)/(element.end-element.start),items=stageFrame(element.stage,t,H);
  c.save();c.scale(unit,unit);
  const stageMatrix=c.getTransform(),pixelScale=c.canvas.width/width;
  const geometry=new Map(items.map(item=>[item.node.id,item]));
  const layers=[],painted=new Map();
  for(const item of items){
    const {node,pose}=item;
    if(node.kind==='group')continue;
    const tex=texture(node,pose,{...resources,surfaceLight:item.light});
    c.save();c.globalAlpha*=item.opacity;
    const clip=geometry.get(node.clipTo??(node.clipToParent?node.parent:null));
    if(clip){viewportPath(c,clip);c.clip();}
    const optical=['glass','liquid-glass'].includes(node.material)&&resources.backdrop;
    let opticalLayer;
    if(optical){
      const snapshot=resources.backdrop,sc=snapshot.getContext('2d');sc.setTransform(1,0,0,1,0,0);sc.globalCompositeOperation='copy';sc.drawImage(c.canvas,0,0);sc.globalCompositeOperation='source-over';
      if(resources.glassPainter===undefined){const canvas=resources.makeCanvas(c.canvas.width,c.canvas.height);resources.glassPainter=glassPainter(canvas);resources.glassMode=resources.glassPainter?'webgl-refraction':'frosted-canvas-fallback';}
      if(resources.glassPainter)opticalLayer=resources.glassPainter(node,snapshot,item,c.getTransform(),element.stage.perspective??1800,resources.palette);
      else{c.save();viewportPath(c,item);c.clip();c.setTransform(1,0,0,1,0,0);c.filter=`blur(${glassSettings(node,pose).blur*resources.resolution}px)`;c.drawImage(snapshot,0,0);c.restore();}
    }
    // Rasterize a whole projected surface once before compositing it. Repeated
    // translucent triangle edges must not accumulate alpha or blur separately.
    if(resources.projective===undefined)resources.projective=projectivePainter(resources.gpu);
    let layer;
    if(opticalLayer)layer=opticalLayer;
    else if(resources.projective)layer=resources.projective(node,tex.canvas,item.points,c.getTransform(),element.stage.perspective??1800);
    else {
      layer=resources.layer;const lc=layer.getContext('2d');
      lc.setTransform(1,0,0,1,0,0);lc.clearRect(0,0,layer.width,layer.height);
      lc.setTransform(c.getTransform());lc.globalCompositeOperation='copy';
      mesh(lc,tex.canvas,item);lc.globalCompositeOperation='source-over';
    }
    c.setTransform(1,0,0,1,0,0);
    if(item.blur>.05)c.filter=`blur(${item.blur*resources.resolution}px)`;
    c.drawImage(layer,0,0);c.restore();
    const ink=tex.inkBox,tw=tex.width,th=tex.height,points=[[ink.x/tw,ink.y/th],[(ink.x+ink.w)/tw,ink.y/th],[(ink.x+ink.w)/tw,(ink.y+ink.h)/th],[ink.x/tw,(ink.y+ink.h)/th]].map(([u,v])=>item.point(u,v));
    if(points.some(p=>!p))continue;
    if(resources.check&&node.kind==='text')painted.set(node.id,points);
    if(node.kind==='glow'||node.kind==='path'||node.role==='decoration'||item.opacity<.85||item.blur>1)continue;
    const native=points.map(point=>{const p=stageMatrix.transformPoint(point);return {x:p.x/pixelScale,y:p.y/pixelScale};});
    const parent=geometry.get(node.clipTo??(node.clipToParent?node.parent:null));
    const contained=!parent||points.every(point=>{
      const signs=parent.points.map((a,i)=>{const b=parent.points[(i+1)%4];return (b.x-a.x)*(point.y-a.y)-(b.y-a.y)*(point.x-a.x);});
      return signs.every(s=>s>=-.5)||signs.every(s=>s<=.5);
    });
    const fontScale=Math.hypot(native[3].x-native[0].x,native[3].y-native[0].y)/Math.max(1,ink.h);
    layers.push({id:element.id+'-'+node.id,parent:node.parent?element.id+'-'+node.parent:undefined,
      readable:contained&&(!tex.fontSize||tex.fontSize*fontScale>=Math.max(18,Math.min(width,height)*.02)),
      content:node.role!=='background'&&['text','counter','image','logo','icon'].includes(node.kind),background:node.kind==='plane'||node.role==='background',underlay:node.kind==='plane'||node.role==='background',allowCrop:node.crop==='allow',
      occludes:(node.contacts??[]).filter(contact=>t>=contact.from&&t<=contact.to).map(contact=>element.id+'-'+contact.target),
      bounds:{left:Math.min(...native.map(p=>p.x)),right:Math.max(...native.map(p=>p.x)),top:Math.min(...native.map(p=>p.y)),bottom:Math.max(...native.map(p=>p.y)),points:native}});
  }
  for(const occluder of layers)for(const target of layers.filter(layer=>occluder.occludes.includes(layer.id))){
    const a=occluder.bounds,b=target.bounds,overlap=Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
    if(overlap>((b.right-b.left)*(b.bottom-b.top))*.1)target.readable=false;
  }
  if(resources.check){
    resources.framing?.sample(frame,element.id,stagePose({track:element.stage.camera},t,{x:500,y:H/2}),items,painted,H);
    const safety=stageSafety(items,painted,{height:H,t});
    for(const event of element.stage.events??[]){
      if(event.kind!=='click'||Math.abs(frame-(element.start+event.t*(element.end-element.start)))>.55)continue;
      const exact=stageFrame(element.stage,event.t,H),target=exact.find(i=>i.node.id===event.actor);
      for(const pointer of exact.filter(i=>i.node.pointer?.target===event.actor)){
        const p=pointer.node.pointer,tip=pointer.point(p.tipX,p.tipY);
        if(!target||!tip||!insidePolygon(target.points,tip))safety.push({code:'pointer_misses_control',target:pointer.node.id,related:event.actor});
      }
    }
    Object.defineProperty(layers,'safety',{value:safety});
  }
  c.restore();return layers;
}

export function stageTextActors(element,fps=30) {
  return element.stage.nodes.filter(node=>node.kind==='text').map(node=>{
    const full=expandStageTrack(node.track??[],{opacity:1,blur:0});
    const settled=full.find(key=>key.opacity>=.98&&key.blur<1)?.t??node.start;
    return {id:element.id+'-'+node.id,kind:'text',text:node.text,start:element.start+node.start*(element.end-element.start),
      end:element.start+node.end*(element.end-element.start),enterFrames:Math.max(0,(settled-node.start)*(element.end-element.start))};
  });
}

// Read-only diagnostics use the same loaded font, fitted texture and projected
// geometry as the actual browser painter, including dynamic parent dimensions.
export function stageGeometry(element,frame,resources){
  const H=1000*resources.height/resources.width,t=(frame-element.start)/(element.end-element.start);
  return stageFrame(element.stage,t,H).map(item=>{
    const {node,pose}=item,tex=node.kind==='group'?null:texture(node,pose,{...resources,surfaceLight:item.light});
    return {id:node.id,kind:node.kind,parent:node.parent,text:node.text,opacity:item.opacity,points:item.points,center:item.point(.5,.5),pose:{x:pose.x,y:pose.y,w:pose.w,h:pose.h,rx:pose.rx,ry:pose.ry,rz:pose.rz,z:pose.z},control:node.control,pointer:node.pointer,
      ...(tex?{inkPoints:[[tex.inkBox.x,tex.inkBox.y],[tex.inkBox.x+tex.inkBox.w,tex.inkBox.y],[tex.inkBox.x+tex.inkBox.w,tex.inkBox.y+tex.inkBox.h],[tex.inkBox.x,tex.inkBox.y+tex.inkBox.h]].map(([x,y])=>item.point(x/tex.width,y/tex.height)),fontSize:tex.fontSize,
        inkCenter:item.point((tex.inkBox.x+tex.inkBox.w/2)/tex.width,(tex.inkBox.y+tex.inkBox.h/2)/tex.height),baselines:tex.textLayout?.lines.map(line=>item.point(line.x/tex.width,line.y/tex.height))}:{}),
      ...(node.pointer?{pointerTip:item.point(node.pointer.tipX,node.pointer.tipY)}:{})};
  });
}
