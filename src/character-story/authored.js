// An authored, silent film for creative review. Never an upload fallback.
import {validateStoryWindow} from './contract.js';

const part=(id,kind,x,y,w,h,fill='paper',stroke='ink',extra={})=>({id,parent:'',kind,x,y,w,h,fill,stroke,...extra});
const prop=(id,label,parts,evidence)=>({id,label,kind:'prop',appearance:0,voice:'',evidence,parts});
const node=(id,entity,x,y,w,h,extra={})=>({id,entity,parent:'',anchor:'origin',x,y,w,h,rotation:0,opacity:1,pose:'idle',lookAt:'',keys:[],parts:[],...extra});
const narrative=[
  {start:0,end:4,text:'Анна написала письмо другу на другом берегу.'},
  {start:4,end:8,text:'Моста через реку больше не было.'},
  {start:8,end:12,text:'Она сложила письмо в бумажный самолётик.'},
  {start:12,end:17,text:'Ветер подхватил его и понёс над водой.'},
  {start:17,end:22,text:'Лев поймал самолётик и развернул письмо.'},
  {start:22,end:27,text:'А потом отправил ответ. Расстояние стало чуть меньше.'},
];
const transition=(kind='cut',anchor='',duration=.7)=>({kind,anchor,duration:kind==='cut'?0:duration,direction:'left'});

function script(){
  let count=0;
  const segments=narrative.map((s,i)=>({...s,id:`s${i}`,speaker:''}));
  const words=segments.flatMap(s=>{const tokens=s.text.split(/\s+/);return tokens.map((text,i)=>({id:`w${count++}`,segment:s.id,text,start:s.start+i*(s.end-s.start)/tokens.length,end:s.start+(i+1)*(s.end-s.start)/tokens.length}));});
  return {language:'ru',text:segments.map(s=>s.text).join(' '),segments,words,engine:'authored-script',timing:'authored-not-spoken'};
}

