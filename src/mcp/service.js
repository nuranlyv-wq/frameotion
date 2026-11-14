import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,realpath,stat,readdir} from 'node:fs/promises';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {ProjectStore,atomicJSON,alive} from './store.js';
import {assertDocument,assertSchema,SceneSchema,DEFAULT_PALETTE,compileProject,projectId} from './contract.js';
import {directorPreparation} from '../craft/brief.js';
import {retrieveCraft} from '../craft/retrieval.js';
import {inspectLaunchGeometry,auditLaunch,renderLaunch} from '../kadr-launch/render.js';
import {brandAssetRoot} from '../production/brand-assets.js';
import {compileStage} from '../kadr-launch/stage-contract.js';
import {createBeatClock,retimeStageToBeats} from '../kadr-launch/beat-grid.js';

const repo=fileURLToPath(new URL('../../',import.meta.url));
const copy=value=>structuredClone(value);
export const artifactURI=(id,relative)=>`frameotion://artifact/${id}/${relative}`;
const mime=file=>file.endsWith('.png')?'image/png':file.endsWith('.mp4')?'video/mp4':'application/json';
const terminal=status=>['completed','failed','cancelled','interrupted'].includes(status);

export class EngineService{
  constructor({root=process.env.FRAMEOTION_MCP_DATA_DIR||path.join(repo,'runs/mcp'),assetRoots,backend}={}){
    this.store=new ProjectStore(root);this.assetRoots=(assetRoots??(process.env.FRAMEOTION_MCP_ASSET_ROOTS||repo).split(path.delimiter)).map(p=>path.resolve(p));
    this.backend=backend??{preview:inspectLaunchGeometry,audit:auditLaunch,render:renderLaunch};this.jobs=new Map();this.tail=Promise.resolve();this.pending=0;this.closed=false;
  }
  async init(){await this.store.init();this.assetRoots=await Promise.all(this.assetRoots.map(p=>realpath(p)));return this;}
  async exclusive(run,signal){
    if(this.closed)throw Error('MCP service is shutting down');if(this.pending>=8)throw Error('Local renderer queue is full; retry after a running operation finishes');
    const before=this.tail;let release;this.tail=new Promise(resolve=>{release=resolve;});this.pending++;
    try{await before;signal?.throwIfAborted();if(this.closed)throw Error('MCP service is shutting down');return await run();}finally{this.pending--;release();}
  }
  async create(args){
    const document={name:args.name,brief:args.brief??'',language:args.language??'en',width:args.width??1920,height:args.height??1080,fps:args.fps??24,pace:args.pace??'dynamic',palette:args.palette??copy(DEFAULT_PALETTE),fonts:args.fonts??['Comfortaa','Fira Sans'],evidence:args.evidence??[],scenes:[]};
    const record=await this.store.create(document);return {project:record,preparation:this.preparation(record),next:'Read the stage schema, add connected scenes with put_scene, then validate and preview.'};
  }
  preparation(record){const d=record.document;return directorPreparation({brief:d.brief,language:d.language,settings:{width:d.width,height:d.height,fps:d.fps,frames:d.scenes.reduce((n,s)=>n+s.durationFrames,0),pace:d.pace},source:{nameHint:d.name},studio:'motion'});}
  async get({projectId:id,revision,sceneId}){const r=await this.store.get(id,revision);if(sceneId){const scene=r.document.scenes.find(s=>s.id===sceneId);if(!scene)throw Error('Unknown scene');return {projectId:id,revision:r.revision,scene};}const dir=await this.store.directory(id);let renders=[];try{renders=(await readdir(path.join(dir,'renders'))).filter(id=>new RegExp(projectId.pattern).test(id)).slice(-30);}catch(e){if(e.code!=='ENOENT')throw e;}return {...r,renderIds:renders};}
  async update({projectId:id,expectedRevision,document}){assertDocument(document);return this.store.mutate(id,expectedRevision,r=>{r.document=copy(document);if(r.rhythm)r.rhythm.dirty=true;});}
  async putScene({projectId:id,expectedRevision,scene,index}){
    assertSchema(SceneSchema,scene);
    return this.store.mutate(id,expectedRevision,r=>{
      const scenes=r.document.scenes,old=scenes.findIndex(s=>s.id===scene.id);
      if(old!==-1)scenes.splice(old,1);
      const at=index??(old===-1?scenes.length:old);if(at>scenes.length)throw Error('Scene insertion index exceeds scene count');scenes.splice(at,0,copy(scene));
      if(r.rhythm)r.rhythm.dirty=true;
    });
  }
  async retime({projectId:id,expectedRevision,beats,confidence,scenes}){
    let proof;
    const record=await this.store.mutate(id,expectedRevision,r=>{
      const compiled=compileProject(r),clock=createBeatClock({beats,confidence,fps:r.document.fps,duration:compiled.score.frames/r.document.fps}),seen=new Set(),reports=[];
      for(const request of scenes){
        if(seen.has(request.sceneId))throw Error('Retiming scene IDs must be unique');seen.add(request.sceneId);
        const scene=r.document.scenes.find(s=>s.id===request.sceneId),range=compiled.score.scenes.find(s=>s.id===request.sceneId);if(!scene)throw Error('Unknown retiming scene '+request.sceneId);
        const expanded=compileStage(scene.stage,scene.durationFrames/r.document.fps),retimed=retimeStageToBeats(expanded,{clock,startFrame:range.start,endFrame:range.end,landmarks:request.landmarks});scene.stage=retimed.stage;
        reports.push({sceneId:scene.id,landmarks:request.landmarks.map(l=>({at:l.at,beat:l.beat,frame:clock.frame(l.beat),errorMs:(clock.frame(l.beat)/clock.fps-clock.time(l.beat))*1000}))});
      }
      compileProject(r);proof={method:'Explicit landmarks on caller-supplied measured beat grid',confidence,fps:clock.fps,scenes:reports,dirty:false};r.rhythm={...proof,beats:copy(beats)};
    });
    return {projectId:id,revision:record.revision,rhythm:proof,modelCalls:0};
  }
  async validate(args){
    const record=await this.store.get(args.projectId,args.revision);
    try{const compiled=compileProject(record);return {ok:true,projectId:record.id,revision:record.revision,frames:compiled.score.frames,seconds:compiled.score.frames/compiled.score.fps,continuity:compiled.continuity,rhythm:record.rhythm??null,modelCalls:0};}
    catch(error){return {ok:false,projectId:record.id,revision:record.revision,issues:error.message.split('\n'),semanticAssessment:'Not established by structural validation',modelCalls:0};}
  }
  async preview(args,signal){
    const record=await this.store.get(args.projectId,args.revision),{score,source}=compileProject(record);
    const frames=args.frames??[0,...score.scenes.slice(1).flatMap(s=>[s.start-.001,s.start]),score.frames-1].slice(0,8);
    if(frames.some(f=>f<0||f>=score.frames))throw Error(`Preview frames must be within [0, ${score.frames})`);
    const samples=await this.exclusive(()=>this.backend.preview(score,source,frames,{scale:args.scale??.5,blur:args.blur??1,fps:score.fps,signal}),signal);
    if(samples.reduce((n,s)=>n+s.png.length,0)>4*1024*1024)throw Error('Preview images exceed the inline MCP budget. Reduce scale or request fewer frames.');
    const key=randomUUID(),relative='previews/'+key,dir=await this.store.outputDirectory(record.id,'previews',key);
    const images=[];
    for(const [i,sample]of samples.entries()){const name=`frame-${i}.png`;await writeFile(path.join(dir,name),sample.png);images.push({frame:sample.frame,path:path.join(dir,name),uri:artifactURI(record.id,relative+'/'+name),...(args.geometry?{stages:sample.stages}:{})});}
    const result={projectId:record.id,revision:record.revision,scoreFps:score.fps,images};await atomicJSON(path.join(dir,'geometry.json'),{...result,geometry:samples.map(({png,...data})=>data)});
    return {result,images:samples.map(s=>s.png)};
  }
  async audit(args,signal){
    const record=await this.store.get(args.projectId,args.revision),compiled=compileProject(record);
    const review=await this.exclusive(()=>this.backend.audit(compiled.score,compiled.source,{scale:args.scale??.5,blur:args.blur??1,fps:compiled.score.fps,signal}),signal);
    const key=randomUUID(),relative='previews/'+key,dir=await this.store.outputDirectory(record.id,'previews',key);
    const result={projectId:record.id,revision:record.revision,review,continuity:compiled.continuity,rhythm:record.rhythm??null,artistic:'Requires connected AI and human review; no internal director was called',modelCalls:0};await atomicJSON(path.join(dir,'audit.json'),result);return {...result,uri:artifactURI(record.id,relative+'/audit.json')};
  }
  async importAsset({projectId:id,expectedRevision,file,name,kind='illustration'}){
    if(!path.isAbsolute(file))throw Error('Asset path must be absolute');const resolved=await realpath(file);
    if(!this.assetRoots.some(root=>resolved.startsWith(root+path.sep)))throw Error('Asset is outside configured local asset roots');
    const info=await stat(resolved);if(!info.isFile()||info.size>8*1024*1024)throw Error('Local raster asset must be a file of at most 8 MiB');
    if(!/\.(png|jpe?g|webp)$/i.test(resolved))throw Error('Only PNG, JPEG and WebP raster assets are accepted');
    const bytes=await readFile(resolved);
    const raster=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||bytes.subarray(0,3).equals(Buffer.from([255,216,255]))||bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
    if(bytes.length>8*1024*1024||!raster)throw Error('Asset bytes must be PNG, JPEG or WebP, at most 8 MiB; SVG and executable content are not accepted');
    const image=await loadImage(bytes);if(!image.width||!image.height||image.width*image.height>16e6)throw Error('Asset exceeds 16 million pixels');
    const scale=Math.min(1,1600/Math.max(image.width,image.height)),canvas=createCanvas(Math.max(1,Math.round(image.width*scale)),Math.max(1,Math.round(image.height*scale)));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
    const png=canvas.toBuffer('image/png'),hash=createHash('sha256').update(png).digest('hex'),assetId='brand-'+hash.slice(0,20),root=brandAssetRoot();
    const asset={id:assetId,name,kind:'image',provider:'product-source',pack:'local-mcp',file:assetId+'.png',source:pathToFileURL(resolved).href,sha256:hash,width:canvas.width,height:canvas.height,license:'User-supplied local asset; use only with appropriate rights',scope:'local-video-only'};
    const record=await this.store.mutate(id,expectedRevision,async r=>{await mkdir(root,{recursive:true});try{await writeFile(path.join(root,asset.file),png,{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}try{await writeFile(path.join(root,assetId+'.json'),JSON.stringify(asset,null,2),{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}r.assets=r.assets.filter(a=>a.id!==assetId);r.assets.push({id:assetId,kind,name,source:asset.source});});
    return {projectId:id,revision:record.revision,asset:record.assets.find(a=>a.id===assetId)};
  }
  async startRender(args){
    if(this.closed)throw Error('MCP service is shutting down');if(this.pending>=8)throw Error('Local renderer queue is full');
    const record=await this.store.get(args.projectId,args.revision),{score,source}=compileProject(record),id=randomUUID(),dir=await this.store.outputDirectory(record.id,'renders',id);
    const job={jobId:id,projectId:record.id,revision:record.revision,status:'queued',progress:0,createdAt:new Date().toISOString(),ownerPid:process.pid,modelCalls:0};
    await atomicJSON(path.join(dir,'job.json'),job);await atomicJSON(path.join(dir,'project.json'),record);await atomicJSON(path.join(dir,'score.json'),score);await atomicJSON(path.join(dir,'source.json'),source);
    const controller=new AbortController(),entry={job,controller};this.jobs.set(id,entry);
    entry.promise=this.exclusive(async()=>{
      job.status='running';job.startedAt=new Date().toISOString();await atomicJSON(path.join(dir,'job.json'),job);
      const rendered=await this.backend.render(score,source,dir,{scale:args.scale??1,blur:args.blur??6,fps:score.fps,signal:controller.signal,onProgress:value=>{job.progress=Math.max(job.progress,Math.min(1,value));}});
      controller.signal.throwIfAborted();
      const auditIssues=[...(rendered.issues??[]),...(rendered.composition?.issues??[]),...(rendered.motionAudit?.issues??[])];
      await atomicJSON(path.join(dir,'audit.json'),{issues:auditIssues,composition:rendered.composition??null,motionAudit:rendered.motionAudit??null,directionAudit:rendered.directionAudit??null,artistic:'Requires creative review; no internal director called'});
      job.status='completed';job.progress=1;job.video={path:rendered.video,uri:artifactURI(record.id,`renders/${id}/video.mp4`),mimeType:'video/mp4'};job.metadata=rendered.metadata;job.audit={uri:artifactURI(record.id,`renders/${id}/audit.json`),issues:auditIssues};
    },controller.signal).catch(error=>{job.status=controller.signal.aborted?'cancelled':'failed';job.error=error.message;}).finally(async()=>{job.finishedAt=new Date().toISOString();await atomicJSON(path.join(dir,'job.json'),job);});
    // Observe failures of the final status write as well; never leak an unhandled rejection to stdio.
    entry.promise.catch(error=>{console.error('Frameotion MCP job persistence error:',error.message);});
    return copy(job);
  }
  async renderStatus({projectId:id,jobId}){
    const entry=this.jobs.get(jobId);if(entry){if(entry.job.projectId!==id)throw Error('Render belongs to another project');return copy(entry.job);}
    const file=await this.store.file(id,`renders/${jobId}/job.json`),job=JSON.parse(await readFile(file,'utf8'));if(job.jobId!==jobId||job.projectId!==id)throw Error('Invalid render record');
    if(!terminal(job.status)&&!alive(job.ownerPid)){job.status='interrupted';job.error='The owning MCP process exited. Start a new render from this revision.';job.finishedAt=new Date().toISOString();await atomicJSON(file,job);}return job;
  }
  async cancelRender(args){const status=await this.renderStatus(args);if(terminal(status.status))return status;const entry=this.jobs.get(args.jobId);if(!entry)throw Error('Render belongs to another live MCP process; cancel it through that process');entry.controller.abort(new Error('Render cancelled by client'));if(status.status==='queued'){entry.job.status='cancelled';entry.job.finishedAt=new Date().toISOString();const file=await this.store.file(args.projectId,`renders/${args.jobId}/job.json`);await atomicJSON(file,entry.job);}else await entry.promise;return copy(entry.job);}
  async readArtifact(uri){
    const url=new URL(uri);if(url.protocol!=='frameotion:'||url.hostname!=='artifact'||url.search||url.hash)throw Error('Unknown artifact URI');
    const parts=url.pathname.slice(1).split('/'),id=parts.shift(),relative=parts.join('/');assertSchema(projectId,id);
    const uuid=projectId.pattern.slice(1,-1),allowed=new RegExp(`^(?:previews/${uuid}/(?:frame-[0-7]\\.png|geometry\\.json|audit\\.json)|renders/${uuid}/(?:video\\.mp4|render-metadata\\.json|audit\\.json|score\\.json))$`);
    if(!allowed.test(relative))throw Error('Artifact is not an exposed engine output');const file=await this.store.file(id,relative),info=await stat(file);if(info.size>6*1024*1024)throw Error('Artifact exceeds inline resource limit; use its absolute local file path, or request a smaller preview');
    const data=await readFile(file),mimeType=mime(file);return {uri,mimeType,...(mimeType==='application/json'?{text:data.toString('utf8')}:{blob:data.toString('base64')})};
  }
  search(args){return retrieveCraft(args.query,{studio:'motion',limit:args.limit??4,maxChars:args.maxChars??5000});}
  async close(){this.closed=true;for(const {job,controller}of this.jobs.values())if(!terminal(job.status))controller.abort(new Error('MCP connection closed'));await Promise.allSettled([...this.jobs.values()].map(e=>e.promise));await this.tail;}
}
