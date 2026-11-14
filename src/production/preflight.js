import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from '../config.js';
import { absoluteBounds } from './motion.js';

export function inspectPlan(ctx) {
  const { narrative, interface: kit, motion } = ctx;
  if(motion.world)return {version:2,issues:[],automaticChecks:['persistent actor graph and required states validated by director contract'],artistic:'requires_render_review'};
  const issues = [];
  const issue = (scene, code, problem, impact, fix) => issues.push({ code, scene: scene.id,
    frame: scene.start, timecode: (scene.start / motion.fps).toFixed(2), problem, impact, fix });
  const overlaps = (a, b) => Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x) + 3 && Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y) + 3;
  for (const [i, scene] of motion.scenes.entries()) {
    const story = narrative.scenes[i];
    const reading = (story.headline + ' ' + story.copy).trim().split(/\s+/).length / 3.2;
    if ((scene.end - scene.start - scene.transition.frames) / motion.fps < reading) issue(scene, 'reading_time', 'Недостаточно времени для титра', 'Текст может остаться непрочитанным', 'Сократите титр или увеличьте время удержания');
    const component = kit.components.find(({ id }) => id === scene.componentId);
    if (component) {
      const texts = component.elements.filter((e) => ['text', 'badge', 'number'].includes(e.kind));
      for (const e of texts) {
        const area = absoluteBounds(scene.bounds, e.bounds);
        if (overlaps(area, scene.headline)) issue(scene, 'title_ui_overlap', `Заголовок пересекает ${e.id}`, 'Интерфейс и титр конкурируют', 'Разведите заголовок и объект по сетке');
      }
    }
  }
  return { version: 1, issues, automaticChecks: ['reading-time estimate', 'title/UI geometry'], artistic: 'requires_human_review' };
}

export async function renderDirections({ narrative }, dir) {
  if (!narrative.creative) return;
  const target = path.join(dir, 'directions'); await mkdir(target, { recursive: true });
  GlobalFonts.registerFromPath(path.join(ROOT, 'assets/fonts/Inter/Inter_700Bold.ttf'), 'DirectionSans');
  GlobalFonts.registerFromPath(path.join(ROOT, 'assets/fonts/SourceSerif4/SourceSerif4_700Bold.ttf'), 'DirectionSerif');
  GlobalFonts.registerFromPath(path.join(ROOT, 'assets/fonts/IBMPlexMono/IBMPlexMono_500Medium.ttf'), 'DirectionMono');
  for (const d of narrative.creative.directions) {
    const c = createCanvas(960, 540), x = c.getContext('2d'), p = d.artDirection.palette;
    x.fillStyle = p.background; x.fillRect(0, 0, 960, 540);
    const split = d.keyframe.composition === 'split';
    const box = split ? [510, 95, 380, 350] : [200, 230, 560, 240];
    x.fillStyle = p.surface; x.beginPath(); x.roundRect(...box, d.artDirection.radius); x.fill();
    x.fillStyle = p.accent; x.beginPath(); x.roundRect(box[0] + 28, box[1] + 28, box[2] - 56, 60, 12); x.fill();
    x.fillStyle = p.onAccent; x.font = '20px DirectionSans'; x.fillText(d.keyframe.object.slice(0, 26), box[0] + 42, box[1] + 65);
    x.fillStyle = p.muted;
    for (let i = 0; i < 3; i++) { x.globalAlpha = 0.25; x.fillRect(box[0] + 28, box[1] + 120 + i * 33, (box[2] - 56) * (1 - i * 0.2), 10); }
    x.globalAlpha = 1; x.fillStyle = p.foreground;
    const family = { sans: 'DirectionSans', serif: 'DirectionSerif', mono: 'DirectionMono' }[d.artDirection.typography];
    x.font = `46px ${family}`;
    const words = d.keyframe.headline.split(/\s+/); let line = '', y = split ? 210 : 105;
    for (const word of [...words, null]) {
      if (word === null || x.measureText(line + word).width > (split ? 400 : 800)) { x.fillText(line.trim(), 60, y); y += 54; line = ''; }
      if (word !== null) line += word + ' ';
    }
    x.font = '14px DirectionMono'; x.fillStyle = p.muted; x.fillText('DIRECTION STUDY / CONCEPT', 60, 505);
    await writeFile(path.join(target, d.id + '.png'), await c.encode('png'));
  }
}