export function authoredStory(){
  const transcript=script();
  const assets=[
    {id:'anna',label:'Анна',kind:'character',appearance:0,voice:'',evidence:['s0'],parts:[]},
    {id:'lev',label:'Лев',kind:'character',appearance:1,voice:'',evidence:['s0','s4'],parts:[]},
    prop('shore','Берег',[
      part('bank','path',0,0,100,100,'support','ink',{d:'M 0 28 Q 15 20 32 24 Q 54 7 75 23 Q 88 20 100 32 L 100 100 L 0 100 Z'}),
      part('grass','path',0,0,100,100,'none','ink',{d:'M 10 27 L 9.7 23 M 10 27 L 10.7 23 M 86 26 L 85.8 22 M 86 26 L 86.7 22',strokeWidth:.6}),
    ],['s1']),
    prop('river','Река',[
      part('water','path',0,0,100,100,'soft','soft',{d:'M 34 0 C 10 22 63 35 30 55 C 6 72 12 88 0 100 L 100 100 C 80 72 83 56 72 39 C 63 24 90 9 76 0 Z',color:'blue',strokeWidth:.7}),
      part('ripples','path',0,0,100,100,'none','paper',{d:'M 39 12 Q 50 9 59 12 M 43 27 L 60 27 M 30 48 Q 45 44 56 48 M 24 66 L 53 66 M 33 86 Q 54 80 70 86',strokeWidth:.8}),
    ],['s1']),
    prop('bridge','Остаток моста',[
      part('post','path',0,0,100,100,'support','ink',{d:'M 23 100 L 25 20 L 36 20 L 39 100 Z M 72 100 L 70 30 L 82 30 L 87 100 Z',color:'brown'}),
      part('deck','path',0,0,100,100,'paper','ink',{d:'M 0 30 L 75 30 L 85 39 L 76 45 L 85 53 L 0 53 Z'}),
      part('seams','path',0,0,100,100,'none','ink',{d:'M 17 31 L 17 52 M 33 31 L 33 52 M 51 31 L 51 52 M 66 31 L 66 51',strokeWidth:.6}),
    ],['s1']),
    prop('bridge-far','Остаток моста на другом берегу',[
      part('post','path',0,0,100,100,'support','ink',{d:'M 77 100 L 75 20 L 64 20 L 61 100 Z M 28 100 L 30 30 L 18 30 L 13 100 Z',color:'brown'}),
      part('deck','path',0,0,100,100,'paper','ink',{d:'M 100 30 L 25 30 L 15 39 L 24 45 L 15 53 L 100 53 Z'}),
      part('seams','path',0,0,100,100,'none','ink',{d:'M 83 31 L 83 52 M 67 31 L 67 52 M 49 31 L 49 52 M 34 31 L 34 51',strokeWidth:.6}),
    ],['s1']),
    prop('letter','Письмо и бумажный самолётик',[
      part('sheet','path',0,0,100,100,'paper','ink',{d:'M 2 10 L 90 10 L 98 21 L 98 90 L 2 90 Z'}),
      part('writing','path',0,0,100,100,'none','ink',{d:'M 16 30 Q 25 20 34 30 Q 45 38 56 28 L 78 28 M 16 47 L 80 47 M 16 63 L 63 63',strokeWidth:.65}),
      part('fold','path',0,0,100,100,'none','soft',{d:'M 50 10 L 50 90',strokeWidth:.5}),
      part('left-wing','path',0,0,100,100,'paper','ink',{d:'M 0 7 L 100 48 L 29 56 Z'}),
      part('right-wing','path',0,0,100,100,'paper','ink',{d:'M 0 93 L 100 48 L 29 56 L 24 78 Z'}),
      part('keel','path',0,0,100,100,'none','ink',{d:'M 29 56 L 100 48 M 29 56 L 24 78',strokeWidth:.65}),
    ],['s0','s2','s3','s4','s5']),
    prop('willow','Дерево на берегу',[
      part('crown','path',0,0,100,100,'support','ink',{d:'M 10 65 Q -2 30 23 25 Q 25 0 50 12 Q 79 -1 84 28 Q 107 36 88 68 Q 60 85 10 65 Z'}),
      part('trunk','path',0,0,100,100,'none','ink',{d:'M 47 100 Q 54 55 51 29 M 50 64 L 31 43 M 50 55 L 70 34',strokeWidth:1.6}),
    ],['s0']),
    prop('hills','Дальний берег',[
      part('line','path',0,0,100,100,'soft','none',{d:'M 0 90 Q 14 30 25 70 Q 41 5 60 66 Q 80 14 100 86 L 100 100 L 0 100 Z'}),
    ],['s0']),
    prop('cloud','Облако',[
      part('cloud-shape','path',0,0,100,100,'paper','soft',{d:'M 15 75 C -8 74 0 40 22 43 C 12 12 52 1 61 32 C 84 18 104 45 86 59 C 110 79 76 93 63 80 C 48 98 29 85 15 75 Z',strokeWidth:.6}),
    ],['s3']),
    prop('wind','Порыв ветра',[
      part('gust','path',0,0,100,100,'none','soft',{d:'M 0 36 C 38 36 55 36 63 25 C 85 -4 107 40 77 43 M 8 58 L 75 58 M 25 78 C 72 78 87 77 81 90',strokeWidth:.8}),
    ],['s3']),
  ];
  const paperParts=(plane=false)=>['sheet','writing','fold','left-wing','right-wing','keel'].map(target=>({target,keys:[{at:0,opacity:(['sheet','writing','fold'].includes(target)!==plane)?1:0}]}));
  const paper=(id,x,y,w,h,plane=false,extra={})=>node(id,'letter',x,y,w,h,{parts:paperParts(plane),...extra});
  const girl=(x=650,extra={})=>node('anna','anna',x,775,230,460,{lookAt:'letter',...extra});
  const boy=(x=1840,extra={})=>node('lev','lev',x,775,240,475,{...extra});
  const landscape=(start,end)=>[
    node('horizon','hills',1200,580,2300,190,{opacity:.25}),
    node('river','river',1210,690,680,470),
    node('left-bank','shore',290,850,1350,225),
    node('right-bank','shore',2150,850,1350,225),
    node('willow','willow',200,550,280,430),
    node('far-willow','willow',2220,580,210,350),
    node('cloud','cloud',1070,215,230,95,{opacity:.75,keys:[{at:start,x:1070},{at:end,x:1170}]}),
    node('bridge-left','bridge',830,795,240,170),
    node('bridge-right','bridge-far',1560,795,240,170),
  ];
  function scene(i,id,title,action,nodes,camera,trans=transition()){
    const source=transcript.segments[i],start=source.start;
    // Every part track has absolute times, including a static initial visibility.
    for(const n of nodes)for(const t of n.parts)for(const k of t.keys)if(k.at===0)k.at=start;
    return {id,title,action,startWord:transcript.words.find(w=>w.segment===source.id).id,sourceSegments:[source.id],quote:source.text,nodes,camera,transition:trans};
  }
  const scenes=[
    scene(0,'letter','Письмо другу','Анна берёт письмо и идёт к реке.',[
      ...landscape(0,4),girl(470,{pose:'walk',keys:[{at:0,x:470},{at:2.8,x:650,pose:'carry'}]}),
      paper('letter',0,0,165,115,false,{parent:'anna',anchor:'hand-right',rotation:-12}),
    ],[{at:0,x:590,y:490,zoom:1.22},{at:3.8,x:780,y:490,zoom:1.05}]),
    scene(1,'distance','Другой берег','Камера открывает разрыв моста и Льва по другую сторону реки.',[
      ...landscape(4,8),girl(650,{pose:'think',keys:[{at:4,pose:'think'},{at:7.4,pose:'carry'}]}),boy(1840,{pose:'point',lookAt:'anna'}),
      paper('letter',0,0,165,115,false,{parent:'anna',anchor:'hand-right',rotation:-12}),
    ],[{at:4,x:780,y:490,zoom:1.05},{at:5.8,x:1230,y:465,zoom:.68},{at:7.8,x:1230,y:465,zoom:.68}],transition('match','anna',.6)),
    scene(2,'fold','Найти форму','Крупный план: края листа сходятся, из письма складывается самолётик.',[
      ...landscape(8,12),girl(650,{pose:'carry'}),boy(1840,{pose:'listen',lookAt:'anna'}),
      paper('letter',810,560,150,105,false,{rotation:-9,keys:[{at:8,x:810,y:560},{at:9.2,rotation:0},{at:11.5,w:160,h:88,rotation:-8}],parts:[
        {target:'sheet',keys:[{at:8,opacity:1,w:100,h:100},{at:8.7,w:70,x:15},{at:9.7,w:12,x:44,h:75,y:12},{at:10.1,opacity:0}]},
        {target:'writing',keys:[{at:8,opacity:1},{at:9.3,opacity:0}]},
        {target:'fold',keys:[{at:8,opacity:.4},{at:9.8,opacity:0}]},
        {target:'left-wing',keys:[{at:8,opacity:0,w:7,x:46},{at:9.6,opacity:1,w:7,x:46},{at:10.8,w:100,x:0}]},
        {target:'right-wing',keys:[{at:8,opacity:0,w:7,x:46},{at:9.8,opacity:1,w:7,x:46},{at:11,w:100,x:0}]},
        {target:'keel',keys:[{at:8,opacity:0},{at:10.3,opacity:0},{at:11,opacity:1}]},
      ]}),
    ],[{at:8,x:810,y:560,zoom:1.75},{at:9,x:810,y:560,zoom:2.4},{at:11.7,x:840,y:540,zoom:2.1}],transition('match','letter',.8)),
    scene(3,'flight','На ветру','Самолётик взлетает, пролетает над рекой, ныряет под порывом ветра и снова набирает высоту.',[
      ...landscape(12,17),girl(650,{pose:'point',lookAt:'letter'}),boy(1840,{pose:'reach',lookAt:'letter'}),
      node('wind','wind',1370,355,280,110,{opacity:0,keys:[{at:12,opacity:0},{at:14.2,opacity:0},{at:14.6,opacity:.7,x:1300},{at:15.7,opacity:0,x:1520}]}),
      paper('letter',810,560,160,88,true,{rotation:-8,keys:[{at:12,x:810,y:560,w:160,h:88},{at:12.8,x:990,y:360,w:160,h:88,rotation:-25},{at:13.7,x:1210,y:270,w:155,h:85,rotation:4},{at:14.6,x:1420,y:390,rotation:29},{at:15.2,x:1500,y:430,rotation:-13},{at:16.9,x:1690,y:330,w:160,h:88,rotation:-11}]}),
    ],[{at:12,x:840,y:540,zoom:2.1},{at:12.9,x:1080,y:420,zoom:1.35},{at:14.5,x:1370,y:420,zoom:1.35},{at:16.8,x:1710,y:455,zoom:1.1}],transition('match','letter',.5)),
    scene(4,'receive','Поймать и прочитать','Лев встречает самолётик рукой. Крылья раскрываются обратно в исписанный лист.',[
      ...landscape(17,22),girl(650,{pose:'listen',lookAt:'letter'}),boy(1840,{pose:'reach',lookAt:'letter',keys:[{at:17,pose:'reach'},{at:18.8,pose:'carry'}]}),
      paper('letter',1690,330,160,88,true,{rotation:-11,keys:[{at:17,x:1690,y:330},{at:18.3,parent:'lev',anchor:'hand-left',x:0,y:0,w:220,h:130,rotation:160},{at:19.7,w:220,h:145,rotation:180}],parts:[
        {target:'sheet',keys:[{at:17,opacity:0,w:8,x:46},{at:19,opacity:0},{at:19.6,opacity:1,w:8,x:46},{at:20.4,w:100,x:0}]},
        {target:'writing',keys:[{at:17,opacity:0},{at:20,opacity:0},{at:20.7,opacity:1}]},
        {target:'fold',keys:[{at:17,opacity:0},{at:20.1,opacity:0},{at:20.5,opacity:.4}]},
        {target:'left-wing',keys:[{at:17,opacity:1},{at:19,w:100,x:0},{at:19.7,w:6,x:47},{at:20.1,opacity:0}]},
        {target:'right-wing',keys:[{at:17,opacity:1},{at:19.2,w:100,x:0},{at:19.9,w:6,x:47},{at:20.2,opacity:0}]},
        {target:'keel',keys:[{at:17,opacity:1},{at:19.2,opacity:0}]},
      ]}),
    ],[{at:17,x:1710,y:455,zoom:1.1},{at:18.6,x:1780,y:495,zoom:1.7},{at:21.7,x:1760,y:480,zoom:1.55}],transition('match','letter',.4)),
    scene(5,'reply','Ответ','Ответ летит к Анне. Камера отъезжает и снова объединяет оба берега.',[
      ...landscape(22,27),girl(650,{pose:'reach',lookAt:'letter',keys:[{at:22,pose:'reach'},{at:26.1,pose:'celebrate'}]}),boy(1840,{pose:'point',lookAt:'letter'}),
      paper('letter',1720,565,160,98,true,{rotation:180,keys:[{at:22,x:1720,y:565},{at:22.65,x:1720,y:565},{at:23.1,x:1630,y:390,w:160,h:88,rotation:196},{at:23.9,x:1390,y:285,w:150,h:80,rotation:185},{at:24.5,x:1160,y:285,rotation:177},{at:25.3,x:950,y:390,rotation:159},{at:26.1,parent:'anna',anchor:'hand-right',x:0,y:0,w:180,h:100,rotation:170},{at:26.9,rotation:165}],parts:[
        {target:'sheet',keys:[{at:22,opacity:1,w:100,x:0},{at:22.35,w:8,x:46},{at:22.6,opacity:0}]},
        {target:'writing',keys:[{at:22,opacity:1},{at:22.35,opacity:0}]},
        {target:'fold',keys:[{at:22,opacity:.4},{at:22.4,opacity:0}]},
        {target:'left-wing',keys:[{at:22,opacity:0,w:8,x:46},{at:22.35,opacity:1,w:8,x:46},{at:22.8,w:100,x:0}]},
        {target:'right-wing',keys:[{at:22,opacity:0,w:8,x:46},{at:22.4,opacity:1,w:8,x:46},{at:22.85,w:100,x:0}]},
        {target:'keel',keys:[{at:22,opacity:0},{at:22.6,opacity:0},{at:22.85,opacity:1}]},
      ]}),
    ],[{at:22,x:1760,y:480,zoom:1.55},{at:23.2,x:1500,y:420,zoom:1.1},{at:25.3,x:1230,y:465,zoom:.68},{at:27,x:1230,y:465,zoom:.7}],transition('match','letter',.7)),
  ];
  const raw={version:1,title:'Письмо через реку',summary:'Письмо меняет форму, пересекает реку и возвращается ответом. Авторская немая постановка, подготовленная без API.',entities:assets,scenes};
  const validated=validateStoryWindow(raw,{transcript,start:0,end:27});
  return {...validated,version:1,duration:27,transcript,provenance:{generated:false,director:'codex-authored',source:'authored-script',silent:true}};
}
