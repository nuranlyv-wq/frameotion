import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {rename,rm} from 'node:fs/promises';
const exec=promisify(execFile);
export async function measureSound(file,signal){
  const {stderr}=await exec('ffmpeg',['-hide_banner','-nostats','-i',file,'-vn','-af','loudnorm=I=-16:TP=-2.5:LRA=11:print_format=json','-f','null','-'],{signal});
  const m=JSON.parse(stderr.match(/\{\s*"input_i"[\s\S]*?\}/)?.[0]||'{}');
  if(!Number.isFinite(+m.input_i))throw new Error('Пустая звуковая дорожка');return m;
}
export async function masterSound(input,output,signal){
  const m=await measureSound(input,signal),baseline=output+'.normalized.wav',pending=output+'.pending.wav';
  const norm=`loudnorm=I=-16:TP=-2.5:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
  try{
    await exec('ffmpeg',['-v','error','-y','-i',input,'-af',norm,'-ar','48000','-ac','2',baseline],{signal});
    const measured=await measureSound(baseline,signal);let gain=-16-(+measured.input_i),result;
    // Sparse effects often cannot meet LUFS and peak constraints in loudnorm's
    // linear pass. Measure the actual master, limit at 4x sample rate, then adjust.
    for(let attempt=0;attempt<3;attempt++){
      const filter=`volume=${gain.toFixed(3)}dB,aresample=192000,alimiter=limit=0.749894:level=0:latency=1,aresample=48000`;
      await exec('ffmpeg',['-v','error','-y','-i',baseline,'-af',filter,'-ar','48000','-ac','2',pending],{signal});
      result=await measureSound(pending,signal);
      if(Math.abs(+result.input_i+16)<.65)break;
      gain+=-16-(+result.input_i);
    }
    await rename(pending,output);return {integratedLUFS:+result.input_i,truePeakDB:+result.input_tp};
  }finally{await Promise.all([baseline,pending].map(f=>rm(f,{force:true})));}
}
