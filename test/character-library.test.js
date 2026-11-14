import test from 'node:test';
import assert from 'node:assert/strict';
import {CHARACTER_LIBRARY,replaceAvatar} from '../src/character-studio/cast.js';
import {demoScore} from '../src/character-studio/score.js';
import {applySpeechResult} from '../src/character-studio/visemes.js';
import {validateStoryWindow} from '../src/character-story/contract.js';
import {gardenStoryFixture} from './fixtures/character-stories.js';
import {VOX_LOOKS,voxLook} from '../src/vox-paper/looks.js';

test('new avatars preserve speaker identity, name and phonetic tracks',()=>{
  const additions=CHARACTER_LIBRARY.slice(3);
  assert.equal(additions.filter(p=>p.gender==='male').length,3);
  assert.equal(additions.filter(p=>p.gender==='female').length,1);
  for(const avatar of additions){
    const score=demoScore();score.cast[0]=replaceAvatar(score.cast[0],avatar.id);
    const result=applySpeechResult(score,{speakers:[{id:'voice-a'}],turns:[{speaker:'voice-a',start:0,end:1}],phones:[{speaker:'voice-a',start:0,end:1,phone:'a'}]});
    assert.equal(result.cast[0].id,'anna');assert.equal(result.cast[0].name,'Анна');assert.equal(result.cast[0].appearance,avatar.appearance);
    assert.equal(result.turns[0].speaker,'anna');assert.equal(result.speech.tracks.anna[0].viseme,'open');
  }
  assert.throws(()=>replaceAvatar(demoScore().cast[0],'missing'),RangeError);
});
test('the story contract accepts the added appearances and rejects unknown ones',()=>{
  const {raw,transcript}=gardenStoryFixture();
  for(const avatar of CHARACTER_LIBRARY.slice(3)){
    const value=structuredClone(raw);value.entities.find(e=>e.kind==='character').appearance=avatar.appearance;
    assert.doesNotThrow(()=>validateStoryWindow(value,{transcript,start:0,end:16}));
  }
  const invalid=structuredClone(raw);invalid.entities.find(e=>e.kind==='character').appearance=7;
  assert.throws(()=>validateStoryWindow(invalid,{transcript,start:0,end:16}),/invalid appearance/);
});
test('Vox looks have stable identities and reject unknown choices',()=>{
  assert.equal(new Set(VOX_LOOKS.map(s=>s.id)).size,5);
  assert.equal(voxLook().id,'paper');
  assert.throws(()=>voxLook('missing'),RangeError);
});
