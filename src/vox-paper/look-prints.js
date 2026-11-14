import {voxLook} from './looks.js';
const ink='#232a29';
function text(c,value,x,y,size=36,{color=ink,font='Inter',weight=600,max=1380}={}){
  while(size>14){c.font=`${weight} ${size}px '${font}'`;if(c.measureText(value).width<=max)break;size--;}
  c.fillStyle=color;c.fillText(value,x,y);return {width:c.measureText(value).width,size,x,y};
}
function line(c,points,color=ink,width=3){c.beginPath();c.moveTo(...points[0]);for(const p of points.slice(1))c.lineTo(...p);c.strokeStyle=color;c.lineWidth=width;c.stroke();}
function paper(c,assets,fill){c.fillStyle=fill;c.fillRect(0,0,1600,900);c.save();c.globalAlpha=.13;c.drawImage(assets.grain,0,0,1600,900);c.restore();}
function photo(c,assets,x,y,w,h,rotation=0,mono=false){
  c.save();c.translate(x+w/2,y+h/2);c.rotate(rotation);c.shadowColor='#242c2a44';c.shadowBlur=15;c.shadowOffsetY=7;c.fillStyle='#faf6e9';
  c.beginPath();c.moveTo(-w/2-15,-h/2-13);c.lineTo(w/2+13,-h/2-18);c.lineTo(w/2+18,h/2+15);c.lineTo(-w/2-17,h/2+22);c.closePath();c.fill();
  c.shadowColor='transparent';if(mono)c.filter='grayscale(1) contrast(1.1)';
  const sourceRatio=assets.photo.width/assets.photo.height,targetRatio=w/h;
  const sw=sourceRatio>targetRatio?assets.photo.height*targetRatio:assets.photo.width,sh=sourceRatio>targetRatio?assets.photo.height:assets.photo.width/targetRatio;
  c.drawImage(assets.photo,(assets.photo.width-sw)/2,(assets.photo.height-sh)/2,sw,sh,-w/2,-h/2,w,h);c.restore();
}
function stamp(c,value,x,y,color='#9b3b32'){
  c.save();c.translate(x,y);c.rotate(-.06);c.strokeStyle=color;c.lineWidth=4;c.strokeRect(0,-42,240,58);text(c,value,14,0,30,{color,font:'Oswald',max:210});c.restore();
}
function collage(c,assets,after){
  paper(c,assets,'#ede8dc');
  c.fillStyle='#eac443';c.beginPath();c.moveTo(740,174);c.lineTo(1510,218);c.lineTo(1440,693);c.lineTo(688,650);c.closePath();c.fill();
  c.save();c.translate(155,216);c.rotate(-.1);c.fillStyle='#b33d32';c.fillRect(0,0,570,506);c.restore();
  photo(c,assets,140,236,555,405,after?.035:-.04);
  text(c,'РЕДАКЦИОННЫЙ КОЛЛАЖ',108,108,25);
  text(c,'МЕСТО',800,330,130,{font:'Oswald',max:620});
  text(c,after?'И ИСТОРИЯ':'И КОНТЕКСТ',800,465,108,{font:'Oswald',max:620});
  text(c,after?'Новый слой меняет взгляд.':'Вырезки собираются в одну мысль.',800,567,29,{max:620});
  line(c,[[710,701],[924,710],[960,675]],'#b33d32',6);
  stamp(c,'ФОТО / БАКУ',190,733);
  text(c,'Фотография, бумага и типографика',108,827,29);
}
function dossier(c,assets,after){
  paper(c,assets,'#d9d1bf');c.fillStyle='#f5efdf';c.fillRect(95,170,1400,590);
  for(let y=219;y<735;y+=42)line(c,[[120,y],[1480,y]],'#a9a392',1);
  c.fillStyle='#252927';c.fillRect(100,184,641,500);
  for(let x=120;x<725;x+=46){c.fillStyle='#d9d1bf';c.fillRect(x,195,22,12);c.fillRect(x,655,22,12);}
  photo(c,assets,129,230,580,390,-.018,true);
  text(c,'АРХИВ / ВИЗУАЛЬНЫЕ ЗАМЕТКИ',105,108,25,{font:'Inter'});
  text(c,after?'ДРУГОЙ РАКУРС':'ЗАМЕТКИ',810,294,78,{font:'Oswald',max:580});
  text(c,'К ИСТОРИИ',810,386,78,{font:'Oswald',max:580});
  for(const [i,phrase]of ['Фотография сохраняет место.','Документ добавляет контекст.','Деталь связывает историю.'].entries())text(c,phrase,814,478+i*52,28,{font:'Courier New',weight:400,max:550});
  line(c,[[804,620],[1350,607]],'#9b3b32',6);stamp(c,'МАТЕРИАЛ',1150,720);
  text(c,'Демонстрационная композиция · фото Баку',105,830,26,{font:'Inter'});
}
function atlas(c,assets,after){
  paper(c,assets,'#e3e9de');
  for(let x=100;x<1550;x+=95)line(c,[[x,160],[x,790]],'#b5c4b8',1);
  for(let y=170;y<800;y+=95)line(c,[[70,y],[1530,y]],'#b5c4b8',1);
  c.fillStyle='#b3cbd0';c.beginPath();c.moveTo(650,160);c.bezierCurveTo(440,420,960,560,660,805);c.lineTo(890,805);c.bezierCurveTo(1160,520,680,370,850,160);c.closePath();c.fill();
  for(const [x,y,w,h]of [[150,245,248,148],[1070,206,300,143],[195,564,320,138],[1100,541,270,170]]){c.fillStyle='#c4cfb7';c.fillRect(x,y,w,h);}
  const route=after?[[270,478],[487,425],[740,481],[1030,432],[1320,475]]:[[270,478],[487,425],[740,481]];
  line(c,route,'#f8f3df',25);line(c,route,'#d88442',12);
  for(const [x,y,label]of [[270,478,'БЕРЕГ А'],[1320,475,'БЕРЕГ Б']]){c.beginPath();c.arc(x,y,14,0,Math.PI*2);c.fillStyle='#263e44';c.fill();text(c,label,x-85,y-38,30,{max:220});}
  text(c,'АТЛАС / СВЯЗИ МЕЖДУ МЕСТАМИ',105,108,25);
  c.fillStyle='#f6f3e7';c.fillRect(106,682,810,85);text(c,after?'МАРШРУТ СОЕДИНЯЕТ':'КАК ДОБРАТЬСЯ?',130,742,57,{font:'Oswald',max:760});
  line(c,[[1420,218],[1420,287]],'#263e44',4);line(c,[[1406,240],[1420,214],[1434,240]],'#263e44',4);text(c,'С',1409,198,28);
  text(c,'Условная карта · демонстрация маршрута',105,838,25);
}
function infographic(c,assets,after){
  paper(c,assets,'#f6f4e8');
  text(c,'ИНФОГРАФИКА / КАК СВЯЗАНЫ ИДЕИ',105,108,25);
  text(c,after?'СВЯЗИ СТАНОВЯТСЯ ВИДНЫ':'ОТ ДЕТАЛИ К ЦЕЛОМУ',105,251,100,{font:'Oswald',max:1380});
  const nodes=after?[[250,500,'ИДЕЯ'],[790,500,'ДЕЙСТВИЕ'],[1330,500,'РЕЗУЛЬТАТ']]:[[250,500,'ИДЕЯ'],[790,500,'ДЕЙСТВИЕ']];
  line(c,[[250,500],[1330,500]],'#c9d0c9',4);
  for(let i=1;i<nodes.length;i++){
    line(c,[[nodes[i-1][0]+120,500],[nodes[i][0]-130,500]],'#223b45',9);
    line(c,[[nodes[i][0]-156,481],[nodes[i][0]-130,500],[nodes[i][0]-156,519]],'#223b45',7);
  }
  for(const [i,[x,y,label]]of nodes.entries()){
    c.fillStyle=i===1?'#dfb831':'#223b45';c.beginPath();if(i===1)c.rect(x-106,y-95,212,190);else c.arc(x,y,106,0,Math.PI*2);c.fill();
    c.save();c.textAlign='center';text(c,label,x,y+11,31,{color:i===1?ink:'#ffffff',max:190});c.restore();
    line(c,[[x,620],[x,673]],'#687774',2);
  }
  text(c,'Схема объясняет последовательность, а не статистику.',105,825,28);
}
const painters={'editorial-collage':collage,'archive-dossier':dossier,atlas,infographic};
export function applyVoxLook(prints,lookId,assets,{technique}={}){
  const look=voxLook(lookId);if(look.id==='paper')return prints;
  const painter=painters[look.id];
  for(const [key,after]of [['before',false],['after',true],['back',false]])painter(prints[key].getContext('2d'),assets,after);
  // Keep the isolated printed phrase aligned with the renderer's torn strip.
  if(technique==='phrase-swap'){
    for(const key of ['before','after']){
      const c=prints[key].getContext('2d');c.fillStyle=look.colors[0];c.fillRect(0,361,1600,210);
      text(c,'Это',110,515,118,{font:'Oswald'});text(c,'шаг.',1240,515,118,{font:'Oswald'});
    }
  }
  // A marker must cover an actual headline in this composition.
  const marker=look.id==='editorial-collage'?[0,-.43,5.8,1.25]:look.id==='archive-dossier'?[.1,.5,5.6,1.6]:look.id==='atlas'?[-6.2,-2.9,1,-2.05]:[-6.2,1.75,6,2.65];
  return {...prints,markerRegion:marker};
}
