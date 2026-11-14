import fs from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {motionStyleRoot} from './asset-library.js';
const exec=promisify(execFile);

export async function motionSmithReview(video,dir,{fps=30,signal}={}){
 const helper=path.join(motionStyleRoot(),'vox/v1/lib/review.mjs');
 const result={provider:'MotionSmith',mode:'advisory',status:'unavailable',notes:[]};
 if(fs.existsSync(helper)&&fps===30){
  try{
   const {stdout}=await exec(process.execPath,[helper,'stats',video,'1'],{timeout:120000,signal,maxBuffer:1024*1024});
   result.motion=JSON.parse(stdout);
   if(!Number.isInteger(result.motion.frames)||result.motion.frames<1)throw new Error('No decoded frames');
   result.status='measured';
   result.notes.push('Vendor helper samples a 180×320 luminance grid at 30 fps. Motion/cut thresholds are heuristics, not an artistic pass.');
  }catch(error){signal?.throwIfAborted();result.notes.push(`Motion helper failed: ${error.code||error.name}`);}
 }else if(fps!==30)result.notes.push('This installed MotionSmith helper assumes 30 fps; skipped for this frame rate.');
 try{
  const {stderr}=await exec('ffmpeg',['-hide_banner','-nostats','-i',video,'-vn','-af','loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json','-f','null','-'],{timeout:120000,signal,maxBuffer:2*1024*1024});
  const data=JSON.parse(stderr.match(/\{\s*"input_i"[\s\S]*?\}/)?.[0]||'{}');
  result.audio={integratedLUFS:Number.isFinite(+data.input_i)?+data.input_i:null,truePeakDB:Number.isFinite(+data.input_tp)?+data.input_tp:null,measuredOnly:true};
 }catch(error){signal?.throwIfAborted();result.notes.push(`Audio measurement failed: ${error.code||error.name}`);}
 await fs.promises.writeFile(path.join(dir,'motionsmith-review.json'),JSON.stringify(result,null,2));
 return result;
}
