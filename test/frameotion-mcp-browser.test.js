import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdir,writeFile,readFile,stat} from 'node:fs/promises';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {connectedExample} from '../src/mcp/example.js';

const repo=fileURLToPath(new URL('../',import.meta.url)),root=process.env.FRAMEOTION_MCP_TEST_ARTIFACTS||path.join(repo,'runs/mcp-local-qa-20261113');
const enabled=process.env.KADR_BROWSER_TESTS==='1'||process.env.FRAMEOTION_MCP_BROWSER_TESTS==='1';
async function connect(){
  const transport=new StdioClientTransport({command:process.execPath,args:[path.join(repo,'scripts/frameotion-mcp.mjs')],cwd:repo,stderr:'pipe',env:{...process.env,FRAMEOTION_MCP_DATA_DIR:path.join(root,'projects'),FRAMEOTION_MCP_ASSET_ROOTS:root,KADR_BRAND_ASSETS:path.join(root,'asset-library'),ANTHROPIC_API_KEY:'offline-sentinel-must-be-cleared'}});
  let stderr='';transport.stderr.on('data',d=>{stderr+=d.toString();});
  const client=new Client({name:'frameotion-offline-integration',version:'1.0.0'});await client.connect(transport);return {client,stderr:()=>stderr};
}
async function call(client,name,args={}){const result=await client.callTool({name,arguments:args},undefined,{timeout:120000});assert.ok(!result.isError,JSON.stringify(result));return result;}

test('real stdio MCP client authors, previews, repairs, audits and renders locally without an internal director', {skip:!enabled,timeout:180000},async t=>{
  await mkdir(root,{recursive:true});let {client,stderr}=await connect();t.after(()=>client.close());
  const info=(await call(client,'engine_info')).structuredContent;assert.equal(info.internalDirector,false);assert.equal(info.network,'local-only');
  const discovery=await client.listTools();assert.equal(discovery.tools.length,16);
  const schema=JSON.parse((await client.readResource({uri:'frameotion://schema/project'})).contents[0].text);assert.equal(schema.properties.scenes.items.properties.stage.properties.nodes.maxItems,96);
  const example=JSON.parse((await client.readResource({uri:'frameotion://example/connected-project'})).contents[0].text);assert.equal(example.scenes.length,2);
  const prepared=(await call(client,'prepare_brief',{brief:'Одна задача переходит в готовый результат',language:'ru'})).structuredContent;assert.equal(prepared.modelCalls,0);
  const created=(await call(client,'create_project',{name:'Offline MCP integration',width:320,height:320,fps:30})).structuredContent.project,id=created.id;
  const document=connectedExample(320,320);let revision=created.revision;
  for(const scene of document.scenes){revision=(await call(client,'put_scene',{projectId:id,expectedRevision:revision,scene})).structuredContent.revision;}
  const valid=(await call(client,'validate_project',{projectId:id})).structuredContent;assert.equal(valid.ok,true);assert.equal(valid.modelCalls,0);
  const before=await call(client,'preview_frames',{projectId:id,frames:[144,179.999,180,270],scale:1,blur:1,geometry:true});
  const images=before.content.filter(c=>c.type==='image');assert.equal(images.length,4);assert.ok(images.every(i=>Buffer.from(i.data,'base64').subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))));
  assert.equal(images[1].data,images[2].data,'actual seam pixels must remain identical');
  const resource=await client.readResource({uri:before.structuredContent.images[0].uri});assert.equal(resource.contents[0].blob,images[0].data);
  await writeFile(path.join(root,'before-repair.png'),Buffer.from(images[0].data,'base64'));await writeFile(path.join(root,'receipt.png'),Buffer.from(images[3].data,'base64'));
  // Change one visible native word through MCP, leaving the neighbouring scene and old revision intact.
  const repaired=structuredClone(document.scenes[0]);repaired.stage.nodes.find(n=>n.id==='title').text='Clear idea';
  revision=(await call(client,'put_scene',{projectId:id,expectedRevision:revision,scene:repaired})).structuredContent.revision;
  const after=await call(client,'preview_frames',{projectId:id,frames:[144],scale:1,blur:1});assert.notEqual(after.content.find(c=>c.type==='image').data,images[0].data);
  await writeFile(path.join(root,'after-repair.png'),Buffer.from(after.content.find(c=>c.type==='image').data,'base64'));
  const old=(await call(client,'get_project',{projectId:id,revision:3,sceneId:'request'})).structuredContent;assert.equal(old.scene.stage.nodes.find(n=>n.id==='title').text,'One idea');
  const stale=await client.callTool({name:'put_scene',arguments:{projectId:id,expectedRevision:3,scene:repaired}});assert.equal(stale.isError,true);assert.match(stale.content[0].text,/Revision conflict/);
  const audit=(await call(client,'audit_project',{projectId:id,scale:1,blur:1})).structuredContent;assert.deepEqual(audit.review.issues,[]);assert.deepEqual(audit.review.composition.issues,[]);assert.equal(audit.modelCalls,0);
  const started=(await call(client,'start_render',{projectId:id,scale:1,blur:1})).structuredContent;
  let status;
  for(let i=0;i<600;i++){
    status=(await call(client,'render_status',{projectId:id,jobId:started.jobId})).structuredContent;
    if(['completed','failed','cancelled'].includes(status.status))break;
    await new Promise(r=>setTimeout(r,100));
  }
  assert.equal(status.status,'completed',JSON.stringify(status));assert.equal(status.revision,revision);assert.equal(status.metadata.frames,360);assert.equal(status.metadata.fps,30);assert.ok((await stat(status.video.path)).size>1000);assert.equal(status.modelCalls,0);
  const mp4=await client.readResource({uri:status.video.uri});assert.equal(mp4.contents[0].mimeType,'video/mp4');assert.ok(Buffer.from(mp4.contents[0].blob,'base64').includes(Buffer.from('ftyp')));
  const cancelling=(await call(client,'start_render',{projectId:id,scale:.5,blur:1})).structuredContent;
  const cancelled=(await call(client,'cancel_render',{projectId:id,jobId:cancelling.jobId})).structuredContent;assert.equal(cancelled.status,'cancelled');assert.ok((await stat(status.video.path)).size>1000);
  const firstStderr=stderr();await client.close();({client,stderr}=await connect());
  const resumed=(await call(client,'render_status',{projectId:id,jobId:started.jobId})).structuredContent;assert.equal(resumed.status,'completed');assert.equal(resumed.video.path,status.video.path);
  const recovered=(await call(client,'get_project',{projectId:id})).structuredContent;assert.equal(recovered.revision,revision);assert.ok(recovered.renderIds.includes(started.jobId));
  assert.equal(firstStderr+stderr(),'','No protocol pollution, API retries or process errors');
  const report={date:'2026-11-13',transport:'official SDK stdio client/server',projectId:id,revision,jobId:started.jobId,tools:discovery.tools.length,internalDirector:false,modelCalls:0,externalNetwork:'Blocked by entry-point preload and offline test runner',seamPixelsIdentical:true,previewRepairChangedPixels:true,issues:audit.review.issues,compositionIssues:audit.review.composition.issues,render:status,readableMp4Resource:true,cancelledSecondRender:cancelled.status,persistenceAfterReconnect:true,artistic:'Authored diagnostic fixture; semantic and creative review remain separate'};
  await writeFile(path.join(root,'mcp-browser-report.json'),JSON.stringify(report,null,2)+'\n');
});
