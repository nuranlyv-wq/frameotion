import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { probeVideo } from '../qa.js';
import { worldMetrics } from './world.js';
import {motionSmithReview} from './motionsmith-review.js';
import {renderCadence} from '../render/cadence.js';
import {probeFrameCadence} from '../render/frame-probe.js';

const exec = promisify(execFile);

function pixels(image, area = { x: 0, y: 0, w: 1000, h: 1000 }) {
  const canvas = createCanvas(48, 48);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, image.width * area.x / 1000, image.height * area.y / 1000,
    image.width * area.w / 1000, image.height * area.h / 1000, 0, 0, 48, 48);
  return ctx.getImageData(0, 0, 48, 48).data;
}

function difference(a, b, threshold) {
  let changed = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])) > threshold) changed++;
  }
  return changed / (a.length / 4);
}

export async function inspectProduction({ video, issues: renderIssues, textFits = [], cadence = null }, { narrative, motion }, dir, { signal, scale = 1 } = {}) {
  cadence ??= renderCadence(motion, motion.fps);
  if(motion.world){
    const legacy={...motion};delete legacy.world;
    legacy.scenes=motion.scenes.map(s=>({...s,bounds:{x:0,y:0,w:1000,h:1000},effects:[],states:[],transition:{type:'cut',frames:0,target:''}}));
    const result=await inspectProduction({video,issues:renderIssues,textFits,cadence},{narrative:{...narrative,scenes:narrative.scenes.map(s=>({...s,requiredStates:[]}))},motion:legacy},dir,{signal,scale});
    const motionSmith=await motionSmithReview(video,dir,{fps:cadence.fps,signal});
    return {...result,world:worldMetrics(motion),reviewMode:'persistent-actors',motionSmith};
  }
  const issues = [...renderIssues];
  const media = await probeVideo(video);
  const expected = { width: Math.round(motion.width * scale), height: Math.round(motion.height * scale), fps: cadence.fps, frames: cadence.frames };
  media.ok = media.width === expected.width && media.height === expected.height && media.fps === expected.fps &&
    Math.abs(media.durationSec - expected.frames / expected.fps) < 0.02 && media.videoCodec === 'h264';
  if (!media.ok) issues.push({ code: 'media_mismatch', expected });
  media.frameCadence = await probeFrameCadence(video, cadence, {signal});
  if (!media.frameCadence.ok) issues.push({code:'uneven_frame_cadence', ...media.frameCadence});
  if (motion.audio && media.audioCodec !== 'aac') issues.push({ code: 'missing_score' });
  const scenes = motion.scenes.map((scene) => ({
    id: scene.id, sample: Math.floor((scene.start + scene.end - 1) / 2),
    handoff: scene.transition.type !== 'cut' ? scene.start + Math.floor(scene.transition.frames / 2) : null,
    states: scene.states.map((cue, i) => {
      const limit = scene.states[i + 1]?.at ?? (scene.end - scene.start);
      const animationEnd = Math.max(cue.at, ...scene.effects.filter((effect) => effect.from >= cue.at && effect.from < limit)
        .map((effect) => effect.from + effect.frames - 1));
      return { id: cue.id, frame: scene.start + Math.min(limit - 1, Math.max(animationEnd, Math.floor((cue.at + limit - 1) / 2))) };
    }),
  }));
  const matches = motion.scenes.filter(({ transition }) => ['match', 'morph', 'zoom-through'].includes(transition.type))
    .map(({ id, start, transition }) => ({ scene: id, target: transition.target, start, frames: transition.frames }));
  const frames = [...new Set([0, motion.frames - 1, ...motion.scenes.flatMap((scene) => [scene.start, scene.end - 1, Math.min(scene.end - 1, scene.start + scene.transition.frames)]), ...matches.flatMap(({ start }) => [start - 1, start]), ...scenes.flatMap((scene) =>
    [scene.sample, scene.handoff, ...scene.states.map(({ frame }) => frame)].filter((frame) => frame !== null))])].sort((a, b) => a - b);
  const samplesDir = await mkdtemp(path.join(dir, '.inspect-'));
  try {
    await exec('ffmpeg', ['-v', 'error', '-i', video, '-vf', 'select=' + frames.map((frame) => `eq(n\\,${frame * cadence.samplesPerFrame})`).join('+'),
      '-fps_mode', 'passthrough', path.join(samplesDir, 'frame-%03d.png')], { timeout: 120_000, signal });
    const images = new Map();
    const cellW = 180;
    const cellH = Math.round(cellW * motion.height / motion.width);
    const cols = Math.min(5, frames.length);
    const sheet = createCanvas(cols * cellW, Math.ceil(frames.length / cols) * (cellH + 24));
    const ctx = sheet.getContext('2d');
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, sheet.width, sheet.height);
    ctx.font = '12px sans-serif';
    for (const [i, frame] of frames.entries()) {
      const image = await loadImage(path.join(samplesDir, `frame-${String(i + 1).padStart(3, '0')}.png`));
      images.set(frame, image);
      const x = i % cols * cellW;
      const y = Math.floor(i / cols) * (cellH + 24);
      ctx.drawImage(image, x, y, cellW, cellH);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`frame ${frame}`, x + 8, y + cellH + 16);
      const sample = pixels(image);
      const reference = Uint8ClampedArray.from(sample, (_value, j) => sample[j % 4]);
      if (difference(sample, reference, 12) < 0.002) {
        const scene = motion.scenes.find(({ start, end }) => frame >= start && frame < end);
        issues.push({ code: 'blank_sample', scene: scene.id, frame });
      }
    }
    for (const match of matches) {
      const jump = difference(pixels(images.get(match.start - 1)), pixels(images.get(match.start)), 16);
      match.firstFrameDifference = Number(jump.toFixed(4));
      if (jump > 0.02) issues.push({ code: 'broken_match', scene: match.scene, frame: match.start });
    }
    for (const [i, result] of scenes.entries()) {
      const scene = motion.scenes[i];
      const required = narrative.scenes[i].requiredStates;
      for (const [j, stateId] of required.entries()) {
        if (j === 0) continue;
        const before = result.states.find(({ id }) => id === required[j - 1]);
        const after = result.states.find(({ id }) => id === stateId);
        const changed = difference(pixels(images.get(before.frame), scene.bounds), pixels(images.get(after.frame), scene.bounds), 16);
        after.changedFraction = Number(changed.toFixed(4));
        if (changed < 0.002) issues.push({ code: 'state_change_not_visible', scene: scene.id, state: stateId, frame: after.frame });
      }
    }
    await writeFile(path.join(dir, 'sheet.png'), await sheet.encode('png'));
  } finally {
    await rm(samplesDir, { recursive: true, force: true });
  }
  const advice = {
    text_clipping: ['Текст обрезан', 'Подпись нельзя прочитать полностью', 'Увеличьте поле или сократите текст'],
    text_frame_clipping: ['Текст выходит за край кадра', 'Камера обрезает читаемую подпись', 'Измените положение камеры или текста в этом кадре; важные надписи должны помещаться в экран после трансформации'],
    blank_sample: ['Пустой кадр', 'Теряется нить действия', 'Сохраните главный объект видимым'],
    state_change_not_visible: ['Результат действия не виден', 'Зритель не понимает пользу', 'Увеличьте изменившийся объект или контраст'],
    broken_match: ['Скачок на стыке', 'Объект теряет непрерывность', 'Совместите начальную геометрию с последним кадром'],
  };
  const detailed = issues.map((issue) => {
    const [problem, impact, fix] = advice[issue.code] || [issue.code, 'Файл не соответствует плану', 'Исправьте параметры или отсутствующий ресурс'];
    return { ...issue, timecode: ((issue.frame || 0) / motion.fps).toFixed(2), problem, impact, fix };
  });
  return { version: 1, ok: issues.length === 0, media, expected, scenes, matches, textFits, issues: detailed, artistic: 'requires_human_review', sheet: 'sheet.png' };
}
