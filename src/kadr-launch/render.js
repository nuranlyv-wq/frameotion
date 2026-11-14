import fs from 'node:fs';
import {mkdir,writeFile,rm,rename,readFile} from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {chromium} from 'playwright';
import {CONFIG} from '../config.js';
import {resolveBrandAsset} from '../production/brand-assets.js';
import {resolveRuntime,runtimeManifest} from './runtime.js';
import {scoreCues,scoreSamples} from './score.js';
import {productFlowMilestones} from './product-flow.js';
import {muxLaunchAudio} from './audio.js';
import {OUTPUT_FPS, renderCadence} from '../render/cadence.js';
import {isVisualAsset,imageAssetIds} from './media.js';
import {prepareStageTypography} from './stage-fonts.js';
const here=path.dirname(fileURLToPath(import.meta.url));
async function withPlayer(score, source, {signal, scale, blur, cadence}, run) {
  if(!Number.isInteger(blur)||blur<1||blur>16)throw new Error('Shutter samples must be an integer from 1 to 16');
  signal?.throwIfAborted();
  const typography=prepareStageTypography(score,source);score=typography.score;
  const runtime = resolveRuntime();
  const logo = source.assets?.find(asset => asset.kind === 'logo');
  const hasDisplayFont = score.elements.some(element => element.font === 'display');
  const brandFont=score.elements.some(element=>element.stage)&&source.brand?.fonts?.some(font=>/^Onest$/i.test(font))
    ?path.join(path.dirname(path.dirname(runtime.font)),'Onest/Onest.ttf'):null;
  const hasBrandFont=Boolean(brandFont&&fs.existsSync(brandFont));
  const productFlow = source.productFlow ? productFlowMilestones(score, source.productFlow) : null;
  const imageIds = imageAssetIds(score);
  const captured = new Set((source.assets ?? []).filter(isVisualAsset).map(asset => asset.id));
  const files = new Map([
    ['/player', ['player.js', 'text/javascript']],
    ['/kinetic.js', ['kinetic.js', 'text/javascript']],
    ['/word-click.js', ['word-click.js', 'text/javascript']],
    ['/reading.js', ['reading.js', 'text/javascript']],
    ['/stage-contract.js', ['stage-contract.js', 'text/javascript']],
    ['/stage-player.js', ['stage-player.js', 'text/javascript']],
    ['/stage-gpu.js', ['stage-gpu.js', 'text/javascript']],
    ['/shutter.js', ['shutter.js', 'text/javascript']],
    ['/object-reveal.js', ['object-reveal.js', 'text/javascript']],
    ['/spatial.js', ['spatial.js', 'text/javascript']],
    ['/composition.js', ['composition.js', 'text/javascript']],
    ['/fold.js', ['fold.js', 'text/javascript']],
    ['/motion-audit.js', ['motion-audit.js', 'text/javascript']],
    ['/font', [runtime.font, 'font/ttf']],
  ]);
  if (logo) files.set('/logo', [resolveBrandAsset(logo.id).file, 'image/png']);
  if (hasDisplayFont) {
    const displayFont = path.join(path.dirname(path.dirname(runtime.font)), 'Montserrat/Montserrat_800ExtraBold.ttf');
    files.set('/display-font', [displayFont, 'font/ttf']);
  }
  if(hasBrandFont)files.set('/brand-font',[brandFont,'font/ttf']);
  for(const font of typography.fonts)files.set('/stage-fonts/'+font.key,[font.file,'font/ttf']);
  // Keep the browser's module graph complete as native capabilities evolve.
  // Only relative JS dependencies of the explicit player modules are exposed.
  const scanned=new Set();
  for(const [url,[filename,type]]of files){
    if(type!=='text/javascript'||scanned.has(filename))continue;
    scanned.add(filename);
    const body=await readFile(path.join(here,filename),'utf8');
    for(const match of body.matchAll(/(?:from\s*|import\s*)['"](\.\/[\w./-]+\.js)['"]/g)){
      const relative=path.posix.normalize(path.posix.join(path.posix.dirname(filename),match[1]));
      if(relative.startsWith('../'))throw new Error('Player dependency leaves its module directory');
      files.set('/'+relative,[relative,'text/javascript']);
    }
  }
  for (const id of imageIds) {
    if (!captured.has(id)) throw new Error(`Image ${id} is outside the launch source`);
    files.set('/image/' + id, [resolveBrandAsset(id).file, 'image/png']);
  }

  const launch = {headless: true};
  if (CONFIG.chromePath && fs.existsSync(CONFIG.chromePath)) launch.executablePath = CONFIG.chromePath;
  const browser = await chromium.launch(launch);
  const abort = () => browser.close().catch(() => {});
  signal?.addEventListener('abort', abort, {once: true});
  try {
    signal?.throwIfAborted();
    const origin = 'http://kadr-render.invalid';
    const page = await browser.newPage({serviceWorkers: 'block'});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname === '/') {
        return route.fulfill({
          contentType: 'text/html',
          headers: {'content-security-policy': "default-src 'self'; img-src 'self' data:; script-src 'self'; font-src 'self'; connect-src 'self'"},
          body: '<canvas></canvas><script type="module" src="/player"></script>',
        });
      }
      if (url.pathname === '/score') {
        return route.fulfill({json: {score, scale, blur, cadence, hasLogo: !!logo, hasDisplayFont, hasBrandFont, imageIds,stageFonts:typography.fonts.map(({key,family,weight})=>({key,family,weight})),stageFontFamilies:typography.fontFamilies,fontAudit:typography.audit,assetRoles:Object.fromEntries((source.assets??[]).map(asset=>[asset.id,asset.role])), productFlow}});
      }
      const file = files.get(url.pathname);
      if (!file) return route.fulfill({status: 404});
      const [filename, contentType] = file;
      return route.fulfill({path: path.resolve(here, filename), contentType});
    });
    await page.goto(origin);
    try {await page.waitForFunction(() => window.__ready === true, null, {timeout: 30000});}
    catch(error){throw new Error(errors.length?errors.join('; '):error.message);}
    return await run(page, errors, {productFlow, hasDisplayFont});
  } finally {
    signal?.removeEventListener('abort', abort);
    await browser.close();
  }
}

