import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {mixSoundLibrary} from '../src/production/sound-library.js';
import {resolveRuntime,runtimeManifest} from '../src/kadr-launch/runtime.js';

test('the sound mix contains only ZIP samples and a missing cue renders silence',async t=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'kadr-sfx-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const silence = path.join(dir,'silence.wav'), mixed = path.join(dir,'mixed.wav');
  const missing = {kind:'click',assetId:'unavailable',frame:12,gain:50};
  const click = {kind:'click',frame:32,gain:50};
  const options = {seconds:2,fps:30};
  assert.deepEqual(await mixSoundLibrary({...options,output:silence,cues:[missing]}), []);
  const used = await mixSoundLibrary({...options,output:mixed,cues:[missing,click]});
  assert.equal(used.length,1);
  assert.match(used[0].origin.archive,/^Clicks.*\.zip$/);
  const [quiet,audio] = await Promise.all([readFile(silence),readFile(mixed)]);
  // Compare the PCM payload after FFmpeg's WAV metadata.
  const pcm = wav => wav.subarray(wav.indexOf('data') + 8);
  assert.equal(pcm(quiet).length,2*48000*4);
  assert.ok(pcm(quiet).every(v=>v===0));
  assert.ok(pcm(audio).some(v=>v!==0));
});
test('renderer resolves only its packaged open font',()=>{const {font}=resolveRuntime();assert.match(font,/assets\/fonts\/Inter/);assert.equal(runtimeManifest().provider,'KADR');});
