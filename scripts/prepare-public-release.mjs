// Explicit allowlist: never copy the working directory wholesale.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const out=path.join(root,'release/frameotion');
try {await fs.access(out);throw Error('Release directory exists; inspect or move it before preparing another release.');} catch(e){if(e.code!=='ENOENT')throw e;}
await fs.mkdir(out,{recursive:true});
const entries=['src','test/frameotion-mcp.test.js','test/frameotion-mcp-browser.test.js','remotion','assets/fonts','library/open-motion','library/NOTICE.md','library/frameotion-craft-index.json','library/motion-reference-index.json','library/motionsmith-effects.json','README.md','LICENSE','CONTRIBUTING.md','SECURITY.md','THIRD_PARTY_NOTICES.md','package.json','package-lock.json','.env.example','.github','public/connect.html','public/connect.js','public/frameotion-mark.svg','public/fonts'];
const scripts=['frameotion-mcp.mjs','frameotion-mcp-config.mjs','offline-network-guard.cjs','test-offline.mjs','index-frameotion-craft.mjs','prepare-frameotion-brief.mjs','prepare-public-release.mjs'];
for(const entry of [...entries,...scripts.map(s=>'scripts/'+s),'docs/frameotion-local-mcp.md','docs/LAUNCH.md']){
 await fs.mkdir(path.dirname(path.join(out,entry)),{recursive:true});
 await fs.cp(path.join(root,entry),path.join(out,entry),{recursive:true,filter:src=>!src.split(path.sep).some(p=>['node_modules','.git'].includes(p))});
}
// Studio source ships without private/client media. The local MCP is the supported release path.
for(const name of await fs.readdir(path.join(root,'public')))if(/\.(html|js|css|svg)$/.test(name))await fs.copyFile(path.join(root,'public',name),path.join(out,'public',name));
await fs.writeFile(path.join(out,'.gitignore'),'node_modules/\n.env\n.env.*\n!.env.example\nruns/\n.account-data/\nrelease/\n.DS_Store\n');
await fs.writeFile(path.join(out,'library/motionsmith-assets.json'),JSON.stringify({version:1,assets:[],curves:[]}));
await fs.writeFile(path.join(out,'library/sound-library.json'),JSON.stringify({version:1,sounds:[]}));
let guide=await fs.readFile(path.join(out,'docs/frameotion-local-mcp.md'),'utf8');
guide=guide.replaceAll('/Users/nuranlyv/motionvideos','/absolute/path/to/frameotion');
guide=guide.replace(/\[Результаты полного локального прогона\][\s\S]*$/,'');
guide=guide.replace(/Готовый конфиг для клиента[^\n]+/,'Создайте конфиг для установленной копии командой ниже или откройте `/connect.html` после `npm start`.');
await fs.writeFile(path.join(out,'docs/frameotion-local-mcp.md'),guide);
const pkg=JSON.parse(await fs.readFile(path.join(out,'package.json'),'utf8'));
pkg.description='Editable local motion video engine for MCP clients';
pkg.scripts=Object.fromEntries(Object.entries(pkg.scripts).filter(([name])=>['start','mcp','mcp:config','test','test:offline','craft:index','craft:prepare','release:prepare'].includes(name)));
await fs.writeFile(path.join(out,'package.json'),JSON.stringify(pkg,null,2)+'\n');
await fs.copyFile(path.join(out,'public/connect.html'),path.join(out,'public/index.html'));
await fs.appendFile(path.join(out,'THIRD_PARTY_NOTICES.md'),'\nThe public source export excludes service-icon assets, client media and private sound packs. Referenced optional assets must be supplied separately under appropriate terms.\n');
console.log('Prepared '+out+'\nReview before publishing. Excludes private media, credentials, account data, vendor trees and model weights.');
