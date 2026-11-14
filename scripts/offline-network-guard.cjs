// Local-only preload for offline QA and the native-engine MCP entry point.
// Local servers and Chromium IPC remain available; external Node requests are refused
// even if the workspace .env contains provider credentials.
const net=require('node:net'),tls=require('node:tls'),http=require('node:http'),https=require('node:https'),fs=require('node:fs');
const local=host=>['localhost','127.0.0.1','::1','[::1]','::ffff:127.0.0.1'].includes(String(host??'localhost').toLowerCase());
function refuse(host){
  const safe=String(host).replace(/[^a-zA-Z0-9.:_\[\]-]/g,'').slice(0,200);
  if(process.env.FRAMEOTION_OFFLINE_LOG)fs.appendFileSync(process.env.FRAMEOTION_OFFLINE_LOG,JSON.stringify({host:safe,pid:process.pid})+'\n');
  const error=new Error('Offline test blocked external network: '+safe);error.code='FRAMEOTION_OFFLINE_NETWORK';throw error;
}
function inspect(args){
  const first=args[0];
  if(Array.isArray(first))return inspect(first);
  if(typeof first==='object'&&first!==null){if(first.path&&!first.host&&!first.hostname)return;const host=first.hostname??first.host;if(host&&!local(host))refuse(host);return;}
  if(typeof first==='number'){const host=typeof args[1]==='string'?args[1]:'localhost';if(!local(host))refuse(host);return;}
  if(typeof first==='string'&&/^https?:\/\//i.test(first)){const url=new URL(first);if(!local(url.hostname))refuse(url.hostname);}
}
const connect=net.Socket.prototype.connect;net.Socket.prototype.connect=function(...args){inspect(args);return connect.apply(this,args);};
const secure=tls.connect;tls.connect=function(...args){inspect(args);return secure.apply(this,args);};
for(const client of [http,https])for(const method of ['request','get']){const original=client[method];client[method]=function(...args){inspect(args);return original.apply(this,args);};}
if(globalThis.fetch){const original=globalThis.fetch;globalThis.fetch=function(input,...args){const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);if(!local(url.hostname))refuse(url.hostname);return original.call(this,input,...args);};}
for(const name of ['ANTHROPIC_API_KEY','ANTHROPIC_AUTH_TOKEN','ELEVENLABS_API_KEY','ELEVENLABS_VOICE_ID','OPENAI_API_KEY'])process.env[name]='';
process.env.FRAMEOTION_OFFLINE_TESTS='1';
require('node:module').syncBuiltinESMExports();
