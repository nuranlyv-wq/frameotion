import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import {mkdtemp,rm,readFile,writeFile,symlink,mkdir} from 'node:fs/promises';
import {createCanvas} from '@napi-rs/canvas';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {EngineService} from '../src/mcp/service.js';
import {createEngineMcpServer,TOOLS} from '../src/mcp/server.js';
import {compileProject} from '../src/mcp/contract.js';
import {connectedExample} from '../src/mcp/example.js';
import {atomicJSON} from '../src/mcp/store.js';

async function temporary(t){const root=await mkdtemp(path.join(os.tmpdir(),'frameotion-mcp-'));t.after(()=>rm(root,{recursive:true,force:true}));return root;}
async function service(t,options={}){const root=await temporary(t),s=await new EngineService({root:path.join(root,'projects'),assetRoots:[root],...options}).init();t.after(()=>s.close());return {s,root};}
async function populated(s){const {project}=await s.create({name:'Test',width:320,height:320,fps:30});return s.update({projectId:project.id,expectedRevision:1,document:connectedExample(320,320)});}
const png=()=>createCanvas(32,32).toBuffer('image/png');

test('MCP project compilation preserves native choreography, fragments and explicit causal context',()=>{
  const document=connectedExample(),before=structuredClone(document),{score,continuity}=compileProject({document,assets:[]});
  assert.equal(score.frames,360);assert.equal(score.fps,30);assert.deepEqual(document,before);
  assert.equal(continuity.pairs[0].previousOutcome,document.scenes[0].result);assert.match(continuity.policy,/mandatory default/);
  assert.match(continuity.semanticAssessment,/geometry alone/);assert.equal(score.elements[1].stage.handoffs[0].fromElement,'request');
  const disconnected=structuredClone(document);disconnected.scenes[0].handoff='';assert.throws(()=>compileProject({document:disconnected}),/explain how this result leads/);
  const withFragment=structuredClone(document);withFragment.scenes[0].stage.fragments=[{id:'extra',kind:'control',x:800,y:100,w:120,h:50,start:0,end:1,label:'Go'}];
  assert.ok(compileProject({document:withFragment}).score.elements[0].stage.nodes.some(n=>n.id==='extra_label'));
});

test('MCP revisions survive restart, reject stale/concurrent writes and retain old scenes',async t=>{
  const {s}=await service(t),r=await populated(s),id=r.id;
  const first=await s.get({projectId:id,revision:1});assert.equal(first.document.scenes.length,0);
  const scene={...r.document.scenes[0],action:'A revised action'};
  const writes=await Promise.allSettled([s.putScene({projectId:id,expectedRevision:2,scene}),s.putScene({projectId:id,expectedRevision:2,scene})]);
  assert.equal(writes.filter(x=>x.status==='fulfilled').length,1);
  await assert.rejects(s.putScene({projectId:id,expectedRevision:2,scene}),/Revision conflict/);
  const restarted=await new EngineService({root:s.store.root,assetRoots:s.assetRoots}).init();t.after(()=>restarted.close());
  assert.equal((await restarted.get({projectId:id})).revision,3);
  assert.equal((await restarted.get({projectId:id,revision:2})).document.scenes[0].action,r.document.scenes[0].action);
  await assert.rejects(s.putScene({projectId:id,expectedRevision:3,scene,index:11}),/insertion index/);
  assert.equal((await s.get({projectId:id})).revision,3);
});

test('MCP native validation reports incomplete drafts and bad controls, not creative approval',async t=>{
  const {s}=await service(t),{project}=await s.create({name:'Draft'});
  const draft=await s.validate({projectId:project.id});assert.equal(draft.ok,false);assert.ok(draft.issues.length);
  const r=await populated(s);assert.equal((await s.validate({projectId:r.id})).ok,true);
  const scene=structuredClone(r.document.scenes[0]);scene.stage.nodes.find(n=>n.id==='send').control.label='missing';
  await s.putScene({projectId:r.id,expectedRevision:2,scene});const invalid=await s.validate({projectId:r.id});assert.equal(invalid.ok,false);assert.match(invalid.issues.join(' '),/control/);
});

