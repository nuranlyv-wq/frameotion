import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {mkdir,writeFile,readFile,stat} from 'node:fs/promises';
import {hasApiKey} from '../config.js';
import {directVox} from './director.js';
import {renderVoxFilm} from './render.js';
const valid=id=>/^vox-[a-f0-9-]{36}$/.test(id);
export function createVoxService(root,{director=directVox,renderer=renderVoxFilm,enabled=true}={}){
  const jobs=new Map();let active=null;
  const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
  const visible=job=>({id:job.id,status:job.status,stage:job.stage,progress:job.progress,title:job.title,error:job.error,video:job.status==='complete'?`/api/vox/jobs/${job.id}/video`:null});
  async function save(job){await writeFile(path.join(root,'runs',job.id,'status.json'),JSON.stringify(visible(job)));}
  async function find(id){
    if(jobs.has(id))return jobs.get(id);if(!valid(id))return null;
    try{const job=JSON.parse(await readFile(path.join(root,'runs',id,'status.json'),'utf8'));if(job.status==='running'){job.status='failed';job.error='Создание прервалось. Исходный текст можно отправить ещё раз.';}return job;}catch{return null;}
  }
  async function run(job,text,baseURL){
    const timer=setTimeout(()=>job.controller.abort(Error('Превышено время создания. Попробуйте сократить текст.')),8*60*1000);timer.unref();
    try{
      const directory=path.join(root,'runs',job.id);await mkdir(directory,{recursive:true});await writeFile(path.join(directory,'request.json'),JSON.stringify({text}));await save(job);
      const score=await director(text,{signal:job.controller.signal});job.title=score.title;job.stage='render';job.progress=.2;await writeFile(path.join(directory,'score.json'),JSON.stringify(score,null,2));
      await renderer(score,{directory,baseURL,signal:job.controller.signal,onProgress:p=>{job.progress=.2+.78*p;}});
      job.status='complete';job.stage='complete';job.progress=1;
    }catch(error){job.status=job.controller.signal.aborted?'cancelled':'failed';job.error=job.controller.signal.aborted?'Создание остановлено. Текст сохранён.':error.message;}
    finally{clearTimeout(timer);active=null;await save(job).catch(()=>{});}
  }
  return {async handle(req,res,url){
    if(!url.pathname.startsWith('/api/vox/'))return false;
    if(!enabled){json(res,503,{error:'Создание Vox-видео пока недоступно на этом сервере.'});return true;}
    if(req.method==='GET'&&url.pathname==='/api/vox/status'){json(res,200,{configured:hasApiKey()||director!==directVox});return true;}
    if(['POST','DELETE'].includes(req.method)&&req.headers.origin!==`http://${req.headers.host}`){json(res,403,{error:'Чужой источник запроса.'});return true;}
    if(req.method==='POST'&&url.pathname==='/api/vox/jobs'){
      if(!hasApiKey()&&director===directVox){json(res,503,{error:'Создание видео пока не подключено. Текст сохранён.'});return true;}
      if(active){json(res,429,{error:'Сейчас создаётся другое видео. Попробуйте немного позже.'});return true;}
      if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||'')){json(res,415,{error:'Ожидается текст.'});return true;}
      try{
        const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>50000)throw Error('Сократите текст до 10 000 знаков.');chunks.push(chunk);}
        const body=JSON.parse(Buffer.concat(chunks).toString()),text=typeof body.text==='string'?body.text.trim():'';if(text.length<10||text.length>10000)throw Error('Добавьте текст длиной от 10 до 10 000 знаков.');
        const job={id:'vox-'+randomUUID(),status:'running',stage:'director',progress:.03,controller:new AbortController()};jobs.set(job.id,job);active=job.id;
        json(res,202,visible(job));void run(job,text,`http://127.0.0.1:${req.socket.localPort}`);return true;
      }catch(error){json(res,400,{error:error instanceof SyntaxError?'Не удалось прочитать текст.':error.message});return true;}
    }
    const match=url.pathname.match(/^\/api\/vox\/jobs\/(vox-[a-f0-9-]{36})(\/video)?$/);
    if(match){
      const job=await find(match[1]);if(!job){json(res,404,{error:'Видео не найдено.'});return true;}
      if(req.method==='DELETE'&&!match[2]){job.controller?.abort();json(res,200,{status:'cancelled'});return true;}
      if(req.method==='GET'&&!match[2]){json(res,200,visible(job));return true;}
      if(req.method==='GET'&&match[2]&&job.status==='complete'){
        const file=path.join(root,'runs',job.id,'video.mp4');
        try{
          const size=(await stat(file)).size,range=req.headers.range;let start=0,end=size-1;
          if(range){const m=/^bytes=(\d+)-(\d*)$/.exec(range);if(!m){res.writeHead(416,{'Content-Range':`bytes */${size}`});res.end();return true;}start=Number(m[1]);end=m[2]?Math.min(Number(m[2]),size-1):end;if(start>end||start>=size){res.writeHead(416,{'Content-Range':`bytes */${size}`});res.end();return true;}}
          res.writeHead(range?206:200,{'Content-Type':'video/mp4','Content-Length':end-start+1,'Accept-Ranges':'bytes','Cache-Control':'private, no-cache','X-Content-Type-Options':'nosniff',...(range?{'Content-Range':`bytes ${start}-${end}/${size}`}:{})});createReadStream(file,{start,end}).pipe(res);
        }catch{json(res,404,{error:'Файл видео не найден.'});}return true;
      }
    }
    json(res,404,{error:'Неизвестный запрос.'});return true;
  },close(){for(const job of jobs.values())if(job.status==='running')job.controller.abort();}};
}
