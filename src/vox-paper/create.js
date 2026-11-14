const $=id=>document.getElementById(id),panels=['create','progress','result'];
let active=null,timer,generation=0;
try{$('source').value=localStorage.getItem('frameotion-vox-draft')||'';}catch{}
function save(){try{localStorage.setItem('frameotion-vox-draft',$('source').value);}catch{}}
$('source').oninput=save;
function show(name){for(const id of panels)$(id+'-panel').hidden=id!==name;}
function error(message){$('error').textContent=message;$('error').hidden=!message;}
async function json(url,options){const response=await fetch(url,options);const value=await response.json();if(!response.ok)throw Error(value.error||'Не удалось выполнить запрос. Текст сохранён.');return value;}
function reset(message=''){clearTimeout(timer);active=null;generation++;show('create');$('generate').disabled=false;error(message);history.replaceState(null,'',location.pathname);}
async function poll(id,attempt=generation,failures=0){
 try{
  const job=await json(`/api/vox/jobs/${encodeURIComponent(id)}`);if(attempt!==generation)return;
  if(job.status==='complete'){
   active=null;show('result');$('result-title').textContent=job.title||'Ваше видео';$('video').src=job.video;$('download').href=job.video;$('result-title').focus();return;
  }
  if(job.status==='failed'||job.status==='cancelled'){reset(job.error||'Создание остановлено. Текст сохранён.');return;}
  $('stage').textContent=job.stage==='render'?'Собираем готовое видео…':'Продумываем историю и сцены…';$('progress').value=job.progress||0;
  timer=setTimeout(()=>poll(id,attempt),700);
 }catch(e){if(attempt!==generation)return;if(failures<3)timer=setTimeout(()=>poll(id,attempt,failures+1),1400);else reset(e.message);}
}
$('vox-form').onsubmit=async event=>{
 event.preventDefault();save();error('');$('generate').disabled=true;const attempt=++generation;
 try{
  const job=await json('/api/vox/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:$('source').value.trim()})});if(attempt!==generation)return;
  active=job.id;show('progress');$('progress').value=0;$('stage').textContent='Продумываем историю и сцены…';$('cancel').disabled=false;$('progress-title').focus();
  const url=new URL(location.href);url.searchParams.set('run',job.id);history.replaceState(null,'',url);poll(job.id,attempt);
 }catch(e){if(attempt===generation)reset(e.message);}
};
$('attach').onclick=()=>$('text-file').click();
$('text-file').onchange=async()=>{const file=$('text-file').files[0];$('text-file').value='';if(!file)return;if(file.size>60000){error('Добавьте текстовый файл до 10 000 знаков.');return;}const text=await file.text();if(text.length>10000){error('Сократите текст до 10 000 знаков.');return;}$('source').value=text;save();error('');$('source').focus();};
$('cancel').onclick=async()=>{if(!active)return;$('cancel').disabled=true;try{await json(`/api/vox/jobs/${encodeURIComponent(active)}`,{method:'DELETE'});}catch(e){$('stage').textContent=e.message;$('cancel').disabled=false;}};
$('new-video').onclick=()=>{$('video').pause();$('video').removeAttribute('src');$('video').load();reset();$('source').focus();};
const run=new URLSearchParams(location.search).get('run');if(run&&/^vox-[a-f0-9-]{36}$/.test(run)){active=run;show('progress');poll(run);}
window.__ready=true;
