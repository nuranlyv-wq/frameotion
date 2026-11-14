// Hand-authored test graphs. These are never the production semantic director.
import {validateStoryWindow} from '../../src/character-story/contract.js';
export function storyTranscript(lines){
  let id=0;
  const segments=lines.map((text,i)=>({id:`s${i}`,start:i*4,end:i*4+3.5,text,speaker:'voice-0'}));
  const words=segments.flatMap(s=>{const values=s.text.split(/\s+/);return values.map((text,i)=>({id:`w${id++}`,segment:s.id,start:s.start+i*3.5/values.length,end:s.start+(i+1)*3.5/values.length,text,probability:1}));});
  return {language:'ru',text:lines.join(' '),segments,words,engine:'hand-authored-test-transcript'};
}
const part=(id,kind,x,y,w,h,fill='paper',stroke='ink',extra={})=>({id,parent:'',kind,x,y,w,h,fill,stroke,...extra});
const entity=(id,label,parts,evidence=['s0'])=>({id,label,kind:'prop',appearance:0,voice:'',evidence,parts});
const node=(id,asset,x,y,w,h,extra={})=>({id,entity:asset,parent:'',anchor:'origin',x,y,w,h,rotation:0,opacity:1,pose:'idle',lookAt:'',keys:[],parts:[],...extra});
const transition=(kind='cut',anchor='')=>({kind,duration:kind==='cut'?0:.6,anchor,direction:'left'});
function scene(id,transcript,index,nodes,action,trans=transition()){
  const source=transcript.segments[index],start=source.start;
  return {id,startWord:transcript.words.find(w=>w.segment===source.id).id,sourceSegments:[source.id],quote:source.text,title:source.text.replace(/[.!?]/g,''),action,nodes,camera:[{at:start,x:800,y:450,zoom:1}],transition:trans};
}
export function gardenStoryFixture(){
  const transcript=storyTranscript(['Маша нашла семечко.','Она посадила его в землю.','Пошёл дождь.','Из земли вырос цветок.']);
  const entities=[
    {id:'masha',label:'Маша',kind:'character',appearance:0,voice:'',evidence:['s0'],parts:[]},
    entity('seed','Семечко',[part('seed-body','ellipse',15,5,70,90,'support')]),
    entity('bed','Земля',[part('soil','path',0,0,100,100,'support','ink',{d:'M 0 30 Q 20 5 40 25 Q 60 10 100 30 L 100 100 L 0 100 Z'})],['s1']),
    entity('rain','Дождь',[part('drops','path',0,0,100,100,'none','ink',{d:'M 12 0 L 4 25 M 45 15 L 37 42 M 80 0 L 72 25 M 18 55 L 10 80 M 60 50 L 52 78 M 95 65 L 87 92'})],['s2']),
    entity('flower','Цветок',[part('stem','path',0,0,100,100,'none','ink',{d:'M 50 100 L 50 25 M 50 75 Q 10 45 15 70 Q 25 90 50 85 M 50 57 Q 90 32 87 60 Q 75 76 50 70'}),part('petals','path',0,0,100,50,'accent','ink',{d:'M 50 40 C 10 40 10 10 40 10 C 45 -10 72 0 65 20 C 100 5 100 45 73 42 C 88 76 53 87 50 58 C 20 80 4 50 30 40 Z'}),part('centre','ellipse',42,13,16,12,'support')],['s3']),
  ];
  const hero=node('hero','masha',390,800,220,440,{pose:'walk',keys:[{at:0,x:390},{at:2.8,x:670,pose:'carry'}]});
  const seed=node('held-seed','seed',780,760,36,27,{keys:[{at:2.8,parent:'hero',anchor:'hand-right',x:0,y:0,w:60,h:50}]});
  const bed=node('earth','bed',930,780,430,100);
  const scenes=[
    scene('find',transcript,0,[seed,hero],'Маша подходит и поднимает семечко.'),
    scene('plant',transcript,1,[bed,node('hero','masha',670,800,220,440,{pose:'carry',keys:[{at:4,pose:'carry'},{at:6.4,pose:'reach'}]}),node('held-seed','seed',0,0,60,50,{parent:'hero',anchor:'hand-right',keys:[{at:5.8,x:0,y:0},{at:6.4,parent:'',anchor:'origin',x:920,y:750,w:36,h:27},{at:7.3,opacity:0}]})],'Семечко переходит из руки в землю.',transition('match','hero')),
    scene('water',transcript,2,[bed,node('hero','masha',670,800,220,440,{pose:'listen',keys:[{at:8,x:670},{at:10.7,x:430,pose:'point'}]}),node('rainfall','rain',930,400,480,530,{opacity:0,keys:[{at:8,opacity:0},{at:8.8,opacity:1},{at:11.5,y:510}]})],'Капли дождя падают на землю.',transition('match','earth')),
    scene('bloom',transcript,3,[bed,node('hero','masha',430,800,220,440,{pose:'celebrate'}),node('bloom','flower',930,735,210,1,{keys:[{at:12,y:735,h:1},{at:14.7,y:600,h:270}]})],'Цветок вырастает из той же земли.',transition('match','earth')),
  ];
  const raw={version:1,title:'Из семечка — цветок',summary:'Последовательность находки, посадки, дождя и роста.',entities,scenes};
  const validated=validateStoryWindow(raw,{transcript,start:0,end:16});
  return {transcript,raw,story:{...validated,version:1,duration:16,transcript,provenance:{generated:false,director:'hand-authored-render-test'}}};
}
export function doorStoryFixture(){
  const transcript=storyTranscript(['Маша не открыла дверь.','Она оставила письмо у порога и ушла.']);
  const entities=[{id:'masha',label:'Маша',kind:'character',appearance:0,voice:'',evidence:['s0'],parts:[]},entity('door','Закрытая дверь',[part('frame','rect',0,0,100,100),part('panel','rect',7,3,86,94,'paper','ink'),part('handle','ellipse',75,48,8,5,'accent')]),entity('letter','Письмо',[part('envelope','rect',0,0,100,100),part('fold','path',0,0,100,100,'none','ink',{d:'M 0 0 L 50 60 L 100 0'})],['s1'])];
  const door=node('closed-door','door',1050,500,280,540);
  const scenes=[scene('closed',transcript,0,[door,node('hero','masha',550,800,220,440,{pose:'think'})],'Маша стоит перед дверью; дверь остаётся закрытой.'),scene('leave',transcript,1,[door,node('letter','letter',1010,780,85,48),node('hero','masha',550,800,220,440,{pose:'walk',keys:[{at:4,x:550},{at:7.6,x:170,pose:'idle'}]})],'Письмо остаётся у закрытой двери, Маша уходит.',transition('match','closed-door'))];
  const raw={version:1,title:'Письмо у порога',summary:'Дверь не открылась; письмо оставлено у порога.',entities,scenes};
  const validated=validateStoryWindow(raw,{transcript,start:0,end:8});return {transcript,raw,story:{...validated,version:1,duration:8,transcript,provenance:{generated:false,director:'hand-authored-render-test'}}};
}
export function englishAudioStoryFixture(transcript,duration){
  const at=token=>transcript.words.find(w=>w.text.toLowerCase().replace(/[^a-z]/g,'')===token)?.start??0;
  const startWord=token=>transcript.words.find(w=>w.text.toLowerCase().replace(/[^a-z]/g,'')===token)?.id;
  const supporting=token=>transcript.segments.filter(s=>s.text.toLowerCase().includes(token)).map(s=>s.id);
  const quote=token=>transcript.segments.find(s=>s.text.toLowerCase().includes(token))?.text??'';
  const make=(id,token,nodes,action,trans=transition())=>({id,startWord:startWord(token),sourceSegments:supporting(token),quote:quote(token),title:token,action,nodes,camera:[{at:id==='pencil-scene'?0:at(token),x:800,y:450,zoom:1}],transition:trans});
  const entities=[
    entity('pencil','Pencil with black lead',[part('shaft','path',0,0,100,100,'support','ink',{d:'M 0 35 L 82 35 L 100 50 L 82 65 L 0 65 Z'}),part('lead','path',0,0,100,100,'ink','ink',{d:'M 90 42 L 100 50 L 90 58 Z',color:'black'})],supporting('pencil')),
    entity('written-line','Graphite mark',[part('line','path',0,0,100,100,'none','ink',{d:'M 0 75 Q 18 35 30 60 Q 45 88 57 40 Q 69 0 76 70 Q 88 98 100 38'})],supporting('pencil')),
    entity('lamp','Lamp with a green flame',[part('base','path',0,0,100,100,'support','ink',{d:'M 20 100 L 27 76 L 43 70 L 43 32 L 57 32 L 57 70 L 73 76 L 80 100 Z'}),part('glass','ellipse',27,4,46,64,'paper','ink'),part('flame','path',35,13,30,43,'accent','ink',{d:'M 50 100 C -5 65 15 30 50 0 C 30 45 98 51 50 100 Z',color:'green'})],supporting('lamp')),
    entity('shirt','Clothes',[part('shirt','path',0,0,100,100,'accent','ink',{d:'M 25 5 L 40 0 Q 50 17 60 0 L 75 5 L 100 27 L 83 48 L 73 40 L 74 100 L 26 100 L 27 40 L 17 48 L 0 27 Z'})],supporting('clothes')),
    entity('bed','Lodging',[part('bed','path',0,0,100,100,'paper','ink',{d:'M 0 85 L 0 20 L 10 20 L 10 55 L 100 55 L 100 85 L 90 85 L 90 70 L 10 70 L 10 85 Z'}),part('pillow','ellipse',12,38,28,15,'soft','ink')],supporting('lodging')),
    {id:'newcomer',label:'A new man',kind:'character',appearance:1,voice:'',evidence:supporting('men'),parts:[]},
    {id:'girl',label:'The girl in the sentence',kind:'character',appearance:0,voice:'',evidence:supporting('girl'),parts:[]},
    entity('eye-glow','Growing light in the eyes',[part('halo','ellipse',0,0,100,100,'none','support')],supporting('glow')),
  ];
  const firstEnd=at('lamp'),secondEnd=at('clothes'),thirdEnd=at('glow');
  const scenes=[
    make('pencil-scene','pencil',[node('mark','written-line',800,650,650,130,{reveal:0,keys:[{at:at('writes'),reveal:0},{at:Math.min(firstEnd-.03,at('best')),reveal:1}]}),node('pencil','pencil',480,550,300,170,{rotation:-22,keys:[{at:at('writes'),x:480,y:550},{at:Math.min(firstEnd-.03,at('best')),x:1070,y:540}]})],'The black pencil moves and leaves a graphite mark.'),
    make('lamp-scene','lamp',[node('lamp','lamp',800,510,390,510,{parts:[{target:'flame',keys:[{at:at('lamp'),opacity:.2},{at:Math.min(secondEnd-.03,at('green')),opacity:1}]}]})],'The lamp flame becomes steadily visible and green.',transition('wipe')),
    make('lodging-scene','clothes',[node('shirt','shirt',760,380,200,210,{keys:[{at:at('clothes'),y:440,opacity:0},{at:at('lodging'),y:350,opacity:1}]}),node('bed','bed',1120,580,370,270),node('man','newcomer',300,790,230,450,{pose:'walk',keys:[{at:at('clothes'),x:300},{at:Math.min(thirdEnd-.04,at('men')),x:560,pose:'reach'}]})],'A newcomer approaches the offered clothing and lodging.',transition('pan')),
    make('girl-scene','glow',[node('girl','girl',800,800,420,620,{pose:'listen'}),node('left-eye','eye-glow',-30,10,24,28,{parent:'girl',anchor:'head',opacity:0,keys:[{at:at('glow'),opacity:0},{at:at('eyes'),opacity:1,w:34,h:38}]}),node('right-eye','eye-glow',30,10,24,28,{parent:'girl',anchor:'head',opacity:0,keys:[{at:at('glow'),opacity:0},{at:at('eyes'),opacity:1,w:34,h:38}]})],'A restrained light develops around the girl’s eyes.',transition('wipe')),
  ];
  const raw={version:1,title:'The images in the recording',summary:'Pencil, green lamp, clothing and lodging, then the girl’s eyes.',entities,scenes};
  const validated=validateStoryWindow(raw,{transcript,start:0,end:duration});
  return {...validated,version:1,duration,transcript,provenance:{generated:false,director:'hand-authored-english-audio-test'}};
}
