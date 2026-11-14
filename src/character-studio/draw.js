import {characterStyle} from './styles.js';
import {sampleScene} from './score.js';
import {paintReferenceCharacter} from './characters.js';
import {walkingMotion} from './locomotion.js';
import {renderStoryScene} from '../character-story/render.js';
const clamp=x=>Math.max(0,Math.min(1,x)),ease=x=>{x=clamp(x);return x*x*(3-2*x);};
function shape(c,draw,fill,stroke,line=2){c.beginPath();draw(c);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=line;c.lineJoin='round';c.lineCap='round';c.stroke();}}
const rect=(c,x,y,w,h,r,fill,stroke,width)=>shape(c,q=>q.roundRect(x,y,w,h,r),fill,stroke,width);
const ellipse=(c,x,y,rx,ry,fill,stroke,width)=>shape(c,q=>q.ellipse(x,y,rx,ry,0,0,Math.PI*2),fill,stroke,width);
const line=(c,points,ink,width=2)=>shape(c,q=>{q.moveTo(...points[0]);for(const p of points.slice(1))q.lineTo(...p);},null,ink,width);
function label(c,text,x,y,style,size=24,align='center'){c.font=`500 ${size}px 'Fira Sans',sans-serif`;c.fillStyle=style.ink;c.textAlign=align;c.fillText(text,x,y);}
function plant(c,x,style){
  const mono=style.monochrome;
  rect(c,x-24,604,48,59,4,mono?'#fff':style.soft,style.ink,style.line);
  line(c,[[x,604],[x,477]],style.ink,style.line);
  for(const [side,y]of [[-1,541],[1,516],[-1,490]])shape(c,q=>{q.moveTo(x,y+13);q.quadraticCurveTo(x+side*55,y-50,x+side*29,y-40);q.quadraticCurveTo(x+side*2,y-30,x,y+13);},mono?style.ink:style.support,mono?style.ink:null,style.line);
}
function room(c,style,story){
  c.fillStyle=style.background;c.fillRect(-400,-300,2400,1500);
  line(c,[[0,741],[1600,741]],style.monochrome?'#d5d5d5':style.soft,1.5);
  if(story)return;
  for(const x of [130,1370]){
    rect(c,x,148,100,270,6,style.monochrome?'#fff':style.soft,style.monochrome?'#cacaca':null,1.5);
    for(let i=0;i<4;i++)line(c,[[x+22+i*19,171],[x+22+i*19,395]],style.monochrome?'#e5e5e5':style.background,2);
  }
  rect(c,671,158,258,134,9,style.surface,style.monochrome?style.ink:style.soft,2);
  for(let i=0;i<7;i++){const h=[18,34,52,75,52,34,18][i];line(c,[[722+i*26,226-h/2],[722+i*26,226+h/2]],style.accent,5);}
  plant(c,85,style);plant(c,1525,style);
}
function table(c,style){
  shape(c,q=>{q.moveTo(90,738);q.bezierCurveTo(235,655,1365,655,1510,738);q.lineTo(1470,920);q.lineTo(130,920);q.closePath();},style.monochrome?'#fff':style.id==='flat-2d'?'#d9e3d4':'#f5f5ef',style.monochrome?style.ink:style.soft,style.line);
  ellipse(c,800,739,710,61,style.surface,style.ink,style.line);
}
function microphone(c,x,style){
  const side=x<800?1:-1,base=x+side*126;
  ellipse(c,base,752,40,9,style.ink,null);
  line(c,[[base,746],[base,640],[x+side*98,530]],style.ink,5);
  c.save();c.translate(x+side*94,518);c.rotate(-side*.17);
  rect(c,-17,-36,34,77,13,style.ink,null);
  for(let i=0;i<6;i++)line(c,[[-10,-22+i*8],[10,-22+i*8]],style.surface,1.5);c.restore();
}
function demoProp(c,style,time){
  const move=ease((time-1)/4),open=ease((time-5)/3),grow=ease((time-9)/5),accent=style.monochrome?'#fff':style.accent;
  c.save();c.translate(510+290*move,560-215*move-Math.sin(move*Math.PI)*130);c.rotate((1-move)*-.3);
  if(open<.98){c.save();c.scale(1+open*2.9,1+open*.6);rect(c,-30,-35,60,70,3,accent,style.ink,2.5);c.restore();}
  if(open>.02){c.globalAlpha=open;rect(c,-150,-67,300,135,4,style.surface,style.ink,2.5);line(c,[[0,-54],[0,55]],style.ink,2);for(let i=0;i<3;i++){line(c,[[-124,-30+i*25],[-25,-30+i*25]],style.ink,1.3);line(c,[[25,-30+i*25],[115,-30+i*25]],style.ink,1.3);}}
  c.restore();
  if(grow){line(c,[[800,315],[800,315-185*grow]],style.monochrome?style.ink:style.support,3);for(let i=0;i<4;i++){
    const p=clamp(grow*1.8-i*.22),side=i%2?1:-1;if(!p)continue;c.save();c.translate(800+side*26*p,310-i*38-15*p);c.rotate(side*.6);ellipse(c,0,0,15*p,31*p,style.monochrome?'#fff':style.support,style.ink,2);c.restore();
  }}
}
export function renderCharacterScene(ctx,score,time,{styleId='flat-2d',mode='podcast',level=0,demonstration=false,camera='auto',shots}={}){
  const style=characterStyle(styleId),state=sampleScene(score,time,{level,demonstration,camera,shots});
  if(mode==='storytelling'&&score.story)return renderStoryScene(ctx,score,state,{style,time,paintActor:(c,p,options)=>paintReferenceCharacter(c,p,style,options)});
  ctx.save();ctx.setTransform(ctx.canvas.width/1600,0,0,ctx.canvas.height/900,0,0);
  if(mode==='storytelling'&&score.recording){ctx.fillStyle=style.background;ctx.fillRect(0,0,1600,900);label(ctx,'Постановка рассказа ещё не создана',800,440,style,42);ctx.restore();return {...state,storyPending:true};}
  const story=mode==='storytelling',lens=story?{x:800,y:450,zoom:1.015}:state.camera;
  ctx.translate(800,450);ctx.scale(lens.zoom,lens.zoom);ctx.translate(-lens.x,-lens.y);room(ctx,style,story);
  if(story){
    label(ctx,'Из идеи — в общее дело',112,118,style,40,'left');
    for(const p of state.characters){
      const dx=p.id==='anna'?110:p.id==='mira'?-110:0,x=p.x+ease((time-11)/4)*dx;
      const locomotion=walkingMotion({x:p.x,y:0,w:330*.65,pose:'idle',keys:[{at:11,pose:'walk'},{at:15,x:p.x+dx,pose:'idle'}]},time);
      paintReferenceCharacter(ctx,{...p,gaze:Math.sign(800-x)},style,{x,scale:.65,foot:805,fullBody:true,locomotion});
    }demoProp(ctx,style,time);
  }else{
    for(const p of state.characters)rect(ctx,p.x-100,464,200,315,28,style.monochrome?'#fff':style.soft,style.monochrome?'#bfbfbf':null,1.5);
    for(const p of state.characters){ctx.save();if(lens.zoom>1.05&&!p.speaking)ctx.filter=`blur(${Math.min(2,(lens.zoom-1)*5)}px)`;paintReferenceCharacter(ctx,p,style);ctx.restore();}
    table(ctx,style);
    for(const p of state.characters){
      const x=p.x-86;rect(ctx,x-19,699,38,43,5,style.monochrome?'#fff':style.accent,style.ink,2);shape(ctx,q=>q.arc(x+21,718,11,-Math.PI/2,Math.PI/2),null,style.ink,2);ellipse(ctx,x,700,15,3,style.surface,style.ink,1.5);
      microphone(ctx,p.x,style);label(ctx,p.name,p.x,810,style,24);
    }
  }
  ctx.restore();return state;
}
