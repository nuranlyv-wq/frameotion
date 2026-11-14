import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {registerBrandAsset,resolveBrandAsset,brandAssets} from '../src/production/brand-assets.js';
import {resolveRenderResources,retrieveMotionAssets} from '../src/production/asset-library.js';

test('source brand is rasterized, scoped to its product, hashed and resolved without remote requests',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kadr-brand-')),old=process.env.KADR_BRAND_ASSETS;
 try{
  process.env.KADR_BRAND_ASSETS=path.join(dir,'brands');
  const file=path.join(dir,'logo.svg');fs.writeFileSync(file,'<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="#ffcc00"/></svg>');
  const a=await registerBrandAsset({file,name:'Example',source:'https://example.com/logo.svg'});
  assert.equal(a.kind,'logo');assert.equal(brandAssets().length,1);assert.equal(brandAssets()[0].width,40);
  const found=retrieveMotionAssets('Example',{productAssets:[a]}).images;assert.ok(found.some(i=>i.id===a.id));
  assert.ok(!retrieveMotionAssets('Another product').images.some(i=>i.id===a.id));
  const timeline={world:{nodes:[{assetId:a.id,keys:[]}],camera:[]}},r=resolveRenderResources(timeline);
  assert.match(r.images[a.id].src,/^data:image\/png;base64,/);assert.equal(r.manifest.assets[0].source,a.source);
  const target=resolveBrandAsset(a.id).file;fs.writeFileSync(target,'changed');
  assert.throws(()=>resolveRenderResources(timeline),/changed/);
  fs.unlinkSync(target);fs.symlinkSync('/etc/hosts',target);
  assert.throws(()=>resolveBrandAsset(a.id),/escaped/);
  assert.throws(()=>resolveBrandAsset('../../.env'),/Unavailable/);
 }finally{if(old===undefined)delete process.env.KADR_BRAND_ASSETS;else process.env.KADR_BRAND_ASSETS=old;fs.rmSync(dir,{recursive:true,force:true});}
});
