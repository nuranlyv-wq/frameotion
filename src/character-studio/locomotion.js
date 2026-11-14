// Full-body rig in native actor units. The floor is y=900.
const clamp=x=>Math.max(0,Math.min(1,x));
const ease=x=>{x=clamp(x);return x*x*(3-2*x);};
export function walkingMotion(node,time,start=0){
  let previous={...node},at=start,distance=0;
  const unit=Math.max(.01,node.w/330);
  for(const key of node.keys??[]){
    const next={...previous,...key},span=key.at-at;
    const length=Math.hypot(next.x-previous.x,next.y-previous.y)/unit;
    if(time<key.at){
      const u=clamp((time-at)/Math.max(.001,span));
      if(previous.pose!=='walk'||length<.01)return {distance:0,weight:0,direction:1};
      const speed=length*6*u*(1-u)/Math.max(.001,span);
      return {distance:distance+length*ease(u),weight:clamp(speed/65),direction:Math.sign(next.x-previous.x)||1};
    }
    if(previous.pose==='walk')distance+=length;
    previous=next;at=key.at;
  }
  return {distance,weight:0,direction:1};
}

function knee(hip,ankle,direction,upper,lower){
  const dx=ankle[0]-hip[0],dy=ankle[1]-hip[1],d=Math.hypot(dx,dy);
  const along=(upper*upper-lower*lower+d*d)/(2*d),bend=Math.sqrt(Math.max(0,upper*upper-along*along));
  return [hip[0]+dx/d*along+dy/d*bend*direction,hip[1]+dy/d*along-dx/d*bend*direction];
}

export function lowerBody({distance=0,weight=0,direction=1}={}, {hipY=714,upper=83,lower=85,hipWidth=47,stride=140}={}){
  weight=clamp(weight);const cycle=((distance/stride)%1+1)%1;
  // The shirt hides the hip joint. Breathing stays in the upper body, so a
  // standing character has straight legs and soles fixed to the floor.
  const pelvis=weight*7;
  return [-1,1].map((side,i)=>{
    const phase=(cycle+i*.5)%1,swing=phase>=.5,u=(phase-.5)*2;
    const travel=swing?-stride/4+stride/2*ease(u):stride*(.25-phase);
    const lift=swing?Math.sin(Math.PI*clamp(u))*27*weight:0;
    const hip=[side*hipWidth,hipY+pelvis];
    const ankle=[side*hipWidth+direction*travel*weight,882-lift];
    return {side,hip,knee:knee(hip,ankle,direction,upper,lower),ankle,sole:900-lift,contact:lift<.001,direction,facing:side+(direction-side)*weight};
  });
}

export function trouserPath(c,leg,{width=44}={}){
  const {hip:h,knee:k,ankle:a}=leg;
  // Tapered continuous contours keep the knee inside the trouser silhouette.
  c.moveTo(h[0]-width/2,h[1]-8);
  c.lineTo(k[0]-width*.47,k[1]-8);
  c.quadraticCurveTo(k[0]-width*.47,k[1]+3,a[0]-width*.34,a[1]+2);
  c.lineTo(a[0]+width*.34,a[1]+2);
  c.quadraticCurveTo(k[0]+width*.47,k[1]+3,k[0]+width*.47,k[1]-8);
  c.lineTo(h[0]+width/2,h[1]-8);
  c.closePath();
}

export function shoePath(c,leg){
  const x=leg.ankle[0],y=leg.sole,f=leg.facing??leg.direction;
  const left=27-8*f,right=27+8*f;
  c.moveTo(x-14,y-22);
  c.quadraticCurveTo(x-left,y-15,x-left,y-4);
  c.quadraticCurveTo(x-left,y,x-left+7,y);
  c.lineTo(x+right-6,y);
  c.quadraticCurveTo(x+right+3,y-2,x+right,y-9);
  c.quadraticCurveTo(x+right-3,y-15,x+15,y-18);
  c.lineTo(x+11,y-23);
  c.closePath();
}
