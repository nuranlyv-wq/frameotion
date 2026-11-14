import path from 'node:path';
import {createCanvas,GlobalFonts} from '@napi-rs/canvas';
import * as fontkit from 'fontkit';
import {ROOT} from '../config.js';
import {layoutStageTypography} from './stage-typography.js';

const loaded=new Map(),faces=new Map();
const names={inter:'FrameotionInter',display:'FrameotionDisplay',comfortaa:'FrameotionComfortaa','fira-sans':'FrameotionFira',onest:'FrameotionOnest'};
function resolveFace(font,weight,brand){
  const fonts=(brand?.fonts??[]).map(f=>String(typeof f==='string'?f:f.family??'')),has=name=>fonts.some(f=>f.toLowerCase().replace(/[\s-]/g,'')===name);
  if(['brand','heading','body'].includes(font))font=has('comfortaa')?(font==='body'?'fira-sans':'comfortaa'):has('onest')?'onest':has('firasans')?'fira-sans':'inter';
  let file;
  if(font==='comfortaa'){weight=700;file='Comfortaa/Comfortaa_700Bold.ttf';}
  else if(font==='display'){weight=800;file='Montserrat/Montserrat_800ExtraBold.ttf';}
  else if(font==='onest')file='Onest/Onest.ttf';
  else if(font==='fira-sans'){weight=weight>=600?700:500;file=`FiraSans/FiraSans_${weight}${weight===700?'Bold':'Medium'}.ttf`;}
  else {font='inter';weight=Math.max(400,Math.min(800,Math.round(weight/100)*100));file=`Inter/Inter_${weight}${{400:'Regular',500:'Medium',600:'SemiBold',700:'Bold',800:'ExtraBold'}[weight]}.ttf`;}
  return {font:font==='onest'?'brand':font,key:font+'-'+weight,family:names[font],weight,file:path.join(ROOT,'assets/fonts',file)};
}
function load(face){
  if(!loaded.has(face.key)){if(!GlobalFonts.registerFromPath(face.file,face.family))throw Error('Cannot load bundled stage font: '+face.key);loaded.set(face.key,face);}
  if(!faces.has(face.file))faces.set(face.file,fontkit.openSync(face.file));
  return faces.get(face.file);
}
function missing(face,text){const f=load(face);return [...new Set([...text].filter(c=>!/[\s\p{Cf}]/u.test(c)&&!f.hasGlyphForCodePoint(c.codePointAt(0))))];}

export function prepareStageTypography(input,source={}){
  const score=structuredClone(input),used=new Map(),runs=[],fallbacks=[];
  for(const element of score.elements.filter(e=>!e.stage)){
    const text=[element.text,element.card?.title,element.card?.subtitle,element.card?.badge,element.card?.avatar,element.wordSwap?.before,element.wordSwap?.after,...(element.wordSwap?.variants??[]).map(v=>v.text)].filter(Boolean).join(' ');if(!text)continue;
    let face=resolveFace(element.font==='display'?'display':'inter',600,{}),absent=missing(face,text);
    if(absent.length&&element.font==='display'){const fallback=resolveFace('inter',600,{});if(!missing(fallback,text).length){fallbacks.push({node:element.id,requested:'display',used:'inter',characters:absent});delete element.font;face=fallback;absent=[];}}
    if(absent.length)throw Error(`${element.id}: native text font does not cover ${absent.map(ch=>'U+'+ch.codePointAt(0).toString(16).toUpperCase()).join(', ')}`);
    runs.push({node:element.id,font:face.key,characters:[...new Set([...text].filter(ch=>!/[\s\p{Cf}]/u.test(ch)))].length,baseline:false});
  }
  for(const element of score.elements.filter(e=>e.stage)){
    const byId=new Map(element.stage.nodes.map(n=>[n.id,n]));
    for(const node of element.stage.nodes.filter(n=>n.kind==='text'||n.kind==='counter')){
      const text=node.kind==='counter'?'0123456789−-.,'+(node.suffix??''):node.text;
      const requested=node.font??'brand';let face=resolveFace(requested,node.weight??600,source.brand),absent=missing(face,text);
      if(absent.length){const fallback=resolveFace('inter',node.weight??600,source.brand),remaining=missing(fallback,text);if(remaining.length)throw Error(`${element.id}/${node.id}: bundled fonts do not cover ${remaining.map(c=>'U+'+c.codePointAt(0).toString(16).toUpperCase()).join(', ')}; use supported text or supplied imagery`);fallbacks.push({stage:element.id,node:node.id,requested,used:'inter',characters:absent});face=fallback;}
      used.set(face.key,face);node.font=face.font;node.weight=face.weight;
      if(byId.get(node.parent)?.layout){if(node.kind!=='text')throw Error(`${node.id}: an inline run must be native text`);node.textMode='baseline';}
      runs.push({stage:element.id,node:node.id,font:face.key,characters:[...new Set([...text].filter(ch=>!/[\s\p{Cf}]/u.test(ch)))].length,baseline:node.textMode==='baseline'});
    }
  }
  const fontFamilies=Object.fromEntries([...used.values()].map(f=>[f.font,f.family]));
  for(const element of score.elements.filter(e=>e.stage))layoutStageTypography(element.stage,()=>createCanvas(8,8).getContext('2d'),fontFamilies);
  return {score,fonts:[...used.values()],fontFamilies,audit:{checkedRuns:runs.length,missingGlyphs:[],fallbacks,runs}};
}
