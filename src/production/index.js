import { appendFile, mkdir, readFile, readdir, rename, writeFile, open, rm } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { CONFIG, PRICING } from '../config.js';
import { createClient } from '../director/agent.js';
import { CostTracker } from '../director/cost.js';
import {directorPreparation,preparationForModel} from '../craft/brief.js';
import { importSite } from '../import/index.js';
import { newRunId } from '../pipeline.js';
import { inspectProduction } from './inspect.js';
import { anthropicStages, STAGES, StageError } from './stages.js';
import { abortable } from './control.js';
import { ContractError } from './validate.js';
import { WORLD_STAGE } from './world-stage.js';
import { PATCH_STAGE,COMPACT_PATCH_STAGE,applyDirectedPatch } from './motion-patch.js';
import {registerBrandAsset} from './brand-assets.js';
import {enrichServiceAssets} from './service-assets.js';

const FORMATS = { portrait: CONFIG.video, landscape: { width: 1920, height: 1080, fps: 30 }, square: { width: 1080, height: 1080, fps: 30 } };
const ARTIFACTS = { product: 'product-blueprint', narrative: 'narrative-blueprint', interface: 'interface-scene-kit', motion: 'motion-timeline' };
const hash = (data) => crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
const read = async (dir, name) => JSON.parse(await readFile(path.join(dir, name + '.json'), 'utf8'));
async function persist(dir, name, data) {
  const file = path.join(dir, name + '.json');
  await writeFile(file + '.tmp', JSON.stringify(data, null, 2));
  await rename(file + '.tmp', file);
}

export async function research({ description, url, dir, signal, importer = importSite }) {
  const source = { kind: description && url ? 'combined' : description ? 'description' : 'url', evidence: [],
    brand: { colors: [], fonts: [] }, pages: [], assets: [], interfaceEvidenceIds: [], warnings: [] };
  if (description) source.evidence.push({ id: 'D1', source: 'user-description', text: description });
  if (url) {
    try {
      const imported = await importer(url, { staticOnly: true, lang: 'en', maxPages: 4, signal, workDir: path.join(dir, 'import') });
      source.evidence.push(...imported.facts.slice(0, 39).map(({ id, text, url: origin }) => ({ id: `W${id}`, text, source: origin })));
      Object.assign(source, { nameHint: imported.brand, url: imported.finalUrl, brand: imported.identity, pages: imported.pages,
        warnings: imported.warnings || [] });
      if(imported.logo?.path)try{
        source.assets.push(await registerBrandAsset({file:imported.logo.path,source:imported.logo.url,name:imported.brand}));
      }catch{source.warnings.push('Логотип не удалось подготовить; текстовый бренд остаётся доступен.');}
      for (const image of imported.images ?? []) try {
        const asset=await registerBrandAsset({file:image.path,source:image.url,name:image.caption || imported.brand,kind:'illustration'});
        source.assets.push({...asset,name:image.caption || imported.brand,caption:image.caption,role:image.role,
          width:image.width,height:image.height,evidenceId:source.evidence.find(item=>item.source===imported.finalUrl)?.id});
      } catch { source.warnings.push('Изображение сайта не удалось подготовить.'); }
    } catch (error) {
      signal?.throwIfAborted();
      if (!description) throw new StageError('source_unavailable', `Сайт недоступен: ${error.message}. Добавьте описание продукта.`);
      source.warnings.push(`Сайт не прочитан: ${error.message}. Используется только описание пользователя.`);
    }
  }
  if (!source.evidence.length || source.evidence.every((entry) => entry.text.trim().length < 24)) {
    throw new StageError('no_evidence', 'Недостаточно данных. Опишите продукт, пользователя и одно действие с результатом.');
  }
  await enrichServiceAssets(source);
  return source;
}

