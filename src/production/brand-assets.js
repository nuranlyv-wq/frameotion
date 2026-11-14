import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {ROOT} from '../config.js';

export const brandAssetRoot=()=>path.resolve(process.env.KADR_BRAND_ASSETS||path.join(ROOT,'assets/imported-brands'));
export function brandAssets(){
 const root=brandAssetRoot();if(!fs.existsSync(root))return [];
 return fs.readdirSync(root).filter(f=>/^brand-[a-f0-9]{20}\.json$/.test(f)).flatMap(f=>{
  try{const a=JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
   return a.id===f.slice(0,-5)&&a.provider==='product-source'&&a.kind==='image'&&a.file===a.id+'.png'?[a]:[];
  }catch{return [];}
 });
}
export function resolveBrandAsset(id){
 const asset=brandAssets().find(a=>a.id===id);if(!asset)throw new Error(`Unavailable brand asset: ${id}`);
 const root=fs.realpathSync(brandAssetRoot()),file=fs.realpathSync(path.join(root,asset.file));
 if(!file.startsWith(root+path.sep))throw new Error('Brand asset escaped its library');
 return {asset,file};
}

// Publicly imported images become immutable local raster assets. The renderer never
// executes source SVG markup or follows URLs from an AI-generated film.
export async function registerBrandAsset({file,source,name,kind='logo'}){
 const sourceURL=new URL(source);if(!['http:','https:'].includes(sourceURL.protocol)||sourceURL.username||sourceURL.password)throw new Error('Invalid brand source');
 const bytes=fs.readFileSync(file);if(bytes.length>(['screenshot','illustration'].includes(kind)?8:2)*1024*1024)throw new Error('Brand asset too large');
 const img=await loadImage(bytes);
 if(!img.width||!img.height||img.width*img.height>16e6)throw new Error('Invalid brand dimensions');
 const scale=Math.min(1,1600/Math.max(img.width,img.height)),canvas=createCanvas(Math.max(1,Math.round(img.width*scale)),Math.max(1,Math.round(img.height*scale)));
 canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
 const raster=canvas.toBuffer('image/png'),sha256=crypto.createHash('sha256').update(raster).digest('hex');
 const identity=kind==='logo'?sha256:crypto.createHash('sha256').update(sourceURL.href+'\0'+name+'\0'+sha256).digest('hex');
 const id='brand-'+identity.slice(0,20);
 const asset={id,name:kind==='logo'?name+' logo':name,kind:'image',provider:'product-source',pack:kind==='logo'?'product-brand':'website-capture',file:id+'.png',source:sourceURL.toString(),sha256,
  sourceSha256:crypto.createHash('sha256').update(bytes).digest('hex'),width:canvas.width,height:canvas.height,
  license:'Brand asset for the requested product film',scope:'local-video-only'};
 const root=brandAssetRoot();fs.mkdirSync(root,{recursive:true});
 if(!fs.existsSync(path.join(root,asset.file)))fs.writeFileSync(path.join(root,asset.file),raster,{flag:'wx'});
 fs.writeFileSync(path.join(root,id+'.json'),JSON.stringify(asset,null,2));
 return {id,kind,source:asset.source};
}
