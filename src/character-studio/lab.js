import {CHARACTER_STYLES,characterStyle,DEFAULT_CAST,demoScore,assignTurn,planCamera,analyseAudio,audioLevel,renderCharacterScene,applySpeechResult} from './index.js';
import {paintReferenceCharacter} from './characters.js';
import {prepareSpeechWav,analyseSpeech} from './speech-client.js';
import {authoredStory} from '../character-story/authored.js';
import {CHARACTER_LIBRARY,replaceAvatar} from './cast.js';

const $=selector=>document.querySelector(selector), canvas=$('#stage'),ctx=canvas.getContext('2d');
const query=new URLSearchParams(location.search),capture=query.has('capture');
if(capture){document.documentElement.classList.add('capture');canvas.width=Number(query.get('width'))||1600;canvas.height=canvas.width*9/16;}
await document.fonts.load("500 24px 'Fira Sans'");
let score=demoScore(),shots=planCamera(score),styleId=characterStyle(query.get('style')||'flat-2d').id,mode=query.get('mode')||'podcast';
let time=0,playing=false,last=0,analysis=null,blobUrl=null,loadGeneration=0;
let castBank=score.cast,controller=null,currentFile=null,busy=false;
const audio=$('#audio');
const format=value=>{const n=Math.max(0,value);return `${Math.floor(n/60)}:${String(Math.floor(n%60)).padStart(2,'0')}`;};