// Conservative byte-based input reservation, then restrict generated tokens to the remaining budget.
export function outputAllowance(request, tracker, model = CONFIG.model) {
  const price = PRICING[model];
  if (!price) throw new StageError('unknown_price', 'Нет проверенного тарифа модели; задайте поддерживаемую модель.');
  const inputBytes = Buffer.byteLength(JSON.stringify(request)) + 4096 + (request.imageTokenBudget ?? (request.imagePaths?.length||0)*6000);
  const remaining = tracker.budgetUSD - tracker.usd - inputBytes * price.input / 1e6;
  const tokens = Math.min(request.outputCeiling||16000, CONFIG.maxOutputTokens, Math.floor(remaining * 1e6 / price.output));
  if (tokens < 512) throw new StageError('model_budget', 'Бюджета недостаточно для следующего этапа. Сохранённые этапы доступны для возобновления.');
  return tokens;
}

async function runStage(stage, ctx, request, tracker, log, { signal, feedback: initial = [], persistCost, metered }) {
  const input = { ...stage.input(ctx), ...(['narrative','motion'].includes(stage.name)?{creativePreparation:preparationForModel(directorPreparation({brief:ctx.brief,settings:ctx.settings,source:ctx.source,description:ctx.product?.name}))}:{}), ...(initial.length&&ctx[stage.name]?{existing:ctx[stage.name]}:{}), ...(ctx.sceneId ? { sceneId: ctx.sceneId, existing: ctx[stage.name] } : {}) };
  let feedback = initial;
  for (let attempt = 1; attempt <= 2; attempt++) {
    signal.throwIfAborted();
    if (tracker.overBudget()) throw new StageError('model_budget', 'Исчерпан бюджет вызовов модели');
    const start = Date.now();
    try {
      const args = { name: stage.name, schema: stage.schema, prompt: stage.prompt, input, feedback, outputCeiling:stage.maxTokens||16000, ...(stage.effort?{modelEffort:stage.effort}:{}), ...(stage.images?{imagePaths:stage.images(ctx),imageTokenBudget:stage.imageTokenBudget?.(ctx)}:{}) };
      const maxOutputTokens = Math.min(stage.maxTokens||16000,metered ? outputAllowance(args, tracker) : 16000);
      const response = await abortable(request({ ...args, signal, maxOutputTokens }), signal);
      if(ctx.saveResponse)await ctx.saveResponse(stage.name,attempt,response);
      if (response.usage) { tracker.record(response.model || CONFIG.model, response.usage, { stage: stage.name, attempt }); await persistCost(); }
      signal.throwIfAborted();
      if (tracker.overBudget()) throw new StageError('model_budget', 'Достигнут бюджет генерации');
      if (!response.output) throw new StageError('model_output', `Нет структурированного результата (${response.stopReason || 'empty'})`, true);
      let output = response.output;
      // Scene regeneration cannot silently change timing, copy or other scenes.
      if (ctx.sceneId && stage.name === 'motion' && ctx.motion) {
        const replacement = output.scenes?.find(({ id }) => id === ctx.sceneId);
        output = { ...ctx.motion, scenes: ctx.motion.scenes.map((s) => s.id === ctx.sceneId ? replacement : s) };
      }
      stage.validate(output, ctx);
      await log({ stage: stage.name, attempt, status: 'validated', ms: Date.now() - start });
      return output;
    } catch (error) {
      signal.throwIfAborted();
      const invalid = error instanceof ContractError;
      feedback = [...initial, ...(invalid ? error.issues.slice(0, 16) : [error.message,...(error.code==='model_output'?['If the response exhausted max_tokens, reduce the number of actors and keyframes. Use existing component actors and shared parents. Keep a compact complete score.']:[])])];
      await log({ stage: stage.name, attempt, status: 'failed', code: invalid ? 'contract_validation' : error.code || 'unexpected', issues: feedback });
      if (attempt === 2 || (!invalid && !error.retryable)) throw error;
    }
  }
}

