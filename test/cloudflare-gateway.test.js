import test from 'node:test';
import assert from 'node:assert/strict';
import maintenanceGateway, {gatewayFetch} from '../deploy/cloudflare/_worker.js';
const gateway = {fetch:gatewayFetch};
const env={FRAMEOTION_ORIGIN:'https://backend.example.test',FRAMEOTION_ORIGIN_TOKEN:'s'.repeat(40),FRAMEOTION_PUBLIC_ORIGIN:'https://frameotion.com',ASSETS:{fetch:async()=>new Response('asset')}};
test('maintenance blocks pages, generation requests and media without calling the backend',async t=>{
 const original=globalThis.fetch; t.after(()=>{globalThis.fetch=original}); let called=false; globalThis.fetch=async()=>{called=true;throw new Error('must not call origin')};
 for(const [path,method] of [['/','GET'],['/account.html','GET'],['/create.js','GET'],['/api/create','POST'],['/api/account','GET'],['/media/a/video.mp4','GET']]){
  const response=await maintenanceGateway.fetch(new Request('https://frameotion.com'+path,{method}),env);
  assert.equal(response.status,503);assert.match(response.headers.get('cache-control'),/no-store/);
 }
 assert.equal(called,false);
});
test('gateway serves assets and refuses unconfigured or unsupported API paths',async()=>{
 assert.equal(await (await gateway.fetch(new Request('https://frameotion.com/'),env)).text(),'asset');
 assert.equal((await gateway.fetch(new Request('https://frameotion.com/api/jobs'),env)).status,404);
 assert.equal((await gateway.fetch(new Request('https://frameotion.com/api/account'),{...env,FRAMEOTION_ORIGIN:''})).status,503);
 assert.equal((await gateway.fetch(new Request('https://frameotion.com/api/create',{method:'POST',headers:{origin:'https://evil.test'}}),env)).status,403);
});
test('gateway forwards only to configured HTTPS origin with private origin auth and no caching',async t=>{
 const original=globalThis.fetch; t.after(()=>{globalThis.fetch=original}); let forwarded;
 globalThis.fetch=async request=>{forwarded=request; return new Response('ok',{headers:{'set-cookie':'frameotion_session=example; HttpOnly'}})};
 const response=await gateway.fetch(new Request('https://frameotion.com/api/create?x=1',{method:'POST',headers:{origin:'https://frameotion.com',authorization:'untrusted','content-type':'application/json'},body:'{}'}),env);
 assert.equal(forwarded.url,'https://backend.example.test/api/create?x=1');
 assert.equal(forwarded.headers.get('authorization'),`Basic ${btoa('frameotion:'+env.FRAMEOTION_ORIGIN_TOKEN)}`);
 assert.equal(response.headers.get('cache-control'),'private, no-store');assert.match(response.headers.get('set-cookie'),/HttpOnly/);
});
test('gateway rejects insecure origins and does not follow backend redirects',async t=>{
 const original=globalThis.fetch; t.after(()=>{globalThis.fetch=original});
 let called=false; globalThis.fetch=async()=>{called=true;return new Response(null,{status:302,headers:{location:'https://elsewhere.test/'}})};
 assert.equal((await gateway.fetch(new Request('https://frameotion.com/api/account'),{...env,FRAMEOTION_ORIGIN:'http://backend.example.test'})).status,503);
 assert.equal(called,false);
 assert.equal((await gateway.fetch(new Request('https://frameotion.com/api/account'),env)).status,502);
});
