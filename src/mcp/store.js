import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,rename,realpath,open,rm,readdir} from 'node:fs/promises';
import {assertSchema,assertDocument,projectId} from './contract.js';

export const alive=pid=>{try{process.kill(pid,0);return true;}catch(e){return e.code==='EPERM';}};
export async function atomicJSON(file,value){const temp=file+'.'+randomUUID()+'.tmp';try{await writeFile(temp,JSON.stringify(value,null,2)+'\n',{flag:'wx'});await rename(temp,file);}finally{await rm(temp,{force:true});}}
export class ProjectStore{
  constructor(root){this.root=path.resolve(root);}
  async init(){await mkdir(this.root,{recursive:true});this.root=await realpath(this.root);return this;}
  async directory(id){assertSchema(projectId,id);const dir=await realpath(path.join(this.root,id));if(path.dirname(dir)!==this.root)throw Error('Project directory leaves MCP data root');return dir;}
  async create(document){
    assertDocument(document);const id=randomUUID(),dir=path.join(this.root,id);await mkdir(path.join(dir,'revisions'),{recursive:true});
    const record={id,revision:1,createdAt:new Date().toISOString(),document,assets:[]};
    await writeFile(path.join(dir,'revisions','1.json'),JSON.stringify(record,null,2)+'\n',{flag:'wx'});await atomicJSON(path.join(dir,'head.json'),{revision:1});return record;
  }
  async get(id,revision){const dir=await this.directory(id);if(revision===undefined)revision=JSON.parse(await readFile(path.join(dir,'head.json'),'utf8')).revision;if(!Number.isSafeInteger(revision)||revision<1)throw Error('Invalid project revision');const record=JSON.parse(await readFile(path.join(dir,'revisions',revision+'.json'),'utf8'));if(record.id!==id||record.revision!==revision)throw Error('Invalid stored revision');return record;}
  async mutate(id,expectedRevision,change){
    const dir=await this.directory(id),lock=path.join(dir,'.write-lock');let handle;
    try{handle=await open(lock,'wx');}catch(e){
      if(e.code!=='EEXIST')throw e;
      let owner;try{owner=JSON.parse(await readFile(lock,'utf8')).pid;}catch{throw Error('Project is busy; retry after reading its latest revision');}
      if(!Number.isSafeInteger(owner)||alive(owner))throw Error('Project is busy; retry after reading its latest revision');
      await rm(lock,{force:true});handle=await open(lock,'wx');
    }
    try{
      await handle.writeFile(JSON.stringify({pid:process.pid}));
      const previous=await this.get(id);if(previous.revision!==expectedRevision)throw Error(`Revision conflict: expected ${expectedRevision}, current ${previous.revision}. Read the project again.`);
      const record=structuredClone(previous);await change(record);assertDocument(record.document);record.revision++;record.updatedAt=new Date().toISOString();
      // A previous crash may have left this uncommitted snapshot. The lock owns recovery.
      await atomicJSON(path.join(dir,'revisions',record.revision+'.json'),record);await atomicJSON(path.join(dir,'head.json'),{revision:record.revision});return record;
    }finally{await handle.close();await rm(lock,{force:true});}
  }
  async list(limit=30){const ids=(await readdir(this.root)).filter(id=>new RegExp(projectId.pattern).test(id));const records=[];for(const id of ids){const r=await this.get(id);records.push({projectId:id,revision:r.revision,name:r.document.name,language:r.document.language,scenes:r.document.scenes.length,updatedAt:r.updatedAt??r.createdAt});}return records.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,limit);}
  async file(id,relative){const dir=await this.directory(id),file=await realpath(path.join(dir,relative));if(!file.startsWith(dir+path.sep))throw Error('Artifact leaves project directory');return file;}
  async outputDirectory(id,...segments){
    const root=await this.directory(id);let current=root;
    for(const segment of segments){if(!/^[a-zA-Z0-9_-]+$/.test(segment))throw Error('Invalid output directory');current=path.join(current,segment);try{await mkdir(current);}catch(e){if(e.code!=='EEXIST')throw e;}current=await realpath(current);if(!current.startsWith(root+path.sep))throw Error('Output directory leaves project directory');}
    return current;
  }
}
