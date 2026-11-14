import {readFile,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {applyDirectedPatch} from './motion-patch.js';
const hash=data=>crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
export async function writeGenerationProof(dir,report){
 const read=async name=>JSON.parse(await readFile(path.join(dir,name),'utf8'));
 report ||= await read('report.json');
 const motion=await read('motion-timeline.json');
 const allFiles=await readdir(dir);
 const fingerprint=hash(motion),files=allFiles.filter(n=>/^model-response-motion-\d+-\d+\.json$/.test(n)).sort();
 let matched=null;
 const verified=new Set(),patchResponses=new Map(),patchChain=[];
 for(const file of files){const response=await read(file);if(response.output)verified.add(hash(response.output));if(hash(response.output)===fingerprint)matched={file,model:response.model,outputHash:response.outputHash};}
 for(const file of allFiles.filter(n=>/^model-response-motion-patch-\d+-\d+\.json$/.test(n))){const r=await read(file);if(r.output)patchResponses.set(hash(r.output),{file,model:r.model});}
 for(const file of allFiles.filter(n=>/^applied-motion-patch-\d+\.json$/.test(n)).sort()){
  const p=await read(file),response=patchResponses.get(hash(p.patch));
  if(!response||!verified.has(hash(p.base)))continue;
  let result;try{result=hash(applyDirectedPatch(p.base,p.patch));}catch{continue;}
  if(result!==p.resultHash)continue;verified.add(result);patchChain.push({record:file,response,...{baseHash:hash(p.base),resultHash:result}});
 }
 const video=report.video||report.draft;
 const mediaDir=video?path.dirname(video):'.';
 const cues=await read(path.join(mediaDir,'sound-cues.json')).catch(()=>[]);
 const rendered=await read(path.join(mediaDir,'render-metadata.json')).catch(()=>null);
 const website=report.modelMode==='website'?await read('source.json'):null;
 const result={version:1,modelMode:report.modelMode,motionMode:website?'website':motion.world?'cinematic':'ui',
  exactModelOutput:Boolean(matched),directorResponse:matched,motionHash:fingerprint,
  verifiedModelDerivation:verified.has(fingerprint),patchChain,
  video:video||null,renderedScoreMatches:rendered?.motionHash===fingerprint,
  usesFixedFilmRecipe:Boolean(motion.choreography),actorCount:motion.world?.nodes.length||0,
  soundAssets:[...new Set(cues.filter(c=>c.assetId).map(c=>c.assetId))],soundEvents:cues.length,
  ...(website?{sourceUrl:website.url,websiteReference:website.reference,websiteLayers:website.layers.map(layer=>({role:layer.role,assetId:layer.asset.id,capture:layer.capture,box:layer.box,...(layer.sourceUrl?{sourceUrl:layer.sourceUrl}:{}),...(layer.destination?{destination:layer.destination}:{})}))}:{}),
  cost:report.cost,limitations:website?'The website layers are captured from the page. The local director animates their placement and timing.':'Response hash verifies the saved score matches a model response. It is not a subjective quality rating.'};
 await writeFile(path.join(dir,'generation-proof.json'),JSON.stringify(result,null,2));return result;
}
