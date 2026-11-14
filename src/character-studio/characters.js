import {drawMouth} from './mouth.js';
import {lowerBody,trouserPath,shoePath} from './locomotion.js';
import {armJoints,characterHeadPose} from './arms.js';
import {CHARACTER_LIBRARY} from './cast.js';
const WHITE='#ffffff',BLACK='#151515';
const named={red:'#d96548',orange:'#e49550',yellow:'#dabb52',green:'#8ec74c',blue:'#588fac',purple:'#a37eb7',pink:'#d895ab',brown:'#9e704c',black:'#222522',white:WHITE,gray:'#969d96'};
const index=p=>{const i=p.appearance??(p.id==='lev'?1:p.id==='mira'?2:0);return Number.isInteger(i)&&i>=0&&i<CHARACTER_LIBRARY.length?i:0;};
function shape(c,path,fill,stroke=BLACK,width=3){c.beginPath();path(c);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.lineJoin='round';c.lineCap='round';c.stroke();}}
const oval=(c,x,y,rx,ry,fill,stroke=BLACK,width=3)=>shape(c,q=>q.ellipse(x,y,rx,Math.max(.5,ry),0,0,Math.PI*2),fill,stroke,width);
const line=(c,points,color=BLACK,width=3)=>shape(c,q=>{q.moveTo(...points[0]);for(const p of points.slice(1))q.lineTo(...p);},null,color,width);
const shirtColor=(p,style)=>style.id==='flat-2d'?(named[p.outfit]??CHARACTER_LIBRARY[index(p)].shirt):style.id==='minimal-stickman'?['#242725','#303330','#202420'][index(p)%3]:WHITE;
const skinColor=(p,style)=>style.id==='flat-2d'?CHARACTER_LIBRARY[index(p)].skin:WHITE;

