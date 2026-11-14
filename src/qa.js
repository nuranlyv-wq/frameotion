// Измерение ГОТОВОГО файла (а не веры в план): разрешение, fps, длительность, громкость.
import { spawn } from 'node:child_process';

const run = (cmd, args) => new Promise((res, rej) => { const p = spawn(cmd, args); let o = '', e = ''; p.stdout.on('data', (d) => (o += d)); p.stderr.on('data', (d) => (e += d)); p.on('close', (c) => (c === 0 ? res({ o, e }) : rej(new Error(e.slice(-200))))); });

export async function probeVideo(file) {
  const j = JSON.parse((await run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_entries', 'format=duration,size:stream=codec_type,codec_name,width,height,r_frame_rate,sample_rate', file])).o);
  const v = j.streams.find((s) => s.codec_type === 'video'), a = j.streams.find((s) => s.codec_type === 'audio');
  const [n, d] = (v?.r_frame_rate || '0/1').split('/').map(Number);
  const out = { width: v?.width, height: v?.height, fps: d ? n / d : 0, durationSec: Number(Number(j.format.duration).toFixed(2)), sizeMB: Number((j.format.size / 1e6).toFixed(2)), videoCodec: v?.codec_name, audioCodec: a?.codec_name || null };
  if (a) {
    const { e } = await run('ffmpeg', ['-hide_banner', '-i', file, '-af', 'volumedetect', '-vn', '-f', 'null', '-']);
    out.meanVolumeDb = Number((e.match(/mean_volume: (-?[\d.]+) dB/) || [])[1]); out.maxVolumeDb = Number((e.match(/max_volume: (-?[\d.]+) dB/) || [])[1]);
  }
  out.ok = out.width === 1080 && out.height === 1920 && Math.abs(out.fps - 30) < 0.1 && out.durationSec > 5;
  return out;
}