export async function auditLaunch(score, source, {signal, scale = .5, blur = 6, fps = OUTPUT_FPS} = {}) {
  const cadence = renderCadence(score, fps);
  return withPlayer(score, source, {signal, scale, blur, cadence}, async (page, errors, {productFlow}) => {
    for (let start = 0; start < cadence.frames; start += 120) {
      signal?.throwIfAborted();
      if (errors.length) throw new Error(errors[0]);
      const end = Math.min(start + 120, cadence.frames);
      await page.evaluate(([start, end]) => window.auditFrames(start, end), [start, end]);
    }
    const review = await page.evaluate(() => window.review());
    if (productFlow?.name && !review.namePhotoAudit?.samples) {
      review.issues.push({code: 'product_name_photo_unverified'});
    }
    return review;
  });
}

export async function previewLaunchFrames(score, source, frames, {signal, scale = .5, blur = 6, fps = OUTPUT_FPS} = {}) {
  const cadence = renderCadence(score, fps);
  return withPlayer(score, source, {signal, scale, blur, cadence}, async (page, errors) => {
    const images = await page.evaluate(frames => frames.map(frame => {
      window.renderFrame(frame, false);
      return window.grab();
    }), frames);
    if (errors.length) throw new Error(errors.join('; '));
    return images.map(image => Buffer.from(image.split(',')[1], 'base64'));
  });
}

export async function inspectLaunchGeometry(score,source,frames,{signal,scale=.5,blur=1,fps=OUTPUT_FPS}={}){
  const cadence=renderCadence(score,fps);
  return withPlayer(score,source,{signal,scale,blur,cadence},async(page,errors)=>{
    const samples=await page.evaluate(frames=>frames.map(frame=>{window.renderFrame(frame,false);return {frame,stages:window.nativeGeometry(frame),png:window.grab()};}),frames);
    if(errors.length)throw Error(errors.join('; '));return samples.map(({png,...sample})=>({...sample,png:Buffer.from(png.split(',')[1],'base64')}));
  });
}