export async function generateProduction(options) {
  let { description, url, brief = '', seconds = 12, format = 'portrait', linkScenes = false, runsDir = CONFIG.runsDir,
    runId = newRunId('react'), resume = false, fromStage, sceneId, client, requestStage, onEvent = () => {},
    signal: callerSignal, timeoutMs = 20 * 60_000, budgetUSD = CONFIG.maxRunCostUSD ?? 2.5, services = {}, motionMode='ui',
    websitePace = 'dynamic', revalidateMotion=false,polish=false } = options;
  if(polish&&(!resume||fromStage||revalidateMotion))throw new Error('Полировка требует --resume и не совмещается с --from или --revalidate-motion');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(runId)) throw new Error('Недопустимый ID запуска');
  if (fromStage && !STAGES.some((s) => s.name === fromStage)) throw new Error('Неизвестный этап возобновления');
  if (sceneId && !resume) throw new Error('Для изменения сцены укажите --resume');
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || !Number.isFinite(budgetUSD) || budgetUSD <= 0) throw new Error('Некорректный лимит времени или стоимости');
  if(!['ui','cinematic','website'].includes(motionMode))throw new Error('Unknown motion mode');
  const dir = path.join(runsDir, runId);
  if (resume) {
    const saved = await read(dir, 'request');
    ({ description, url, brief, seconds, format, linkScenes } = saved);motionMode=saved.motionMode||'ui';
    websitePace = saved.websitePace ?? 'calm';
  }
  for (const value of [description, url, brief]) if (value !== undefined && typeof value !== 'string') throw new Error('Источник и пожелания должны быть текстом');
  description = description?.trim(); url = url?.trim();
  if (!description && !url) throw new Error('Укажите описание, публичную ссылку или оба источника');
  if (motionMode === 'website' && (!url || fromStage || sceneId || revalidateMotion || polish)) {
    throw new Error('Для анимации страницы нужна публичная ссылка. Повторить рендер можно через --resume или --render-only.');
  }
  if (motionMode === 'website' && !['dynamic', 'calm'].includes(websitePace)) throw new Error('Темп сайта: dynamic или calm.');
  if (description?.length > 3200 || url?.length > 2048 || brief.length > 1600) throw new Error('Слишком длинный источник');
  if (!Object.hasOwn(FORMATS, format) || !Number.isInteger(seconds) || seconds < 3 || seconds > 60) throw new Error('Формат portrait, landscape или square; длительность 3–60 целых секунд');
  if(sceneId&&motionMode==='cinematic')throw new Error('Для связанного пространства используйте --from motion: акторы продолжаются через границы сцен.');
  await mkdir(runsDir, { recursive: true });
  if (!resume) await mkdir(dir);
  const lock = await open(path.join(dir, '.lock'), 'wx').catch(() => { throw new Error('Этот запуск уже обрабатывается'); });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new StageError('run_timeout', 'Превышен лимит времени генерации')), timeoutMs);
  const signal = callerSignal ? AbortSignal.any([callerSignal, controller.signal]) : controller.signal;
  const log = (event) => appendFile(path.join(dir, 'events.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...event }) + '\n');
  const tracker = new CostTracker({ budgetUSD });
  const persistCost = () => persist(dir, 'cost', tracker.summary());
  const settings = { ...FORMATS[format], frames: seconds * FORMATS[format].fps, linkScenes, creative: true, motionFirst: true, motionMode,
    ...(motionMode === 'website' ? { websitePace } : {}) };
  const stages=STAGES.map(s=>s.name==='motion'&&motionMode==='cinematic'?WORLD_STAGE:s);
  const ctx = { settings, brief, sceneId };
  ctx.saveResponse=(stage,attempt,response)=>persist(dir,`model-response-${stage}-${Date.now()}-${attempt}`,{model:response.model||null,usage:response.usage||null,output:response.output??null,outputHash:hash(response.output??null),stopReason:response.stopReason||null});
  const report = { version: 2, runId, renderer: 'remotion', modelMode: motionMode === 'website' ? 'website' : requestStage ? 'injected' : 'anthropic',
    artifacts: {}, timings: {}, status: 'running', quality: { technical: 'pending', artistic: 'requires_human_review' } };
  let current,previousReport;
  async function phase(name, execute) {
    signal.throwIfAborted(); current = name; onEvent({ type: 'stage', name });
    const start = Date.now(); await log({ stage: name, status: 'started' });
    try { const result = await execute(); signal.throwIfAborted(); await log({ stage: name, status: 'completed' }); return result; }
    finally { report.timings[name] = Date.now() - start; }
  }
  try {
    if (resume) {
      tracker.calls = (await read(dir, 'cost').catch(() => ({ perCall: [] }))).perCall;
      previousReport=await read(dir,'report');
      await persist(dir, `report-before-${Date.now()}`, previousReport);
      if((fromStage==='motion'||polish)&&/^draft-\d+\/video\.mp4$/.test(previousReport.draft||'')){
        const critique=await read(dir,previousReport.draft.replace('video.mp4','visual-review')).catch(()=>null);
        if(critique?.verdict==='revise')ctx.revisionFeedback=critique.issues;
        else if(polish){
          const inspection=await read(dir,previousReport.draft.replace('video.mp4','inspection')).catch(()=>null);
          if(inspection?.issues?.length)ctx.revisionFeedback=inspection.issues;
        }
      }
    } else await persist(dir, 'request', { description, url, brief, seconds, format, linkScenes,motionMode,
      ...(motionMode === 'website' ? { websitePace } : {}) });
    await persist(dir,'report',report);
    if (motionMode === 'website') {
      const { importWebsiteLayers, directWebsite } = await import('./website-motion.js');
      const cached = resume ? await read(dir, 'source').catch(() => null) : null;
      const source = cached || await phase('research', () => importWebsiteLayers(url, dir, settings, brief, signal));
      await persist(dir, 'source', source);
      Object.assign(ctx, await phase('motion', () => directWebsite(source, settings)));
      for (const stage of ['product', 'narrative', 'interface', 'motion']) {
        await persist(dir, ARTIFACTS[stage], ctx[stage]);
        report.artifacts[stage] = ARTIFACTS[stage] + '.json';
      }
      report.artifacts.source = 'source.json';
      const render = services.render || (await import('./render.js')).renderProduction;
      const inspect = services.inspect || inspectProduction;
      const rendered = await phase('render', () => render(ctx, dir, progress => onEvent({ type: 'render', progress }), { signal }));
      report.video = 'video.mp4';
      const inspection = await phase('inspect', () => inspect(rendered, ctx, dir, { signal }));
      await persist(dir, 'inspection', inspection);
      report.inspection = 'inspection.json';
      report.status = inspection.ok ? 'completed' : 'needs_revision';
      report.quality.technical = inspection.ok ? 'passed' : 'failed';
      return { ok: inspection.ok, dir, runId, report, video: rendered.video };
    }
    ctx.source = resume ? await read(dir, 'source').catch(() => null) : null;
    if (!ctx.source) ctx.source = await phase('research', () => research({ description, url, dir, signal, importer: services.importer }));
    await persist(dir, 'source', ctx.source);
    const request = requestStage || anthropicStages(client || createClient(), { model: CONFIG.model, maxTokens: CONFIG.maxOutputTokens });
    const stageOptions = { signal, persistCost, metered: !requestStage };
    let invalidate = !resume;
    for (const stage of stages) {
      const name = ARTIFACTS[stage.name];
      const fingerprint = hash({ input: stage.input(ctx), prompt: stage.prompt, schema: stage.schema });
      if (stage.name === fromStage || (sceneId && stage.name === 'motion')) invalidate = true;
      const saved = resume ? await read(dir, name).catch(() => null) : null;
      const meta = resume ? await read(dir, name + '.meta').catch(() => null) : null;
      if(resume&&revalidateMotion&&stage.name==='motion'){
        const files=(await readdir(dir)).filter(f=>/^model-response-motion-\d+-\d+\.json$/.test(f)).sort().reverse();
        let candidate;
        for(const file of files){const response=JSON.parse(await readFile(path.join(dir,file),'utf8'));if(response.output){candidate={file,response};break;}}
        if(!candidate)throw new StageError('response_missing','Нет полного сохранённого ответа режиссёра');
        stage.validate(candidate.response.output,ctx);ctx.motion=candidate.response.output;invalidate=true;
        await persist(dir,name,ctx.motion);await persist(dir,name+'.meta',{fingerprint,revalidatedResponse:candidate.file});
        await log({stage:stage.name,status:'revalidated-model-response',file:candidate.file,outputHash:hash(ctx.motion)});
      }else if (!invalidate && saved && (polish || meta?.fingerprint === fingerprint || (revalidateMotion && stage.name!=='motion') || (fromStage&&stages.indexOf(stage)<stages.findIndex(s=>s.name===fromStage)))) {
        stage.validate(saved, ctx); ctx[stage.name] = saved; await log({ stage: stage.name, status: 'reused' });
      } else {
        invalidate = true;
        if (sceneId && stage.name === 'motion') {
          if (!saved?.scenes.some(({ id }) => id === sceneId)) throw new StageError('scene_missing', 'Сцена не найдена');
          ctx.motion = saved;
        }
        ctx[stage.name] = await phase(stage.name, () => runStage(stage, ctx, request, tracker, log, stageOptions));
        await persist(dir, name, ctx[stage.name]); await persist(dir, name + '.meta', { fingerprint });
      }
      report.artifacts[stage.name] = name + '.json';
      if (stage.name === 'narrative') {
        const { renderDirections } = await import('./preflight.js');
        await renderDirections(ctx, dir);
      }
    }
    if(polish){
      // A failed patch attempt must not discard the previous completed review.
      // Reuse only evidence rendered from the same saved score.
      if(!ctx.revisionFeedback?.length){
        const drafts=(await readdir(dir)).filter(f=>/^draft-\d+$/.test(f)).sort((a,b)=>Number(b.slice(6))-Number(a.slice(6)));
        for(const draft of drafts){
          const metadata=await read(path.join(dir,draft),'render-metadata').catch(()=>null);
          if(metadata?.motionHash!==hash(ctx.motion))continue;
          const visual=await read(path.join(dir,draft),'visual-review').catch(()=>null);
          const inspection=await read(path.join(dir,draft),'inspection').catch(()=>null);
          const feedback=visual?.verdict==='revise'?visual.issues:inspection?.issues;
          if(feedback?.length){ctx.revisionFeedback=feedback;report.draft=draft+'/video.mp4';break;}
        }
      }
      if(!ctx.motion.world||!ctx.revisionFeedback?.length)throw new StageError('review_missing','Для полировки нужен сохранённый cinematic-план с замечаниями визуальной проверки');
      const base=ctx.motion;
      const repairStage=!requestStage&&tracker.budgetUSD-tracker.usd<.4?COMPACT_PATCH_STAGE:PATCH_STAGE;
      const patch=await phase('repair',()=>runStage(repairStage,ctx,request,tracker,log,stageOptions));
      ctx.motion=applyDirectedPatch(base,patch);
      await persist(dir,`applied-motion-patch-${Date.now()}`,{base,patch,resultHash:hash(ctx.motion)});
      await persist(dir,ARTIFACTS.motion,ctx.motion);
    }
    const render = services.render || (await import('./render.js')).renderProduction;
    const inspect = services.inspect || inspectProduction;
    const stills = services.stills || (await import('./render.js')).renderKeyframes;
    const { inspectPlan } = await import('./preflight.js');
    const preflight = inspectPlan(ctx);
    await persist(dir, 'preflight', preflight);
    await phase('keyframes', () => stills(ctx, dir, { signal }));
    report.artifacts.keyframes = 'keyframes/';
    let draftInspection,reviewUnavailable=false;
    // Keep old rendered evidence when resuming, and do not restart the paid repair allowance.
    let repairs=polish?1:resume&&!fromStage?(previousReport?.repairAttempts??(previousReport?.timings?.repair?1:0)):0;
    report.repairAttempts=repairs;
    const oldDrafts=(await readdir(dir)).filter(f=>/^draft-\d+$/.test(f)).map(f=>Number(f.slice(6)));
    const firstDraft=oldDrafts.length?Math.max(...oldDrafts)+1:0;
    for (let revision = firstDraft; ; revision++) {
      const draftDir = path.join(dir, `draft-${revision}`); await mkdir(draftDir, { recursive: true });
      const draft = await phase('draft', () => render(ctx, draftDir, (progress) => onEvent({ type: 'render', progress }), { signal, scale: 0.5 }));
      draftInspection = await phase('draft-inspect', () => inspect(draft, ctx, draftDir, { signal, scale: 0.5 }));
      report.draft = `draft-${revision}/video.mp4`;
      await persist(draftDir,'inspection',draftInspection);await persist(dir,'report',report);
      if(ctx.motion.world&&draftInspection.ok){
        const {prepareVisualReview,VISUAL_STAGE}=await import('./visual-review.js');
        ctx.visualInput=await (services.prepareReview||prepareVisualReview)(ctx,draft.video,draftDir,signal);
        let review;
        try{review=await phase('visual-review',()=>runStage(VISUAL_STAGE,ctx,request,tracker,log,stageOptions));}
        catch(error){
          if(error.code!=='model_budget')throw error;
          reviewUnavailable=true;report.warnings=[{stage:'visual-review',code:'model_budget',message:error.message}];
          report.quality.artistic='requires_human_review';
          await persist(draftDir,'visual-review-unavailable',{reason:'model_budget',message:error.message});
          break; // Technical inspection passed. Export locally without another model call.
        }
        await persist(draftDir,'visual-review',review);draftInspection.visualReview=review;
        if(review.verdict==='revise'){
          draftInspection.technicalOk=true;draftInspection.ok=false;
          draftInspection.issues.push(...review.issues.map(i=>({...i,code:'visual_review',timecode:(i.frame/ctx.motion.fps).toFixed(2),impact:'Rendered composition requires revision'})));
        }
        report.quality.artistic=review.verdict==='pass'?'sampled_frames_review_passed':'needs_visual_revision';
      }
      await persist(draftDir, 'inspection', draftInspection);
      if (draftInspection.ok || repairs >= 1) break;
      await persist(dir, 'motion-before-repair', ctx.motion);
      report.repairAttempts=++repairs;await persist(dir,'report',report);
      const feedback=draftInspection.issues.map(issue=>JSON.stringify(issue));
      if(ctx.motion.world){
        const base=ctx.motion;ctx.revisionFeedback=draftInspection.issues;
        const repairStage=!requestStage&&tracker.budgetUSD-tracker.usd<.4?COMPACT_PATCH_STAGE:PATCH_STAGE;
        const patch=await phase('repair',()=>runStage(repairStage,ctx,request,tracker,log,{...stageOptions,feedback}));
        ctx.motion=applyDirectedPatch(base,patch);
        await persist(dir,`applied-motion-patch-${Date.now()}`,{base,patch,resultHash:hash(ctx.motion)});
      }else ctx.motion=await phase('repair',()=>runStage(stages[3],ctx,request,tracker,log,{...stageOptions,feedback}));
      await persist(dir, ARTIFACTS.motion, ctx.motion);
    }
    if (!draftInspection.ok && !draftInspection.technicalOk) {
      report.status = 'needs_revision'; report.quality.technical = draftInspection.technicalOk?'passed':'failed'; report.inspection = report.draft.replace('video.mp4', 'inspection.json');
    } else {
      const rendered = await phase('render', () => render(ctx, dir, (progress) => onEvent({ type: 'render', progress }), { signal }));
      report.video = 'video.mp4';
      const inspection = await phase('inspect', () => inspect(rendered, ctx, dir, { signal }));
      await persist(dir, 'inspection', inspection); report.inspection = 'inspection.json';
      report.status = inspection.ok && draftInspection.ok ? (reviewUnavailable?'needs_review':'completed') : 'needs_revision';
      if(!draftInspection.ok)report.visualInspection=report.draft.replace('video.mp4','inspection.json');
      report.quality.technical = inspection.ok ? 'passed' : 'failed';
    }
  } catch (error) {
    const aborted = signal.aborted;
    const reason = aborted ? signal.reason : error;
    report.status = aborted && reason?.code !== 'run_timeout' ? 'cancelled' : 'failed';
    report.error = { stage: current, code: aborted ? reason?.code || 'cancelled' : error instanceof ContractError ? 'contract_validation' : error.code || `${current}_failed`,
      message: reason?.message || 'Генерация отменена', ...(error instanceof ContractError ? { issues: error.issues } : {}) };
    await log({ stage: current, status: report.status, code: report.error.code });
  } finally {
    clearTimeout(timer);
    report.cost = tracker.summary();
    await persistCost(); await persist(dir, 'report', report);
    if(ctx.motion){const {writeGenerationProof}=await import('./provenance.js');await writeGenerationProof(dir,report).catch(()=>{});}
    await lock.close(); await rm(path.join(dir, '.lock'), { force: true });
  }
  return { ok: report.status === 'completed', dir, runId, report, video: report.video && path.join(dir, report.video) };
}
