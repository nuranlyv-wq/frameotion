import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('the offline preload refuses external fetch and sockets before dispatch and clears model credentials',()=>{
  const guard=fileURLToPath(new URL('../scripts/offline-network-guard.cjs',import.meta.url)),script=`
    const assert=require('node:assert/strict'),net=require('node:net');
    assert.equal(process.env.ANTHROPIC_API_KEY,'');
    assert.throws(()=>fetch('https://api.example.invalid/v1'),{code:'FRAMEOTION_OFFLINE_NETWORK'});
    assert.throws(()=>new net.Socket().connect({host:'api.example.invalid',port:443}),{code:'FRAMEOTION_OFFLINE_NETWORK'});
  `,r=spawnSync(process.execPath,['--require',guard,'-e',script],{encoding:'utf8',env:{...process.env,ANTHROPIC_API_KEY:'dummy-offline-only'}});
  assert.equal(r.status,0,r.stderr);
});
