// Connected arm rig. Thinking is a coordinated contact pose, not two unrelated
// angle presets: the free hand reaches the jaw and the other supports its elbow.
const clamp=x=>Math.max(0,Math.min(1,x));
const ease=x=>{x=clamp(x);return x*x*(3-2*x);};
const blend=(a,b,t)=>a+(b-a)*t;
const rad=x=>x*Math.PI/180,deg=x=>x*180/Math.PI;
const poses={carry:{shoulder:-5,elbow:95,hand:'grip',amount:.85},reach:{shoulder:12,elbow:80,hand:'open',amount:1.05},point:{shoulder:10,elbow:90,hand:'point',amount:1.05},celebrate:{shoulder:135,elbow:35,hand:'open',amount:1.1},talk:{shoulder:-3,elbow:64,hand:'open',amount:1}};
const normalAngle=a=>((a+540)%360)-180;
const thinkingAmount=p=>p.actionPose==='think'?clamp(Math.abs(p.gesture??0)/1.65)*(p.fromArms?clamp(p.armBlend??1):1):0;

export function characterHeadPose(style,physical={}){
  const amount=physical.actionPose==='think'?clamp(Math.abs(physical.gesture??0)/1.65):0,side=physical.activeHand==='left'?-1:1,bodyOffset=physical.bodyOffset??0;
  let center=[style.rig.head[0],style.rig.head[1]+bodyOffset+13*amount],rotation=side*.035*amount,thinking=amount;
  if(physical.fromHead){
    const from=physical.fromHead,p=clamp(physical.armBlend??1),offset=bodyOffset-(from.bodyOffset??0);
    center=[blend(from.center[0],center[0],p),blend(from.center[1]+offset,center[1],p)];rotation=blend(from.rotation,rotation,p);thinking=blend(from.thinking,thinking,p);
  }else if(physical.fromArms){const p=clamp(physical.armBlend??1);center[1]=style.rig.head[1]+bodyOffset+13*amount*p;rotation*=p;thinking*=p;}
  return {center,rotation,thinking,bodyOffset};
}
function chinAtRest(style,side,bodyOffset){
  const scale=style.rig.headScale??1,chin=style.id==='minimal-stickman'?90:78*scale;
  const rotation=side*.035,x=side*12,y=chin;
  return [style.rig.head[0]+Math.cos(rotation)*x-Math.sin(rotation)*y,style.rig.head[1]+bodyOffset+13+Math.sin(rotation)*x+Math.cos(rotation)*y];
}
function chain(style,side,upperAngle,bend,physical,extra={}){
  const rig=style.rig.arms,shoulder=[side*rig.x,rig.y+(physical.bodyOffset??0)];
  const upper=[side*Math.sin(rad(upperAngle)),Math.cos(rad(upperAngle))],forearmAngle=upperAngle+bend;
  const forearm=[side*Math.sin(rad(forearmAngle)),Math.cos(rad(forearmAngle))];
  const elbow=[shoulder[0]+upper[0]*rig.upper,shoulder[1]+upper[1]*rig.upper];
  const wrist=[elbow[0]+forearm[0]*rig.lower,elbow[1]+forearm[1]*rig.lower];
  const hand=[wrist[0]+forearm[0]*11*rig.palm,wrist[1]+forearm[1]*11*rig.palm];
  const cuff=[shoulder[0]+upper[0]*rig.sleeve,shoulder[1]+upper[1]*rig.sleeve];
  return {side,shoulder,elbow,wrist,hand,cuff,upper,forearm,upperAngle,bend,...extra};
}
function inverse(style,side,target,physical){
  const rig=style.rig.arms,s=[side*rig.x,rig.y+(physical.bodyOffset??0)];
  const dx=target[0]-s[0],dy=target[1]-s[1],distance=Math.hypot(dx,dy),d=Math.max(Math.abs(rig.upper-rig.lower)+.001,Math.min(rig.upper+rig.lower-.001,distance));
  const ux=dx/Math.max(.001,distance),uy=dy/Math.max(.001,distance),along=(rig.upper**2-rig.lower**2+d*d)/(2*d),height=Math.sqrt(Math.max(0,rig.upper**2-along*along));
  const elbow=[s[0]+ux*along+side*uy*height,s[1]+uy*along-side*ux*height];
  const wrist=[s[0]+ux*d,s[1]+uy*d],upperAngle=deg(Math.atan2((elbow[0]-s[0])*side,elbow[1]-s[1]));
  const forearmAngle=deg(Math.atan2((wrist[0]-elbow[0])*side,wrist[1]-elbow[1]));
  return chain(style,side,upperAngle,normalAngle(forearmAngle-upperAngle),physical);
}
function contactArm(style,side,target,reach,physical){
  let wrist=[target[0],target[1]+reach],arm;
  for(let i=0;i<14;i++){
    arm=inverse(style,side,wrist,physical);
    wrist=[wrist[0]+target[0]-arm.wrist[0]-arm.forearm[0]*reach,wrist[1]+target[1]-arm.wrist[1]-arm.forearm[1]*reach];
  }
  return inverse(style,side,wrist,physical);
}
function wristArc(start,end,p){
  const t=ease(p),a=[start[0],start[1]-(start[1]-end[1])*.36],b=[end[0]+(start[0]-end[0])*.15,end[1]+(start[1]-end[1])*.22],v=1-t;
  return [v**3*start[0]+3*v*v*t*a[0]+3*v*t*t*b[0]+t**3*end[0],v**3*start[1]+3*v*v*t*a[1]+3*v*t*t*b[1]+t**3*end[1]];
}
function chinArc(start,end,p,side){
  const t=ease(p),v=1-t,a=[-side*35,start[1]-5],b=[-side*20,end[1]+60];
  return [v**3*start[0]+3*v*v*t*a[0]+3*v*t*t*b[0]+t**3*end[0],v**3*start[1]+3*v*v*t*a[1]+3*v*t*t*b[1]+t**3*end[1]];
}
function ordinary(style,physical){
  const rig=style.rig.arms,{gesture=0,bothHands=false,activeHand='right',fromArms,armBlend=1}=physical;
  const profile=poses[physical.actionPose]??((physical.speaking||!physical.actionPose)&&Math.abs(gesture)>.001?poses.talk:null);
  return [-1,1].map(side=>{
    const active=gesture*(side===(activeHand==='left'?-1:1)||bothHands?1:.28),amount=profile?clamp(Math.abs(active)/profile.amount):0;
    const target=active<0&&profile===poses.talk?{shoulder:15,elbow:12}:profile;
    let upperAngle=blend(rig.restShoulder,target?.shoulder??rig.restShoulder,amount),bend=blend(rig.restElbow,target?.elbow??rig.restElbow,amount);
    const previous=fromArms?.find(j=>j.side===side);
    if(previous){
      const progress=clamp(armBlend);
      if(previous.thinking>.2&&['chin','support'].includes(previous.handShape)&&progress<.8){
        const rest=chain(style,side,rig.restShoulder,rig.restElbow,physical),dy=rest.shoulder[1]-previous.shoulder[1];
        const start=[previous.wrist[0],previous.wrist[1]+dy],target=previous.handShape==='chin'?chinArc(rest.wrist,start,1-progress/.8,side):wristArc(start,rest.wrist,progress/.8),arm=inverse(style,side,target,physical);
        return {...arm,active,amount,handShape:progress<.4?previous.handShape:'relaxed'};
      }
      const base=previous.thinking>.2&&['chin','support'].includes(previous.handShape)?{upperAngle:rig.restShoulder,bend:rig.restElbow}:previous;
      const p=base===previous?progress:ease((progress-.8)/.2);
      upperAngle=blend(base.upperAngle,upperAngle,p);bend=blend(base.bend,bend,p);
    }
    return chain(style,side,upperAngle,bend,physical,{active,amount,handShape:amount>.42?profile.hand:style.id==='minimal-stickman'?'pocket':'relaxed'});
  });
}
export function armJoints(style,physical={}){
  if(physical.actionPose!=='think')return ordinary(style,physical);
  const rig=style.rig.arms,amount=thinkingAmount(physical),activeSide=physical.activeHand==='left'?-1:1;
  const occupied=new Set((physical.occupiedHands??[]).map(hand=>hand==='left'?-1:1));
  const rest=new Map([-1,1].map(side=>[side,chain(style,side,rig.restShoulder,rig.restElbow,physical)]));
  const release=physical.fromArms?.length ? .16 : 0,progress=clamp((amount-release)/(1-release));
  const chin=chinAtRest(style,activeSide,physical.bodyOffset??0);
  const chinGoal=contactArm(style,activeSide,chin,20*rig.palm,physical);
  let chinArm;
  if(amount<release){
    const from=physical.fromArms.find(j=>j.side===activeSide),base=rest.get(activeSide),t=ease(amount/release);
    chinArm=chain(style,activeSide,blend(from.upperAngle,base.upperAngle,t),blend(from.bend,base.bend,t),physical);
  }else chinArm=inverse(style,activeSide,chinArc(rest.get(activeSide).wrist,chinGoal.wrist,clamp((progress-.1)/.9),activeSide),physical);
  const arms=[-1,1].map(side=>{
    let arm,handShape;
    if(occupied.has(side)){
      const from=physical.fromArms?.find(j=>j.side===side)??rest.get(side),goal=poses.carry;
      arm=chain(style,side,blend(from.upperAngle,goal.shoulder,ease(amount)),blend(from.bend,goal.elbow,ease(amount)),physical);handShape='grip';
    }else if(side===activeSide){arm=chinArm;handShape='chin';}
    else{
      const target=[chinArm.elbow[0],chinArm.elbow[1]+13],goal=contactArm(style,side,target,11*rig.palm,physical);
      if(amount<release){const from=physical.fromArms.find(j=>j.side===side),base=rest.get(side),t=ease(amount/release);arm=chain(style,side,blend(from.upperAngle,base.upperAngle,t),blend(from.bend,base.bend,t),physical);}
      else arm=inverse(style,side,wristArc(rest.get(side).wrist,goal.wrist,clamp(progress/.7)),physical);
      handShape='support';
    }
    return {...arm,amount,active:physical.gesture??0,handShape:amount>.2?handShape:style.id==='minimal-stickman'?'pocket':'relaxed',thinking:amount,front:amount>.1};
  });
  return arms;
}
