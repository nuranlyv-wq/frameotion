import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {copyFile, rename, rm, writeFile} from 'node:fs/promises';
import {mixSoundLibrary} from '../production/sound-library.js';
const exec=promisify(execFile);

export async function muxLaunchAudio({picture, output, dir, cues, fps, seconds, signal}) {
  const raw = path.join(dir, 'effects.wav');
  const master = path.join(dir, 'sound-design.wav');
  const used = await mixSoundLibrary({output: raw, cues, fps, seconds, signal});
  let peakDB = -2.5;
  const verification = [];
  for (let attempt=0;attempt<3;attempt++) {
    if (used.length) await masterSound(raw, master, signal,{peakDB});
    else await copyFile(raw, master);
    await exec('ffmpeg', ['-v', 'error', '-y', '-i', picture, '-i', master,
      '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k',
      '-t', String(seconds), '-movflags', '+faststart', output], {signal});
    if (!used.length) break;
    const encoded = await measureSound(output,signal);
    verification.push({peakCeilingDB:peakDB,integratedLUFS:+encoded.input_i,truePeakDB:+encoded.input_tp});
    if (+encoded.input_tp<=-1.5 && Math.abs(+encoded.input_i+16)<=1.5) break;
    // Lossy coding can overshoot a clean WAV transient. Correct the ceiling
    // against the decoded AAC while copying the video stream on every pass.
    if (+encoded.input_tp<=-1.5) break;
    peakDB -= +encoded.input_tp+1.5+.35;
  }
  await writeFile(path.join(dir,'audio-master-verification.json'),JSON.stringify(verification,null,2));
  await writeFile(path.join(dir, 'sound-cues.json'), JSON.stringify(used, null, 2));
  return used.length;
}
export async function measureSound(file,signal){
  const {stderr}=await exec('ffmpeg',['-hide_banner','-nostats','-i',file,'-vn','-af','loudnorm=I=-16:TP=-2.5:LRA=11:print_format=json','-f','null','-'],{signal});
  const m=JSON.parse(stderr.match(/\{\s*"input_i"[\s\S]*?\}/)?.[0]||'{}');
  if(!Number.isFinite(+m.input_i))throw new Error('Пустая звуковая дорожка');return m;
}
export async function masterSound(input,output,signal,{peakDB=-2.5}={}){
  const m=await measureSound(input,signal),baseline=output+'.normalized.wav',pending=output+'.pending.wav';
  const norm=`loudnorm=I=-16:TP=-2.5:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
  try{
    await exec('ffmpeg',['-v','error','-y','-i',input,'-af',norm,'-ar','48000','-ac','2',baseline],{signal});
    const measured=await measureSound(baseline,signal);let gain=-16-(+measured.input_i),result;
    // Sparse effects often cannot meet LUFS and peak constraints in loudnorm's
    // linear pass. Measure the actual master, limit at 4x sample rate, then adjust.
    for(let attempt=0;attempt<8;attempt++){
      const filter=`volume=${gain.toFixed(3)}dB,aresample=192000,alimiter=limit=${10**(peakDB/20)}:level=0:latency=1,aresample=48000`;
      await exec('ffmpeg',['-v','error','-y','-i',baseline,'-af',filter,'-ar','48000','-ac','2',pending],{signal});
      result=await measureSound(pending,signal);
      if(Math.abs(+result.input_i+16)<.65)break;
      gain+=-16-(+result.input_i);
    }
    await rename(pending,output);return {integratedLUFS:+result.input_i,truePeakDB:+result.input_tp};
  }finally{await Promise.all([baseline,pending].map(f=>rm(f,{force:true})));}
}
