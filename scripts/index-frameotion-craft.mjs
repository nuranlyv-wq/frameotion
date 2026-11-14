import {mkdir,writeFile} from 'node:fs/promises';
import {buildCraftIndex} from '../src/craft/retrieval.js';
const file=new URL('../library/frameotion-craft-index.json',import.meta.url),index=buildCraftIndex();
await mkdir(new URL('../library/',import.meta.url),{recursive:true});
await writeFile(file,JSON.stringify(index,null,2)+'\n');
console.log(JSON.stringify({file:file.pathname,documents:index.docs.length,sourceHash:index.sourceHash,apiCalls:0}));
