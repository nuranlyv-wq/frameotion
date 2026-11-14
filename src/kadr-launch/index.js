import {mkdir,readFile,writeFile,rename,open,rm,appendFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {CONFIG, hasApiKey} from '../config.js';
import {newRunId} from '../pipeline.js';
import {createClient} from '../director/agent.js';
import {CostTracker} from '../director/cost.js';
import {research,outputAllowance} from '../production/index.js';
import {anthropicStages} from '../production/stages.js';
import {directScore,directTreatment,directSemanticTreatment,directConnectedStory,directObjectStory,launchReviewContext,recordLaunchUsage,validateDirectedScore,REVIEW_PROMPT,STAGED_REVIEW_PROMPT,CONNECTED_REVIEW_PROMPT,OBJECT_REVIEW_PROMPT} from './director.js';
import {LAUNCH_STYLES, validateScore} from './score.js';
import {validateTreatment,validateTreatmentScore} from './treatment.js';
import {compileLaunch, normalizeSemanticTreatment, recordedProductTreatment, reviewBeatIds} from './compile.js';
import {directionPlan} from './direction-plan.js';
import {directorPreparation} from '../craft/brief.js';
import {ANGLES, LAYOUTS, creativeProfile, filmSummary, planVariation, readHistory, recordFilm, sourceKey} from './variety.js';
import {improvesFindings, preflightLaunch} from './preflight.js';
import {resolveRuntime} from './runtime.js';
import {importProductFlow} from './product-flow.js';
import {resolveInterfacePalette} from './interface-palette.js';
import {ART_DIRECTIONS} from './art-direction.js';
import {applyMotionRecipe, CONTINUOUS_MORPH, EXPLAINERS_DATA_VIZ, KINETIC_TYPOGRAPHY, MOTION_RECIPES, OBJECT_TRANSFORM, usesConnectedStory} from './motion-recipe.js';
import {compileConnectedStory,compileContinuousMorph,validateConnectedStory} from './connected-story.js';
import {compileObjectStory,validateObjectStory} from './object-story.js';
import {sourceMediaSheet} from './source-sheet.js';
import {SUPERDYNAMIC_REVIEW} from './superdynamic-direction.js';
import {ORDINARY_REVIEW} from './ordinary-direction.js';
import {READING_DIRECTION} from './reading.js';
import {STAGE_REVIEW} from './stage-direction.js';

const FORMATS={landscape:{width:1920,height:1080},portrait:{width:1080,height:1920},square:{width:1080,height:1080}};
const read=async(dir,name)=>JSON.parse(await readFile(path.join(dir,name+'.json'),'utf8'));
async function save(dir,name,data){const f=path.join(dir,name+'.json');await writeFile(f+'.tmp',JSON.stringify(data,null,2));await rename(f+'.tmp',f);}
export function validateLaunchRequest(options){
  const {url='',description='',brief='',format='landscape',seconds=25,language='ru',style='saas-launch',pace='dynamic',
    directionMode='semantic',visualReview=true,motionRecipe,artDirection,objectStory,variation,outputFps,sourceRun}=options;
  if(sourceRun!==undefined&&(typeof sourceRun!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(sourceRun)))throw new Error('Некорректный снимок источника');
  if(outputFps!==undefined && ![30,60].includes(outputFps))throw new Error('Частота экспорта: 30 или 60 fps');
  const manual = directionMode === 'manual';
  if([url,description,brief].some(v=>typeof v!=='string')||url.length>2048||description.length>3200||brief.length>1600)throw new Error('Некорректное описание или ссылка');
  if(!url.trim()&&!description.trim()&&!manual)throw new Error('Укажите сайт или описание продукта');
  if(!Object.hasOwn(FORMATS,format)||!Number.isInteger(seconds)||seconds<12||seconds>60)throw new Error('SaaS Launch: 12–60 секунд; формат landscape, portrait или square');
  if(!['ru','en','az'].includes(language))throw new Error('Язык: ru, en или az');
  if (!LAUNCH_STYLES.includes(style)) throw new Error('Стиль: saas-launch или product-demo');
  if (!['dynamic','calm','superdynamic'].includes(pace)) throw new Error('Ритм: dynamic, calm или superdynamic');
  if (!['semantic','detailed','manual'].includes(directionMode) || typeof visualReview !== 'boolean') throw new Error('Некорректный режим режиссуры');
  if (pace === 'superdynamic' && (style !== 'saas-launch' || directionMode !== 'semantic' || motionRecipe)) {
    throw new Error('Супердинамичный ритм доступен для брендового ролика с автоматической сборкой и обычным движением.');
  }
  if (motionRecipe !== undefined) {
    if (typeof motionRecipe !== 'string' || !Object.hasOwn(MOTION_RECIPES, motionRecipe)) {
      throw new Error('Неизвестный рецепт движения');
    }
    const requiredStyle = MOTION_RECIPES[motionRecipe].style;
    if (requiredStyle && requiredStyle !== style) throw new Error('Рецепт Product UI Promo доступен для постановки Product Demo');
  }
  if (artDirection !== undefined && (typeof artDirection !== 'string' || !Object.hasOwn(ART_DIRECTIONS, artDirection))) {
    throw new Error('Неизвестное направление арт-дирекшна');
  }
  if (variation !== undefined && (!Object.hasOwn(ANGLES, variation?.angle) || !LAYOUTS.includes(variation.layout) ||
      (variation.artDirection !== undefined && !Object.hasOwn(ART_DIRECTIONS, variation.artDirection)))) {
    throw new Error('Некорректная вариация постановки');
  }
  if (manual && motionRecipe !== OBJECT_TRANSFORM) throw new Error('Выберите рецепт «Объект меняет форму» для ручной сборки.');
  if (!manual && objectStory !== undefined) throw new Error('Ручной текст доступен в режиме «Без ИИ».');
  const authored = manual && validateObjectStory({...objectStory,evidenceId:'MANUAL'});
  const sourceDescription = description.trim() || (authored ? manualEvidence(authored) : '');
  return {engine:'kadr-launch',style,pace,directionMode,visualReview:!manual && visualReview,url:url.trim(),description:sourceDescription,brief:brief.trim(),format,seconds,language,
    ...(sourceRun&&{sourceRun}),...(outputFps!==undefined&&{outputFps}),...(motionRecipe && {motionRecipe}),...(artDirection && {artDirection}),...(authored && {objectStory:authored}),...(variation && {variation})};
}
const manualEvidence = story => `Описание автора ролика. ${story.brand}. ${story.hook}. ${story.route}. ${story.benefit}. ${story.qualifier}`;
const ReviewSchema={type:'object',properties:{verdict:{type:'string',enum:['pass','revise']},issues:{type:'array',minItems:0,maxItems:3,items:{type:'string',maxLength:320}}},required:['verdict','issues'],additionalProperties:false};
const DEFAULT_BUDGET_USD = .60;

function validReview(output) {
  return output && ['pass','revise'].includes(output.verdict) &&
    Array.isArray(output.issues) && output.issues.length<=3 &&
    output.issues.every(issue=>typeof issue==='string' && issue.length<=320);
}

async function reviewFingerprint(args,score) {
  const hash=createHash('sha256').update(JSON.stringify({...args,imagePaths:undefined})).update(JSON.stringify(score));
  for (const file of args.imagePaths) {
    const bytes=await readFile(file).catch(error=>{
      if (error.code!=='ENOENT') throw error;
      return null;
    });
    if (!bytes) return null;
    hash.update(bytes);
  }
  return hash.digest('hex');
}

export function launchBudgetUSD(requested=DEFAULT_BUDGET_USD) {
  const cap=CONFIG.maxRunCostUSD ?? Infinity;
  if (!Number.isFinite(requested) || requested<=0 || !(cap>0)) throw new Error('Укажите положительный бюджет запуска в USD.');
  return Math.min(requested,cap);
}

export async function generateLaunch(options={}){
  const {runsDir=CONFIG.runsDir,runId=newRunId('launch'),resume=false,renderOnly=false,onEvent=()=>{},services={},
    requestStage,signal:callerSignal,timeoutMs=20*60_000,budgetUSD,exportFormat}=options;
  let sceneRevision = options.sceneRevision;
  if (sceneRevision && (!resume || typeof sceneRevision.sceneId !== 'string' ||
      typeof sceneRevision.instruction !== 'string' || !sceneRevision.instruction.trim() || sceneRevision.instruction.length > 800)) {
    throw new Error('Укажите сцену и короткое описание правки.');
  }
  if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(runId))throw new Error('Недопустимый ID');
  if(!Number.isFinite(timeoutMs)||timeoutMs<1)throw new Error('Некорректный лимит времени');
  const initialBudget=launchBudgetUSD(budgetUSD);
  if(renderOnly&&!resume)throw new Error('Повторный рендер требует --resume');
  if (exportFormat !== undefined && (!renderOnly || !Object.hasOwn(FORMATS, exportFormat))) throw new Error('Некорректный формат повторного экспорта');
  const dir=path.join(runsDir,runId);
  const saved=resume?await read(dir,'request'):options;
  const revisionReport = sceneRevision ? await read(dir,'report') : null;
  const revisionScore = revisionReport?.artifacts?.score ? await read(dir,revisionReport.artifacts.score.replace(/\.json$/u,'')) : null;
  if (sceneRevision && revisionScore?.staging === 'superdynamic') {
    const shot = revisionScore.scenes.find(scene => scene.id === sceneRevision.sceneId);
    if (shot?.sourceScene) sceneRevision = {...sceneRevision, sceneId: shot.sourceScene};
  }
  const revisionFormat = revisionReport?.exportFormat ?? (revisionScore && Object.keys(FORMATS).find(key=>
    FORMATS[key].width===revisionScore.width && FORMATS[key].height===revisionScore.height));
  if(resume&&saved.engine!=='kadr-launch')throw new Error('Этот запуск использует другой движок');
  // A resumed run keeps its saved request; the caller may still switch the frame review off for this pass.
  const input=validateLaunchRequest(resume ? {pace:'calm',directionMode:'detailed',...saved,
    ...(options.visualReview===false&&{visualReview:false})} : saved);
  // A new scene film draws its variation against what was already made for the same product.
  const varied = input.directionMode==='semantic' && input.style==='saas-launch' && !input.motionRecipe;
  const productKey = sourceKey(input);
  if (!resume && varied && !input.variation) {
    input.variation = planVariation(await readHistory(runsDir,productKey),{artDirection:input.artDirection,random:services.random});
  }
  const artDirection = input.artDirection ?? input.variation?.artDirection;
  (services.runtime||resolveRuntime)();
  await mkdir(runsDir,{recursive:true});if(!resume)await mkdir(dir);
  const lock=await open(path.join(dir,'.lock'),'wx').catch(()=>{throw new Error('Запуск уже выполняется');});
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(new Error('Превышен лимит времени')),timeoutMs);
  const signal=callerSignal?AbortSignal.any([callerSignal,controller.signal]):controller.signal;
  const tracker=new CostTracker({budgetUSD:initialBudget});
  let savedCost;
  const persistCost=async()=>{
    const cost=savedCost ?? tracker.summary();
    if (!savedCost) await save(dir,'cost',cost);
    onEvent({type:'cost',usd:cost.usd,budgetUSD:cost.budgetUSD});
  };
  const format = exportFormat ?? revisionFormat ?? input.format;
  const alternate = format !== input.format;
  const settings={...FORMATS[format],fps:30,frames:input.seconds*30,style:input.style,pace:input.pace,
    ...(input.motionRecipe && {motionRecipe:input.motionRecipe}),
    ...(artDirection && {artDirection}),...(input.variation && {variation:input.variation}),
    ...([KINETIC_TYPOGRAPHY, EXPLAINERS_DATA_VIZ].includes(input.motionRecipe) && {language:input.language})};
  const stageMotion = score => applyMotionRecipe(score, input.motionRecipe);
  const objectTransform = input.motionRecipe === OBJECT_TRANSFORM;
  const connected = usesConnectedStory(input.motionRecipe);
  const planName = objectTransform ? 'object-story' : connected ? 'connected-story' : 'treatment';
  const report={version:1,runId,renderer:'kadr-launch',style:input.style,status:'running',artifacts:{},timings:{},quality:{technical:'pending',artistic:'requires_human_review'}};
  if (sceneRevision) report.exportFormat = format;
  if (artDirection) report.artDirection = artDirection;
  if (input.variation) report.variation = input.variation;
  if (input.motionRecipe) {
    report.motionRecipe = input.motionRecipe;
    const credit = MOTION_RECIPES[input.motionRecipe].credit;
    if (credit) report.credits = [credit];
  }
  let current,previousReport,writeProgress=!resume;
  async function phase(name,fn){
    current=name;signal.throwIfAborted();onEvent({type:'stage',name});const start=Date.now();
    await appendFile(path.join(dir,'events.jsonl'),JSON.stringify({at:new Date().toISOString(),stage:name})+'\n');
    try{const result=await fn();signal.throwIfAborted();return result;}finally{report.timings[name]=Date.now()-start;}
  }
  try{
    let score=resume ? await read(dir,'launch-score').catch(error => {
      if (error.code !== 'ENOENT') throw error;
      return null;
    }) : null;
    if (renderOnly && !score) throw new Error('Сохранённого плана ещё нет');
    let source=resume ? await read(dir,'source').catch(error => {
      if (error.code !== 'ENOENT') throw error;
      return null;
    }) : null;
    if (renderOnly && !source) throw new Error('Сохранённого источника ещё нет');
    if(!source && input.sourceRun){
      source=await phase('source-snapshot',()=>read(path.join(runsDir,input.sourceRun),'source'));
      if(input.url&&new URL(input.url).hostname!==new URL(source.url).hostname)throw new Error('Снимок относится к другому сайту');
      report.sourceSnapshot={runId:input.sourceRun,url:source.url,kind:'saved-website-capture',freshFetch:false};
      source.warnings=[...(source.warnings??[]),`Использован сохранённый снимок ${input.sourceRun}; текущий сайт заново не прочитан.`];
    }
    let treatment = resume ? await read(dir,planName).catch(error => {
      if (error.code !== 'ENOENT') throw error;
      return null;
    }) : null;
    const canCompile = () => Boolean(connected ? treatment : treatment?.beats.every(beat => beat.visual));
    report.canReformat = canCompile();
    if (alternate && !report.canReformat) throw new Error('Смена формата доступна для планов, собранных из действий');
    if (resume) {
      previousReport = await read(dir,'report');
      if (['recorded-product','manual'].includes(previousReport.directionSource)) report.directionSource = previousReport.directionSource;
      const previousVideo = previousReport.video ?? previousReport.previousVideo;
      if (previousVideo) report.previousVideo = previousVideo;
      if (sceneRevision) report.artifacts = {...previousReport.artifacts};
      const ledger=await read(dir,'cost').catch(error=>{
        if(error.code!=='ENOENT')throw error;
        return previousReport.cost ?? {perCall:[]};
      });
      if (!Array.isArray(ledger.perCall) || ledger.perCall.some(call=>!Number.isFinite(call.usd)||call.usd<0)) {
        throw new Error('Не удалось восстановить расходы сохранённого запуска.');
      }
      tracker.calls=ledger.perCall;
      const savedBudget=ledger.budgetUSD ?? saved.budgetUSD;
      tracker.budgetUSD=launchBudgetUSD(renderOnly ? savedBudget : budgetUSD ?? savedBudget);
      if (renderOnly) savedCost = ledger.tokens ? ledger : tracker.summary();
      await save(dir, `report-before-${Date.now()}`, previousReport);
      writeProgress=true;
      if (!renderOnly && budgetUSD!==undefined) await save(dir,'request',{...saved,budgetUSD:tracker.budgetUSD});
      if (!alternate && previousReport.draft && !previousReport.exportFormat) {
        report.draft = previousReport.draft;
        report.inspection = previousReport.inspection;
        report.artifacts.contactSheet = previousReport.artifacts?.contactSheet;
      }
    } else await save(dir,'request',{...input,budgetUSD:tracker.budgetUSD});
    report.modelAttempts = sceneRevision ? {} : {...previousReport?.modelAttempts};
    if (!previousReport?.modelAttempts) {
      for (const {stage} of tracker.calls) if (stage) report.modelAttempts[stage] = (report.modelAttempts[stage] ?? 0) + 1;
    }
    await persistCost();
    await save(dir,'report',report);
    if (!source) {
      source = await phase('research', () => research({...input,dir,signal,importer:services.importer}));
      if (input.objectStory) source.evidence.push({id:'MANUAL',source:'user-description',text:manualEvidence(input.objectStory)});
      if ((connected || input.style === 'product-demo' || input.directionMode === 'semantic') && source.url) {
        await phase('capture', async () => {
          try {
            const layered = await importProductFlow(source, input.language);
            if (layered) {
              if (input.style === 'product-demo') source.productFlow = layered.productFlow;
              source.assets.push(layered.asset);
              source.evidence.push(...layered.evidence);
              return;
            }
            if (!connected && input.style !== 'product-demo') return;
            const capture = services.capture || (await import('../production/website-motion.js')).importWebsiteLayers;
            const {layers} = await capture(source.url, dir, {...settings, websitePace: 'calm'}, input.brief, signal);
            for (const layer of layers.filter(item => item.role !== 'opening').slice(0, 4)) {
              const evidence = layer.text?.trim() && {
                id: `CAP${source.assets.length + 1}`, source: layer.asset.source, text: layer.text.trim().slice(0, 480),
              };
              if (evidence) source.evidence.push(evidence);
              source.assets.push({...layer.asset, role: layer.role, ...(evidence ? {evidenceId: evidence.id} : {})});
            }
          } catch (error) {
            signal.throwIfAborted();
            source.warnings.push(`Слои сайта недоступны: ${error.message}. Для демо используется схематичный интерфейс.`);
          }
        });
      }
    }
    if (source.url && !score && !source.brand?.paletteSource) {
      await phase('palette', async () => {
        let appearance;
        try {
          const capture = services.appearance || (await import('../import/website-capture.js')).captureWebsite;
          appearance = await capture(source.url,{width:1440,height:900,appearanceOnly:true,signal});
          if (!appearance?.foreground || !appearance?.background || (!appearance.heading && !appearance.controls?.length)) {
            throw new Error('нет видимых цветов страницы');
          }
        } catch (error) {
          signal.throwIfAborted();
          source.warnings.push(`Палитра интерфейса недоступна: ${error.message}. Используется нейтральная палитра.`);
          appearance = undefined;
        }
        const {palette,sampledControl,mode} = resolveInterfacePalette(appearance);
        source.brand = {...source.brand, colors:[...new Set([palette.background,palette.foreground,palette.accent])],
          mode, pageBg:palette.background,
          paletteSource:appearance ? 'rendered-interface' : 'neutral-fallback',
          interfacePalette:palette, ...(appearance && {interfaceEvidence:{
            url:appearance.url,heading:appearance.heading,background:appearance.background,
            foreground:appearance.foreground,primaryControl:sampledControl,
          }}),
        };
      });
    }
    await save(dir,'source',source);report.artifacts.source='source.json';
    let request;
    const model = () => {
      if (!requestStage && !hasApiKey()) throw new Error('Для постановки этого ролика нужен ключ Anthropic');
      return request ||= requestStage || anthropicStages(createClient(), {model: CONFIG.model, maxTokens: CONFIG.maxOutputTokens});
    };
    const semantic = input.directionMode === 'semantic';
    const mediaSheet = !renderOnly && (!score || sceneRevision) ? await sourceMediaSheet(source,dir) : null;
    if(mediaSheet)report.artifacts.sourceMedia='source-media.jpg';
    const creativePreparation=!renderOnly?directorPreparation({brief:input.brief,description:input.description,language:input.language,settings,source}):null;
    if(creativePreparation){await save(dir,'creative-preparation',creativePreparation);report.artifacts.creativePreparation='creative-preparation.json';}
    const treatmentArgs = {source, settings, description: input.description, brief: input.brief, language: input.language,
      ...(creativePreparation?{creativePreparation}:{}),
      onPreparation:(prepared,{stage,attempt})=>save(dir,`creative-context-${stage}-${attempt}`,prepared),
      ...(mediaSheet && {imagePaths:[mediaSheet]})};
    const validateConnected = value => objectTransform ? validateObjectStory(value,source) : validateConnectedStory(value,source);
    const directConnected = objectTransform ? directObjectStory : directConnectedStory;
    const compile = value => {
      if (objectTransform) return compileObjectStory(value,settings,source);
      if (input.motionRecipe === CONTINUOUS_MORPH) return compileContinuousMorph(value,settings,source);
      if (connected) return compileConnectedStory(value,settings,source);
      return stageMotion(compileLaunch(value,settings,source));
    };
    async function beforeRequest(stage, limit = 2) {
      const count = report.modelAttempts[stage] ?? 0;
      if (count >= limit) {
        throw new Error('Лимит попыток модели для этого этапа исчерпан.');
      }
      report.modelAttempts[stage] = count + 1;
      await save(dir, 'report', report);
    }
    function saveResponse(kind, response) {
      return save(dir, `model-${kind}-${Date.now()}-${report.modelAttempts[response.stage]}`, response);
    }
    if (treatment) {
      if (connected) validateConnected(treatment);
      else validateTreatment(treatment, treatment.storyboardFrames && settings.pace === 'superdynamic' ?
        {...settings,frames:treatment.storyboardFrames} : settings,
        {source,requireMoves:!treatment.beats.every(beat=>beat.visual?.scene)});
    }
    if (sceneRevision) {
      report.sceneRevision = sceneRevision;
      if (connected || !treatment?.beats.some(beat=>beat.id === sceneRevision.sceneId)) {
        throw new Error('Правка фрагмента доступна для сохранённого плана сцен.');
      }
      const original = treatment;
      treatment = await phase('scene-revision', () => directSemanticTreatment({
        ...treatmentArgs, previous:original, stage:'launch-scene-revision',
        feedback:[`[${sceneRevision.sceneId}] ${sceneRevision.instruction}`], request:model(),
        tracker,persistCost,signal,beforeRequest,maxAttempts:1,
        onAttempt:response=>saveResponse('scene-revision',response),
      }));
      await save(dir,`treatment-before-scene-${Date.now()}`,original);
      score = null;
    }
    if (!score && !treatment && input.objectStory) {
      treatment = validateConnected(input.objectStory);
      report.directionSource = 'manual';
      await save(dir,planName,treatment);
    }
    if (!score && !treatment && semantic && !connected) {
      treatment = recordedProductTreatment(source, settings);
      if (treatment) {
        report.directionSource = 'recorded-product';
        await save(dir, 'report', report);
        await save(dir, 'treatment', treatment);
      }
    }
    if (!score && !treatment) {
      const draftTreatment = await phase('treatment', async () => {
        const files = resume ? (await readdir(dir)).filter(file => /^model-treatment-\d+-\d+\.json$/.test(file)).sort().reverse() : [];
        for (const file of files) {
          const candidate = await read(dir, file.slice(0, -5));
          if (!candidate.output) continue;
          try {
            if (connected) return validateConnected(candidate.output);
            if (!semantic) return validateTreatment(candidate.output, settings, {source, requireCreative: true});
            return normalizeSemanticTreatment(candidate.output, settings, source);
          } catch { /* Only reuse a response that still passes validation. */ }
        }
        const direct = connected ? directConnected : semantic ? directSemanticTreatment : directTreatment;
        return direct({
          ...treatmentArgs, request: model(), tracker, persistCost, signal, beforeRequest,
          onAttempt: response => saveResponse('treatment', response),
        });
      });
      treatment = draftTreatment;
      await save(dir, planName, treatment);
      if (input.variation && treatment.beats) {
        await recordFilm(runsDir,productKey,{runId,at:new Date().toISOString(),angle:input.variation.angle,layout:input.variation.layout,
          artDirection:artDirection ?? null,pace:input.pace,summary:filmSummary(treatment),creative:creativeProfile(treatment)});
      }
    }
    report.canReformat = canCompile();
    if (treatment) report.artifacts.treatment = planName + '.json';
    if (alternate || (renderOnly && ['scenes','superdynamic'].includes(score?.staging) && report.canReformat) || (!score && report.canReformat)) {
      score = await phase('compile', () => compile(treatment));
    }
    const direction=extra=>directScore({
      source,settings,brief:input.brief,language:input.language,treatment,request:model(),tracker,persistCost,signal,
      ...(creativePreparation?{creativePreparation}:{}),
      onPreparation:(prepared,{stage,attempt})=>save(dir,`creative-context-${stage}-${attempt}`,prepared),
      beforeRequest: stage => beforeRequest(stage, stage === 'launch-revision' ? 1 : 2),
      onAttempt: response => saveResponse(response.stage === 'launch-revision' ? 'revision' : 'score', response),...extra,
    });
    if(!score){
      const priorError=previousReport?.error;
      const feedback=priorError?.stage==='director'&&typeof priorError.message==='string'?[priorError.message]:[];
      score=stageMotion(await phase('director',async()=>{
        if(resume){
          const files=(await readdir(dir)).filter(file=>/^model-score-\d+-\d+\.json$/.test(file)).sort().reverse();
          for(const file of files){
            const candidate=await read(dir,file.slice(0,-5));
            if(!candidate.output)continue;
            try{return validateDirectedScore(candidate.output,{source,settings,treatment});}catch{/* Keep validating the remaining candidates. */}
          }
        }
        return direction({feedback});
      }));
    }
    const validate = value => {
      validateScore(value, settings, source);
      if (treatment && !connected && value.staging !== 'superdynamic') validateTreatmentScore(value, treatment, {requireMorph: settings.pace === 'dynamic' && !source.productFlow});
      return value;
    };
    validate(score);
    const separateExport = Boolean(sceneRevision) || renderOnly && (alternate || previousReport.video || previousReport.exportFormat);
    const exportPath = separateExport ? `exports/${format}-${Date.now()}` : '';
    if (separateExport) report.exportFormat = format;
    const outputDir = path.join(dir, exportPath);
    const artifact = file => exportPath ? exportPath + '/' + file : file;
    await mkdir(outputDir, {recursive: true});
    async function saveDirection(value) {
      if (!['scenes','superdynamic'].includes(value.staging) || !treatment) return;
      await save(outputDir, 'direction-plan', directionPlan(treatment, value, settings));
      report.artifacts.directionPlan = artifact('direction-plan.json');
    }
    async function saveScore(value) {
      await save(outputDir, 'launch-score', value);
      report.artifacts.score = artifact('launch-score.json');
      await saveDirection(value);
    }
    if (renderOnly && !exportPath) {
      const stored = await read(outputDir, 'launch-score').catch(error => {
        if (error.code !== 'ENOENT') throw error;
        return null;
      });
      if (stored && JSON.stringify(stored) !== JSON.stringify(score)) {
        await save(outputDir, `launch-score-before-render-${Date.now()}`, stored);
      }
      await saveScore(score);
    } else await saveScore(score);
    const audit = services.audit || (!services.render && (await import('./render.js')).auditLaunch);
    async function runPreflight(value) {
      if (!audit) return {score: value, remaining: []};
      const result = await phase('preflight', () => preflightLaunch(value, source, {audit, validate, signal}));
      const {score: repaired, ...summary} = result;
      report.preflight = [...(report.preflight ?? []), summary];
      await save(outputDir, 'preflight', report.preflight);
      report.artifacts.preflight = artifact('preflight.json');
      return {score: repaired, remaining: result.remaining};
    }
    const initial = await runPreflight(score);
    if (initial.score !== score) {
      await save(outputDir, 'launch-score-before-preflight', score);
      score = initial.score;
      await saveScore(score);
    }
    const render=services.render||(await import('./render.js')).renderLaunch;
    const inspect=services.inspect||(await import('./inspect.js')).inspectLaunch;
    async function produceDraft(value, attempt) {
      const name = `draft-${Date.now()}-${attempt}`;
      const directory = path.join(outputDir, name);
      await mkdir(directory);
      const draft = await phase('draft', () => render(value, source, directory, {
        signal, scale: .5,...(input.outputFps&&{fps:input.outputFps}), onProgress: progress => onEvent({type: 'render', progress}),
      }));
      const inspection = await phase('draft-inspect', () => inspect(draft, value, directory, {signal, scale: .5,treatment}));
      report.quality.motion = inspection.motion?.ok ? 'passed' : inspection.motion ? 'needs_review' : 'unmeasured';
      return {name, directory, inspection};
    }
    async function showDraft({name, inspection}) {
      report.draft = artifact(name + '/video.mp4');
      report.inspection = artifact(name + '/inspection.json');
      report.artifacts.contactSheet = artifact(name + '/contact-sheet.jpg');
      const compositionSheet = inspection.composition?.contactSheet;
      if (compositionSheet) report.artifacts.compositionSheet = artifact(name + '/' + compositionSheet);
      else delete report.artifacts.compositionSheet;
      report.quality.technical = inspection.ok ? 'passed' : 'failed';
      await save(dir, 'report', report);
    }
    async function reviewDraft(value, {directory,inspection}) {
      const modelName = CONFIG.launchBuildModel;
      const objectEvidence = objectTransform ? new Set(value.elements.flatMap(element=>element.evidenceIds)) : null;
      const sharedImage = connected && value.elements.find(element =>
        element.kind === 'image' && element.start === 0 && element.end === value.frames);
      const args = {name: 'launch_review', schema: ReviewSchema,
        prompt: (objectTransform ? OBJECT_REVIEW_PROMPT : connected ? CONNECTED_REVIEW_PROMPT : ['scenes','superdynamic'].includes(value.staging) ? STAGED_REVIEW_PROMPT + '\n' + (value.staging === 'superdynamic' ? (value.timing === 'actions' ? SUPERDYNAMIC_REVIEW : 'For each note name the sourceScene ID, not the individual shot ID. Short half-second shots are intentional; still report unreadable copy or unclear action.') : ORDINARY_REVIEW) : REVIEW_PROMPT) + '\n' + READING_DIRECTION + (value.elements.some(element=>element.stage)?'\n'+STAGE_REVIEW:''),
        input: objectTransform ? {story:treatment,brief:input.brief,evidence:source.evidence.filter(item=>objectEvidence.has(item.id)),
          measuredDurationSeconds:inspection?.media?.duration}
          : connected ? {story:treatment,brief:input.brief,evidence:source.evidence.filter(item=>
          [treatment?.actionEvidenceId,treatment?.resultEvidenceId,...(sharedImage?.evidenceIds ?? [])].includes(item.id)),
          ...(sharedImage && {sharedSubject:{name:treatment.subject,assetId:sharedImage.assetId}})}
          : {...launchReviewContext({source, score: value, treatment, pace: settings.pace, brief: input.brief,
            creativeHistory:input.variation?.creativeHistory}),
            measuredMotion:inspection.motion,measuredPacing:inspection.pacing,measuredDirection:inspection.direction},
        feedback: [], imagePaths: [path.join(directory, 'contact-sheet.jpg'),
          ...(connected ? [path.join(directory, 'review-endpoints.jpg')] : [])],
        outputCeiling: 1900, model: modelName, modelEffort: value.elements.some(element=>element.stage)?'medium':'low'};
      const output = await phase('visual-review', async () => {
        const key = await reviewFingerprint(args, value);
        const cached = key && await read(dir, 'review-cache').catch(error => {
          if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
          return null;
        });
        const previous = cached?.key === key ? cached.output : cached?.entries?.[key];
        if (validReview(previous)) return previous;
        const maxOutputTokens = outputAllowance(args, tracker, modelName);
        await beforeRequest('visual-review');
        const response = await model()({...args, maxOutputTokens, signal});
        await recordLaunchUsage(response, modelName, tracker, persistCost, {stage: 'visual-review'});
        // The schema's length limits are advisory to the model. Trim an otherwise usable review instead of discarding it.
        if (response.output && Array.isArray(response.output.issues)) {
          response.output.issues = response.output.issues.filter(issue => typeof issue === 'string')
            .slice(0, 3).map(issue => issue.slice(0, 320));
        }
        if (!validReview(response.output)) {
          await save(dir, `model-review-rejected-${Date.now()}`, {output: response.output ?? null, stopReason: response.stopReason ?? null});
          throw new Error('Не получена проверка кадров');
        }
        if (key) {
          const entries = {...cached?.entries, ...(cached?.key && {[cached.key]: cached.output}), [key]: response.output};
          await save(dir, 'review-cache', {entries});
        }
        return response.output;
      });
      await save(directory, 'visual-review', output);
      return output;
    }

    let failure;
    let draft;
    const wantsReview = input.visualReview && !renderOnly && report.directionSource !== 'recorded-product';
    if (wantsReview || initial.remaining.length || !audit) {
      draft = await produceDraft(score, 0);
      await showDraft(draft);
      if (!draft.inspection.ok) {
        failure = {stage: 'draft-inspect', message: 'Черновик не прошёл техническую проверку. Причины указаны в отчёте.'};
      } else if (wantsReview) {
        try {
          const review = await reviewDraft(score, draft);
          report.quality.artistic = review.verdict === 'pass' ? 'sampled_frames_review_passed' : 'needs_visual_revision';
          if (review.verdict === 'revise') failure = {stage: 'visual-review', feedback: review.issues,
            message: review.issues.join(' · ') || 'Художественная проверка рекомендует правку композиции.'};
        } catch (error) {
          signal.throwIfAborted();
          report.quality.artistic = 'review_unavailable';
          failure = {stage: 'visual-review', message: error.message};
        }
      }
    }

    const authored = score.elements.some(element=>element.stage);
    const repairLimit=authored?2:1;
    let acceptedTechnical=draft?.inspection.ok??initial.remaining.length===0;
    if(authored && failure?.stage==='draft-inspect'){
      const notes=(draft?.inspection.issues??[]).slice(0,3).map(issue=>`[${issue.scene??score.scenes.find(scene=>issue.frame>=scene.start&&issue.frame<scene.end)?.id??score.scenes[0].id}] ${JSON.stringify(issue)}`);
      failure={stage:'visual-review',feedback:notes,message:notes.join(' · ')};
    }
    // Native scenes revise meaning; authored compositions can also revise exact geometry and tracks.
    for(let repairPass=0;repairPass<repairLimit;repairPass++) {
    // Scene films answer a review with new content, not coordinates: the notes go back to the treatment,
    // which is recompiled and checked. The frame review is advisory here, so a technically clean film is
    // always exported, and any notes that remain are kept in the report for the viewer.
    if ((connected || ['scenes','superdynamic'].includes(score.staging) && semantic) && treatment && failure?.stage === 'visual-review') {
      const allNotes = failure.feedback ?? [];
      const notes = sceneRevision ? allNotes.filter(note=>reviewBeatIds([note],treatment).has(sceneRevision.sceneId)) : allNotes;
      report.reviewNotes = allNotes;
      if (report.quality.artistic === 'needs_visual_revision') report.quality.artistic = 'review_notes_remaining';
      const actionable = connected ? notes.length : reviewBeatIds(notes, treatment).size;
      if (!renderOnly && actionable && (report.modelAttempts['launch-treatment-revision']??0)<repairLimit) {
        const original = treatment;
        try {
          const revise = connected ? directConnected : directSemanticTreatment;
          const revisedTreatment = await phase('repair', () => revise({
            ...treatmentArgs, previous: original, feedback: notes, stage: 'launch-treatment-revision', maxAttempts: 1,
            request: model(), tracker, persistCost, signal, beforeRequest: stage => beforeRequest(stage, repairLimit),
            onAttempt: response => saveResponse('treatment-revision', response),
          }));
          treatment = revisedTreatment;
          const checked = await runPreflight(validate(compile(revisedTreatment)));
          if (checked.remaining.length) throw new Error('Правка не прошла проверку композиции: '+JSON.stringify(checked.remaining.slice(0,2)));
          const revised = await produceDraft(checked.score, 1);
          if (!revised.inspection.ok) throw new Error('Правка не прошла техническую проверку: '+JSON.stringify(revised.inspection.issues.slice(0,2)));
          await save(outputDir, `launch-score-before-repair-${Date.now()}`, score);
          await save(dir, `${planName}-before-revision-${Date.now()}`, original);
          if (!sceneRevision) await save(dir, planName, treatment);
          score = checked.score;
          acceptedTechnical=true;
          await saveScore(score);
          await showDraft(revised);
          report.reviewNotes = connected ? notes : [];
          report.quality.artistic = 'revised_not_reviewed';
          try {
            const review = await reviewDraft(score, revised);
            report.reviewNotes = review.verdict === 'pass' ? [] : review.issues;
            report.quality.artistic = review.verdict === 'pass' ? 'sampled_frames_review_passed' : 'review_notes_remaining';
          } catch (error) {
            signal.throwIfAborted();
          }
        } catch (error) {
          signal.throwIfAborted();
          treatment = original;
          report.revisionError = error.message;
          if(authored)report.reviewNotes=[`${notes[0]?.match(/^\[[\w-]+\]/)?.[0]??'['+treatment.beats[0].id+']'} Rejected revision: ${error.message}`,...notes.slice(0,2)];
        }
      }
      report.reviewPasses??=[];report.reviewPasses.push({pass:repairPass+1,notes:report.reviewNotes??[],error:report.revisionError??null});
      if ((connected || authored && repairPass+1<repairLimit) && report.reviewNotes.length) {
        failure = {stage:'visual-review',message:report.reviewNotes.join(' · '),feedback:report.reviewNotes};
      } else failure = undefined;
    }

    if(!failure)break;
    }
    if(authored&&!acceptedTechnical)failure={stage:'draft-inspect',message:'Свободная композиция требует исправления читаемости или геометрии. Подробности сохранены в inspection.json.'};

    const artisticRepair = failure?.stage === 'visual-review' && report.quality.artistic === 'needs_visual_revision';
    const detailedRepair = failure?.stage === 'draft-inspect' && !semantic && wantsReview;
    if (!connected && !renderOnly && (artisticRepair || detailedRepair) && !(report.modelAttempts['launch-revision'] > 0)) {
      try {
        const feedback = artisticRepair ? failure.feedback.length ? failure.feedback : [failure.message] :
          draft.inspection.issues.slice(0, 12).map(issue => JSON.stringify(issue));
        const sheet = draft.inspection.composition?.contactSheet ?? (artisticRepair ? 'contact-sheet.jpg' : null);
        const candidate = await phase('repair', () => direction({
          previous: score, feedback, imagePaths: sheet ? [path.join(draft.directory, sheet)] : [], maxAttempts: 1,
        }));
        const stagedCandidate = stageMotion(candidate);
        if (stagedCandidate !== candidate) validate(stagedCandidate);
        const checked = await runPreflight(stagedCandidate);
        const repeated = initial.remaining.length && !improvesFindings(initial.remaining, checked.remaining);
        if (checked.remaining.length && (artisticRepair || repeated)) {
          throw new Error('Правка не устранила замечания к композиции.');
        }
        const revised = await produceDraft(checked.score, 1);
        if (!revised.inspection.ok) throw new Error('Правка не прошла техническую проверку.');
        if (wantsReview) {
          const review = await reviewDraft(checked.score, revised);
          if (review.verdict !== 'pass') throw new Error(review.issues.join(' · ') || 'После правки остались замечания к кадрам.');
          report.quality.artistic = 'sampled_frames_review_passed';
        }
        await save(outputDir, `launch-score-before-repair-${Date.now()}`, score);
        score = checked.score;
        await saveScore(score);
        await showDraft(revised);
        failure = undefined;
      } catch (error) {
        signal.throwIfAborted();
        failure.message += ' ' + error.message;
      }
    }

    if (failure) {
      report.status = 'needs_revision';
      report.error = {stage: failure.stage, message: failure.message};
    } else {
      const full = await phase('render', () => render(score, source, outputDir, {
        signal, scale: 1,...(input.outputFps&&{fps:input.outputFps}), onProgress: progress => onEvent({type: 'render', progress}),
      }));
      const final = await phase('inspect', () => inspect(full, score, outputDir, {signal,treatment}));
      report.quality.motion = final.motion?.ok ? 'passed' : final.motion ? 'needs_review' : 'unmeasured';
      if (final.ok) {
        report.video = artifact('video.mp4');
        if (sceneRevision) {
          await save(dir,planName,treatment);
          await save(dir,'launch-score',score);
        }
        if (report.video === report.previousVideo) delete report.previousVideo;
      }
      else {
        report.draft ??= artifact('video.mp4');
        report.error = {stage: 'inspect', message: 'Файл не прошёл финальную техническую проверку. Причины указаны в отчёте.'};
      }
      report.inspection = artifact('inspection.json');
      report.artifacts.contactSheet = artifact('contact-sheet.jpg');
      report.artifacts.render = artifact('render-metadata.json');
      report.quality.technical = final.ok ? 'passed' : 'failed';
      report.status = final.ok ? 'completed' : 'needs_revision';
    }
  }catch(error){
    report.status=signal.aborted?'cancelled':error.code==='model_budget'&&report.draft?'needs_revision':'failed';
    report.error={stage:current,message:error.message};
  }finally{
    clearTimeout(timer);
    report.cost=savedCost ?? tracker.summary();
    try {
      if (writeProgress) {
        await persistCost();
        await save(dir,'report',report);
      }
    } finally {
      await lock.close();
      await rm(path.join(dir,'.lock'),{force:true});
    }
  }
  return {ok:report.status==='completed',dir,runId,report,video:report.video&&path.join(dir,report.video)};
}
