import {mkdir,readFile,writeFile,rename,open,rm,appendFile} from 'node:fs/promises';
import path from 'node:path';
import {CONFIG} from '../config.js';
import {newRunId} from '../pipeline.js';
import {createClient} from '../director/agent.js';
import {CostTracker} from '../director/cost.js';
import {research,outputAllowance} from '../production/index.js';
import {anthropicStages} from '../production/stages.js';
import {directScore} from './director.js';
import {validateScore} from './score.js';
import {resolveRuntime} from './runtime.js';

const FORMATS={landscape:{width:1920,height:1080},portrait:{width:1080,height:1920},square:{width:1080,height:1080}};
const read=async(dir,name)=>JSON.parse(await readFile(path.join(dir,name+'.json'),'utf8'));
async function save(dir,name,data){const f=path.join(dir,name+'.json');await writeFile(f+'.tmp',JSON.stringify(data,null,2));await rename(f+'.tmp',f);}
export function validateLaunchRequest(options){
  const {url='',description='',brief='',format='landscape',seconds=25,language='ru'}=options;
  if([url,description,brief].some(v=>typeof v!=='string')||url.length>2048||description.length>3200||brief.length>1600)throw new Error('Некорректное описание или ссылка');
  if(!url.trim()&&!description.trim())throw new Error('Укажите сайт или описание продукта');
  if(!Object.hasOwn(FORMATS,format)||!Number.isInteger(seconds)||seconds<12||seconds>60)throw new Error('SaaS Launch: 12–60 секунд; формат landscape, portrait или square');
  if(!['ru','en','az'].includes(language))throw new Error('Язык: ru, en или az');
  return {engine:'motionsmith',style:'saas-launch',url:url.trim(),description:description.trim(),brief:brief.trim(),format,seconds,language};
}
const ReviewSchema={type:'object',properties:{verdict:{type:'string',enum:['pass','revise']},issues:{type:'array',minItems:0,maxItems:8,items:{type:'string',maxLength:320}}},required:['verdict','issues'],additionalProperties:false};