test('official MCP client discovers tools, schemas, prompts and structured repair errors',async t=>{
  const root=await temporary(t),{server,service:s}=await createEngineMcpServer({root:path.join(root,'projects'),assetRoots:[root]});
  const [clientSide,serverSide]=InMemoryTransport.createLinkedPair(),client=new Client({name:'local-test',version:'1.0.0'});
  t.after(async()=>{await client.close();await s.close();});await server.connect(serverSide);await client.connect(clientSide);
  const tools=await client.listTools();assert.equal(tools.tools.length,16);assert.ok(tools.tools.some(t=>t.name==='retime_project'));assert.ok(TOOLS.every(t=>!t.annotations.openWorldHint));
  const guide=await client.readResource({uri:'frameotion://guide'});assert.match(guide.contents[0].text,/YOU are the director/);
  const schema=await client.readResource({uri:'frameotion://schema/stage'});assert.equal(JSON.parse(schema.contents[0].text).properties.nodes.items.properties.material.enum.includes('liquid-glass'),true);
  const prompt=await client.getPrompt({name:'direct_motion_video',arguments:{brief:'Только точный текст'}});assert.match(prompt.messages[0].content.text,/Только точный текст/);
  const result=await client.callTool({name:'create_project',arguments:{name:'Created through MCP'}});assert.equal(result.isError,undefined);assert.equal(result.structuredContent.project.revision,1);
  const invalid=await client.callTool({name:'create_project',arguments:{name:'Bad',execute:'shell'}});assert.equal(invalid.isError,true);assert.match(invalid.content[0].text,/unknown field/);
  const unknown=await client.callTool({name:'internal_director',arguments:{}});assert.equal(unknown.isError,true);
  const search=await client.callTool({name:'search_craft',arguments:{query:'жидкое стекло'}});assert.equal(search.structuredContent.embeddingCalls,0);
  const info=await client.callTool({name:'engine_info',arguments:{}});assert.equal(info.structuredContent.internalDirector,false);assert.equal(info.structuredContent.network,'local-only');
});

test('MCP measured beat retiming moves camera, actors and sound together, rejects collapsed timing and invalidates stale proof',async t=>{
  const {s}=await service(t),r=await populated(s),scene=structuredClone(r.document.scenes[0]);
  scene.stage.camera=[{t:0,x:500},{t:.5,x:600},{t:1,x:500}];scene.stage.nodes.find(n=>n.id==='project').track=[{t:0,x:500},{t:.5,x:600},{t:1,x:500}];scene.stage.events=[{t:.5,kind:'click',actor:'send'}];
  const written=await s.putScene({projectId:r.id,expectedRevision:2,scene});const args={projectId:r.id,expectedRevision:written.revision,beats:Array.from({length:25},(_,i)=>i*.5),confidence:.8,scenes:[{sceneId:'request',landmarks:[{at:.5,beat:5}]}]};
  const retimed=await s.retime(args),record=await s.get({projectId:r.id}),stage=record.document.scenes[0].stage;
  assert.equal(retimed.modelCalls,0);assert.equal(stage.camera[1].t,75/180);assert.equal(stage.nodes.find(n=>n.id==='project').track[1].t,75/180);assert.equal(stage.events[0].t,75/180);assert.equal(record.rhythm.dirty,false);
  await assert.rejects(s.retime({...args,expectedRevision:retimed.revision,scenes:[{sceneId:'request',landmarks:[{at:.2,beat:1},{at:.3,beat:1}]}]}),/collapses/);
  assert.equal((await s.get({projectId:r.id})).revision,retimed.revision);
  await s.putScene({projectId:r.id,expectedRevision:retimed.revision,scene:record.document.scenes[0]});assert.equal((await s.get({projectId:r.id})).rhythm.dirty,true);
});

test('MCP previews constrain score frames and expose only generated artifacts inside the project',async t=>{
  const {s,root}=await service(t,{backend:{preview:async(score,source,frames)=>frames.map(frame=>({frame,stages:[],png:png()}))}}),r=await populated(s);
  await assert.rejects(s.preview({projectId:r.id,frames:[360]}),/within/);
  const preview=await s.preview({projectId:r.id,frames:[179.999,180],geometry:true});assert.equal(preview.images.length,2);assert.equal(preview.result.revision,2);
  const resource=await s.readArtifact(preview.result.images[0].uri);assert.equal(resource.mimeType,'image/png');assert.deepEqual(Buffer.from(resource.blob,'base64'),png());
  await writeFile(preview.result.images[0].path,Buffer.alloc(6*1024*1024+1));await assert.rejects(s.readArtifact(preview.result.images[0].uri),/inline resource limit/);
  const backend=s.backend;s.backend={preview:async()=>[{frame:0,stages:[],png:Buffer.alloc(4*1024*1024+1)}]};await assert.rejects(s.preview({projectId:r.id,frames:[0]}),/inline MCP budget/);s.backend=backend;
  await assert.rejects(s.readArtifact(`frameotion://artifact/${r.id}/revisions/1.json`),/not an exposed/);
  await assert.rejects(s.readArtifact(`frameotion://artifact/${r.id}/../../.env`));
  await assert.rejects(s.store.get('../escape'));
  const other=await populated(s),dir=await s.store.directory(other.id);await symlink(root,path.join(dir,'previews'),'dir');
  await assert.rejects(s.preview({projectId:other.id,frames:[0]}),/leaves project/);
});