export function characterBodyOffset(style,time,appearance=0){return Math.sin(time*1.55+appearance)*style.sway*1.2;}
export function characterJoints(style,physical={}){
  const head=characterHeadPose(style,physical);
  return {head:head.center,headRotation:head.rotation,thinking:head.thinking,hands:armJoints(style,physical)};
}
export function characterAnchor(style,anchor,physical){
  const j=characterJoints(style,physical),point=anchor==='head'?j.head:anchor==='hand-left'?j.hands[0].hand:anchor==='hand-right'?j.hands[1].hand:[0,900];
  return [point[0],point[1]-900];
}
function hair(c,p,style,back=false){
  const i=index(p),flat=style.id==='flat-2d';
  if(i>=3){
    if(back){
      if(i===6)shape(c,q=>{q.moveTo(48,-64);q.bezierCurveTo(127,-112,127,11,94,76);q.quadraticCurveTo(105,0,57,-3);q.closePath();},BLACK,null);
      return;
    }
    if(i===3){
      shape(c,q=>{q.moveTo(-64,0);q.lineTo(-66,-51);q.bezierCurveTo(-83,-99,-18,-117,15,-103);q.bezierCurveTo(77,-120,87,-51,64,-9);q.lineTo(51,-43);q.quadraticCurveTo(0,-67,-49,-36);q.closePath();},BLACK,null);
      for(const [x,y,r]of [[-49,-65,24],[-23,-86,25],[9,-86,24],[40,-74,25],[57,-51,19]])oval(c,x,y,r,r,BLACK,null);
    }else if(i===4){
      shape(c,q=>{q.moveTo(-65,1);q.lineTo(-68,-51);q.quadraticCurveTo(-52,-114,27,-100);q.quadraticCurveTo(76,-87,66,-22);q.lineTo(52,-34);q.lineTo(34,-70);q.quadraticCurveTo(-5,-40,-51,-44);q.lineTo(-51,2);q.closePath();},BLACK,null);
      line(c,[[27,-87],[31,-69]],flat?'#6b645c':'#fff',2.6);
    }else if(i===5){
      shape(c,q=>{q.moveTo(-63,-13);q.lineTo(-65,18);q.lineTo(-53,23);q.lineTo(-52,-14);q.closePath();},BLACK,null);
      shape(c,q=>{q.moveTo(63,-13);q.lineTo(65,18);q.lineTo(53,23);q.lineTo(52,-14);q.closePath();},BLACK,null);
    }else if(i===6){
      shape(c,q=>{q.moveTo(-65,-1);q.bezierCurveTo(-86,-104,43,-131,71,-48);q.lineTo(65,7);q.lineTo(51,-48);q.lineTo(24,-64);q.quadraticCurveTo(-5,-15,-49,-18);q.lineTo(-52,11);q.closePath();},BLACK,null);
    }
    return;
  }
  if(back){
    if(i===0)shape(c,q=>{q.moveTo(-67,-50);q.bezierCurveTo(-106,-135,89,-140,79,-35);q.bezierCurveTo(126,0,95,77,57,82);q.lineTo(-67,71);q.closePath();},BLACK,null);
    if(i===2){oval(c,-64,-55,30,31,BLACK,null);oval(c,64,-55,30,31,BLACK,null);}return;
  }
  shape(c,q=>{
    q.moveTo(-64,-5);
    if(i===1){q.bezierCurveTo(-92,-109,-45,-117,-21,-102);q.bezierCurveTo(-1,-132,73,-112,67,-52);q.lineTo(49,-27);q.lineTo(34,-69);q.quadraticCurveTo(8,-42,-32,-59);q.lineTo(-46,-18);}
    else if(i===0){q.bezierCurveTo(-96,-98,50,-133,74,-50);q.lineTo(60,7);q.lineTo(43,-54);q.bezierCurveTo(21,-12,-13,-10,-43,-17);q.lineTo(-52,14);}
    else{q.bezierCurveTo(-90,-113,84,-112,69,-6);q.lineTo(47,-25);q.lineTo(26,-62);q.quadraticCurveTo(5,-31,-36,-40);q.lineTo(-51,-3);}
    q.closePath();
  },BLACK,flat?null:BLACK,style.line);
}
function face(c,p,style){
  const i=index(p),stick=style.id==='minimal-stickman',flat=style.id==='flat-2d';
  const gaze=(p.gaze??0)*(stick?5:3),blink=Math.max(0,Math.min(1,p.blink??0));
  // Facial hair leaves the articulation area clear in every mouth shape.
  if(i===3)shape(c,q=>{q.moveTo(-57,25);q.quadraticCurveTo(-57,78,0,83);q.quadraticCurveTo(58,77,58,24);q.lineTo(45,35);q.quadraticCurveTo(0,94,-45,35);q.closePath();},BLACK,null);
  for(const side of [-1,1]){
    const x=side*(stick?29:23);
    if(blink>.65)shape(c,q=>{q.moveTo(x-7,5);q.quadraticCurveTo(x,10,x+7,5);},null,style.ink,stick?3.2:2.4);
    else oval(c,x+gaze,stick?6:4,stick?7:3.5,(stick?12:5)*(1-blink),style.ink,null);
    shape(c,q=>{q.moveTo(x-10,-15);q.quadraticCurveTo(x,-22-Math.abs(p.gesture)*2,x+8,-16);},null,style.ink,stick?3.2:2.4);
  }
  if(i===4){
    for(const side of [-1,1])shape(c,q=>{const x=side*(stick?30:25);q.roundRect(x-20,-9,40,31,7);},null,style.ink,stick?3:2.7);
    line(c,[[-5,4],[5,4]],style.ink,2.6);
  }
  if(i===5)shape(c,q=>{q.moveTo(-23,30);q.quadraticCurveTo(-10,18,0,26);q.quadraticCurveTo(11,18,24,30);q.quadraticCurveTo(9,36,0,30);q.quadraticCurveTo(-12,38,-23,30);},BLACK,null);
  if(i===6){
    for(const side of [-1,1])oval(c,side*(stick?83:65),33,8,13,null,style.ink,2.5);
  }
  if(!stick){
    shape(c,q=>{q.moveTo(3,6);q.lineTo(7,24);q.quadraticCurveTo(3,29,-2,24);},null,style.ink,1.8);
    if(i===0&&flat||i===1&&!flat){for(const side of [-1,1])oval(c,side*24,7,17,16,null,style.ink,2.2);line(c,[[-7,6],[7,6]],style.ink,2);}
    if(i===1&&!flat)shape(c,q=>{q.moveTo(-16,29);q.quadraticCurveTo(-4,17,0,25);q.quadraticCurveTo(9,16,17,29);q.quadraticCurveTo(3,36,0,31);q.quadraticCurveTo(-7,37,-16,29);},BLACK,null);
  }
  if(stick&&!p.speaking&&p.mouth<.025){
    shape(c,q=>{q.moveTo(-20,42);q.quadraticCurveTo(9,58,34,30);},null,style.ink,3.4);
  }else{c.save();c.translate(stick?8:0,0);c.scale(stick?1.08:.77,stick?1:.78);drawMouth(c,p,style,stick?44:51);c.restore();}
}
function head(c,p,style,joints){
  const stick=style.id==='minimal-stickman',flat=style.id==='flat-2d';
  c.save();c.translate(...joints.head);c.rotate((joints.headRotation??0)+(joints.thinking?0:(p.nod??0)*(stick?.045:.03)));
  c.scale(style.rig.headScale??1,style.rig.headScale??1);
  if(stick){
    if(index(p)===6)shape(c,q=>{q.moveTo(62,-66);q.bezierCurveTo(133,-115,132,-13,105,30);q.quadraticCurveTo(116,-32,74,-28);q.closePath();},BLACK,null);
    oval(c,0,0,88,90,WHITE,style.ink,3.8);
    if(index(p)>=3){
      const i=index(p);
      if(i===3)for(const [x,y,r]of [[-57,-78,16],[-31,-92,18],[0,-96,18],[31,-90,18],[56,-76,16]])oval(c,x,y,r,r,BLACK,null);
      if(i===4)shape(c,q=>{q.moveTo(-73,-51);q.quadraticCurveTo(-44,-124,39,-84);q.lineTo(68,-54);q.quadraticCurveTo(25,-83,-13,-57);q.quadraticCurveTo(-45,-41,-73,-51);q.closePath();},BLACK,null);
      if(i===5){line(c,[[-77,-14],[-74,8]],style.ink,4);line(c,[[77,-14],[74,8]],style.ink,4);}
      if(i===6)shape(c,q=>{q.moveTo(-78,-42);q.quadraticCurveTo(-60,-119,32,-84);q.quadraticCurveTo(71,-68,80,-33);q.lineTo(57,-48);q.lineTo(31,-68);q.quadraticCurveTo(-13,-27,-78,-42);q.closePath();},BLACK,null);
    }else{
    shape(c,q=>{
      if(index(p)===1){q.moveTo(-15,-89);q.quadraticCurveTo(-38,-117,-30,-123);q.quadraticCurveTo(-20,-131,-10,-112);q.moveTo(0,-91);q.lineTo(7,-112);}
      else if(index(p)===2){q.moveTo(-24,-87);q.quadraticCurveTo(-42,-114,-56,-103);q.moveTo(-7,-91);q.quadraticCurveTo(-13,-120,-34,-121);}
      else{q.moveTo(-23,-88);q.quadraticCurveTo(-32,-110,-44,-114);q.moveTo(-12,-91);q.quadraticCurveTo(-14,-115,-21,-125);q.moveTo(1,-91);q.quadraticCurveTo(8,-109,5,-120);}
    },null,style.ink,3.5);
    }
  }else{
    hair(c,p,style,true);const skin=skinColor(p,style);
    oval(c,-62,6,11,17,skin,flat?null:style.ink,2.8);oval(c,63,6,11,17,skin,flat?null:style.ink,2.8);
    shape(c,q=>{q.moveTo(-61,-43);q.bezierCurveTo(-72,-1,-57,63,-15,77);q.bezierCurveTo(27,84,66,48,64,-6);q.bezierCurveTo(65,-91,-47,-96,-61,-43);q.closePath();},skin,flat?null:style.ink,style.line);hair(c,p,style);
  }
  face(c,p,style);c.restore();
}
const offset=(p,v,d)=>[p[0]+v[0]*d,p[1]+v[1]*d];
function sleevePath(style,j){
  const rig=style.rig.arms,{shoulder:s,cuff:end,upper:u}=j,n=[u[1]*j.side,-u[0]*j.side],half=rig.sleeveWidth/2;
  const q=new Path2D();
    q.moveTo(j.side*50,s[1]-14);
    q.quadraticCurveTo(...offset(offset(s,n,half),u,-7),...offset(offset(s,n,half),u,13));
    q.lineTo(...offset(end,n,half));q.quadraticCurveTo(...offset(end,u,4),...offset(end,n,-half));q.closePath();
  return q;
}
function capsule(start,end,a,b,flatStart=false){
  const dx=end[0]-start[0],dy=end[1]-start[1],length=Math.max(.001,Math.hypot(dx,dy)),u=[dx/length,dy/length],n=[u[1],-u[0]],q=new Path2D();
  q.moveTo(...offset(start,n,a));q.lineTo(...offset(end,n,b));q.quadraticCurveTo(...offset(end,u,b*1.5),...offset(end,n,-b));
  q.lineTo(...offset(start,n,-a));if(flatStart)q.lineTo(...offset(start,n,a));else q.quadraticCurveTo(...offset(start,u,-a*1.5),...offset(start,n,a));q.closePath();return q;
}
function paintSkin(c,p,style,j){
  const rig=style.rig.arms,elbow=new Path2D();elbow.ellipse(...j.elbow,rig.elbowWidth/2,rig.elbowWidth/2,0,0,Math.PI*2);
  const paths=[capsule(offset(j.cuff,j.upper,-1),j.elbow,rig.upperWidth/2,rig.elbowWidth/2,true),capsule(j.elbow,j.wrist,rig.elbowWidth/2,rig.wristWidth/2),elbow];
  c.fillStyle=skinColor(p,style);for(const path of paths)c.fill(path);
  if(style.id!=='flat-2d')for(const path of paths){
    c.save();for(const other of paths)if(other!==path){const outside=new Path2D();outside.rect(-600,-200,1200,1400);outside.addPath(other);c.clip(outside,'evenodd');}
    c.strokeStyle=style.ink;c.lineWidth=style.id==='minimal-stickman'?2.2:style.line;c.lineJoin='round';c.stroke(path);c.restore();
  }
}
function hand(c,p,style,j){
  const f=j.forearm,n=[f[1],-f[0]],flat=style.id==='flat-2d';
  c.save();c.transform(n[0]*j.side,n[1]*j.side,f[0],f[1],...j.wrist);c.scale(style.rig.arms.palm,style.rig.arms.palm);
  shape(c,q=>{
    q.moveTo(6,-3);q.quadraticCurveTo(9,3,8,10);
    if(j.handShape==='chin'){
      q.quadraticCurveTo(10,14,5,20);q.quadraticCurveTo(1,22,-2,18);q.quadraticCurveTo(-8,20,-9,14);q.lineTo(-10,8);
    }else if(j.handShape==='support'){
      q.quadraticCurveTo(16,9,18,13);q.quadraticCurveTo(17,19,10,22);q.quadraticCurveTo(0,25,-8,20);q.lineTo(-10,10);
    }else if(j.handShape==='point'){
      q.lineTo(9,31);q.quadraticCurveTo(7,36,5,31);q.lineTo(4,17);q.quadraticCurveTo(0,26,-6,22);q.lineTo(-9,13);
    }else if(j.handShape==='grip'){
      q.quadraticCurveTo(17,6,17,13);q.quadraticCurveTo(14,23,6,23);q.quadraticCurveTo(-5,25,-9,17);q.lineTo(-10,10);
    }else{
      q.quadraticCurveTo(10,18,7,23);q.quadraticCurveTo(4,27,1,24);q.quadraticCurveTo(-3,28,-6,23);q.quadraticCurveTo(-10,23,-9,17);q.lineTo(-11,10);
    }
    q.quadraticCurveTo(-16,8,-12,4);q.quadraticCurveTo(-9,2,-7,8);q.lineTo(-6,-3);
  },skinColor(p,style),flat?null:style.ink,style.id==='minimal-stickman'?2.3:2.1);
  if(j.handShape==='grip')shape(c,q=>{q.moveTo(3,10);q.quadraticCurveTo(9,17,14,13);},null,flat?'#b97f60':style.ink,1.5);
  else if(j.handShape!=='point')line(c,[[1,15],[1,22]],flat?'#b97f60':style.ink,1.1);
  c.restore();
}
function armFront(c,p,style,j){
  paintSkin(c,p,style,j);
  hand(c,p,style,j);
}
function torso(c,p,style,y,joints){
  const flat=style.id==='flat-2d',stick=style.id==='minimal-stickman',i=index(p);
  shape(c,q=>{q.moveTo(-13,385+y);q.lineTo(-15,435+y);q.quadraticCurveTo(0,452+y,17,432+y);q.lineTo(13,382+y);q.closePath();},skinColor(p,style),flat?null:style.ink,style.line);
  const body=new Path2D(),q=body;
    if(stick){q.moveTo(-14,424+y);q.quadraticCurveTo(-44,424+y,-72,444+y);q.quadraticCurveTo(-77,492+y,-63,541+y);q.lineTo(-69,653+y);q.quadraticCurveTo(17,691+y,76,652+y);q.lineTo(65,537+y);q.quadraticCurveTo(81,494+y,77,446+y);q.quadraticCurveTo(42,424+y,15,424+y);}
    else{q.moveTo(-18,425+y);q.quadraticCurveTo(-62,425+y,-79,455+y);q.lineTo(-73,533+y);q.lineTo(-81,(flat?664:690)+y);q.quadraticCurveTo(4,(flat?675:702)+y,83,(flat?663:690)+y);q.lineTo(74,532+y);q.lineTo(81,456+y);q.quadraticCurveTo(57,427+y,18,425+y);}
    q.closePath();
  const garment=[body,...joints.hands.map(j=>sleevePath(style,j))];
  c.fillStyle=shirtColor(p,style);for(const part of garment)c.fill(part);
  if(!flat)for(const part of garment){
    c.save();
    // Stroke only the visible union boundary. Shared shoulder edges are inside
    // the shirt, so they must not look like separately attached sleeve blocks.
    for(const other of garment)if(other!==part){const outside=new Path2D();outside.rect(-600,-200,1200,1400);outside.addPath(other);c.clip(outside,'evenodd');}
    c.strokeStyle=style.ink;c.lineWidth=style.line;c.lineJoin='round';c.stroke(part);c.restore();
  }
  if(stick){
    shape(c,q=>{q.moveTo(-18,425+y);q.quadraticCurveTo(-1,451+y,19,425+y);},null,'#121512',3.5);
    shape(c,q=>{q.moveTo(-39,615+y);q.quadraticCurveTo(-8,637+y,45,593+y);},null,'#141715',2.6);
  }else if(flat){
    shape(c,q=>{q.moveTo(-23,426+y);q.lineTo(-6,453+y);q.lineTo(0,436+y);q.lineTo(8,454+y);q.lineTo(27,427+y);},WHITE,null);
    c.save();if(i>=3)c.globalAlpha=.15;shape(c,q=>{q.moveTo(49,475+y);q.lineTo(73,649+y);q.lineTo(53,659+y);q.closePath();},i>=3?BLACK:i===1?'#277352':'#81b841',null);c.restore();
    line(c,[[5,460+y],[5,580+y]],i===0?'#cce89d':i<3?'#87b596':'#c7d7d1',1.6);
  }else{
    shape(c,q=>{q.moveTo(-23,426+y);q.quadraticCurveTo(0,454+y,25,426+y);},null,style.ink,3);
    if(i===1){line(c,[[-15,436+y],[-27,458+y],[-9,466+y],[0,447+y],[10,466+y],[28,456+y],[16,436+y]],style.ink,2.5);line(c,[[0,451+y],[0,531+y]],style.ink,2.4);}
    if(i===2){line(c,[[-23,453+y],[-21,520+y]],style.ink,2.8);line(c,[[23,453+y],[22,520+y]],style.ink,2.8);}
  }
  if(i===3||i===4){
    line(c,[[0,456+y],[0,626+y]],flat?'#f4eadb':style.ink,2);
    shape(c,q=>{q.moveTo(25,481+y);q.lineTo(52,481+y);q.lineTo(51,513+y);q.quadraticCurveTo(37,523+y,25,513+y);q.closePath();},null,flat?'#f4eadb':style.ink,2);
  }
  if(i===5)shape(c,q=>{q.moveTo(-23,430+y);q.quadraticCurveTo(0,465+y,25,430+y);},null,flat?'#e0d4eb':style.ink,3);
}
function legs(c,style,locomotion){
  const flat=style.id==='flat-2d',stick=style.id==='minimal-stickman';
  for(const leg of lowerBody(locomotion,style.rig.legs)){
    if(stick){
      line(c,[leg.hip,leg.knee,leg.ankle],style.ink,9);line(c,[leg.hip,leg.knee,leg.ankle],WHITE,3.5);
      const {hip:h,knee:k}=leg,hem=[h[0]+(k[0]-h[0])*.48,h[1]+(k[1]-h[1])*.48];
      shape(c,q=>{q.moveTo(h[0]-28,h[1]-45);q.lineTo(hem[0]-29,hem[1]+15);q.quadraticCurveTo(hem[0],hem[1]+25,hem[0]+29,hem[1]+15);q.lineTo(h[0]+27,h[1]-45);q.closePath();},'#7895a9',style.ink,3.5);
      line(c,[[hem[0]-27,hem[1]+8],[hem[0]+27,hem[1]+8]],'#405f72',2);
    }else shape(c,q=>trouserPath(q,leg,{width:flat?47:48}),flat?'#286e50':WHITE,flat?null:style.ink,style.line);
    c.save();if(stick){c.translate(leg.ankle[0],leg.sole);c.scale(1.3,1.25);c.translate(-leg.ankle[0],-leg.sole);}
    shape(c,q=>shoePath(q,leg),flat?'#202824':WHITE,flat?null:style.ink,style.line);
    if(stick){
      for(let n=0;n<3;n++)line(c,[[leg.ankle[0]-7,leg.sole-17+n*4],[leg.ankle[0]+10,leg.sole-19+n*4]],style.ink,1.7);
      line(c,[[leg.ankle[0]-20,leg.sole-5],[leg.ankle[0]+28,leg.sole-5]],style.ink,2);
    }
    c.restore();
  }
}
export function paintReferenceCharacter(c,p,style,{x=p.x,scale=1,foot=730,fullBody=false,locomotion}={}){
  const bob=p.bodyOffset??(p.breathe??0)*style.sway*1.2,joints=characterJoints(style,p.armPhysical??{...p,bodyOffset:bob});
  c.save();c.translate(x,foot-(fullBody?900:730)*scale);c.scale(scale,scale);
  if(fullBody)legs(c,style,locomotion);
  torso(c,p,style,bob,joints);head(c,p,style,joints);
  const activeSide=(p.armPhysical?.activeHand??p.activeHand)==='left'?-1:1;
  for(const joint of [...joints.hands].sort((a,b)=>(a.side===activeSide)-(b.side===activeSide)))armFront(c,p,style,joint);
  c.restore();
}
