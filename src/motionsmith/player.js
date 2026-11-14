// Original KADR composition adapter. Vendor modules are served only to the private
// render browser from the subscriber's installed library, never by the app API.
import {morphChain} from '/vendor/techniques/match-morph-chain.js';
import {heroWordRise} from '/vendor/techniques/hero-word-rise.js';
import {wordBlurIn} from '/vendor/techniques/word-blur-in.js';
import {cameraAt,applyCamera} from '/vendor/techniques/camera-ride.js';
import {toggle,pillPop} from '/vendor/techniques/pill-toggle.js';
import {logoResolve} from '/vendor/techniques/logo-resolve.js';
import {livingBackground} from '/vendor/techniques/living-background.js';
import {seg,clamp} from '/vendor/core.js';
import {ez} from '/vendor/techniques/tokens.js';

const config=await (await fetch('/score.json')).json();
const {score,scale=1,blur=6,hasLogo}=config, W=score.width,H=score.height,FPS=score.fps;
const canvas=document.querySelector('canvas');canvas.width=Math.round(W*scale/2)*2;canvas.height=Math.round(H*scale/2)*2;
const ctx=canvas.getContext('2d'),off=document.createElement('canvas');off.width=canvas.width;off.height=canvas.height;
const c=off.getContext('2d'),C=score.palette;
const offTrack='#'+[1,3,5].map(i=>Math.round(parseInt(C.surface.slice(i,i+2),16)*.82+parseInt(C.foreground.slice(i,i+2),16)*.18).toString(16).padStart(2,'0')).join('');
document.fonts.add(await new FontFace('Launch','url(/font.ttf)',{weight:'100 900'}).load());
await document.fonts.ready;
let logo;
if(hasLogo){logo=new Image();logo.src='/logo.png';await logo.decode();}
const layouts=new Map(),issues=new Map(),fitted=new Map();
const flag=(code,el,frame,detail)=>issues.set(`${code}:${el.id}`,{code,target:el.id,frame:Math.round(frame),...detail});
const cameras=score.camera.map(k=>[k.frame/FPS,[k.x,k.y,k.zoom/100,k.rotate],'camera_s']);
const shapes=score.shapes.map(s=>s.states.map(k=>({t:k.frame/FPS,dur:k.duration/FPS,color:C[k.fill],box:{...k.box,r:k.box.radius}})));
const round=(ct,b,fill)=>{ct.beginPath();ct.roundRect(b.x,b.y,Math.max(1,b.w),Math.max(1,b.h),Math.min(b.radius,b.w/2,b.h/2));ct.fillStyle=fill;ct.fill();};
function textLayout(el){
  if(layouts.has(el.id))return layouts.get(el.id);
  let size=el.fontSize||48,lines=[];const original=size;
  for(;size>=20;size--){
    c.font=`${el.weight||550} ${size}px Launch`;lines=[];
    for(const paragraph of (el.text||'').split('\n')){
      if(el.kind==='pill'){lines.push(paragraph);continue;}
      let line='';for(const word of paragraph.split(/\s+/)){
        const candidate=line?line+' '+word:word;
        if(line&&c.measureText(candidate).width>el.box.w){lines.push(line);line=word;}else line=candidate;
      }lines.push(line);
    }
    if(lines.length*size*1.18<=el.box.h&&lines.every(s=>c.measureText(s).width<=el.box.w))break;
  }
  const result={size,lines,lineHeight:size*1.18};layouts.set(el.id,result);
  if(size<original)fitted.set(el.id,{target:el.id,requestedSize:original,fittedSize:size});
  if(size<Math.max(24,Math.min(W,H)*.028)||size<original*.6)flag('text_too_small',el,el.start,{requested:original,actual:size});
  return result;
}
function line(ct,points,color=C.foreground,width=5){ct.beginPath();for(const [i,[x,y]] of points.entries())i?ct.lineTo(x,y):ct.moveTo(x,y);ct.strokeStyle=color;ct.lineWidth=width;ct.lineCap='round';ct.lineJoin='round';ct.stroke();}
function icon(ct,name,b,color){
  ct.save();ct.translate(b.x+b.w/2,b.y+b.h/2);const z=Math.min(b.w,b.h)/100;ct.scale(z,z);
  if(name==='check')line(ct,[[-29,0],[-8,22],[32,-25]],color,8);
  if(name==='arrow'){line(ct,[[-35,0],[35,0]],color,7);line(ct,[[10,-26],[36,0],[10,26]],color,7);}
  if(name==='plus'){line(ct,[[-32,0],[32,0]],color,7);line(ct,[[0,-32],[0,32]],color,7);}
  if(name==='pause'){round(ct,{x:-25,y:-30,w:15,h:60,radius:4},color);round(ct,{x:10,y:-30,w:15,h:60,radius:4},color);}
  if(name==='lock'){
    ct.beginPath();ct.moveTo(-24,8);ct.lineTo(-24,-12);ct.arc(0,-12,24,Math.PI,0);ct.lineTo(24,8);ct.strokeStyle=color;ct.lineWidth=8;ct.stroke();
    round(ct,{x:-36,y:0,w:72,h:46,radius:9},color);
    ct.beginPath();ct.arc(0,19,6,0,Math.PI*2);ct.fillStyle=C.onAccent;ct.fill();
  }
  if(name==='calendar'){
    ct.strokeStyle=color;ct.lineWidth=5;ct.beginPath();ct.roundRect(-35,-30,70,70,10);ct.stroke();
    line(ct,[[-35,-10],[35,-10]],color,4);line(ct,[[-18,-40],[-18,-21]],color,6);line(ct,[[18,-40],[18,-21]],color,6);
    line(ct,[[-18,13],[-5,26],[20,0]],color,5);
  }
  if(name==='paw'){
    for(const [x,y,r] of [[-28,-20,12],[-9,-35,12],[15,-30,12],[32,-10,11],[0,16,27]]){
      ct.beginPath();ct.ellipse(x,y,r,r*1.15,-.2,0,Math.PI*2);ct.fillStyle=color;ct.fill();
    }
  }
  if(name==='box'){
    line(ct,[[-34,-22],[0,-40],[34,-22],[34,23],[0,42],[-34,23],[-34,-22],[0,-3],[34,-22]],color,5);
    line(ct,[[0,-3],[0,42]],color,5);line(ct,[[-17,-31],[17,-12]],color,5);
  }
  if(name==='bolt'){ct.beginPath();ct.moveTo(6,-44);ct.lineTo(-31,5);ct.lineTo(-3,5);ct.lineTo(-8,44);ct.lineTo(32,-10);ct.lineTo(6,-10);ct.closePath();ct.fillStyle=color;ct.fill();}
  if(name==='search'){ct.beginPath();ct.arc(-8,-8,27,0,Math.PI*2);ct.strokeStyle=color;ct.lineWidth=7;ct.stroke();line(ct,[[13,13],[36,36]],color,8);}
  if(name==='heart'){ct.beginPath();ct.moveTo(0,34);ct.bezierCurveTo(-75,-12,-28,-56,0,-26);ct.bezierCurveTo(28,-56,75,-12,0,34);ct.fillStyle=color;ct.fill();}
  ct.restore();
}
function drawLogo(ct,b){
  if(logo){const z=Math.min(b.w/logo.width,b.h/logo.height);ct.drawImage(logo,-logo.width*z/2,-logo.height*z/2,logo.width*z,logo.height*z);}
  else {round(ct,{x:-b.w/2,y:-b.h/2,w:b.w,h:b.h,radius:Math.min(b.w,b.h)*.22},C.accent);ct.font=`600 ${Math.min(b.w,b.h)*.55}px Launch`;ct.fillStyle=C.onAccent;ct.textAlign='center';ct.textBaseline='middle';ct.fillText([...score.brand][0],0,0);}
}

