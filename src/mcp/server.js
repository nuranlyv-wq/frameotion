import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {ListToolsRequestSchema,CallToolRequestSchema,ListResourcesRequestSchema,ReadResourceRequestSchema,ListPromptsRequestSchema,GetPromptRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import {EngineService} from './service.js';
import {ENGINE_GUIDE,ProjectSchema,PaletteSchema,EvidenceSchema,SceneSchema,object,string,integer,number,array,choice,projectId,sceneId,assertSchema} from './contract.js';
import {StageSchema} from '../kadr-launch/stage-contract.js';
import {directorPreparation} from '../craft/brief.js';
import {connectedExample} from './example.js';

const revision=integer(1,1e9),selected={projectId},version={revision};
const renderOptions={scale:number(.1,1),blur:integer(1,16)};
const json=value=>({content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value});
const annotations=readOnly=>({readOnlyHint:readOnly,destructiveHint:false,idempotentHint:readOnly,openWorldHint:false});
const tool=(name,description,inputSchema,readOnly=false)=>({name,description,inputSchema,annotations:annotations(readOnly)});

export const TOOLS=[
  tool('engine_info','Get local engine capabilities, authoring workflow, schema and example resource URIs. No model calls.',object(),true),
  tool('search_craft','Search the local motion craft library for relevant construction fragments. No embeddings or model calls.',object({query:string(2000)},{limit:integer(1,6),maxChars:integer(500,6200)}),true),
  tool('prepare_brief','Prepare a constraint-preserving brief locally. The connected AI remains the director.',object({brief:string(8000)},{language:string(20)}),true),
  tool('create_project','Create an empty editable local project. Add native scene graphs with put_scene; the internal director is never called.',object({name:string(64)},{brief:string(8000,0),language:string(20),width:integer(320,1920),height:integer(320,1920),fps:choice(24,30),pace:choice('calm','dynamic','superdynamic'),palette:PaletteSchema,fonts:array(string(64),5,1),evidence:EvidenceSchema})),
  tool('list_projects','List projects owned by this MCP data directory.',object({}, {limit:integer(1,100)}),true),
  tool('get_project','Read a project revision, or one named scene. Includes render IDs. Source assets are managed by import_asset.',object(selected,{...version,sceneId}),true),
  tool('update_project','Replace the editable project document atomically with revision protection. Prior revisions and renders remain intact. Allows draft scenes.',object({projectId,expectedRevision:revision,document:ProjectSchema})),
  tool('put_scene','Insert or replace one native scene, optionally moving it to index. Times are normalized 0..1 inside a scene; durationFrames is in score frames. Requires current revision.',object({projectId,expectedRevision:revision,scene:SceneSchema},{index:integer(0,11)})),
  tool('retime_project','Align explicit scene landmarks to a supplied measured beat grid. Retimes camera, actors, contacts, control windows, orbit and sound together. Does not analyze or upload audio; validates the whole result and saves a new revision.',object({projectId,expectedRevision:revision,beats:array(number(0,3600),1024,2),confidence:number(.3,1),scenes:array(object({sceneId,landmarks:array(object({at:number(0,1),beat:number(0,1023)}),62,1)}),12,1)})),
  tool('import_asset','Import a supplied local PNG/JPEG/WebP from configured asset roots and attach its immutable raster ID to this project. No URL fetching.',object({projectId,expectedRevision:revision,file:string(4096),name:string(64)},{kind:choice('logo','illustration','screenshot')})),
  tool('validate_project','Compile and validate schema, references, timing and declared scene handoffs without rendering or model calls. Reports errors for repair.',object(selected,version),true),
  tool('preview_frames','Return actual browser-painted PNG frames and optional projected geometry. Frame numbers are score frames, may be fractional, and must be within the film. Saves local evidence.',object(selected,{...version,...renderOptions,frames:array(number(0,1799.999),8,1),geometry:{type:'boolean'}})),
  tool('audit_project','Audit all frames in the actual local browser renderer: text, control placement, collisions and motion. Returns adjacent story actions for YOUR semantic review, without calling a director.',object(selected,{...version,...renderOptions})),
  tool('start_render','Snapshot a revision and queue a local MP4 export. Returns immediately with a job ID. Poll render_status; no internal director or paid API calls.',object(selected,{...version,...renderOptions})),
  tool('render_status','Read progress/result of a local render, including video artifact URI and absolute file path. Completed jobs persist across MCP restarts.',object({projectId,jobId:projectId}),true),
  tool('cancel_render','Cancel a queued or running render owned by this MCP process; completed exports remain intact.',object({projectId,jobId:projectId})),
];
export const RESOURCES=[
  {uri:'frameotion://guide',name:'Native engine authoring guide',mimeType:'text/plain'},
  {uri:'frameotion://schema/project',name:'Editable project JSON Schema',mimeType:'application/json'},
  {uri:'frameotion://schema/stage',name:'Native scene graph JSON Schema',mimeType:'application/json'},
  {uri:'frameotion://example/connected-project',name:'Editable connected project construction example',mimeType:'application/json'},
];
export async function createEngineMcpServer(options={}){
  const service=await new EngineService(options).init();
  // The low-level SDK preserves our existing JSON Schemas exactly, without a second schema dialect.
  const server=new Server({name:'frameotion-local',version:'0.1.0'},{capabilities:{tools:{},resources:{},prompts:{}},instructions:'Frameotion local native motion engine. You are the director: read frameotion://guide, search craft, author native scene data, preview real PNGs, audit, repair, render. Internal model calls and external networking are disabled. Each next scene must develop the previous action or result. Geometry is not proof of semantic coherence.'});
  server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:TOOLS}));
  server.setRequestHandler(ListResourcesRequestSchema,async()=>({resources:RESOURCES}));
  server.setRequestHandler(ReadResourceRequestSchema,async({params:{uri}})=>{
    if(uri==='frameotion://guide')return {contents:[{uri,mimeType:'text/plain',text:ENGINE_GUIDE}]};
    const value=uri==='frameotion://schema/project'?ProjectSchema:uri==='frameotion://schema/stage'?StageSchema:uri==='frameotion://example/connected-project'?connectedExample():undefined;
    if(value)return {contents:[{uri,mimeType:'application/json',text:JSON.stringify(value)}]};
    return {contents:[await service.readArtifact(uri)]};
  });
  server.setRequestHandler(ListPromptsRequestSchema,async()=>({prompts:[{name:'direct_motion_video',description:'Direct a native Frameotion film in this AI client, without the internal director.',arguments:[{name:'brief',description:'The user’s original instructions',required:true}]}]}));
  server.setRequestHandler(GetPromptRequestSchema,async({params})=>{
    if(params.name!=='direct_motion_video')throw Error('Unknown prompt');const brief=params.arguments?.brief;if(typeof brief!=='string'||!brief.trim()||brief.length>8000)throw Error('A brief of 1..8000 characters is required');
    return {description:'Local Frameotion directing workflow',messages:[{role:'user',content:{type:'text',text:ENGINE_GUIDE+'\n\nOriginal user request (binding):\n'+brief}}]};
  });
  server.setRequestHandler(CallToolRequestSchema,async({params},extra)=>{
    try{
      const definition=TOOLS.find(t=>t.name===params.name);if(!definition)throw Error('Unknown engine tool: '+params.name);const args=params.arguments??{};assertSchema(definition.inputSchema,args);extra.signal?.throwIfAborted();
      switch(params.name){
        case 'engine_info':return json({name:'Frameotion',transport:'stdio',internalDirector:false,modelCalls:0,network:'local-only',dataDirectory:service.store.root,assetRoots:service.assetRoots,resources:RESOURCES,workflow:['search_craft','create_project','put_scene','validate_project','preview_frames','audit_project','put_scene','start_render','render_status'],limits:{scenes:12,nodesPerScene:96,scoreFrames:[360,1800],fps:[24,30],previewFrames:8,inlinePreviewPngBytes:4*1024*1024,inlineResourceBytes:6*1024*1024,queuedHeavyOperations:8},instructions:ENGINE_GUIDE});
        case 'search_craft':return json(service.search(args));
        case 'prepare_brief':return json(directorPreparation({...args,studio:'motion'}));
        case 'create_project':return json(await service.create(args));
        case 'list_projects':return json({projects:await service.store.list(args.limit)});
        case 'get_project':return json(await service.get(args));
        case 'update_project':return json(await service.update(args));
        case 'put_scene':return json(await service.putScene(args));
        case 'retime_project':return json(await service.retime(args));
        case 'import_asset':return json(await service.importAsset(args));
        case 'validate_project':return json(await service.validate(args));
        case 'preview_frames':{const preview=await service.preview(args,extra.signal),result=json(preview.result);result.content.push(...preview.images.map(bytes=>({type:'image',data:bytes.toString('base64'),mimeType:'image/png'})));return result;}
        case 'audit_project':return json(await service.audit(args,extra.signal));
        case 'start_render':return json(await service.startRender(args));
        case 'render_status':{const job=await service.renderStatus(args),result=json(job);if(job.video)result.content.push({type:'resource_link',uri:job.video.uri,name:'Frameotion MP4',mimeType:'video/mp4',description:'Local video: '+job.video.path});return result;}
        case 'cancel_render':return json(await service.cancelRender(args));
      }
    }catch(error){return {isError:true,content:[{type:'text',text:error.message}],structuredContent:{error:error.message}};}
  });
  server.onclose=()=>{service.close().catch(error=>console.error('Frameotion MCP shutdown:',error.message));};
  return {server,service};
}
