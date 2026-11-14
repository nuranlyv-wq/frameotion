// Inspect the exact local preparation without contacting a model or starting a render.
import {parseArgs} from 'node:util';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {directorPreparation,preparationForModel} from '../src/craft/brief.js';
const {values}=parseArgs({options:{input:{type:'string'},brief:{type:'string'},description:{type:'string'},language:{type:'string',default:'ru'},studio:{type:'string',default:'motion'},output:{type:'string'}}});
if(!values.input&&!values.brief&&!values.description)throw Error('Use --input request.json or --brief "...". This command uses no API.');
const input=values.input?JSON.parse(await readFile(values.input,'utf8')):{brief:values.brief??'',description:values.description??'',language:values.language,studio:values.studio};
const prepared=directorPreparation(input),model=preparationForModel(prepared),artifact={...prepared,packetBytes:Buffer.byteLength(JSON.stringify(model)),packetCharacters:JSON.stringify(model).length};
if(values.output){const file=path.resolve(values.output);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(artifact,null,2)+'\n');console.log(JSON.stringify({file,fragments:prepared.knowledge.fragments.map(f=>f.id),packetBytes:artifact.packetBytes,modelCalls:0}));}
else console.log(JSON.stringify(artifact,null,2));
