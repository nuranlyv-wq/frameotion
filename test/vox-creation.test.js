import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {validateVoxFilm,directVox} from '../src/vox-paper/director.js';
import {createVoxService} from '../src/vox-paper/service.js';
const source='Свет становится электричеством. Аккумулятор сохраняет энергию.';
const scene={duration:3,look:'paper',technique:'page-turn',eyebrow:'ЭНЕРГИЯ',headline:'Свет становится электричеством',detail:'Аккумулятор сохраняет энергию.',visual:'type',labels:['Энергия'],sourceExcerpt:'Свет становится электричеством.'};
const plan=()=>({title:'Энергия',scenes:[{...scene},{...scene,look:'infographic',technique:'window-cut'}]});
test('Vox director owns visual decisions and ties every scene to the submitted source',async()=>{
  const result=await directVox(source,{request:async()=>({output:plan()})});assert.equal(result.duration,6);assert.equal(result.scenes[1].start,3);assert.equal(result.cost.calls,0);
  const invented=plan();invented.scenes[0].sourceExcerpt='Неподтверждённая цифра';assert.throws(()=>validateVoxFilm(invented,source),/исходному тексту/);
  const unsafe=plan();unsafe.scenes[0].technique='execute-code';assert.throws(()=>validateVoxFilm(unsafe,source));
  const tooLong=plan();tooLong.scenes=Array.from({length:8},()=>({...scene,duration:7}));assert.throws(()=>validateVoxFilm(tooLong,source),/длину/);
  const wrongLook=plan();wrongLook.scenes[0].look='external-url';assert.throws(()=>validateVoxFilm(wrongLook,source));
});
test('Vox creation rejects foreign origins, unsupported content and malformed text before invoking a director',async t=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'vox-api-'));let called=false;
  const vox=createVoxService(root,{director:async()=>{called=true;throw Error('not expected');}});
  const server=http.createServer(async(req,res)=>{await vox.handle(req,res,new URL(req.url,'http://localhost'));});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{vox.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});});
  const origin=`http://127.0.0.1:${server.address().port}`,url=origin+'/api/vox/jobs';
  assert.equal((await fetch(url,{method:'POST',headers:{origin:'https://evil.test','content-type':'application/json'},body:JSON.stringify({text:source})})).status,403);
  assert.equal((await fetch(url,{method:'POST',headers:{origin,'content-type':'text/plain'},body:source})).status,415);
  for(const text of ['',42,'a'.repeat(10001)])assert.equal((await fetch(url,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({text})})).status,400);
  assert.equal(called,false);
});
