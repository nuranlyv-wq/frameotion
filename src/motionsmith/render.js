import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {chromium} from 'playwright';
import {CONFIG} from '../config.js';
import {resolveBrandAsset} from '../production/brand-assets.js';
import {muxLaunchAudio} from '../kadr-launch/audio.js';
import {resolveRuntime,runtimeManifest,STYLE_FILES} from './runtime.js';
import {scoreCues,scoreSamples} from './score.js';
const here=path.dirname(fileURLToPath(import.meta.url));

export async function renderLaunch(score,source,dir,{signal,scale=1,blur=6,onProgress=()=>{}}={}){
  signal?.throwIfAborted();
  const runtime=resolveRuntime();
  const {launchBrowser,pickEncoder}=await import(pathToFileURL(path.join(runtime.engine,'templates/render/gpu.js')));
  await fs.mkdir(dir,{recursive:true});await fs.mkdir(path.join(dir,'keyframes'),{recursive:true});
  const pending=path.join(dir,'.picture.mp4'),output=path.join(dir,'video.mp4'),muxed=path.join(dir,'.muxed.mp4');
  const token=crypto.randomBytes(24).toString('hex'),messages=[];
  const log=message=>{messages.push(message);};
  log(`MotionSmith ${runtime.version}, saas-launch, ${score.frames} frames at ${score.fps} fps, scale ${scale}, shutter samples ${blur}`);
  const routes=new Map(STYLE_FILES.map(f=>['/vendor/'+f,path.join(runtime.style,f)]));
  routes.set('/player.js',path.join(here,'player.js'));routes.set('/font.ttf',runtime.font);
  const brand=source.assets?.find(a=>a.kind==='logo');
  if(brand)routes.set('/logo.png',resolveBrandAsset(brand.id).file);
  const payload={score,scale,blur,hasLogo:routes.has('/logo.png')};
  const server=http.createServer(async(req,res)=>{
    if(req.headers['x-kadr-render']!==token){res.writeHead(403);return res.end();}
    const url=new URL(req.url,'http://localhost');
    const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; script-src 'self'"};
    if(url.pathname==='/'){res.writeHead(200,{...headers,'Content-Type':'text/html'});return res.end('<!doctype html><canvas></canvas><script type="module" src="/player.js"></script>');}
    if(url.pathname==='/score.json'){res.writeHead(200,{...headers,'Content-Type':'application/json'});return res.end(JSON.stringify(payload));}
    const file=routes.get(url.pathname);
    if(!file){res.writeHead(404);return res.end();}
    try{const bytes=await fs.readFile(file);res.writeHead(200,{...headers,'Content-Type':{'.js':'text/javascript','.ttf':'font/ttf','.png':'image/png'}[path.extname(file)]});res.end(bytes);}
    catch{res.writeHead(404);res.end();}
  });
  let browser,encoder,encoderDone,encoderError,abortError;
  const abort=()=>{abortError=signal.reason||new Error('Render cancelled');encoder?.kill('SIGTERM');browser?.close().catch(()=>{});};
  signal?.addEventListener('abort',abort,{once:true});
  try{
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    const launched=await launchBrowser(options=>chromium.launch({...options,headless:true,executablePath:CONFIG.chromePath,channel:undefined}),log);
    browser=launched.browser;signal?.throwIfAborted();
    log(`Renderer: ${launched.renderer}`);
    const origin=`http://127.0.0.1:${server.address().port}`;
    const page=await browser.newPage({extraHTTPHeaders:{'x-kadr-render':token}}),errors=[];
    await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin);await page.waitForFunction(()=>window.__ready===true,null,{timeout:30000});
    const enc=pickEncoder('ffmpeg'),w=Math.round(score.width*scale/2)*2,h=Math.round(score.height*scale/2)*2;
    log(`Encoder: ${enc.name}, ${w}x${h}`);
    encoder=spawn('ffmpeg',['-v','error','-y','-f','image2pipe','-framerate',String(score.fps),'-i','pipe:0',
      '-vf','scale=out_color_matrix=bt709:out_range=tv,format=yuv420p','-c:v',enc.name,...enc.args,
      '-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-color_range','tv',
      '-frames:v',String(score.frames),'-movflags','+faststart',pending],{stdio:['pipe','ignore','pipe']});
    let stderr='';encoder.stderr.on('data',d=>{stderr=(stderr+d).slice(-16000);});
    encoderDone=new Promise((resolve,reject)=>{encoder.once('error',reject);encoder.once('close',code=>code===0?resolve():reject(new Error(`FFmpeg ${code}: ${stderr}`)));});
    encoderDone.catch(error=>{encoderError=error;});encoder.stdin.on('error',()=>{});
    const samples=scoreSamples(score);
    for(let frame=0;frame<score.frames;frame++){
      signal?.throwIfAborted();if(encoderError)throw encoderError;if(errors.length)throw new Error(errors.join('; '));
      await page.evaluate(f=>window.renderFrame(f),frame);
      const data=await page.evaluate(()=>window.grab());const bytes=Buffer.from(data.split(',')[1],'base64');
      for(const sample of samples.filter(s=>s.frame===frame))await fs.writeFile(path.join(dir,'keyframes',sample.id+'.png'),bytes);
      if(!encoder.stdin.write(bytes))await Promise.race([once(encoder.stdin,'drain'),encoderDone.then(()=>{throw new Error('Encoder ended before all frames');})]);
      if(frame%15===0)onProgress(frame/score.frames);
    }
    encoder.stdin.end();await encoderDone;
    const review=await page.evaluate(()=>window.review());await browser.close();browser=null;
    const audioCues = await muxLaunchAudio({picture:pending, output:muxed, dir, cues:scoreCues(score),
      fps:score.fps, seconds:score.frames/score.fps, signal});
    await fs.rename(muxed,output);
    log(`Completed: ${output}`);
    const metadata={...runtimeManifest(runtime),renderer:launched.renderer,encoder:enc.name,width:w,height:h,fps:score.fps,frames:score.frames,shutterSamples:blur,scoreHash:crypto.createHash('sha256').update(JSON.stringify(score)).digest('hex')};
    await fs.writeFile(path.join(dir,'render-metadata.json'),JSON.stringify(metadata,null,2));
    onProgress(1);return {video:output,...review,metadata,audioCues};
  }catch(error){throw abortError||error;}
  finally{
    signal?.removeEventListener('abort',abort);
    if(encoder&&encoder.exitCode===null)encoder.kill('SIGTERM');
    if(encoderDone)await encoderDone.catch(()=>{});
    if(browser)await browser.close();
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
    await Promise.all([pending,muxed].map(f=>fs.rm(f,{force:true})));
    await fs.writeFile(path.join(dir,'render.log'),messages.join('\n'));
  }
}
