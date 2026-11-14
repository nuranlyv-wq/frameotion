import {paperSurface} from './print.js';
import {voxLook} from './looks.js';
const palette=id=>{const look=voxLook(id);return {bg:look.colors[0],ink:id==='infographic'?'#223b45':id==='atlas'?'#263e44':'#232a29',accent:look.colors[id==='infographic'||id==='atlas'||id==='archive-dossier'?2:1]};};
function fitted(c,value,x,y,size,width,{font='Oswald',color='#242820',weight=600}={}){
  while(size>18){c.font=`${weight} ${size}px '${font}'`;if(c.measureText(value).width<=width)break;size--;}
  c.fillStyle=color;c.fillText(value,x,y);
}
function wrapped(c,value,x,y,width,size=36,color='#44483f'){
  c.font=`400 ${size}px 'Inter'`;c.fillStyle=color;let line='',row=0;
  for(const word of value.split(/\s+/)){const next=line?line+' '+word:word;if(c.measureText(next).width>width&&line){c.fillText(line,x,y+row*size*1.4);line=word;row++;}else line=next;}c.fillText(line,x,y+row*size*1.4);
}
function draw(cv,scene,assets){
  const c=cv.getContext('2d'),{bg,accent,ink}=palette(scene.look);
  c.drawImage(paperSurface({grain:assets.grain,fill:bg}),0,0);fitted(c,scene.eyebrow,110,105,24,1380,{font:'Inter',color:ink});
  c.strokeStyle=ink;c.globalAlpha=.22;c.beginPath();c.moveTo(110,142);c.lineTo(1490,142);c.stroke();c.globalAlpha=1;
  if(scene.visual==='quote'){
    c.fillStyle=accent;c.globalAlpha=.14;c.fillRect(90,224,1410,380);c.globalAlpha=1;
    wrapped(c,scene.sourceExcerpt,130,320,1310,48,ink);fitted(c,scene.headline,110,730,77,1380,{color:ink});
  }else if(scene.visual==='diagram'||scene.visual==='route'){
    fitted(c,scene.headline,110,278,109,1380,{color:ink});
    const labels=scene.labels,n=labels.length;
    c.strokeStyle=accent;c.lineWidth=11;c.beginPath();c.moveTo(240,505);c.lineTo(n===1?490:1360,505);c.stroke();
    labels.forEach((label,i)=>{const x=n===1?800:240+i*1120/(n-1);c.fillStyle=scene.visual==='route'?bg:i%2?accent:ink;c.strokeStyle=ink;c.lineWidth=4;c.beginPath();c.arc(x,505,80,0,Math.PI*2);c.fill();c.stroke();c.save();c.textAlign='center';fitted(c,label,x,650,36,360,{font:'Inter',color:ink});c.restore();});
    if(scene.visual==='route')fitted(c,'Схематичный маршрут',110,712,22,1380,{font:'Inter',color:ink});
    wrapped(c,scene.detail,110,785,1380,33,ink);
  }else{
    if(scene.look==='editorial-collage'){
      c.save();c.translate(1040,510);c.rotate(-.07);c.fillStyle=accent;c.fillRect(-300,-240,600,450);c.fillStyle=ink;c.fillRect(-275,-210,550,390);c.fillStyle=bg;c.fillRect(-245,-180,490,330);c.restore();
      fitted(c,scene.labels[0],820,525,95,580,{color:ink});fitted(c,scene.headline,110,340,112,650,{color:ink});wrapped(c,scene.detail,110,470,580,38,ink);
    }else{
      c.fillStyle=accent;c.globalAlpha=.16;c.fillRect(95,318,1400,214);c.globalAlpha=1;
      fitted(c,scene.headline,110,475,151,1380,{color:ink});wrapped(c,scene.detail,110,680,1330,43,ink);
    }
  }
  if(scene.look==='archive-dossier'){c.save();c.globalAlpha=.12;c.strokeStyle=ink;for(let y=180;y<850;y+=42){c.beginPath();c.moveTo(95,y);c.lineTo(1500,y);c.stroke();}c.restore();}
  if(scene.look==='atlas'){c.save();c.globalAlpha=.1;c.strokeStyle=ink;for(let x=80;x<1540;x+=100){c.beginPath();c.moveTo(x,165);c.lineTo(x,850);c.stroke();}c.restore();}
}
export function makeFilmPrints(scene,next,assets){
  const cv=(w=1600,h=900)=>{const v=document.createElement('canvas');v.width=w;v.height=h;return v;};
  const before=cv(),after=cv(),back=cv();
  if(scene.technique==='phrase-swap'){
    // Crop the actual registered patch; every pixel outside it stays on this sheet.
    const base=cv(),c=base.getContext('2d'),{bg,ink}=palette(scene.look);c.drawImage(paperSurface({grain:assets.grain,fill:bg}),0,0);
    fitted(c,scene.eyebrow,110,105,24,1380,{font:'Inter',color:ink});wrapped(c,scene.detail,110,735,1330,43,ink);
    for(const [sheet,value]of [[before,scene.phrase.before],[after,scene.phrase.after],[back,scene.phrase.before]]){
      const x=sheet.getContext('2d');x.drawImage(base,0,0);x.save();x.textAlign='center';fitted(x,value,800,475,105,720,{color:ink});x.restore();
    }
    const scrap=cv(800,240),replacement=cv(800,240);scrap.getContext('2d').drawImage(before,400,330,800,240,0,0,800,240);replacement.getContext('2d').drawImage(after,400,330,800,240,0,0,800,240);
    return {before,after,back,scrap,replacement,tape:scrap,stamp:scrap};
  }
  draw(before,scene,assets);draw(after,next??scene,assets);draw(back,scene,assets);
  const scrap=cv(800,240),replacement=cv(800,240);for(const [canvas,value]of [[scrap,scene.labels[0]],[replacement,(next??scene).labels[0]]]){
    const c=canvas.getContext('2d'),look=palette(scene.look);c.fillStyle=look.bg;c.fillRect(0,0,800,240);fitted(c,value,40,160,105,720,{color:look.ink});
  }
  return {before,after,back,scrap,replacement,tape:scrap,stamp:scrap};
}