export async function renderLaunch(score,source,dir,{signal,scale=1,blur=6,fps=OUTPUT_FPS,onProgress=()=>{}}={}){
 const cadence = renderCadence(score, fps);
 const hasDisplayFont = score.elements.some(element => element.font === 'display');
 signal?.throwIfAborted();
 await mkdir(path.join(dir,'keyframes'),{recursive:true});
 const picture=path.join(dir,'.picture.mp4'),mux=path.join(dir,'.mux.mp4'),output=path.join(dir,'video.mp4');
 let encoder,encoding;
 const abort=()=>encoder?.kill('SIGTERM');
 signal?.addEventListener('abort',abort,{once:true});
 try {
  const {review, evidenceFrames, productFlow, hasDisplayFont} = await withPlayer(score, source, {signal, scale, blur, cadence},
    async (page, errors, {productFlow, hasDisplayFont}) => {
  signal?.throwIfAborted();
  encoder=spawn('ffmpeg',['-v','error','-y','-f','image2pipe','-framerate',String(cadence.fps),'-i','pipe:0','-c:v','libx264','-preset','fast','-crf','19','-pix_fmt','yuv420p','-frames:v',String(cadence.frames),'-movflags','+faststart',picture],{stdio:['pipe','ignore','pipe']});let log='';encoder.stderr.on('data',d=>{log=(log+d).slice(-12000);});encoder.stdin.on('error',()=>{});
  encoding=new Promise((resolve,reject)=>{encoder.once('error',reject);encoder.once('close',code=>code===0?resolve():reject(Error('FFmpeg: '+log)));});encoding.catch(()=>{});
  const samples=scoreSamples(score,{includeTransitions:true});
  for (let index = 0; index < cadence.frames; index++) {
    signal?.throwIfAborted();
    if (errors.length) throw Error(errors.join('; '));
    const frame = index / cadence.samplesPerFrame;
    const data = await page.evaluate(frame => {
      window.renderFrame(frame);
      return window.grab();
    }, frame);
    const bytes = Buffer.from(data.split(',')[1], 'base64');
    for (const sample of samples.filter(sample => sample.frame === frame)) {
      await writeFile(path.join(dir, 'keyframes', sample.id + '.png'), bytes);
    }
    if (!encoder.stdin.write(bytes)) {
      await Promise.race([once(encoder.stdin,'drain'), encoding.then(() => { throw Error('Encoder stopped early'); })]);
    }
    if (index % 15 === 0) onProgress(index / cadence.frames);
  }
  encoder.stdin.end();await encoding;
  const review=await page.evaluate(()=>window.review());
  const evidenceFrames=[...new Set(review.composition.issues.slice(0,8).map(issue=>issue.frame))].sort((a,b)=>a-b);
  for(const frame of evidenceFrames){
    signal?.throwIfAborted();
    const data=await page.evaluate(frame=>{window.renderFrame(frame,false);return window.grab();},frame);
    await writeFile(path.join(dir,'keyframes',`composition-${frame}.png`),Buffer.from(data.split(',')[1],'base64'));
  }
  return {review, evidenceFrames, productFlow, hasDisplayFont};
  });
  signal?.throwIfAborted();
  const audioCues = await muxLaunchAudio({picture, output:mux, dir, cues:scoreCues(score),
    fps:score.fps, seconds:score.frames/score.fps, signal});
  await rename(mux,output);
  const metadata={...runtimeManifest(),...(hasDisplayFont&&{displayFont:'Montserrat ExtraBold'}),renderer:'Chromium Canvas',stageProjection:review.stageProjection??null,glassMode:review.glassMode??null,encoder:'libx264',width:Math.round(score.width*scale/2)*2,height:Math.round(score.height*scale/2)*2,fps:cadence.fps,frames:cadence.frames,scoreFps:score.fps,scoreFrames:score.frames,shutterSamples:blur,scoreHash:crypto.createHash('sha256').update(JSON.stringify(score)).digest('hex')};await writeFile(path.join(dir,'render-metadata.json'),JSON.stringify(metadata,null,2));onProgress(1);return {video:output,...review,evidenceFrames,metadata,productFlow,audioCues};
 }finally{signal?.removeEventListener('abort',abort);if(encoder&&encoder.exitCode===null)encoder.kill('SIGTERM');if(encoding)await encoding.catch(()=>{});await Promise.all([picture,mux].map(f=>rm(f,{force:true})));}
}
