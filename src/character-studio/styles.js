export const CHARACTER_STYLES=Object.freeze([
  {id:'flat-2d',name:'Цветная 2D',detail:'Плоская иллюстрация',description:'Плоская анимация: живые силуэты, тёмные волосы, зелёные и тёплые акценты.',
    reference:'https://www.pinterest.com/pin/933230354038535699/',background:'#f5f5f2',ink:'#191c1b',surface:'#ffffff',accent:'#97cf4a',support:'#4c9d72',soft:'#e1e5df',line:2.4,
    gesture:.92,sway:.7,blink:.1,monochrome:false,rig:{head:[0,330],headScale:.8,
      arms:{x:86,y:452,upper:101,lower:110,sleeve:58,sleeveWidth:44,upperWidth:28,elbowWidth:23,wristWidth:14,restShoulder:7,restElbow:-10,palm:1},
      legs:{hipY:646,upper:117,lower:119,hipWidth:43,stride:150}}},
  {id:'notion-doodle',name:'Notion Doodle',detail:'Чёрная линия и белый лист',description:'Чёрно-белые персонажи: уверенная линия, чёрные волосы, простые лица и повседневная одежда.',
    reference:'https://www.pinterest.com/pin/1086845322590346363/',background:'#ffffff',ink:'#151515',surface:'#ffffff',accent:'#151515',support:'#ededed',soft:'#dedede',line:3.2,
    gesture:.78,sway:.45,blink:.1,monochrome:true,rig:{head:[0,313],
      arms:{x:86,y:452,upper:106,lower:113,sleeve:62,sleeveWidth:44,upperWidth:26,elbowWidth:22,wristWidth:14,restShoulder:8,restElbow:-12,palm:1},
      legs:{hipY:674,upper:103,lower:105,hipWidth:46,stride:140}}},
  {id:'minimal-stickman',name:'Стикмен',detail:'Футболка, шорты и кеды',description:'Круглая белая голова, штрихи волос, свободная тёмная футболка, джинсовые шорты и кеды.',
    reference:'https://www.pinterest.com/pin/1102748658787966422/',background:'#fcfcf8',ink:'#171918',surface:'#ffffff',accent:'#7896ab',support:'#e5e8e5',soft:'#eeefeb',line:3.8,
    gesture:1.05,sway:.8,blink:.11,monochrome:false,rig:{head:[0,310],
      arms:{x:70,y:452,upper:104,lower:108,sleeve:72,sleeveWidth:49,upperWidth:7,elbowWidth:7,wristWidth:5,restShoulder:15,restElbow:-37,palm:.88},
      legs:{hipY:698,upper:91,lower:93,hipWidth:39,stride:126}}},
].map(style=>Object.freeze({...style,rig:Object.freeze({...style.rig,arms:Object.freeze(style.rig.arms),legs:Object.freeze(style.rig.legs)})})));
const aliases={'drawn-2d':'notion-doodle','geometric-2d':'flat-2d','cartoon-2d':'minimal-stickman'};
export function characterStyle(id){const style=CHARACTER_STYLES.find(s=>s.id===(aliases[id]??id));if(!style)throw new RangeError(`Unknown character style: ${id}`);return style;}
