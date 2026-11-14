// All requests go to the same loopback server. No audio is sent to a model provider.
export async function prepareSpeechWav(buffer){
  if(buffer.duration>1800)throw new RangeError('Для этой мастерской выберите запись до 30 минут.');
  const mono=new Float32Array(buffer.length),channels=Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i));
  let phase=1;
  if(channels.length===2){
    let xy=0,xx=0,yy=0;const step=Math.max(1,Math.floor(buffer.length/16000));
    for(let i=0;i<buffer.length;i+=step){xy+=channels[0][i]*channels[1][i];xx+=channels[0][i]**2;yy+=channels[1][i]**2;}
    if(xy/Math.sqrt(xx*yy||1)<-.85)phase=-1;
  }
  for(let ch=0;ch<channels.length;ch++)for(let i=0;i<mono.length;i++)mono[i]+=channels[ch][i]*(ch===1?phase:1)/channels.length;
  const context=new OfflineAudioContext(1,Math.ceil(buffer.duration*16000),16000);
  const input=context.createBuffer(1,mono.length,buffer.sampleRate);input.copyToChannel(mono,0);
  const source=context.createBufferSource();source.buffer=input;source.connect(context.destination);source.start();
  const resampled=(await context.startRendering()).getChannelData(0),data=new ArrayBuffer(44+resampled.length*2),view=new DataView(data);
  const ascii=(at,text)=>{for(let i=0;i<text.length;i++)view.setUint8(at+i,text.charCodeAt(i));};
  ascii(0,'RIFF');view.setUint32(4,data.byteLength-8,true);ascii(8,'WAVE');ascii(12,'fmt ');view.setUint32(16,16,true);
  view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,16000,true);view.setUint32(28,32000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);ascii(36,'data');view.setUint32(40,resampled.length*2,true);
  for(let i=0;i<resampled.length;i++){const x=Math.max(-1,Math.min(1,resampled[i]));view.setInt16(44+i*2,Math.round(x*(x<0?32768:32767)),true);}
  return data;
}
function abortError(){return new DOMException('Анализ отменён.','AbortError');}
function delay(ms,signal){return new Promise((resolve,reject)=>{if(signal?.aborted){reject(abortError());return;}const timer=setTimeout(done,ms);function done(){signal?.removeEventListener('abort',cancel);resolve();}function cancel(){clearTimeout(timer);signal?.removeEventListener('abort',cancel);reject(abortError());}signal?.addEventListener('abort',cancel,{once:true});});}
export async function analyseSpeech(wav,{speakers=-1,story=false,signal,onProgress=()=>{}}={}){
  let job=null,token;
  async function json(response){const data=await response.json();if(!response.ok)throw new Error(data.error||'Не удалось выполнить анализ.');return data;}
  try{
    const status=await json(await fetch('/api/speech/status',{signal}));token=status.token;
    if(!status.available)throw new Error('Локальные модели ещё не установлены.');
    if(story&&!status.storyConfigured)throw new Error('Подключение режиссёра рассказов ещё не настроено.');
    const created=await json(await fetch(`/api/speech/jobs?speakers=${speakers}&story=${story?1:0}`,{method:'POST',headers:{'Content-Type':'audio/wav','X-Character-Speech-Token':token},body:wav,signal}));job=created.id;
    while(true){
      const state=await json(await fetch(`/api/speech/jobs/${job}`,{signal}));onProgress(state);
      if(state.state==='complete')return state.result;
      if(state.state==='failed')throw new Error(state.error||'Не удалось проанализировать речь.');
      if(state.state==='cancelled')throw abortError();
      await delay(350,signal);
    }
  }finally{
    if(job&&signal?.aborted)fetch(`/api/speech/jobs/${job}`,{method:'DELETE',headers:{'X-Character-Speech-Token':token}}).catch(()=>{});
  }
}
