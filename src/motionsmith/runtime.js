import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { motionStyleRoot, motionAssetRoot } from '../production/asset-library.js';

export const STYLE_FILES=['core.js','draw.js',...['tokens','match-morph-chain','hero-word-rise','word-blur-in','camera-ride','pill-toggle','logo-resolve','living-background'].map(n=>`techniques/${n}.js`)];
export function resolveRuntime(){
  const engine=path.resolve(process.env.KADR_MOTIONSMITH_ENGINE||path.join(os.homedir(),'.framewright/engines/motion-video-director/3.7.0/motion-video-director'));
  const style=path.join(motionStyleRoot(),'saas-launch/v1/lib');
  const fonts=path.join(motionAssetRoot(),'font-onest/v2');
  const findFont=dir=>fs.existsSync(dir)?fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?findFont(path.join(dir,e.name)):/\.ttf$/i.test(e.name)?[path.join(dir,e.name)]:[]):[];
  const font=findFont(fonts).find(f=>/Onest.*wght/.test(f))||findFont(fonts)[0];
  const files=[...STYLE_FILES.map(f=>path.join(style,f)),path.join(engine,'templates/render/gpu.js'),path.join(engine,'LICENSE.md')];
  const missing=files.filter(f=>!fs.existsSync(f));if(!font)missing.push('Onest font pack v2');
  if(missing.length)throw new Error('Движок MotionSmith не установлен полностью. Нужны motion-video-director 3.7.0, saas-launch v1 и font-onest v2 через MotionSmith.');
  return {engine,style,font,files,version:'3.7.0'};
}
export function runtimeStatus(){try{const r=resolveRuntime();return {available:true,style:'saas-launch',version:r.version,scope:'local-private-use'};}catch(e){return {available:false,message:e.message};}}
export function runtimeManifest(r){return {provider:'MotionSmith',engine:'motion-video-director',version:r.version,style:'saas-launch',scope:'local-private-use',vendorSourceBundled:false,
  files:r.files.map(f=>({name:f.startsWith(r.style)?`saas-launch/${path.relative(r.style,f)}`:path.relative(r.engine,f),sha256:crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')}))};}
