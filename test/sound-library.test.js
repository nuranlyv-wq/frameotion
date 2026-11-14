import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../src/config.js';
import { soundLibrary, chooseSound, planSoundCues } from '../src/production/sound-library.js';

test('user library retains provenance, unique IDs and decodable WAV headers',()=>{
 const {sounds}=soundLibrary();assert.equal(sounds.length,77);assert.equal(new Set(sounds.map(s=>s.id)).size,77);
 for(const s of sounds){assert.equal(s.source.sha256.length,64);assert.ok(s.duration>0);assert.ok(s.peakAt<s.duration);assert.ok(s.onset<s.duration);
  const file=fs.readFileSync(path.join(ROOT,'assets',s.file));assert.equal(file.toString('ascii',0,4),'RIFF');assert.equal(file.toString('ascii',8,12),'WAVE');}
});
test('landing sync anticipates the whoosh and aligns clicks to onset',()=>{
 const library={sounds:[{id:'w',category:'whoosh',file:'sfx/w.wav',duration:2,peak:.5,peakAt:.8,onset:.1},{id:'c',category:'click',file:'sfx/c.wav',duration:.4,peak:.8,peakAt:.1,onset:.02}]};
 const [w,c]=planSoundCues([{kind:'whoosh',frame:60,gain:70},{kind:'click',frame:60,gain:50}],30,library);
 assert.equal(w.start,1.2);assert.equal(c.start,1.98);assert.equal(w.sync,'peak');assert.equal(c.sync,'onset');
 const [early]=planSoundCues([{kind:'whoosh',frame:6,gain:50}],30,library);assert.equal(early.start,0);assert.ok(Math.abs(early.trimStart-.6)<1e-9);
});
test('missing explicit assets are skipped and outside-library paths are rejected',()=>{
 const [missing]=planSoundCues([{assetId:'not-a-sound',frame:0,gain:50}],30);
 assert.equal(missing.skipped,'no-zip-sample');
 assert.equal(missing.source,undefined);
 assert.throws(()=>planSoundCues([{assetId:'bad',frame:0,gain:50}],30,{sounds:[{id:'bad',file:'../../.env'}]}),/Invalid sound path/);
 assert.ok(chooseSound({kind:'click'}).id.startsWith('click-'));
});
