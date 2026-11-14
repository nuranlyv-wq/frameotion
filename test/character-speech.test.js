import test from 'node:test';
import assert from 'node:assert/strict';
import {phoneToViseme,sampleViseme,applySpeechResult} from '../src/character-studio/visemes.js';
import {demoScore,sampleScene,assignTurn} from '../src/character-studio/score.js';

const result={speakers:[{id:'voice-0'},{id:'voice-1'}],turns:[{speaker:'voice-0',start:0,end:3},{speaker:'voice-1',start:3,end:6}],phones:[
  {speaker:'voice-0',start:.2,end:.3,phone:'m',confidence:.9},
  {speaker:'voice-0',start:.3,end:.5,phone:'a',confidence:.9},
  {speaker:'voice-1',start:3.2,end:3.4,phone:'u',confidence:.9},
  {speaker:'voice-1',start:3.4,end:3.6,phone:'f',confidence:.9},
],warnings:[],engine:'test-acoustic'};
test('phonetic families produce different mouth geometry, including palatalized consonants',()=>{
  assert.equal(phoneToViseme('m'),'closed');assert.equal(phoneToViseme('bʲ'),'closed');
  assert.equal(phoneToViseme('f'),'labiodental');assert.equal(phoneToViseme('uː'),'pucker');
  assert.equal(phoneToViseme('ɔ'),'round');assert.equal(phoneToViseme('a'),'open');
  assert.equal(phoneToViseme('i'),'wide');assert.equal(phoneToViseme('tʃ'),'postalveolar');
});
test('loud audio cannot open a bilabial closure and silence cannot open a vowel',()=>{
  assert.equal(sampleViseme(result.phones,.25,1).open,0);
  assert.ok(sampleViseme(result.phones,.4,.8).open>.7);
  assert.equal(sampleViseme(result.phones,.4,0).open,0);
  assert.equal(sampleViseme(result.phones,2,1).kind,'rest');
});
test('detected identities are assigned by first occurrence and control only their own mouth',()=>{
  const score=applySpeechResult({...demoScore(),duration:6},result);
  assert.equal(score.cast.length,2);
  const a=sampleScene(score,.25,{level:1});
  assert.equal(a.characters[0].viseme.kind,'closed');assert.equal(a.characters[1].mouth,0);
  const b=sampleScene(score,3.25,{level:1});
  assert.equal(b.characters[1].viseme.kind,'pucker');assert.equal(b.characters[0].mouth,0);
});
test('manual correction moves the phonetic events with the corrected speaking interval',()=>{
  const before=applySpeechResult({...demoScore(),duration:6},result);
  const corrected=assignTurn(before,{speaker:'lev',start:.1,end:.6});
  assert.equal(corrected.speech.tracks.anna.length,0);
  assert.equal(corrected.speech.tracks.lev.filter(p=>p.start<1).length,2);
  assert.ok(sampleScene(corrected,.4,{level:1}).characters.find(p=>p.id==='lev').mouth>.7);
  assert.equal(before.speech.tracks.anna.length,2);
});
test('analysis cannot silently merge excess speakers or accept malformed timing',()=>{
  assert.throws(()=>applySpeechResult(demoScore(),{...result,speakers:[{id:'a'},{id:'b'},{id:'c'},{id:'d'}]}));
  assert.throws(()=>applySpeechResult({...demoScore(),duration:6},{...result,phones:[{speaker:'voice-0',start:4,end:3,phone:'a'}]}));
});
test('phonetic timing survives seeking in either direction',()=>{
  const score=applySpeechResult({...demoScore(),duration:6},result),expected=sampleScene(score,3.5,{level:.8});
  for(const t of [.2,5,0,3.4])sampleScene(score,t,{level:.8});
  assert.deepEqual(sampleScene(score,3.5,{level:.8}),expected);
});
