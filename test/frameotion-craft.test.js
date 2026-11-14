import test from 'node:test';
import assert from 'node:assert/strict';
import {retrieveCraft,buildCraftIndex,craftHash} from '../src/craft/retrieval.js';
import {directorPreparation,preparationForModel} from '../src/craft/brief.js';
import {CRAFT_CARDS} from '../src/craft/registry.js';
import {anthropicStages} from '../src/production/stages.js';
import {causalContinuityContext} from '../src/craft/continuity.js';

test('Russian production requests retrieve the native operation within a hard context budget',()=>{
  for(const [query,id]of [['жидкое стекло и глассморфизм','optical-glass'],['лента при смещении фокусного слова','focus-ribbon'],['иконки вращаются кольцом в трехмерной плоскости','inclined-orbit']]){
    const r=retrieveCraft(query,{limit:4,maxChars:3000});
    assert.ok(r.fragments.some(c=>c.id===id),JSON.stringify(r));
    assert.ok(r.fragments.length<=4);assert.ok(r.characters<=3000);assert.equal(r.embeddingCalls,0);
  }
});
test('weak prompts get a bounded creative brief without rewriting instructions or inventing evidence',()=>{
  const brief='Спокойно. Без камеры. Только «Əla».',p=directorPreparation({brief,language:'az',settings:{pace:'calm',width:1920,height:1080,frames:720,fps:24}});
  assert.equal(p.original,brief);assert.equal(p.modelCalls,0);assert.equal(p.constraints.language,'az');assert.equal(p.constraints.pace,'calm');assert.equal(p.constraints.seconds,30);
  assert.match(p.creativeFreedom,/Preserve requested stillness/);assert.equal(preparationForModel(p).original,undefined);
  assert.equal(directorPreparation({brief,language:'az',settings:{pace:'calm',width:1920,height:1080,frames:720,fps:24}}).contextHash,p.contextHash);
});
test('the local index is reproducible and studio filtering does not promise motion-only fragments in Vox',()=>{
  const a=buildCraftIndex(),b=buildCraftIndex();assert.deepEqual(a,b);assert.equal(a.docs.length,CRAFT_CARDS.length);assert.equal(a.sourceHash,craftHash());
  const r=retrieveCraft('контроль фразы бумага стекло кнопка',{studio:'vox'});assert.ok(r.fragments.every(c=>CRAFT_CARDS.find(v=>v.id===c.id).studios.includes('vox')));
  assert.ok(retrieveCraft('',{studio:'motion'}).fragments.length>0);
});
test('stable system/schema prefixes use the existing provider cache and add no extra model call',async()=>{
  let calls=0,params;
  const client={messages:{stream:p=>{calls++;params=p;return {finalMessage:async()=>({model:'fixture',stop_reason:'tool_use',content:[{type:'tool_use',name:'submit_fixture',input:{ok:true}}]})};}}};
  const request=anthropicStages(client,{model:'fixture',maxTokens:1000});
  const result=await request({name:'fixture',schema:{type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false},prompt:'Stable policy.',input:{brief:'Exact request'},feedback:[]});
  assert.equal(calls,1);assert.equal(params.system[0].cache_control.type,'ephemeral');assert.equal(params.tools[0].cache_control.type,'ephemeral');assert.deepEqual(result.output,{ok:true});
});
test('semantic continuity is mandatory in preparation and geometric matches do not claim coherent storytelling',()=>{
  const p=directorPreparation({brief:'Show three formats'});assert.match(p.constraints.continuity,/mandatory default/);assert.match(p.constraints.continuity,/unrelated ideas/);
  const treatment={beats:[{id:'submit',action:'Submit this project',landing:'This project is received',handoff:'The same project becomes its receipt'},{id:'receipt',action:'Reveal this project’s receipt',landing:'The submitted project is ready'}]},context=causalContinuityContext(treatment);
  assert.equal(context.pairs[0].previousOutcome,treatment.beats[0].landing);assert.equal(context.pairs[0].nextAction,treatment.beats[1].action);assert.equal(context.pairs[0].hasStatedBridge,true);assert.match(context.semanticAssessment,/not established by geometric checks/);
});
