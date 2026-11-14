import {mkdir,readFile,writeFile,open,rm} from 'node:fs/promises';
import path from 'node:path';
import {CONFIG} from '../config.js';
import {validateDirectedFilm} from './world-stage.js';
import {validateTimeline} from './validate.js';
import {writeGenerationProof} from './provenance.js';

// Recovery/export is local: never constructs a model client or invalidates saved stages.
export async function finalizeProduction({runId,runsDir=CONFIG.runsDir,services={},onEvent=()=>{},signal}){
 if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(runId))throw new Error('Invalid run ID');
 const dir=path.join(runsDir,runId),read=async name=>JSON.parse(await readFile(path.join(dir,name+'.json'),'utf8'));
 const lock=await open(path.join(dir,'.lock'),'wx');
 try{
  const [product,narrative,kit,motion,old,cost]=await Promise.all(['product-blueprint','narrative-blueprint','interface-scene-kit','motion-timeline','report','cost'].map(read));
  const settings=Object.fromEntries(['width','height','fps','frames'].map(k=>[k,motion[k]]));
  const ctx={product,narrative,interface:kit,motion,settings};
  if(motion.world)validateDirectedFilm(motion,ctx);else validateTimeline(motion,narrative,kit,settings);
  const name=`exports/final-${Date.now()}`,out=path.join(dir,name);await mkdir(out,{recursive:true});
  const render=services.render||(await import('./render.js')).renderProduction;
  const inspect=services.inspect||(await import('./inspect.js')).inspectProduction;
  onEvent({type:'stage',name:'render'});
  const result=await render(ctx,out,()=>{},{signal});
  const inspection=await inspect(result,ctx,out,{signal});
  await writeFile(path.join(out,'inspection.json'),JSON.stringify(inspection,null,2));
  const report={...old,status:inspection.ok?'needs_review':'needs_revision',video:`${name}/video.mp4`,inspection:`${name}/inspection.json`,
   quality:{technical:inspection.ok?'passed':'failed',artistic:'requires_human_review'},cost,
   localExport:{at:new Date().toISOString(),modelCalls:0,priorError:old.error||null}};
  delete report.error;
  await writeFile(path.join(dir,`report-before-export-${Date.now()}.json`),JSON.stringify(old,null,2));
  await writeFile(path.join(dir,'report.json'),JSON.stringify(report,null,2));
  await writeGenerationProof(dir,report);
  return {ok:inspection.ok,video:result.video,dir,runId,report};
 }finally{await lock.close();await rm(path.join(dir,'.lock'),{force:true});}
}