function drawElement(el,frame,check){
  if(frame<el.start||frame>=el.end)return;
  const t=frame/FPS,b=el.box,start=el.start/FPS,dur=el.enterFrames/FPS;
  const p=seg(t,start,dur,ez(el.enter==='pop'?'pop_soft':'out_settle'));
  const exit=el.end===score.frames?1:clamp((el.end-frame)/7);
  c.save();c.globalAlpha=exit;
  if(!['text','pill','logo'].includes(el.kind)||!['hero-rise','word-blur','resolve'].includes(el.enter))c.globalAlpha*=clamp(p*2);
  if(['rect','icon','toggle'].includes(el.kind)&&el.enter!=='none'){
    const z=el.enter==='pop'?Math.max(.01,p):1;
    c.translate(b.x+b.w/2,b.y+b.h/2+(el.enter==='rise'?(1-p)*40:0));c.scale(z,z);c.translate(-b.x-b.w/2,-b.y-b.h/2);
  }
  if(el.kind==='rect')round(c,b,C[el.fill]);
  if(el.kind==='icon')icon(c,el.icon,b,C[el.fill]);
  if(el.kind==='toggle'){
    // Reversing the local clock turns the same vendor control off.
    const time=el.on===false?(2*el.changeAt+8-frame)/FPS:t;
    toggle(c,time,{x:b.x,y:b.y,w:b.w,h:b.h,t0:el.changeAt/FPS,dur:8/FPS,offColor:offTrack,onColor:C.accent,knobColor:C.foreground});
  }
  if(el.kind==='logo'){
    logoResolve(c,t,{cx:b.x+b.w/2,cy:b.y+b.h/2,t0:start,dur,blurFrom:32,drawLogo:ct=>drawLogo(ct,b)});
  }
  if(el.kind==='pill'){
    const layout=textLayout({...el,box:{...b,w:b.w*.85,h:b.h*.65}});
    pillPop(c,t,{cx:b.x+b.w/2,cy:b.y+b.h/2,w:b.w,h:b.h,t0:start,dur,color:C[el.fill],label:el.text,font:`${el.weight||550} ${layout.size}px Launch`,textColor:C.onAccent,labelDelay:0});
  }
  if(el.kind==='text'){
    const {size,lines,lineHeight}=textLayout(el),align=el.align||'left';
    const x=b.x+(align==='center'?b.w/2:align==='right'?b.w:0);
    const font=`${el.weight||550} ${size}px Launch`;
    c.textBaseline='alphabetic';
    for(let i=0;i<lines.length;i++){
      const y=b.y+size*.86+i*lineHeight,ts=start+i*.08;
      if(el.enter==='hero-rise'){
        c.font=font;const width=c.measureText(lines[i]).width;
        // Supply measured glyph width; the vendor effect otherwise sizes to frame width.
        const cx=align==='center'?x:align==='right'?x-width/2:x+width/2;
        heroWordRise(c,t,lines[i],{cx,y,W,widthFrac:width/W,t0:ts,dur:dur*.72,stagger:Math.min(.035,dur*.28/Math.max(1,lines[i].length)),family:'Launch',weight:el.weight||550,color:C[el.fill],tracking:0,trackingFrom:.025});
      }else if(el.enter==='word-blur'){
        wordBlurIn(c,t,lines[i],{x,y,font,color:C[el.fill],t0:ts,dur:dur*.75,stagger:.055,blur:24,align,tracking:0});
      }else{
        c.save();if(el.enter==='rise'){c.beginPath();c.rect(b.x-2,b.y-5,b.w+4,b.h+10);c.clip();}
        c.font=font;c.fillStyle=C[el.fill];c.textAlign=align;c.fillText(lines[i],x,y+(el.enter==='rise'?(1-p)*size:0));c.restore();
      }
    }
    if(check&&frame>el.start+el.enterFrames+8&&exit>.95){
      const m=c.getTransform(),a=m.transformPoint({x:b.x,y:b.y}),d=m.transformPoint({x:b.x+b.w,y:b.y+b.h});
      if(Math.min(a.x,d.x)<0||Math.max(a.x,d.x)>canvas.width||Math.min(a.y,d.y)<0||Math.max(a.y,d.y)>canvas.height)flag('text_outside_camera',el,frame,{});
    }
  }
  c.restore();
}
function draw(frame,check=false){
  c.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);
  livingBackground(c,frame/FPS,{W,H,bg:C.background,blobs:[C.surface],cover:.4,drift:6,opacity:.35,grain:0});
  c.save();applyCamera(c,cameraAt(frame/FPS,cameras),W,H);
  for(const states of shapes){
    const s=morphChain(c,frame/FPS,states,{draw:false}),b=s.box;
    c.save();c.shadowColor='rgba(0,0,0,.06)';c.shadowBlur=32;c.shadowOffsetY=12;round(c,{...b,radius:b.r},s.color);c.restore();
  }
  for(const el of score.elements)drawElement(el,frame,check);
  c.restore();
}
window.renderFrame=async frame=>{
  ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);
  // Six samples span half a frame at native FPS, as in the approved Lapa render.
  for(let i=0;i<blur;i++){
    const f=Math.max(0,Math.min(score.frames-.001,frame+(i/Math.max(1,blur-1)-.5)*.5));
    draw(f,i===Math.floor(blur/2));ctx.globalCompositeOperation=i?'lighter':'source-over';ctx.globalAlpha=1/blur;ctx.drawImage(off,0,0);
  }
  ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
};
window.grab=()=>canvas.toDataURL('image/png');
window.review=()=>({issues:[...issues.values()],textFits:[...fitted.values()]});
window.__ready=true;
