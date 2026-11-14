// CLI: node src/cli.js --url https://www.google.com/?hl=az --dynamism medium [--style clean] [--mode silent|voice] [--brief "..."] [--scale 1]
import { generateVideo } from './pipeline.js';
import { hasApiKey } from './config.js';
import { fmtUSD } from './director/cost.js';
import { readFile } from 'node:fs/promises';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]] : a), []));
if(args.engine!==undefined&&!['canvas','react','motionsmith','kadr-launch'].includes(args.engine)){
  console.error('Доступные движки: canvas, react, motionsmith, kadr-launch.');process.exit(2);
}
if(args.engine==='motionsmith'||args.engine==='kadr-launch'){
  try{
    const {generateLaunch}=await import(args.engine==='kadr-launch'?'./kadr-launch/index.js':'./motionsmith/index.js');
    if(args.engine==='motionsmith'&&!args.resume&&!hasApiKey())throw new Error('Для режиссёра нужен ключ Anthropic в .env');
    const controller=new AbortController();process.once('SIGINT',()=>controller.abort(new Error('Отменено через Ctrl+C')));
    const result=await generateLaunch({url:args.url,sourceRun:args['source-run'],description:args.description,brief:args.brief,language:args.language||'ru',
      seconds:args.seconds===undefined?25:Number(args.seconds),format:args.format||'landscape',style:args.engine==='kadr-launch'?args.style:undefined,
      pace:args.engine==='kadr-launch'?args.pace:undefined,
      motionRecipe:args.engine==='kadr-launch'?args['motion-recipe']:undefined,
      artDirection:args.engine==='kadr-launch'?args['art-direction']:undefined,
      directionMode:args.engine==='kadr-launch'?args['direction-mode']:undefined,
      objectStory:args.engine==='kadr-launch' && args['object-story'] ? JSON.parse(await readFile(args['object-story'],'utf8')) : undefined,
      visualReview:args.engine==='kadr-launch' && args['no-visual-review'] ? false : undefined,
      exportFormat:args.engine==='kadr-launch' && args['render-only'] ? args.format : undefined,
      resume:Boolean(args.resume),renderOnly:Boolean(args['render-only']),...(args.resume?{runId:args.resume}:{}),
      budgetUSD:args.budget===undefined?undefined:Number(args.budget),outputFps:args.fps===undefined?undefined:Number(args.fps),signal:controller.signal,
      onEvent:e=>{if(e.type==='stage')console.log(`→ ${e.name}`);}});
    console.log(`Отчёт — ${result.dir}/report.json`);if(result.video)console.log(`Видео — ${result.video}`);
    if(!result.ok)console.error(result.report.error?.message||'Нужна правка. См. inspection.json.');
    process.exit(result.ok?0:1);
  }catch(error){console.error(error.message);process.exit(2);}
}
if (args.engine !== 'canvas') {
  if(args['render-only']){
    const {finalizeProduction}=await import('./production/finalize.js');
    const result=await finalizeProduction({runId:args.resume,onEvent:e=>console.log(`→ ${e.name}`)});
    console.log(`Видео — ${result.video}`);process.exit(result.ok?0:1);
  }
  const motionMode = args['motion-mode'] || (args.url ? 'website' : 'cinematic');
  if (motionMode !== 'website' && !args.resume && !hasApiKey()) {
    console.error('Нет ключа Anthropic. Укажите ANTHROPIC_API_KEY в .env.'); process.exit(2);
  }
  try {
    const { generateProduction } = await import('./production/index.js');
    const controller = new AbortController();
    process.once('SIGINT', () => controller.abort(new Error('Отменено через Ctrl+C')));
    const result = await generateProduction({
      signal: controller.signal, resume: Boolean(args.resume), ...(args.resume ? { runId: args.resume } : {}), fromStage: args.from, sceneId: args.scene,
      description: args.description, url: args.url, brief: args.brief,
      motionMode,websitePace:args.pace,budgetUSD:args.budget===undefined?undefined:Number(args.budget),
      revalidateMotion:Boolean(args['revalidate-motion']),
      polish:Boolean(args.polish),
      seconds: args.seconds === undefined ? 12 : Number(args.seconds), format: args.format || 'portrait',
      onEvent: (event) => { if (event.type === 'stage') console.log(`→ ${event.name}`); },
    });
    console.log(`Отчёт — ${result.dir}/report.json`);
    if (result.video) console.log(`Видео — ${result.video}`);
    if(result.report.status==='needs_review')console.log('Полный экспорт готов к просмотру; техническая проверка пройдена.');
    else if (!result.ok) console.error(result.report.error?.message || 'Видео требует правок. См. inspection.json.');
    process.exit(result.ok ? 0 : 1);
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
}
if (args.engine !== undefined && args.engine !== 'canvas') {
  console.error('Доступные движки — canvas и react.');
  process.exit(2);
}
if (!args.url) { console.error('Использование: node src/cli.js --url <ссылка> [--dynamism calm|medium|high] [--style clean|poster|neon] [--mode silent|voice] [--brief "..."]'); process.exit(2); }
if (!hasApiKey()) { console.error('Нет ключа Anthropic. Скопируйте .env.example в .env и заполните ANTHROPIC_API_KEY.'); process.exit(2); }

const r = await generateVideo({ url: args.url, dynamism: args.dynamism || 'medium', length: args.length || 'short', styleId: args.style || 'clean', mode: args.mode || 'silent', brief: args.brief, scale: Number(args.scale || 1), onEvent: (e) => {
  if (e.type === 'stage') console.log(`→ ${e.name}`);
  if (e.type === 'turn') console.log(`  ход ${e.turn}: ${e.tools.join(', ') || '—'}  (накоплено ${fmtUSD(e.usd)})`);
} });
const c = r.report.cost;
console.log(`\n${r.ok ? 'ГОТОВО' : 'НЕ УДАЛОСЬ'}: ${r.ok ? r.video : r.report.error || r.report.stopReason}`);
console.log(`Opus: ${c.calls} вызовов, вход ${c.tokens.input} + кэш-чтение ${c.tokens.cacheRead} + кэш-запись ${c.tokens.cacheWrite}, выход ${c.tokens.output} → ${fmtUSD(c.usd)}`);
if (r.report.voice) console.log('Озвучка:', JSON.stringify(r.report.voice));
if (r.report.library) console.log('Библиотека:', JSON.stringify(r.report.library));
process.exit(r.ok ? 0 : 1);
