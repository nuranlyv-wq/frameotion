import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {scoreCues,scoreSamples} from './score.js';
const exec=promisify(execFile);
export async function inspectLaunch(rendered,score,dir,{signal,scale=1}={}){
  const {stdout}=await exec('ffprobe',['-v','error','-show_streams','-show_format','-of','json',rendered.video],{signal});
  const probe=JSON.parse(stdout),video=probe.streams.find(s=>s.codec_type==='video'),audio=probe.streams.find(s=>s.codec_type==='audio');
  const issues=[...rendered.issues],seconds=score.frames/score.fps;
  if(!video||video.width!==Math.round(score.width*scale/2)*2||video.height!==Math.round(score.height*scale/2)*2||video.codec_name!=='h264'||video.pix_fmt!=='yuv420p'||video.avg_frame_rate!=='30/1'||+video.nb_frames!==score.frames||Math.abs(+probe.format.duration-seconds)>.05)issues.push({code:'media_mismatch'});
  if(!audio||audio.codec_name!=='aac'||audio.channels!==2||+audio.sample_rate!==48000)issues.push({code:'audio_mismatch'});
  const {stderr}=await exec('ffmpeg',['-hide_banner','-nostats','-i',rendered.video,'-af','loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json','-f','null','-'],{signal});
  const m=JSON.parse(stderr.match(/\{\s*"input_i"[\s\S]*?\}/)?.[0]||'{}');
  const cues = rendered.audioCues ?? scoreCues(score).length;
  const loudness={integratedLUFS:+m.input_i,truePeakDB:+m.input_tp};
  if(cues && (!Number.isFinite(loudness.integratedLUFS)||Math.abs(loudness.integratedLUFS+16)>1.5||loudness.truePeakDB> -1.5))issues.push({code:'audio_level',...loudness});
  if(!cues && m.input_tp !== '-inf')issues.push({code:'unexpected_sound'});
  const samples=scoreSamples(score),cols=2,cellW=640,cellH=Math.round(cellW*score.height/score.width),sheet=createCanvas(cols*cellW,Math.ceil(samples.length/cols)*(cellH+30));
  const ctx=sheet.getContext('2d');ctx.fillStyle='#111827';ctx.fillRect(0,0,sheet.width,sheet.height);
  for(let i=0;i<samples.length;i++){
    const sample=samples[i],img=await loadImage(path.join(dir,'keyframes',sample.id+'.png'));
    const x=i%cols*cellW,y=Math.floor(i/cols)*(cellH+30);ctx.drawImage(img,x,y,cellW,cellH);ctx.fillStyle='#fff';ctx.font='16px sans-serif';ctx.fillText(`${sample.scene} · ${sample.phase} · ${(sample.frame/score.fps).toFixed(1)}s`,x+10,y+cellH+21);
  }
  await writeFile(path.join(dir,'contact-sheet.jpg'),sheet.toBuffer('image/jpeg'));
  const report={ok:issues.length===0,issues,textFits:rendered.textFits,media:{width:video?.width,height:video?.height,frames:video?.nb_frames,duration:probe.format.duration},audio:cues?loudness:{silent:m.input_tp === '-inf'},
    cues,cuesPerSecond:cues/seconds,artistic:'requires_human_review',contactSheet:'contact-sheet.jpg'};
  await writeFile(path.join(dir,'inspection.json'),JSON.stringify(report,null,2));return report;
}
