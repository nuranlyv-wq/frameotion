import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ROOT } from '../config.js';

const exec = promisify(execFile);
const sfxRoot = path.join(ROOT, 'assets/sfx');
const CATEGORY = { tick: 'ui', click: 'click', pop: 'pop', whoosh: 'whoosh', swish: 'whoosh', hit: 'shutter', ding: 'ui', riser: 'riser', gear: 'gear', data: 'data', money: 'money',typing:'ui' };
const PREFERRED = { click: 'cinematic-click', ui: 'ui-digital-click', pop: 'pop-smooth-pop-', whoosh: 'smooth-and-fast', shutter: 'smooth-cammera', riser: 'smooth-riser', gear: 'smooth-and-premium', data: 'cinematic-data-collect-2' };

export function soundLibrary() {
  const file = path.join(ROOT, 'library/sound-library.json');
  if (!fs.existsSync(file)) return { version: 1, sounds: [] };
  const library = JSON.parse(fs.readFileSync(file, 'utf8'));
  return {
    ...library,
    sounds: library.sounds.filter(asset => {
      const { archive, entry, sha256 } = asset.source ?? {};
      if (!archive?.endsWith('.zip') || !entry || !/^[a-f0-9]{64}$/.test(sha256)) return false;
      const file = path.resolve(ROOT, 'assets', asset.file);
      return path.dirname(file) === sfxRoot && fs.lstatSync(file, { throwIfNoEntry: false })?.isFile();
    }),
  };
}

export function chooseSound(cue, library = soundLibrary()) {
  if (cue.assetId) return library.sounds.find((s) => s.id === cue.assetId);
  if(cue.kind==='typing')return library.sounds.find(s=>s.category==='ui'&&/typing/i.test(s.name));
  const category = CATEGORY[cue.kind];
  const candidates = library.sounds.filter((s) => s.category === category && s.duration <= (cue.kind === 'riser' ? 6 : 3));
  return candidates.find((s) => s.id.includes(PREFERRED[category] || '\u0000')) || candidates[0];
}

export function planSoundCues(cues, fps, library = soundLibrary()) {
  return cues.map((cue) => {
    const asset = chooseSound(cue, library);
    if (!asset) return { ...cue, skipped: 'no-zip-sample' };
    const source = path.resolve(ROOT, 'assets', asset.file);
    if (path.dirname(source) !== sfxRoot) throw new Error('Invalid sound path');
    // Motion cues denote the landing, not the beginning of a long whoosh file.
    const sync = cue.sync || (['whoosh', 'swish', 'riser'].includes(cue.kind) ? 'peak' : 'onset');
    const rate=(cue.rate||100)/100,duration=Math.min(cue.durationFrames?cue.durationFrames/fps:asset.duration/rate,asset.duration/rate);
    const anchor = sync === 'start' ? 0 : sync==='end'?duration:sync === 'peak' ? asset.peakAt/rate : asset.onset/rate;
    const start = (cue.frame-(cue.leadFrames||0)) / fps - anchor;
    return { ...cue, assetId: asset.id, source, origin: asset.source, category: asset.category, sync, syncOffset:anchor,
      start: Math.max(0, start), trimStart: Math.max(0, -start),
      duration,playbackRate:rate,
      volume: (cue.gain / 100) * Math.min(8, .7 / Math.max(.01, asset.peak)) };
  });
}

export async function mixSoundLibrary({ output, cues, fps, seconds, signal }) {
  const planned = planSoundCues(cues, fps);
  const chosen = planned.filter(cue => cue.source && cue.start < seconds && cue.trimStart < cue.duration && cue.volume > 0);
  const args = ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo'];
  if (!chosen.length) {
    await exec('ffmpeg', [...args, '-t', String(seconds), '-c:a', 'pcm_s16le', output], { signal, timeout: 120_000 });
    return [];
  }
  for (const cue of chosen) args.push('-i', cue.source);
  const filters = [];
  chosen.forEach((c, i) => {
    const duration = Math.min(c.duration - c.trimStart, seconds - c.start);
    const fade = Math.min(.035, duration / 2);
    filters.push(`[${i + 1}:a]${c.playbackRate!==1?`asetrate=48000*${c.playbackRate},aresample=48000,`:''}atrim=start=${c.trimStart}:duration=${duration},asetpts=PTS-STARTPTS,` +
      `afade=t=in:d=${Math.min(.002, fade)},afade=t=out:st=${duration - fade}:d=${fade},volume=${c.volume},` +
      `adelay=${Math.round(c.start * 1000)}:all=1[s${i}]`);
  });
  filters.push(`[0:a]${chosen.map((_, i) => `[s${i}]`).join('')}amix=inputs=${chosen.length + 1}:normalize=0,` +
    `alimiter=limit=0.89:level=0:latency=1,afade=t=out:st=${Math.max(0, seconds - .32)}:d=0.32[out]`);
  args.push('-filter_complex', filters.join(';'), '-map', '[out]', '-t', String(seconds), '-ar', '48000', '-c:a', 'pcm_s16le', output);
  await exec('ffmpeg', args, { signal, timeout: 120_000 });
  return chosen.map(({ source, ...cue }) => cue);
}
