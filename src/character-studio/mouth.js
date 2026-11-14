export function drawMouth(c,person,style,y=56){
  const cartoon=style.id==='minimal-stickman',pencil=style.monochrome,geo=style.id==='flat-2d';
  const shape=person.viseme??{kind:'energy',open:person.mouth,width:1,round:0,teeth:cartoon?.6:0,tongue:cartoon?.25:0};
  const open=person.mouth, ink=style.ink;
  c.lineWidth=pencil?1.7:2.6;c.strokeStyle=ink;
  if(open<.025){
    c.beginPath();c.moveTo(-17*shape.width,y);c.quadraticCurveTo(0,y+(shape.kind==='closed'?2:6),17*shape.width,y);c.stroke();
    if(shape.kind==='closed'){c.save();c.globalAlpha*=.4;c.beginPath();c.moveTo(-12,y+4);c.quadraticCurveTo(0,y+7,12,y+4);c.stroke();c.restore();}return;
  }
  const width=(cartoon?25:geo?23:20)*shape.width,height=2+open*(cartoon?25:22);
  c.beginPath();c.ellipse(0,y,width,height,0,0,Math.PI*2);
  c.fillStyle=pencil?'#555555':ink;c.fill();if(pencil)c.stroke();
  c.save();c.clip();
  if(shape.teeth>.2){
    c.fillStyle=pencil?'#ffffff':'#fff9e9';c.fillRect(-width,y-height,width*2,Math.max(2,shape.teeth*6));
    c.strokeStyle=pencil?'#777777':ink;c.lineWidth=1;c.beginPath();c.moveTo(-width,y-height+shape.teeth*6);c.lineTo(width,y-height+shape.teeth*6);c.stroke();
  }
  if(shape.tongue>.15){
    c.beginPath();c.ellipse(0,y+height-1,width*.55,Math.max(2,height*.4*shape.tongue),0,0,Math.PI*2);
    c.fillStyle=pencil?'#b0b0b0':'#dc9590';c.fill();
  }
  c.restore();
  if(shape.kind==='labiodental'){
    c.beginPath();c.moveTo(-width+1,y+2);c.quadraticCurveTo(0,y+height+6,width-1,y+2);c.strokeStyle=ink;c.stroke();
  }
}
