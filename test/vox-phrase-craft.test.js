import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {validateVoxFilm,VOX_FILM_SCHEMA} from '../src/vox-paper/director.js';
import {makeFilmPrints} from '../src/vox-paper/film-prints.js';
import {checkSchema} from '../src/production/contracts.js';
const source='Сложно? Понятно. Объяснение сохраняет контекст.';
const scene={duration:4,look:'paper',technique:'phrase-swap',eyebrow:'Одна мысль',headline:'Сложно?',detail:'Объяснение сохраняет контекст.',visual:'type',labels:['Суть'],sourceExcerpt:source,phrase:{before:'Сложно?',after:'Понятно.'}};
test('the editorial director can select a grounded local phrase replacement',()=>{
  const next={...scene,technique:'page-turn',headline:'Понятно.'};delete next.phrase;const plan={title:'Суть',scenes:[scene,next]};
  assert.deepEqual(checkSchema(VOX_FILM_SCHEMA,plan),[]);assert.equal(validateVoxFilm(plan,source).scenes[0].phrase.after,'Понятно.');
  assert.throws(()=>validateVoxFilm({...plan,scenes:[{...scene,headline:'Другой заголовок'},next]},source),/Замена фразы/);
});
test('phrase printing changes only the registered native strip, preserving all outside pixels',()=>{
  const prior=globalThis.document;globalThis.document={createElement:()=>createCanvas(1,1)};
  try{
    const prints=makeFilmPrints(scene,null,{}),a=prints.before.getContext('2d').getImageData(0,0,1600,900).data,b=prints.after.getContext('2d').getImageData(0,0,1600,900).data;let insideChanges=0,outsideChanges=0;
    for(let y=0;y<900;y++)for(let x=0;x<1600;x++)for(let c=0;c<4;c++){const i=(y*1600+x)*4+c;if(x>=400&&x<1200&&y>=330&&y<570)insideChanges+=a[i]!==b[i]?1:0;else outsideChanges+=a[i]!==b[i]?1:0;}
    assert.equal(outsideChanges,0);assert.ok(insideChanges>100);assert.equal(prints.scrap.width,800);assert.equal(prints.replacement.height,240);
  }finally{if(prior===undefined)delete globalThis.document;else globalThis.document=prior;}
});
