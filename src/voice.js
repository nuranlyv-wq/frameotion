// Режим озвучки (ElevenLabs). Если ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID не заданы — режим
// корректно деградирует в «музыка + звуковые акценты» и сообщает об этом в отчёте.
// ВНИМАНИЕ: сетевая часть не проверялась (нет ключа ElevenLabs на момент написания).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { CONFIG } from './config.js';

async function tts(text, file) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${CONFIG.elevenLabsVoice}?output_format=mp3_44100_128`, {
    method: 'POST', headers: { 'xi-api-key': CONFIG.elevenLabsKey, 'content-type': 'application/json' },
    body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2' }), signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`ElevenLabs HTTP ${res.status}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return text.length;
}

export async function synthesizeVoice(plan, mp4, dir) {
  const lines = (plan.voiceover?.lines || []).filter((l) => plan.scenes.find((s) => s.id === l.scene));
  if (!CONFIG.elevenLabsKey || !CONFIG.elevenLabsVoice) return { status: 'unavailable', reason: 'ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID не заданы — видео со звуковой дорожкой без голоса' };
  if (!lines.length) return { status: 'skipped', reason: 'режиссёр не передал voiceover_lines' };
  const files = [], chars = [];
  try {
    for (const [i, l] of lines.entries()) { const f = path.join(dir, `voice-${i}.mp3`); chars.push(await tts(l.text, f)); files.push(f); }
    const delays = lines.map((l) => Math.round((plan.scenes.find((s) => s.id === l.scene).start + 0.35) * 1000));
    const filt = files.map((_, i) => `[${i + 1}:a]adelay=${delays[i]}|${delays[i]}[v${i}]`).join(';') + `;${files.map((_, i) => `[v${i}]`).join('')}amix=inputs=${files.length}:normalize=0[voice];[0:a]volume=0.5[m];[m][voice]amix=inputs=2:duration=first:normalize=0[a]`;
    const out = mp4.replace(/\.mp4$/, '.voice.mp4');
    await new Promise((res, rej) => { const p = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-i', mp4, ...files.flatMap((f) => ['-i', f]), '-filter_complex', filt, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', out]); p.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg voice mix')))); });
    fs.renameSync(out, mp4);
    return { status: 'ok', lines: lines.length, characters: chars.reduce((a, b) => a + b, 0) };
  } catch (e) { return { status: 'failed', reason: String(e.message) }; }
  finally { for (const f of files) fs.rmSync(f, { force: true }); }
}