test('MCP render queue snapshots revisions and cancels queued jobs without changing the active export',async t=>{
  let release,started;const began=new Promise(r=>{started=r;}),finish=new Promise(r=>{release=r;}),seen=[];
  const {s}=await service(t,{backend:{render:async(score,source,dir,{onProgress})=>{seen.push(score);started();await finish;onProgress(.7);await writeFile(path.join(dir,'video.mp4'),'fixture');return {video:path.join(dir,'video.mp4'),metadata:{frames:score.frames},issues:[]};}}}),r=await populated(s);
  const first=await s.startRender({projectId:r.id,scale:.1,blur:1});await began;
  await s.putScene({projectId:r.id,expectedRevision:2,scene:{...r.document.scenes[0],action:'New action'}});
  const second=await s.startRender({projectId:r.id});const cancelled=await s.cancelRender({projectId:r.id,jobId:second.jobId});assert.equal(cancelled.status,'cancelled');
  release();await Promise.all([...s.jobs.values()].map(e=>e.promise));
  const done=await s.renderStatus({projectId:r.id,jobId:first.jobId});assert.equal(done.status,'completed');assert.equal(done.revision,2);assert.equal(seen.length,1);assert.equal(seen[0].scenes[0].purpose,r.document.scenes[0].action);
  const restarted=await new EngineService({root:s.store.root,assetRoots:s.assetRoots}).init();t.after(()=>restarted.close());
  assert.equal((await restarted.renderStatus({projectId:r.id,jobId:first.jobId})).status,'completed');
  assert.equal((await restarted.get({projectId:r.id})).revision,3);
});

test('MCP render failures and cancellation persist and dead-owner jobs become interrupted',async t=>{
  const {s}=await service(t,{backend:{render:async()=>{throw Error('Encoder fixture failed');}}}),r=await populated(s),job=await s.startRender({projectId:r.id});
  await s.jobs.get(job.jobId).promise;const failed=await s.renderStatus({projectId:r.id,jobId:job.jobId});assert.equal(failed.status,'failed');assert.match(failed.error,/Encoder fixture/);
  const file=await s.store.file(r.id,`renders/${job.jobId}/job.json`);await atomicJSON(file,{...failed,status:'running',ownerPid:2147483647});s.jobs.delete(job.jobId);
  assert.equal((await s.renderStatus({projectId:r.id,jobId:job.jobId})).status,'interrupted');
  s.backend.render=async(score,source,dir,{signal})=>{signal.throwIfAborted();return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));};
  const active=await s.startRender({projectId:r.id});while(s.jobs.get(active.jobId).job.status==='queued')await new Promise(r=>setImmediate(r));
  assert.equal((await s.cancelRender({projectId:r.id,jobId:active.jobId})).status,'cancelled');
});

test('MCP imports only local raster assets from configured roots and attaches them to a revision',async t=>{
  const {s,root}=await service(t),r=await populated(s),file=path.join(root,'asset.png'),previous=process.env.KADR_BRAND_ASSETS;process.env.KADR_BRAND_ASSETS=path.join(root,'asset-library');
  t.after(()=>{if(previous===undefined)delete process.env.KADR_BRAND_ASSETS;else process.env.KADR_BRAND_ASSETS=previous;});await writeFile(file,png());
  await assert.rejects(s.importAsset({projectId:r.id,expectedRevision:2,file:'/etc/hosts',name:'outside'}),/outside/);
  const disguised=path.join(root,'disguised.png');await writeFile(disguised,'<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');await assert.rejects(s.importAsset({projectId:r.id,expectedRevision:2,file:disguised,name:'not raster'}),/Asset bytes must/);
  const imported=await s.importAsset({projectId:r.id,expectedRevision:2,file,name:'Local illustration'});assert.equal(imported.revision,3);assert.match(imported.asset.id,/^brand-[a-f0-9]{20}$/);
  assert.equal((await s.get({projectId:r.id})).assets.length,1);assert.equal((await s.get({projectId:r.id,revision:2})).assets.length,0);
  const scene=structuredClone(r.document.scenes[0]);scene.stage.nodes.push({id:'photo',kind:'image',assetId:imported.asset.id,x:100,y:100,w:100,h:100,start:0,end:1});await s.putScene({projectId:r.id,expectedRevision:3,scene});assert.equal((await s.validate({projectId:r.id})).ok,true);
  const meta=JSON.parse(await readFile(path.join(process.env.KADR_BRAND_ASSETS,imported.asset.id+'.json'),'utf8'));assert.match(meta.source,/^file:/);
});
