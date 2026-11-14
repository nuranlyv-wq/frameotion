import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {writeFile,rm} from 'node:fs/promises';
export async function renderVoxFilm(score,{baseURL,directory,signal,onProgress=()=>{}}){
  let browser,encoder;const output=path.join(directory,'video.mp4');
  try{
    signal?.throwIfAborted();browser=await chromium.launch({channel:'chrome',headless:true});
    const page=await browser.newPage({viewport:{width:score.width,height:score.height}});
    await page.goto(baseURL+'/src/vox-paper/film.html');await page.waitForFunction(()=>window.__ready,{}, {timeout:30000});
    await page.evaluate(score=>window.voxFilm.load(score),score);
    const frames=Math.ceil(score.duration*score.fps);let stderr='';
    encoder=spawn('ffmpeg',['-y','-hide_banner','-loglevel','error','-f','image2pipe','-vcodec','png','-framerate',String(score.fps),'-i','pipe:0','-an','-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',output],{stdio:['pipe','ignore','pipe']});
    encoder.stdin.on('error',()=>{});encoder.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-1000);});
    const completion=new Promise((resolve,reject)=>{encoder.once('error',reject);encoder.once('close',code=>code===0?resolve():reject(Error('Не удалось собрать видео.')));});completion.catch(()=>{});
    const abort=()=>encoder.kill('SIGTERM');signal?.addEventListener('abort',abort,{once:true});
    try{
      for(let frame=0;frame<frames;frame++){
        signal?.throwIfAborted();const png=Buffer.from(await page.evaluate(t=>window.voxFilm.render(t),frame/score.fps),'base64');
        await new Promise((resolve,reject)=>encoder.stdin.write(png,error=>error?reject(error):resolve()));
        if(frame%12===0)onProgress((frame+1)/frames);
      }
      encoder.stdin.end();await completion;signal?.throwIfAborted();
    }finally{signal?.removeEventListener('abort',abort);}
    const probe=await new Promise((resolve,reject)=>{
      const p=spawn('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height,nb_frames:format=duration','-of','json',output]);let data='';p.stdout.on('data',d=>{data+=d;});p.once('error',reject);p.once('close',code=>{try{if(code)throw Error('Проверка видео не прошла.');resolve(JSON.parse(data));}catch(e){reject(e);}});
    });
    if(probe.streams?.[0]?.width!==score.width||probe.streams?.[0]?.height!==score.height||Math.abs(Number(probe.format?.duration)-score.duration)>.15)throw Error('Проверка видео не прошла.');
    await writeFile(path.join(directory,'inspection.json'),JSON.stringify(probe,null,2));onProgress(1);return {output,inspection:probe};
  }catch(error){encoder?.kill('SIGTERM');await rm(output,{force:true});signal?.throwIfAborted();throw error;
  }finally{await browser?.close();}
}
