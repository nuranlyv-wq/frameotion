import fs from 'node:fs';
import path from 'node:path';
import {ROOT} from '../config.js';
export function resolveRuntime(){const font=path.join(ROOT,'assets/fonts/Inter/Inter_600SemiBold.ttf');if(!fs.existsSync(font))throw Error('Не найден шрифт Inter');return {font,version:'1.0.0'};}
export function runtimeStatus(){try{resolveRuntime();return {available:true,style:'saas-launch',version:'1.0.0'};}catch(e){return {available:false,message:e.message};}}
export function runtimeManifest(){return {provider:'KADR',engine:'kadr-launch',version:'1.0.0',font:'Bundled faces with per-run coverage audit (SIL OFL 1.1)',sound:'User ZIP recordings',vendorSourceBundled:false,nativeCraft:{version:1,fragments:['control','orbit-ring','focus-reel','hinge'],layout:'measured-ink-and-baselines',opticalMaterials:['glass','liquid-glass'],checks:['text-polygons','control-containment','cursor-contact','declared-handoffs']}};}