export async function generateLaunch(options={}){
  const {runsDir=CONFIG.runsDir,runId=newRunId('launch'),resume=false,renderOnly=false,onEvent=()=>{},services={},
    requestStage,signal:callerSignal,timeoutMs=20*60_000,budgetUSD=CONFIG.maxRunCostUSD??2.5}=options;
  if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(runId))throw new Error('Недопустимый ID');
  if(!Number.isFinite(budgetUSD)||budgetUSD<=0||!Number.isFinite(timeoutMs)||timeoutMs<1)throw new Error('Некорректный лимит');
  if(renderOnly&&!resume)throw new Error('Повторный рендер требует --resume');
  const dir=path.join(runsDir,runId);
  const saved=resume?await read(dir,'request'):options;
  if(resume&&saved.engine!=='motionsmith')throw new Error('Этот запуск использует другой движок');
  const input=validateLaunchRequest(saved);
  (services.runtime||resolveRuntime)();
  await mkdir(runsDir,{recursive:true});if(!resume)await mkdir(dir);
  const lock=await open(path.join(dir,'.lock'),'wx').catch(()=>{throw new Error('Запуск уже выполняется');});
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(new Error('Превышен лимит времени')),timeoutMs);
  const signal=callerSignal?AbortSignal.any([callerSignal,controller.signal]):controller.signal;
  const tracker=new CostTracker({budgetUSD}),persistCost=()=>save(dir,'cost',tracker.summary());
  const settings={...FORMATS[input.format],fps:30,frames:input.seconds*30};
  const report={version:1,runId,renderer:'motionsmith',style:'saas-launch',status:'running',artifacts:{},timings:{},quality:{technical:'pending',artistic:'requires_human_review'}};
  let current,previousReport;
  async function phase(name,fn){
    current=name;signal.throwIfAborted();onEvent({type:'stage',name});const start=Date.now();
    await appendFile(path.join(dir,'events.jsonl'),JSON.stringify({at:new Date().toISOString(),stage:name})+'\n');
    try{const result=await fn();signal.throwIfAborted();return result;}finally{report.timings[name]=Date.now()-start;}
  }
  try{
    if(resume){tracker.calls=(await read(dir,'cost').catch(()=>({perCall:[]}))).perCall;previousReport=await read(dir,'report');await save(dir,`report-before-${Date.now()}`,previousReport);}
    else await save(dir,'request',input);
    await save(dir,'report',report);
    let source=resume?await read(dir,'source').catch(()=>null):null;
    if(!source)source=await phase('research',()=>research({...input,dir,signal,importer:services.importer}));
    await save(dir,'source',source);report.artifacts.source='source.json';
    let score=resume?await read(dir,'launch-score').catch(()=>null):null;
    if(renderOnly&&!score)throw new Error('Сохранённого плана ещё нет');
    let request;
    const model=()=>request ||= requestStage||anthropicStages(createClient(),{model:CONFIG.model,maxTokens:CONFIG.maxOutputTokens});
    const direction=extra=>directScore({source,settings,brief:input.brief,language:input.language,request:model(),tracker,persistCost,signal,
      onAttempt:(response,attempt)=>save(dir,`model-score-${Date.now()}-${attempt}`,response),...extra});
    if(!score)score=await phase('director',()=>direction({}));
    else if(!renderOnly&&previousReport?.status==='needs_revision'&&/^draft-[a-zA-Z0-9-]+\/video\.mp4$/.test(previousReport.draft||'')){
      const previousDir=path.join(dir,path.dirname(previousReport.draft));
      const review=await read(previousDir,'visual-review').catch(()=>null),inspection=await read(previousDir,'inspection').catch(()=>null);
      const feedback=[...(inspection?.issues||[]).map(i=>JSON.stringify(i)),...(review?.verdict==='revise'?review.issues:[])];
      if(feedback.length){const before=score;score=await phase('repair',()=>direction({previous:score,feedback}));await save(dir,`launch-score-before-repair-${Date.now()}`,before);}
    }
    validateScore(score,settings,source);await save(dir,'launch-score',score);report.artifacts.score='launch-score.json';
    const render=services.render||(await import('./render.js')).renderLaunch;
    const inspect=services.inspect||(await import('./inspect.js')).inspectLaunch;
    let draft,inspection;
    for(let attempt=0;attempt<2;attempt++){
      const draftName=`draft-${Date.now()}-${attempt}`,draftDir=path.join(dir,draftName);await mkdir(draftDir);
      draft=await phase('draft',()=>render(score,source,draftDir,{signal,scale:.5,blur:6,onProgress:p=>onEvent({type:'render',progress:p})}));
      inspection=await phase('draft-inspect',()=>inspect(draft,score,draftDir,{signal,scale:.5}));
      report.draft=draftName+'/video.mp4';report.inspection=draftName+'/inspection.json';report.artifacts.contactSheet=draftName+'/contact-sheet.jpg';
      await save(dir,'report',report);
      let feedback=inspection.issues.map(i=>JSON.stringify(i));
      if(inspection.ok&&!renderOnly){
        try{
          const args={name:'launch_review',schema:ReviewSchema,prompt:'Review these sampled frames of the product launch video. Each scene has an action sample (may be mid-animation) and a result sample (after settling). Check readable type, overlap, hierarchy, accurate copy, composition variety and factual fidelity to source. Judge completed state on the result sample, not missing text during a legitimate entry. This sheet cannot establish full motion or audio quality. Return pass when sampled composition is clear; revise only for actionable defects, with concrete actor IDs/changes. Put only defects in issues, no praise, disclaimers or optional taste preferences. Available icons: check, arrow, lock, calendar, pause, plus, paw, box, bolt, heart, search. Never request music: this is an SFX-only film.',
            input:{source,score},feedback:[],imagePaths:[path.join(draftDir,'contact-sheet.jpg')],outputCeiling:2500};
          const maxOutputTokens=outputAllowance(args,tracker);
          const review=await phase('visual-review',()=>model()({...args,maxOutputTokens,signal}));
          if(review.usage){tracker.record(review.model||CONFIG.model,review.usage,{stage:'visual-review'});await persistCost();}
          if(!review.output||!['pass','revise'].includes(review.output.verdict)||!Array.isArray(review.output.issues)||review.output.issues.some(i=>typeof i!=='string'))throw new Error('Не получена проверка кадров');
          await save(draftDir,'visual-review',review.output);
          report.quality.artistic=review.output.verdict==='pass'?'sampled_frames_review_passed':'needs_visual_revision';
          if(review.output.verdict==='revise')feedback.push(...(review.output.issues.length?review.output.issues:['Revise composition and readability']));
        }catch(error){signal.throwIfAborted();report.warnings=[{stage:'visual-review',message:error.message}];}
      }
      if(!feedback.length||renderOnly)break;
      if(attempt===1){report.status='needs_revision';report.quality.technical=inspection.ok?'passed':'failed';return {ok:false,dir,runId,report};}
      const previous=score;
      score=await phase('repair',()=>direction({previous,feedback}));
      await save(dir,`launch-score-before-repair-${Date.now()}`,previous);await save(dir,'launch-score',score);
    }
    if(!inspection.ok){report.status='needs_revision';report.quality.technical='failed';}
    else{
      const full=await phase('render',()=>render(score,source,dir,{signal,scale:1,blur:6,onProgress:p=>onEvent({type:'render',progress:p})}));
      const final=await phase('inspect',()=>inspect(full,score,dir,{signal}));
      report.video='video.mp4';report.inspection='inspection.json';report.artifacts.contactSheet='contact-sheet.jpg';report.artifacts.render='render-metadata.json';
      report.quality.technical=final.ok?'passed':'failed';report.status=final.ok?'completed':'needs_revision';
    }
  }catch(error){report.status=signal.aborted?'cancelled':'failed';report.error={stage:current,message:error.message};}
  finally{clearTimeout(timer);report.cost=tracker.summary();await persistCost();await save(dir,'report',report);await lock.close();await rm(path.join(dir,'.lock'),{force:true});}
  return {ok:report.status==='completed',dir,runId,report,video:report.video&&path.join(dir,report.video)};
}
