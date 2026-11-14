// Видеореференс → карточка стиля: числа (ffmpeg) + контактный лист кадров → Claude Opus (vision).
// Структура карточки следует шаблону STYLE.md проекта lemo-opuscar (MIT; идея формата, текст не копируется).
import { spawn } from 'node:child_process';
import { CONFIG } from '../config.js';
import { CostTracker } from '../director/cost.js';
import { isHex } from '../util.js';
import { analyzeReference } from './reference.js';

function contactSheetJpeg(file, duration, crop, cols = 4, rows = 3, width = 360) {
  const n = cols * rows, pre = crop ? `${crop},` : '';
  return new Promise((res, rej) => {
    const p = spawn('ffmpeg', ['-v', 'error', '-i', file, '-an', '-vf', `${pre}fps=${(n / duration).toFixed(5)},scale=${width}:-2,tile=${cols}x${rows}:padding=4:color=0x222222`, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-q:v', '4', '-']);
    const out = []; let err = ''; p.stdout.on('data', (d) => out.push(d)); p.stderr.on('data', (d) => (err += d));
    p.on('close', (c) => (c === 0 ? res(Buffer.concat(out)) : rej(new Error(err.slice(-200)))));
  });
}

const SYSTEM = `You are a motion-design art director. You receive a contact sheet (12 frames in time order, left-to-right, top-to-bottom) from a reference video that a client considers great, plus measured numbers. Write a STYLE CARD that lets a code-driven engine imitate the grammar (never the content) of the reference.
Our engine can render: bespoke illustrated vector scenes written as code (night city skylines with parallax and lit windows, roads, cars, light rays, perspective neon floors, pixel-art sprites, HUD frames, particles, camera moves), kinetic typography on solid/grid/dot/ring fields, search-box typing, animated maps with pins, feature cards with vector icons, counters, brand reveals, call-to-action scenes, light/dark inversion on cuts, camera punches/shakes, beat-locked music and sound accents. It CANNOT render: photographs or video footage, 3D renders, characters, hand-drawn art. List in cannot_render what the reference relies on that we cannot do.
The frames may be filmed off a laptop or phone screen: describe the CONTENT shown on the screen (its illustration language, interface, type, colour, motion), never the device, the room or the recording. Describe ONLY transferable grammar: how type is set, layout logic, colour logic, graphic language, motion and pacing. Do NOT mention the reference's subject, setting, objects, characters or metaphors (no vehicles, cities, mascots, rooms...). Return ONLY one JSON object, no prose, no code fences, with exactly these keys:
name (<=3 words, Russian), essence (2 sentences, English), material_and_look, colour_logic, type_and_layout, motion_quality, camera_and_transitions, sound (each 1-2 sentences, English), story_shape (one of: claim, workflow, list, story, showcase), cannot_render (array of short strings), palette ({bg,fg,accent,accent2,muted} hex strings tuned for our engine, readable contrast), bg (one of: solid, grid, dots, rings, gradient), typography ({family: "Inter" or "Inter Tight" or "Montserrat" or "Oswald" or "Fira Sans" or "Roboto Slab" or "Comfortaa", weight: 700 or 800 or 900}), music ({mood: warm|bright|tense, key: A|B|C|D|E|F|G}), suggested_dynamism (calm|medium|high).`;

function parseJson(text) {
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('в ответе нет JSON');
  return JSON.parse(text.slice(a, b + 1));
}

export async function describeReferenceStyle(file, { client, crop, tracker, label = '' } = {}) {
  const fp = await analyzeReference(file, { crop });
  const jpeg = await contactSheetJpeg(file, Math.min(fp.analyzedSec, 60), crop);
  const t = tracker || new CostTracker();
  const numbers = `Measured: duration ${fp.durationSec}s, ${fp.cutsPerSec} cuts/s, motion energy ${fp.motionEnergy} (0.01 calm, 0.05 energetic), mean luma ${fp.meanLuma}, dominant colours ${fp.topColors.join(' ')}.`;
  const resp = await client.messages.create({
    model: CONFIG.model, max_tokens: 4000, output_config: { effort: 'low' }, system: SYSTEM,
    messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpeg.toString('base64') } }, { type: 'text', text: numbers }] }],
  });
  const rec = t.record(resp.model || CONFIG.model, resp.usage, { turn: label });
  const text = resp.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const card = parseJson(text);
  // страховка: палитра и перечисления приводятся к допустимым значениям
  const pal = card.palette || {};
  for (const k of ['bg', 'fg', 'accent', 'accent2', 'muted']) if (!isHex(pal[k])) pal[k] = fp.palette[k];
  card.palette = pal;
  if (!['solid', 'grid', 'dots', 'rings', 'gradient'].includes(card.bg)) card.bg = 'grid';
  if (!['calm', 'medium', 'high'].includes(card.suggested_dynamism)) card.suggested_dynamism = fp.suggestedDynamism;
  card.typography = { family: ['Inter', 'Inter Tight', 'Montserrat', 'Oswald', 'Fira Sans', 'Roboto Slab', 'Comfortaa'].includes(card.typography?.family) ? card.typography.family : 'Inter', weight: [700, 800, 900].includes(card.typography?.weight) ? card.typography.weight : 800 };
  card.music = { mood: ['warm', 'bright', 'tense'].includes(card.music?.mood) ? card.music.mood : 'warm', key: 'ABCDEFG'.includes(card.music?.key) ? card.music.key : 'A' };
  return { card, fingerprint: fp, usd: rec.usd, usage: { input: rec.input, output: rec.output } };
}
