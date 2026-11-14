import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {checkPresentationTimestamps} from './cadence.js';

const exec = promisify(execFile);

export async function probeFrameCadence(video, cadence, {signal} = {}) {
  const {stdout} = await exec('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_frames',
    '-show_streams', '-show_entries', 'frame=best_effort_timestamp:stream=time_base', '-of', 'json', video],
  {signal, maxBuffer:8*1024*1024});
  const {frames = [], streams = []} = JSON.parse(stdout);
  const timestamps = frames.map(frame => Number(frame.best_effort_timestamp));
  return checkPresentationTimestamps(timestamps, streams[0]?.time_base, cadence);
}
