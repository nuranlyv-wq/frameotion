import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createCanvas} from '@napi-rs/canvas';
import {imageCandidates,importSourceImages} from '../src/import/visual-assets.js';
import {mentionedServices,serviceCatalogue} from '../src/production/service-assets.js';
import {normalizeSemanticTreatment,compileLaunch} from '../src/kadr-launch/compile.js';
import {imageAssetIds} from '../src/kadr-launch/media.js';
import {STORIES} from './fixtures/direction-stories.js';

test('source discovery reads lazy photos and retina sources, excluding logos and trackers',()=>{
 const html='<header><img src="/logo.png"></header><main><img width="32" height="32" src="/pixel.png"><article class="product"><img alt="Настоящий товар" data-src="/photo.jpg" srcset="/small.jpg 200w, /large.jpg 1200w"></article><figure><img data-src="/room.webp"><figcaption>Интерьер</figcaption></figure></main>';
 const found=imageCandidates(html,'https://example.com');
 assert.deepEqual(found.map(item=>item.url),['https://example.com/large.jpg','https://example.com/room.webp']);
 assert.equal(found[0].role,'product-photo');assert.equal(found[1].caption,'Интерьер');
});
test('image import validates dimensions and lets a missing photo fail independently',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'native-media-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const body=createCanvas(400,300).toBuffer('image/png');
 const result=await importSourceImages([{url:'https://example.com/missing.jpg'},{url:'https://example.com/photo.png',caption:'Товар'}],dir,{
  fetcher:async url=>{if(url.includes('missing'))throw new Error('not found');return {body,finalUrl:url};},
 });
 assert.equal(result.length,1);assert.equal(result[0].caption,'Товар');assert.equal(result[0].width,400);
});
test('recognisable service assets require an actual service mention',()=>{
 const catalogue=serviceCatalogue();assert.ok(catalogue.some(item=>item.slug==='telegram'));
 const names=mentionedServices([{id:'D1',text:'Telegram, Notion и GitHub связывают работу команды.'}],catalogue).map(item=>item.slug);
 assert.deepEqual(names,['telegram','notion','github']);
 assert.deepEqual(mentionedServices([{id:'D1',text:'Make a video with a linear gradient and zoom into the product.'}],catalogue),[]);
 assert.ok(mentionedServices([{id:'D1',text:'Автоматизация в Make.com'}],catalogue).some(item=>item.slug==='make'));
});

function planWithMedia(kind,format='landscape') {
 const base=STORIES.forma,plan=structuredClone(base.plan),settings={...base.settings,frames:450,pace:'dynamic',...(format==='portrait'?{width:1080,height:1920}:{})};
 const assets=[0,1,2].map(i=>({id:'brand-'+String(i+1).padStart(20,'0'),kind:'illustration',role:'service-logo'}));
 const source={...base.source,assets};plan.signatureBeat=plan.beats[0].id;
 plan.beats=plan.beats.slice(0,2).map(({text,...beat},i)=>({...beat,move:i?'hold':'keyframes',visual:i?{scene:'brand'}:{
  scene:'show',camera:'locked',show:{kind,parts:assets.map((asset,j)=>({label:['Telegram','Notion','GitHub'][j],assetId:asset.id})),...(kind==='orbit'&&{whole:{label:'Forma',icon:'bolt'}})},evidenceId:'D1'}}));
 const treatment=normalizeSemanticTreatment(plan,settings,source);
 return {plan,settings,source,score:compileLaunch(treatment,settings,source)};
}
test('moving service marks and bento photos compile in both formats with scoped resources',()=>{
 for(const kind of ['orbit','gallery'])for(const format of ['landscape','portrait']) {
  const {score}=planWithMedia(kind,format);
  assert.equal(imageAssetIds(score).length,3);
  assert.equal(score.elements.filter(el=>el.kind==='image').length,3);
  if(kind==='orbit')assert.ok(score.elements.some(el=>el.assetId&&el.motion?.length>4));
  else assert.ok(score.elements.filter(el=>el.kind==='image').every(el=>el.imageFit==='cover'&&el.imageReveal));
 }
 const {plan,settings,source}=planWithMedia('orbit');plan.beats[0].visual.show.parts[0].assetId='brand-99999999999999999999';
 assert.throws(()=>normalizeSemanticTreatment(plan,settings,source),/this film’s source/);
});
test('a service logo carries into the orbit centre before changing role',()=>{
 const {plan,settings,source}=planWithMedia('orbit');
 const orbit=structuredClone(plan.beats[0]);orbit.id='orbit';orbit.visual.link='match';
 const first={...plan.beats[0],visual:{scene:'show',camera:'locked',show:{kind:'transform',stages:[
  {label:'Сообщение',form:'logo',assetId:source.assets[0].id},
  {label:'Задача',form:'logo',assetId:source.assets[1].id},
 ]}}};
 plan.beats=[first,orbit];
 const score=compileLaunch(normalizeSemanticTreatment(plan,settings,source),settings,source);
 const centre=score.elements.find(el=>el.id==='token-1');
 assert.equal(centre.kind,'transform');assert.equal(centre.formTrack.keys[0].assetId,source.assets[1].id);
 assert.equal(centre.formTrack.keys.at(-1).mark,'bolt');
 assert.equal(centre.elevation,undefined);
});
