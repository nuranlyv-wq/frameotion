import {spawn} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';
import {mkdir,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import {directStory} from '../character-story/director.js';
import {hasApiKey} from '../config.js';

const MAX_BYTES=60*1024*1024,MAX_JOBS=3,TTL=20*60*1000;
export function createSpeechService(root,{storyDirector=directStory}={}){
  const python=path.join(root,'tools/character-speech/.venv/bin/python');
  const workerFile=path.join(root,'tools/character-speech/worker.py');
  const models=path.join(root,'tools/character-speech/models');
  const inputRoot=path.join(root,'runs/.character-speech-jobs');
  const token=randomBytes(24).toString('hex'),jobs=new Map();
  let worker=null,ready=false,running=null,closed=false,stderr='',timer=null;
  const available=()=>existsSync(python)&&['manifest.json','phonemes.int8.onnx','sherpa-onnx-pyannote-segmentation-3-0/model.onnx','3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx'].every(f=>existsSync(path.join(models,f)));
  const clean=job=>rm(job.directory,{recursive:true,force:true}).catch(()=>{});
  function settle(job,state,error,result){
    if(!job)return;job.state=state;job.error=error;job.result=result;job.updated=Date.now();
    if(state!=='complete')job.directController?.abort();
    clean(job);if(running===job.id){running=null;clearTimeout(timer);timer=null;}
  }
  function failWorker(reason){
    if(running)settle(jobs.get(running),'failed',reason);ready=false;
  }
  function launch(){
    if(worker||closed)return;
    stderr='';worker=spawn(python,['-u',workerFile],{cwd:root,stdio:['pipe','pipe','pipe']});
    const current=worker;
    let announced=false;
    current.stderr.on('data',data=>{stderr=(stderr+data.toString()).slice(-2500);});
    current.stdin.on('error',()=>{});
    const lines=readline.createInterface({input:current.stdout});
    lines.on('line',line=>{
      if(worker!==current)return;
      let event;try{event=JSON.parse(line);}catch{return;}
      if(event.type==='ready'){announced=true;ready=true;pump();return;}
      const job=jobs.get(event.id);if(!job||job.state==='cancelled')return;
      if(event.type==='progress'){job.stage=event.stage;job.progress=event.progress;job.updated=Date.now();}
      else if(event.type==='result'){
        if(!job.story){settle(job,'complete',null,event.result);pump();return;}
        clean(job);job.stage='story';job.progress=0;job.directController=new AbortController();
        storyDirector({transcript:event.result.transcript,duration:event.result.duration,signal:job.directController.signal,onProgress:state=>{if(job.state!=='cancelled'){job.stage=state.stage;job.progress=state.progress;job.updated=Date.now();}}})
          .then(story=>{if(job.state==='cancelled'||job.state==='failed')return;settle(job,'complete',null,{...event.result,story});pump();})
          .catch(error=>{if(job.state==='cancelled'||job.state==='failed')return;settle(job,'failed',error.message||'Не удалось поставить рассказ.');pump();});
      }
      else if(event.type==='error'){settle(job,'failed',event.error);pump();}
    });
    current.on('error',()=>{if(worker!==current)return;worker=null;failWorker('Не удалось запустить локальный анализатор. Проверьте установку моделей.');for(const job of jobs.values())if(job.state==='queued')settle(job,'failed','Не удалось запустить локальный анализатор.');});
    current.on('exit',()=>{
      if(worker!==current)return;worker=null;
      if(running)failWorker('Локальный анализатор остановился. Попробуйте запись короче.');else ready=false;
      if(!announced)for(const job of jobs.values())if(job.state==='queued')settle(job,'failed','Не удалось загрузить локальные модели анализа.');
      for(const job of jobs.values())if(job.state==='queued'&&!available())settle(job,'failed','Модели анализа недоступны.');
      if(!closed&&[...jobs.values()].some(j=>j.state==='queued'))pump();
    });
  }
  function pump(){
    if(closed||running)return;
    const job=[...jobs.values()].find(j=>j.state==='queued');if(!job)return;
    if(!available()){settle(job,'failed','Локальные модели ещё не установлены.');return;}
    if(!worker){launch();return;}if(!ready)return;
    running=job.id;job.state='running';job.stage='speakers';job.updated=Date.now();
    worker.stdin.write(JSON.stringify({id:job.id,path:job.input,speakers:job.speakers,transcribe:job.story})+'\n');
    timer=setTimeout(()=>{
      settle(job,'failed','Анализ превысил допустимое время. Попробуйте запись короче.');
      const previous=worker;worker=null;ready=false;previous?.kill('SIGTERM');pump();
    },15*60*1000);timer.unref();
  }
  function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));}
  function authorised(req){
    const origin=req.headers.origin;
    return origin===`http://${req.headers.host}`&&req.headers['x-character-speech-token']===token;
  }
  const expiry=setInterval(()=>{for(const [id,job]of jobs)if(Date.now()-job.updated>TTL&&!['running','queued'].includes(job.state)){jobs.delete(id);clean(job);}},60000);expiry.unref();
  async function handle(req,res,url){
    if(!url.pathname.startsWith('/api/speech/'))return false;
    if(req.method==='GET'&&url.pathname==='/api/speech/status'){
      json(res,200,{available:available(),token,processing:running!==null,local:true,storyConfigured:storyDirector!==directStory||hasApiKey()});return true;
    }
    if(req.method==='POST'&&url.pathname==='/api/speech/jobs'){
      if(!authorised(req)){json(res,403,{error:'Недопустимый источник запроса.'});return true;}
      if(!available()){json(res,503,{error:'Локальные модели ещё не установлены.'});return true;}
      if([...jobs.values()].filter(j=>['queued','running'].includes(j.state)).length>=MAX_JOBS){json(res,429,{error:'Анализатор занят. Дождитесь завершения текущей записи.'});return true;}
      const count=Number(url.searchParams.get('speakers')??'-1');
      if(![-1,1,2,3].includes(count)){json(res,400,{error:'Укажите автоматический режим или от одного до трёх участников.'});return true;}
      const chunks=[];let size=0;
      try{
        for await(const chunk of req){size+=chunk.length;if(size>MAX_BYTES){json(res,413,{error:'Запись слишком длинная для локального анализа.'});return true;}chunks.push(chunk);}
        const data=Buffer.concat(chunks);
        if(data.length<44||data.toString('ascii',0,4)!=='RIFF'||data.toString('ascii',8,12)!=='WAVE'){json(res,400,{error:'Ожидается WAV с декодированной записью.'});return true;}
        const id=randomUUID(),directory=path.join(inputRoot,id),input=path.join(directory,'input.wav');
        await mkdir(directory,{recursive:true,mode:0o700});await writeFile(input,data,{mode:0o600});
        const job={id,directory,input,speakers:count,story:url.searchParams.get('story')==='1',state:'queued',progress:0,stage:'queued',updated:Date.now()};
        jobs.set(id,job);json(res,202,{id,state:job.state});pump();return true;
      }catch{if(!res.headersSent)json(res,400,{error:'Не удалось прочитать аудиозапись.'});return true;}
    }
    const match=url.pathname.match(/^\/api\/speech\/jobs\/([a-f0-9-]{36})$/);
    if(match&&req.method==='GET'){
      const job=jobs.get(match[1]);if(!job){json(res,404,{error:'Задача не найдена.'});return true;}
      json(res,200,{id:job.id,state:job.state,stage:job.stage,progress:job.progress,error:job.error,result:job.result});return true;
    }
    if(match&&req.method==='DELETE'){
      if(!authorised(req)){json(res,403,{error:'Недопустимый источник запроса.'});return true;}
      const job=jobs.get(match[1]);
      if(job){const active=running===job.id;settle(job,'cancelled');if(active){const previous=worker;worker=null;ready=false;previous?.kill('SIGTERM');}pump();}
      json(res,200,{state:'cancelled'});return true;
    }
    json(res,404,{error:'Неизвестный запрос.'});return true;
  }
  return {handle,close(){closed=true;clearInterval(expiry);clearTimeout(timer);worker?.kill('SIGTERM');for(const job of jobs.values()){job.directController?.abort();clean(job);}jobs.clear();}};
}
