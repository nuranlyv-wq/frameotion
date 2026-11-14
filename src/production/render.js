import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, rename, rm, writeFile,copyFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { bundle } from '@remotion/bundler';
import { makeCancelSignal, renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { CONFIG, ROOT } from '../config.js';
import { mixSoundLibrary } from './sound-library.js';
import {resolveRenderResources} from './asset-library.js';
import {OUTPUT_FPS, renderCadence} from '../render/cadence.js';

const exec = promisify(execFile);

async function addAudio(video, target, timeline, dir, signal) {
  const { cues } = timeline.audio;
  const duration = timeline.frames / timeline.fps;
  const mixed = path.join(dir, 'sound-design.wav');
  const used = await mixSoundLibrary({ output: mixed, cues, fps: timeline.fps, seconds: duration, signal });
  await copyFile(mixed,path.join(path.dirname(target),'sound-design.wav'));
  await writeFile(path.join(path.dirname(target), 'sound-cues.json'), JSON.stringify(used, null, 2));
  await exec('ffmpeg', ['-v', 'error', '-i', video, '-i', mixed, '-map', '0:v:0', '-map', '1:a:0',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', String(duration), '-movflags', '+faststart', target], { timeout: 120_000, signal });
}

export async function renderProduction({ narrative, interface: kit, motion: timeline }, dir, onProgress = () => {}, { signal, scale = 1 } = {}) {
  const buildDir = await mkdtemp(path.join(os.tmpdir(), 'kadr-remotion-'));
  const pending = path.join(dir, '.rendering.mp4');
  const muxed = path.join(dir, '.scored.mp4');
  const output = path.join(dir, 'video.mp4');
  const issues = new Map();
  const textFits = new Map();
  const { cancelSignal, cancel } = makeCancelSignal();
  let timer;
  signal?.throwIfAborted();
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    const serveUrl = await bundle({ entryPoint: path.join(ROOT, 'remotion/index.jsx'), outDir: buildDir, publicDir: path.join(ROOT, 'assets') });
    signal?.throwIfAborted();
    const resources=resolveRenderResources(timeline);
    const cadence = renderCadence(timeline, timeline.world && timeline.fps === 30 ? OUTPUT_FPS : timeline.fps);
    const inputProps = { narrative, kit, timeline, resources, outputFps:cadence.fps };
    await writeFile(path.join(dir,'resource-manifest.json'),JSON.stringify(resources.manifest,null,2));
    const browser = { browserExecutable: CONFIG.chromePath, timeoutInMilliseconds: 30_000, logLevel: 'error' };
    const composition = await selectComposition({ ...browser, serveUrl, id: 'KadrProduction', inputProps });
    timer = setTimeout(cancel, 10 * 60_000);
    await renderMedia({
      ...browser, composition, serveUrl, inputProps, outputLocation: pending, codec: 'h264',
      // Chrome on macOS can stall in the shared-memory capture path.
      disableSharedMemoryCapture: process.platform === 'darwin',
      concurrency: 2, cancelSignal, scale, crf: scale < 1 ? 28 : 18, onProgress: ({ progress }) => onProgress(progress),
      onBrowserLog: ({ text }) => {
        if (!text.startsWith('KADR_QA ')) return;
        const issue = JSON.parse(text.slice('KADR_QA '.length));
        const key = `${issue.code}:${issue.scene}:${issue.target}`;
        if (issue.code === 'text_fitted') {
          const previous = textFits.get(key);
          if (!previous || issue.fittedSize < previous.fittedSize ||
            (issue.fittedSize === previous.fittedSize && issue.frame < previous.frame)) textFits.set(key, issue);
        } else {
          const existing = issues.get(key);
          if (!existing || issue.frame < existing.frame) issues.set(key, issue);
        }
      },
    });
    if (timeline.audio) {
      await addAudio(pending, muxed, timeline, buildDir, signal);
      await rename(muxed, pending);
    }
    signal?.throwIfAborted();
    await rename(pending, output);
    await writeFile(path.join(dir,'render-metadata.json'),JSON.stringify({motionHash:crypto.createHash('sha256').update(JSON.stringify(timeline)).digest('hex'),scale,video:'video.mp4', ...cadence, scoreFps:timeline.fps}));
    return {
      video: output, cadence, issues: [...issues.values()].sort((a, b) => a.frame - b.frame),
      textFits: [...textFits.values()].sort((a, b) => a.frame - b.frame),
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
    await Promise.all([rm(buildDir, { recursive: true, force: true }), rm(pending, { force: true }), rm(muxed, { force: true })]);
  }
}

export async function renderKeyframes(ctx, dir, { signal } = {}) {
  const buildDir = await mkdtemp(path.join(os.tmpdir(), 'kadr-stills-'));
  const { cancelSignal, cancel } = makeCancelSignal();
  signal?.addEventListener('abort', cancel, { once: true });
  const out = path.join(dir, 'keyframes'); await mkdir(out, { recursive: true });
  try {
    const serveUrl = await bundle({ entryPoint: path.join(ROOT, 'remotion/index.jsx'), outDir: buildDir, publicDir: path.join(ROOT, 'assets') });
    const timeline = structuredClone(ctx.motion);
    if(!timeline.world)for (const scene of timeline.scenes) { scene.effects = []; scene.transition = { type: 'cut', frames: 0, target: '' }; }
    const inputProps = { narrative: ctx.narrative, kit: ctx.interface, timeline,resources:resolveRenderResources(timeline) };
    const browser = { browserExecutable: CONFIG.chromePath, timeoutInMilliseconds: 30000, logLevel: 'error' };
    const composition = await selectComposition({ ...browser, serveUrl, id: 'KadrProduction', inputProps });
    for (const scene of timeline.scenes) {
      signal?.throwIfAborted();
      await renderStill({ ...browser, serveUrl, composition, inputProps, cancelSignal, frame: timeline.world?Math.floor((scene.start+scene.end)/2):scene.end - 1, scale: 0.5,
        output: path.join(out, scene.id + '.png'), imageFormat: 'png' });
    }
  } finally { signal?.removeEventListener('abort', cancel); await rm(buildDir, { recursive: true, force: true }); }
}