for(const style of CHARACTER_STYLES){
  const button=document.createElement('button');button.dataset.style=style.id;button.setAttribute('aria-pressed',String(style.id===styleId));
  const preview=document.createElement('canvas');preview.width=102;preview.height=102;
  const label=document.createElement('span'),name=document.createElement('strong'),detail=document.createElement('small');
  name.textContent=style.name;detail.textContent=style.detail;label.append(name,detail);button.append(preview,label);
  const mini=preview.getContext('2d');mini.fillStyle=style.background;mini.fillRect(0,0,102,102);
  const thumbnailScale=.46/(style.rig.headScale??1);
  paintReferenceCharacter(mini,{...DEFAULT_CAST[0],mouth:0,gesture:0,blink:0,breathe:0,nod:0,gaze:0},style,{x:51,scale:thumbnailScale,foot:50+(730-style.rig.head[1])*thumbnailScale});
  button.onclick=()=>selectStyle(style.id);$('#styles').append(button);
}
function selectStyle(id){
  const style=characterStyle(id);
  styleId=style.id;$('#style-name').textContent=style.name;$('#style-description').textContent=style.description;
  for(const button of $('#styles').children)button.setAttribute('aria-pressed',String(button.dataset.style===style.id));updateAvatars();draw();
}
function setMode(value){
  if(!['podcast','storytelling'].includes(value))throw new RangeError('Unknown mode');mode=value;
  for(const button of document.querySelectorAll('[data-mode]'))button.setAttribute('aria-pressed',String(button.dataset.mode===mode));
  $('#mode-note').textContent=mode==='storytelling'?'Расшифровка и артикуляция обрабатываются локально. Для постановки текст рассказа и временные метки передаются настроенному облачному режиссёру Frameotion.':'Голоса и звуки речи анализируются на этом компьютере. Имена персонажей можно изменить.';
  $('#story-panel').hidden=mode!=='storytelling'||!score.story;draw();
  $('#authored-story').hidden=mode!=='storytelling';$('#camera').disabled=mode==='storytelling';
  if(mode==='storytelling'&&currentFile&&analysis&&!score.story&&!busy)loadFile(currentFile);
}
for(const button of document.querySelectorAll('[data-mode]'))button.onclick=()=>setMode(button.dataset.mode);
function drawWave(){
  const wave=$('#wave'),c=wave.getContext('2d');c.clearRect(0,0,wave.width,wave.height);
  if(!analysis){c.strokeStyle='#748080';c.beginPath();c.moveTo(0,35);c.lineTo(wave.width,35);c.stroke();return;}
  for(let x=0;x<wave.width;x+=3){
    const index=Math.floor(x/wave.width*analysis.peaks.length),lastIndex=Math.max(index+1,Math.floor((x+3)/wave.width*analysis.peaks.length));let peak=0;
    for(let i=index;i<lastIndex;i++)peak=Math.max(peak,analysis.peaks[i]??0);
    c.fillStyle=x/wave.width<time/score.duration?'#ff5a1f':'#748080';const h=Math.max(1,Math.min(31,peak*75));c.fillRect(x,35-h,1.5,h*2);
  }
}
function draw(){
  const state=renderCharacterScene(ctx,score,time,{styleId,mode,level:audioLevel(analysis,time),demonstration:!analysis,camera:$('#camera').value,shots});
  $('#scrub').max=score.duration;$('#scrub').value=time;$('#time').textContent=`${format(time)} / ${format(score.duration)}`;
  const authored=mode==='storytelling'&&score.story?.provenance.source==='authored-script';
  $('#story-line').hidden=!authored;
  if(authored)$('#story-line').textContent=score.story.transcript.segments.find(s=>s.start<=time&&s.end>time)?.text??score.story.transcript.segments.at(-1).text;
  document.querySelector('.bottom-grid').hidden=authored;
  document.querySelector('.avatar-library').hidden=authored;
  if(score.story)for(const [i,button]of [...$('#story-scenes').children].entries())button.setAttribute('aria-current',String(time>=score.story.scenes[i].start&&time<score.story.scenes[i].end));
  $('#play').textContent=playing?'Пауза':analysis?'Слушать':'Смотреть';drawWave();return state;
}
function updateCast(){
  $('#cast').replaceChildren();
  for(const person of score.cast){
    const label=document.createElement('label'),swatch=document.createElement('i'),input=document.createElement('input');
    swatch.style.background=person.color;input.value=person.name;input.maxLength=24;input.setAttribute('aria-label',`Имя персонажа ${person.name}`);
    input.oninput=()=>{person.name=input.value.trim()||DEFAULT_CAST.find(c=>c.id===person.id)?.name||'Участник';updateNames();draw();};label.append(swatch,input);$('#cast').append(label);
  }
  updateNames();
}
function updateNames(){
  const selected=$('#turn-speaker').value,camera=$('#camera').value;
  const avatarSlot=$('#avatar-slot').value;$('#avatar-slot').replaceChildren();
  $('#turn-speaker').replaceChildren();$('#camera').replaceChildren();
  for(const [value,label]of [['auto','Автоматическая'],['wide','Общий план'],...score.cast.map(p=>[p.id,p.name+' крупнее'])]){
    const option=document.createElement('option');option.value=value;option.textContent=label;$('#camera').append(option);
  }
  for(const person of score.cast){const option=document.createElement('option');option.value=person.id;option.textContent=person.name;$('#turn-speaker').append(option);}
  for(const person of score.cast){const option=document.createElement('option');option.value=person.id;option.textContent=person.name;$('#avatar-slot').append(option);}
  $('#avatar-slot').value=score.cast.some(person=>person.id===avatarSlot)?avatarSlot:score.cast[0].id;
  $('#camera').value=['auto','wide',...score.cast.map(p=>p.id)].includes(camera)?camera:'auto';
  $('#turn-speaker').value=score.cast.some(p=>p.id===selected)?selected:score.cast[0].id;
  for(const person of score.cast){
    const speaker=$(`#turn-speaker option[value="${person.id}"]`),camera=$(`#camera option[value="${person.id}"]`);
    if(speaker)speaker.textContent=person.name;if(camera)camera.textContent=person.name+' крупнее';
  }updateTurns();updateAvatars();
}
function updateAvatars(){
  const selected=score.cast.find(person=>person.id===$('#avatar-slot').value)??score.cast[0];
  const appearance=selected.appearance??CHARACTER_LIBRARY.find(a=>a.id===selected.id)?.appearance??0;
  const style=characterStyle(styleId);$('#avatars').replaceChildren();
  for(const avatar of CHARACTER_LIBRARY){
    const button=document.createElement('button');button.type='button';button.dataset.avatar=avatar.id;
    button.setAttribute('aria-pressed',String(appearance===avatar.appearance));button.setAttribute('aria-label',`${avatar.name}: ${avatar.detail}`);
    const portrait=document.createElement('canvas');portrait.width=180;portrait.height=170;portrait.setAttribute('aria-hidden','true');
    const c=portrait.getContext('2d');c.fillStyle=style.background;c.fillRect(0,0,180,170);
    paintReferenceCharacter(c,{...avatar,mouth:0,gesture:0,blink:0,gaze:0,nod:0,breathe:0},style,{x:90,scale:.62/(style.rig.headScale??1),foot:67+(730-style.rig.head[1])*.62/(style.rig.headScale??1)});
    const name=document.createElement('strong'),detail=document.createElement('small');name.textContent=avatar.name;detail.textContent=avatar.detail;
    button.append(portrait,name,detail);button.onclick=()=>{
      const person=score.cast.find(p=>p.id===$('#avatar-slot').value);
      const oldAvatar=CHARACTER_LIBRARY.find(a=>a.appearance===(person.appearance??CHARACTER_LIBRARY.find(a=>a.id===person.id)?.appearance??0));
      const defaultName=person.name===oldAvatar?.name;
      Object.assign(person,replaceAvatar(person,avatar.id));if(defaultName)person.name=avatar.name;
      const bank=castBank.find(p=>p.id===person.id);if(bank&&bank!==person)Object.assign(bank,replaceAvatar(bank,avatar.id),{name:person.name});
      updateCast();draw();
    };$('#avatars').append(button);
  }
}
$('#avatar-slot').onchange=updateAvatars;
function updateTurns(){
  $('#turns').replaceChildren();
  score.turns.forEach((turn,index)=>{
    const button=document.createElement('button');button.className='turn';button.type='button';
    button.textContent=`${score.cast.find(p=>p.id===turn.speaker).name} · ${turn.start.toFixed(1)}–${turn.end.toFixed(1)} с`;
    const close=document.createElement('span');close.textContent='×';button.append(close);button.title='Удалить этот интервал';
    button.onclick=()=>{score={...score,turns:score.turns.filter((_,i)=>i!==index)};shots=planCamera(score);updateTurns();draw();};$('#turns').append(button);
  });
}
$('#turn-form').onsubmit=event=>{
  event.preventDefault();try{
    score=assignTurn(score,{speaker:$('#turn-speaker').value,start:Number($('#turn-start').value),end:Number($('#turn-end').value)});
    shots=planCamera(score);updateTurns();draw();$('#status').textContent='Участник назначен выбранному интервалу.';
  }catch{$('#status').textContent=`Укажите интервал внутри записи: от 0 до ${score.duration.toFixed(1)} секунды.`;}
};
function stop(){playing=false;audio.pause();draw();}
async function play(){
  if(busy)return;
  if(playing){stop();return;}
  if(time>=score.duration){time=0;if(analysis)audio.currentTime=0;}
  try{if(analysis)await audio.play();playing=true;last=0;draw();}catch{$('#status').textContent='Не удалось воспроизвести запись. Выберите другой аудиофайл.';}
}
$('#play').onclick=play;
$('#camera').onchange=draw;
$('#scrub').oninput=()=>{time=Number($('#scrub').value);if(analysis)audio.currentTime=time;draw();};
$('#load').onclick=()=>$('#file').click();
async function loadFile(file){
  if(!file)return;
  if(file.size>100*1024*1024){$('#status').textContent='Для этой мастерской выберите запись до 100 МБ.';return;}
  currentFile=file;
  const generation=++loadGeneration;controller?.abort();controller=new AbortController();const signal=controller.signal;
  const storytelling=mode==='storytelling';
  stop();setBusy(true);$('#status').textContent='Читаем запись на вашем устройстве…';
  let context;
  try{
    context=new AudioContext();const buffer=await context.decodeAudioData(await file.arrayBuffer());
    const nextAnalysis=analyseAudio(Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i)),buffer.sampleRate);
    if(generation!==loadGeneration)return;
    if(!nextAnalysis.duration)throw new Error('Empty audio');
    $('#status').textContent='Подготавливаем запись для анализа речи…';
    const wav=await prepareSpeechWav(buffer);if(signal.aborted)return;
    const result=await analyseSpeech(wav,{speakers:Number($('#speaker-count').value),story:storytelling,signal,onProgress:state=>{
      if(generation!==loadGeneration)return;
      $('#status').textContent=state.state==='queued'?'Ожидаем локальный анализатор…':state.stage==='story'?'Ставим сцены и связываем действия с рассказом…':state.stage==='transcribing'?'Расшифровываем рассказ и время слов…':state.stage==='phonemes'?'Определяем звуки речи и артикуляцию…':'Разделяем запись по голосам…';
    }});
    if(generation!==loadGeneration)return;
    if(result.speakers.length>3)throw new Error(`Обнаружено голосов: ${result.speakers.length}. Эта студия поддерживает до трёх участников. При ошибке модели уточните число голосов и повторите загрузку.`);
    const nextScore=applySpeechResult({...score,cast:castBank,duration:nextAnalysis.duration,turns:[],speech:undefined,story:undefined,transcript:result.transcript,recording:true},result);
    if(storytelling){if(!result.story)throw new Error('Режиссёр не создал постановку рассказа.');nextScore.story=result.story;}
    stop();if(blobUrl)URL.revokeObjectURL(blobUrl);blobUrl=URL.createObjectURL(file);audio.src=blobUrl;analysis=nextAnalysis;
    score=nextScore;shots=planCamera(score);time=0;currentFile=file;
    $('#source-badge').textContent=file.name;$('#source-badge').title=file.name;
    $('#audio-note').textContent=result.speakers.length?`Определено голосов: ${result.speakers.length}. Персонажи назначены по первому появлению голоса. Артикуляция следует звукам записи.`:'Речь в записи не обнаружена. Воспроизведение доступно; персонажи сохраняют молчание.';
    $('#turn-help').textContent='Реплики определены автоматически. При необходимости исправьте участника на выбранном интервале.';
    $('#status').textContent=storytelling?'Рассказ поставлен. Сцены, действия и переходы следуют записи.':result.warnings.includes('overlapping-speech')?'Готово. На участках одновременной речи проверьте артикуляцию обоих участников.':result.warnings.includes('no-phonetic-events')?'Реплики найдены, но звуки речи не распознаны. Проверьте качество записи.':'Реплики и фонетическая артикуляция готовы.';
    $('#turn-start').value=0;$('#turn-end').value=String(Math.min(3,score.duration));updateCast();updateStory();draw();
  }catch(error){if(generation===loadGeneration)$('#status').textContent=error.name==='AbortError'?'Анализ отменён. Предыдущая сцена сохранена.':error.message==='Empty audio'?'Аудиозапись пуста.':error instanceof DOMException?'Не удалось прочитать этот файл. Попробуйте WAV, MP3 или M4A.':error.message||'Не удалось выполнить анализ записи.';}
  finally{await context?.close();if(generation===loadGeneration)setBusy(false);}
}
function setBusy(value){busy=value;$('#play').disabled=value;$('#cancel-analysis').hidden=!value;$('#reanalyse').hidden=value||!currentFile;for(const control of $('#turn-form').elements)control.disabled=value;for(const button of document.querySelectorAll('[data-mode]'))button.disabled=value;}
$('#cancel-analysis').onclick=()=>controller?.abort();
$('#reanalyse').onclick=()=>loadFile(currentFile);
$('#file').onchange=()=>{const file=$('#file').files[0];$('#file').value='';loadFile(file);};
$('#demo').onclick=()=>{
  ++loadGeneration;controller?.abort();currentFile=null;setBusy(false);stop();analysis=null;audio.removeAttribute('src');audio.load();if(blobUrl)URL.revokeObjectURL(blobUrl);blobUrl=null;
  score=demoScore();castBank=score.cast;shots=planCamera(score);time=0;$('#file').value='';$('#source-badge').textContent='Этюд без аудио';
  $('#turn-start').value='0';$('#turn-end').value='3';
  $('#audio-note').textContent='Сейчас показан немой этюд с заданными репликами. Он помогает сравнить форму и движения персонажей.';
  $('#turn-help').textContent='Реплики этюда заданы для сравнения стилей.';$('#status').textContent='Этюд восстановлен.';updateCast();updateStory();draw();
};
function showAuthoredStory(){
  ++loadGeneration;controller?.abort();currentFile=null;setBusy(false);stop();analysis=null;audio.removeAttribute('src');audio.load();
  if(blobUrl)URL.revokeObjectURL(blobUrl);blobUrl=null;
  const story=authoredStory();score={...demoScore(),duration:story.duration,turns:[],speech:undefined,story};shots=planCamera(score);time=0;
  setMode('storytelling');$('#source-badge').textContent='Авторская история · без аудио';$('#source-badge').title='Постановка подготовлена вручную, без API';
  $('#audio-note').textContent='Письмо превращается в самолётик и пересекает реку. Это авторская немая постановка для просмотра и доработки.';
  $('#mode-note').textContent='Авторский сценарий и время действий заданы вручную. Смена стиля сохраняет историю. Загрузите свою запись для отдельной постановки.';
  $('#status').textContent='Постановка готова к просмотру. Выберите стиль и нажмите «Смотреть».';
  updateStory();draw();
}
$('#authored-story').onclick=showAuthoredStory;
function updateStory(){
  $('#story-panel').hidden=mode!=='storytelling'||!score.story;$('#story-scenes').replaceChildren();$('#transcript').replaceChildren();
  if(!score.story)return;
  $('#transcript-label').textContent=score.story.provenance.source==='authored-script'?'Текст истории':'Расшифровка записи';
  $('#story-title').textContent=score.story.title;$('#story-summary').textContent=score.story.summary;
  for(const scene of score.story.scenes){
    const button=document.createElement('button'),title=document.createElement('strong'),action=document.createElement('span');
    title.textContent=`${format(scene.start)} · ${scene.title}`;action.textContent=scene.action;button.append(title,action);
    button.onclick=()=>{time=scene.start;if(analysis)audio.currentTime=time;draw();};$('#story-scenes').append(button);
  }
  for(const segment of score.story.transcript.segments){const button=document.createElement('button');button.textContent=`${format(segment.start)} · ${segment.text}`;button.onclick=()=>{time=segment.start;if(analysis)audio.currentTime=time;draw();};$('#transcript').append(button);}
}
audio.onended=()=>{playing=false;time=score.duration;draw();};
function tick(now){
  if(playing&&!capture){if(analysis)time=audio.currentTime;else if(last)time=Math.min(score.duration,time+(now-last)/1000);if(time>=score.duration)playing=false;draw();}
  last=now;requestAnimationFrame(tick);
}
updateCast();selectStyle(styleId);setMode(mode);requestAnimationFrame(tick);
if(query.get('example')==='letter')showAuthoredStory();
window.characterLab={
  styles:CHARACTER_STYLES,avatars:CHARACTER_LIBRARY,selectStyle,setMode,
  render(t){time=Math.max(0,Math.min(score.duration,t));return draw();},
  inspect(){return {styleId,mode,time,score,analysis:analysis?{duration:analysis.duration,levels:analysis.levels}:null};},
};
window.__ready=true;
window.addEventListener('beforeunload',()=>controller?.abort());
