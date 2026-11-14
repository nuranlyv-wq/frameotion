import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {motionAssets,motionCurves,resolveMotionAsset,resolveRenderResources,retrieveMotionAssets,fontSupports} from '../src/production/asset-library.js';
import {actorAt,cubicProgress} from '../src/production/world.js';
import {planSoundCues,chooseSound} from '../src/production/sound-library.js';

test('installed assets have provenance; retrieval is language-aware and does not flood the prompt with icons',()=>{
 const {packs,assets}=motionAssets();assert.equal(packs.length,148);assert.equal(assets.filter(a=>a.kind==='font').length,128);
 assert.equal(new Set(assets.map(a=>a.id)).size,assets.length);
 for(const a of assets){assert.equal(a.sha256.length,64);assert.ok(resolveMotionAsset(a.id).file);assert.ok(a.license);}
 const result=retrieveMotionAssets('calendar paper interface warm',{text:'Запись готова'});
 assert.ok(result.fonts.length);assert.ok(result.images.length);assert.ok(result.images.filter(a=>a.pack==='res-icons-line').length<=3);
 for(const font of result.fonts)assert.ok(fontSupports(assets.find(a=>a.id===font.id),'Запись готова'));
 assert.throws(()=>resolveMotionAsset('../../.env'),/Unavailable/);
});
test('asset resolution rejects traversal and symbolic links outside the allowlisted library',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'kadr-ms-path-')),old=process.env.KADR_MOTION_ASSETS;
 try{process.env.KADR_MOTION_ASSETS=root;fs.symlinkSync('/etc/hosts',path.join(root,'escape'));
  assert.throws(()=>resolveMotionAsset('bad',{assets:[{id:'bad',file:'escape',scope:'open-license'}]}),/escaped/);
 }finally{if(old===undefined)delete process.env.KADR_MOTION_ASSETS;else process.env.KADR_MOTION_ASSETS=old;fs.rmSync(root,{recursive:true,force:true});}
});
test('MotionSmith curves stay private, interpolate deterministically and leave old scores unchanged',()=>{
 const curves=motionCurves();assert.equal(Object.keys(curves).length,41);
 for(const curve of Object.values(curves)){assert.equal(cubicProgress(curve,0),0);assert.equal(cubicProgress(curve,1),1);assert.ok(Number.isFinite(cubicProgress(curve,.5)));}
 const node={pose:{x:0},fill:'accent',keys:[{at:30,x:100,easing:'linear',curveId:'ms-saas-launch-morph'}]};
 const first=actorAt(node,12,curves);actorAt(node,29,curves);assert.deepEqual(actorAt(node,12,curves),first);assert.notEqual(first.x,40);
 const legacy=structuredClone(node);delete legacy.keys[0].curveId;assert.equal(actorAt(legacy,12,curves).x,40);
 const resources=resolveRenderResources({world:{nodes:[{fontId:'font-onest',keys:[]}],camera:[]}});
 assert.ok(resources.fonts['font-onest'].src.startsWith('data:font/ttf;base64,'));assert.equal(resources.manifest.assets[0].license,'OFL-1.1');
});
test('riser tail sync and pitch changes retain sample alignment; typing uses user recordings',()=>{
 const library={sounds:[{id:'r',category:'riser',file:'sfx/r.wav',duration:2,peak:1,peakAt:1.8,onset:0}]};
 const [cue]=planSoundCues([{kind:'riser',frame:90,gain:50,sync:'end',rate:100}],30,library);
 assert.equal(cue.start+cue.duration,3);
 const [pitched]=planSoundCues([{kind:'riser',frame:90,gain:50,sync:'peak',rate:110,leadFrames:3}],30,library);
 assert.ok(Math.abs(pitched.start+1.8/1.1-2.9)<1e-8);
 assert.match(chooseSound({kind:'typing'}).name,/typing/i);
});
