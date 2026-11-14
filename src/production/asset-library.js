import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {ROOT} from '../config.js';
import {brandAssets,resolveBrandAsset} from './brand-assets.js';

export const motionAssetRoot=()=>path.resolve(process.env.KADR_MOTION_ASSETS||path.join(os.homedir(),'.framewright/assets'));
export const motionStyleRoot=()=>path.resolve(process.env.KADR_MOTION_STYLES||path.join(os.homedir(),'.framewright/styles'));
let cached,stamp;
export function motionAssets(){
 const file=path.join(ROOT,'library/motionsmith-assets.json');
 if(!fs.existsSync(file))return {packs:[],assets:[]};
 const m=fs.statSync(file).mtimeMs;if(m!==stamp){cached=JSON.parse(fs.readFileSync(file,'utf8'));stamp=m;}return cached;
}
export function resolveMotionAsset(id,catalog=motionAssets()){
 if(/^brand-[a-f0-9]{20}$/.test(id))return resolveBrandAsset(id);
 const a=catalog.assets.find(a=>a.id===id);if(!a||a.scope==='review-required')throw new Error(`Unavailable motion asset: ${id}`);
 const root=fs.realpathSync(motionAssetRoot()),file=fs.realpathSync(path.resolve(root,a.file));
 if(!file.startsWith(root+path.sep))throw new Error('Motion asset escaped its library');
 return {asset:a,file};
}
export function knownMotionAssets(){return [...motionAssets().assets,...brandAssets()];}
export function fontSupports(asset,text){const points=new Set(asset.codepoints||[]);return [...text].filter(c=>!/[\s\u200d\ufe0f]/u.test(c)).every(c=>points.has(c.codePointAt(0)));}

// Read numerical tokens from the subscriber's private install. No vendor guide, prompt
// or source implementation is copied into KADR or exposed by its HTTP API.
export function motionCurves(){
 const curves={};
 for(const style of ['saas-launch','vox']){
  const file=path.join(motionStyleRoot(),style,'v1/lib/techniques/tokens.js');
  if(!fs.existsSync(file))continue;
  const text=fs.readFileSync(file,'utf8'),block=text.match(/export const EZ\s*=\s*\{([\s\S]*?)\};/)?.[1]||'';
  for(const match of block.matchAll(/\b([a-z][a-z_]+)\s*:\s*\[([^\]]+)\]/g)){
   const values=match[2].split(',').map(Number);
   if(values.length===4&&values.every(Number.isFinite)&&values[0]>=0&&values[0]<=1&&values[2]>=0&&values[2]<=1)curves[`ms-${style}-${match[1].replaceAll('_','-')}`]=values;
  }
 }
 return curves;
}
function words(text){return new Set(text.toLowerCase().match(/[\p{L}\p{N}]+/gu)||[]);}
export function retrieveMotionAssets(query,{text='',limit=12,productAssets=[]}={}){
 query+=' '+(/бумаг|коллаж|архив/.test(query)?'paper archive collage':'')+' '+(/интерфейс|приложен|календар/.test(query)?'ui browser calendar app':'');
 const terms=words(query),catalog=motionAssets(),packs=new Map(catalog.packs.map(p=>[p.id,p]));
 const score=a=>{const tokens=words(a.name+' '+a.pack+' '+(packs.get(a.pack)?.description||''));return [...terms].reduce((s,t)=>s+(tokens.has(t)?1:0),0);};
 const available=catalog.assets.filter(a=>a.scope!=='review-required'&&fs.existsSync(path.join(motionAssetRoot(),a.file)));
 const fonts=available.filter(a=>a.kind==='font'&&fontSupports(a,text)).sort((a,b)=>score(b)-score(a)||a.id.localeCompare(b.id)).slice(0,6);
 const counts=new Map();
 const images=available.filter(a=>a.kind==='image'&&score(a)>0).sort((a,b)=>score(b)-score(a)||a.id.localeCompare(b.id)).filter(a=>{const n=counts.get(a.pack)||0;if(n>=3)return false;counts.set(a.pack,n+1);return true;}).slice(0,limit);
 const clean=a=>({id:a.id,kind:a.kind,name:a.name,pack:a.pack,...(a.family?{family:a.family,weight:a.weight}:{}),license:a.license});
 const brands=brandAssets().filter(a=>productAssets.some(p=>p.id===a.id));
 return {fonts:fonts.map(clean),images:[...brands.map(a=>({...clean(a),purpose:'original product logo; preserve its colors',width:a.width,height:a.height})),...images.map(clean)],curves:Object.keys(motionCurves())};
}
export function resolveRenderResources(timeline){
 const images={},fonts={},used=[],curves={},knownCurves=motionCurves();
 for(const n of timeline.world?.nodes||[]){
  for(const id of [n.assetId,n.fontId].filter(Boolean)){
   if(used.some(a=>a.id===id))continue;
   const {asset:a,file}=resolveMotionAsset(id),bytes=fs.readFileSync(file);
   if(crypto.createHash('sha256').update(bytes).digest('hex')!==a.sha256)throw new Error(`Motion asset changed: ${id}. Re-index the library.`);
   const ext=path.extname(file).slice(1).toLowerCase();
   const mime={svg:'image/svg+xml',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',ttf:'font/ttf',otf:'font/otf',woff:'font/woff',woff2:'font/woff2'}[ext];
   const data={src:`data:${mime};base64,${bytes.toString('base64')}`};
   if(a.kind==='font')fonts[id]={...data,family:`KadrAsset_${id.replaceAll('-','_')}`,weight:a.weight};else images[id]=data;
   used.push({id:a.id,pack:a.pack,sha256:a.sha256,license:a.license,scope:a.scope,...(a.source?{source:a.source,provider:a.provider}:{})});
  }
 }
 for(const k of [...(timeline.world?.camera||[]),...(timeline.world?.nodes||[]).flatMap(n=>n.keys)])if(k.curveId){if(!knownCurves[k.curveId])throw new Error(`Unavailable curve: ${k.curveId}`);curves[k.curveId]=knownCurves[k.curveId];}
 return {images,fonts,curves,manifest:{assets:used,curveIds:Object.keys(curves),provider:'MotionSmith',scope:'local-private-use',vendorSourceBundled:false}};
}
