import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {ROOT} from '../config.js';
import {registerBrandAsset} from './brand-assets.js';

const root=path.join(ROOT,'assets/service-icons');
export function serviceCatalogue() {
  try {
    const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
    return manifest.services.filter(item=>/^[a-z0-9-]+$/u.test(item.slug) && item.file===item.slug+'.svg' &&
      Array.isArray(item.aliases) && item.aliases.every(alias=>typeof alias==='string') &&
      fs.existsSync(path.join(root,item.file)) &&
      crypto.createHash('sha256').update(fs.readFileSync(path.join(root,item.file))).digest('hex')===item.sha256);
  } catch { return []; }
}
const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
export function mentionedServices(evidence,catalogue=serviceCatalogue()) {
  return catalogue.flatMap(service=>{
    const pattern=new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:${[service.name,...service.aliases].map(escape).join('|')})(?=$|[^\\p{L}\\p{N}])`,'iu');
    const match=evidence.find(item=>{
      if (!pattern.test(item.text)) return false;
      // Common motion words must not turn into unrelated software brands.
      if (service.slug==='make') return /make\.com|(?:интеграц|автоматизац|сервис|workflow|automation|integrat|n8n|zapier)/iu.test(item.text);
      if (service.slug==='linear') return /Linear(?!\s+(?:gradient|easing|motion))|linear\.app/u.test(item.text);
      if (service.slug==='zoom') return /Zoom(?!\s+(?:in|out|into|through))|zoom\.us/u.test(item.text);
      return true;
    });
    return match?[{...service,evidenceId:match.id}]:[];
  });
}
export async function enrichServiceAssets(source) {
  for (const service of mentionedServices(source.evidence).slice(0,12)) {
    if (source.assets.some(asset=>asset.service===service.slug)) continue;
    const asset=await registerBrandAsset({file:path.join(root,service.file),source:service.source,name:service.name,kind:'illustration'});
    source.assets.push({...asset,name:service.name,caption:`Recognisable ${service.name} mark`,role:'service-logo',
      service:service.slug,evidenceId:service.evidenceId,width:512,height:512});
  }
  return source;
}
