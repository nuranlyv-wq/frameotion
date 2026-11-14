import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {scoreCues,scoreSamples} from './score.js';
import {renderCadence} from '../render/cadence.js';
import {probeFrameCadence} from '../render/frame-probe.js';
import {audioTimingAudit} from './motion-audit.js';
import {auditSuperDynamic} from './super-dynamic.js';
import {pacingAudit} from './pacing.js';
const exec=promisify(execFile);
export async function inspectLaunch(rendered,score,dir,{signal,scale=1,treatment}={}){
  const {stdout}=await exec('ffprobe',['-v','error','-show_streams','-show_format','-of','json',rendered.video],{signal});
  const probe=JSON.parse(stdout),video=probe.streams.find(s=>s.codec_type==='video'),audio=probe.streams.find(s=>s.codec_type==='audio');
  const issues=[...rendered.issues,...(rendered.composition?.issues ?? [])],seconds=score.frames/score.fps;
  const superdynamic = score.staging === 'superdynamic' ? auditSuperDynamic(score) : undefined;
  if (superdynamic && !superdynamic.ok) issues.push({code: 'superdynamic_timing', ...superdynamic});
  const cadence = renderCadence(score, rendered.metadata?.fps ?? score.fps);
  if(!video||video.width!==Math.round(score.width*scale/2)*2||video.height!==Math.round(score.height*scale/2)*2||video.codec_name!=='h264'||video.pix_fmt!=='yuv420p'||video.avg_frame_rate!==`${cadence.fps}/1`||+video.nb_frames!==cadence.frames||Math.abs(+probe.format.duration-seconds)>.05)issues.push({code:'media_mismatch'});
  const presentation = await probeFrameCadence(rendered.video, cadence, {signal});
  if (!presentation.ok) issues.push({code:'uneven_frame_cadence', ...presentation});
  const namePhoto = rendered.namePhotoAudit;
  if (rendered.productFlow?.name && !namePhoto?.samples) issues.push({code:'product_name_photo_unverified'});
  if(!audio||audio.codec_name!=='aac'||audio.channels!==2||+audio.sample_rate!==48000)issues.push({code:'audio_mismatch'});
  const {stderr}=await exec('ffmpeg',['-hide_banner','-nostats','-i',rendered.video,'-af','loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json','-f','null','-'],{signal});
  const m=JSON.parse(stderr.match(/\{\s*"input_i"[\s\S]*?\}/)?.[0]||'{}');
  const cues = rendered.audioCues ?? scoreCues(score).length;
  const soundCues = await readFile(path.join(dir,'sound-cues.json'),'utf8').then(JSON.parse).catch(()=>[]);
  const motion = rendered.motionAudit ?? {issues:[],readings:[],joins:[]};
  motion.soundIssues = audioTimingAudit(soundCues,score.fps);
  // New rapid films retain reading holds, so measured reading, continuity and
  // sound defects are repairable failures rather than inevitable montage notes.
  if (score.staging === 'superdynamic' && score.timing === 'actions' || score.elements.some(element=>element.stage)) issues.push(...motion.issues, ...motion.soundIssues);
  await writeFile(path.join(dir,'motion-inspection.json'),JSON.stringify(motion,null,2));
  const loudness={integratedLUFS:+m.input_i,truePeakDB:+m.input_tp};
  if(cues && (!Number.isFinite(loudness.integratedLUFS)||Math.abs(loudness.integratedLUFS+16)>1.5||loudness.truePeakDB> -1.5))issues.push({code:'audio_level',...loudness});
  if(!cues && m.input_tp !== '-inf')issues.push({code:'unexpected_sound'});
  const samples = scoreSamples(score,{includeTransitions:true});
  await contactSheet(samples,score,dir,'contact-sheet.jpg');
  if (score.staging === 'connected') {
    const endpoints = [score.scenes[0],score.scenes.at(-1)].map(scene =>
      samples.find(sample => sample.id === scene.id + '-result'));
    await contactSheet(endpoints,score,dir,'review-endpoints.jpg',{
      cols:score.height > score.width ? 2 : 1, maxCellWidth:1050,
    });
  }
  const evidenceFrames = rendered.evidenceFrames ?? [];
  if (evidenceFrames.length) {
    await contactSheet(evidenceFrames.map(frame => {
      const matching = rendered.composition.issues.filter(issue => issue.frame === frame);
      return {frame, id:'composition-' + frame, scene:matching[0].scene,
        phase:matching.map(issue => issue.related ? `${issue.target} / ${issue.related}` : `${issue.target} clipped`).join(', ')};
    }),score,dir,'composition-sheet.jpg');
  }
  const report={ok:issues.length===0,issues,textFits:rendered.textFits,fonts:rendered.fontAudit,media:{width:video?.width,height:video?.height,frames:video?.nb_frames,duration:probe.format.duration},audio:cues?loudness:{silent:m.input_tp === '-inf'},
    cues,cuesPerSecond:cues/seconds,artistic:'requires_human_review',contactSheet:'contact-sheet.jpg'};
  if (superdynamic) report.superdynamic = superdynamic;
  report.pacing = pacingAudit(score,treatment);
  report.direction = rendered.directionAudit;
  report.motion = {ok:!motion.issues.length && !motion.soundIssues.length,report:'motion-inspection.json',
    issues:motion.issues,soundIssues:motion.soundIssues,framesChecked:motion.samples ?? 0};
  report.frameCadence = {...cadence, scoreFps:score.fps, presentation,shutterMode:rendered.shutterMode??null,stageProjection:rendered.stageProjection??null};
  if (rendered.composition) report.composition = {
    samples:rendered.composition.samples, issues:rendered.composition.issues.length,
    ...(evidenceFrames.length && {evidenceFrames, contactSheet:'composition-sheet.jpg'}),
  };
  if (rendered.productFlow) report.productFlow = {
    ...rendered.productFlow,
    continuousLayersInFrame: !issues.some(issue => issue.code.startsWith('product_layer_')),
    ...(namePhoto && {namePhotoAudit: {
      ...namePhoto, minGapPx:namePhoto.minGapPx === null ? null : Number(namePhoto.minGapPx.toFixed(2)),
      ok:namePhoto.samples > 0 && namePhoto.minGapPx >= 0,
    }}),
  };
  await writeFile(path.join(dir,'inspection.json'),JSON.stringify(report,null,2));return report;
}

async function contactSheet(samples,score,dir,filename,{
  cols = score.height > score.width || samples.length > 14 ? 4 : 2, maxCellWidth = 640,
} = {}) {
  const rows = Math.ceil(samples.length / cols);
  const cellW = Math.min(maxCellWidth, Math.floor(1760 / cols), Math.floor((2440 / rows - 30) * score.width / score.height));
  const cellH = Math.round(cellW * score.height / score.width);
  const sheet = createCanvas(cols * cellW, rows * (cellH + 30));
  const ctx=sheet.getContext('2d');ctx.fillStyle='#111827';ctx.fillRect(0,0,sheet.width,sheet.height);
  for(let i=0;i<samples.length;i++){
    const sample=samples[i],img=await loadImage(path.join(dir,'keyframes',sample.id+'.png'));
    const x=i%cols*cellW,y=Math.floor(i/cols)*(cellH+30);ctx.drawImage(img,x,y,cellW,cellH);ctx.fillStyle='#fff';ctx.font='16px sans-serif';ctx.fillText(`${(sample.frame/score.fps).toFixed(2)}s · ${sample.phase} · ${sample.scene}`,x+8,y+cellH+21,cellW-16);
  }
  await writeFile(path.join(dir,filename),sheet.toBuffer('image/jpeg'));
}
