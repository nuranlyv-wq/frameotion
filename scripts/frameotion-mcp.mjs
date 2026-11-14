#!/usr/bin/env node
// Install the local-only policy BEFORE loading config/.env or any engine module.
import {createRequire} from 'node:module';
createRequire(import.meta.url)('./offline-network-guard.cjs');
process.env.FRAMEOTION_LOCAL_ENGINE='1';
const {StdioServerTransport}=await import('@modelcontextprotocol/sdk/server/stdio.js');
const {createEngineMcpServer}=await import('../src/mcp/server.js');
const {server,service}=await createEngineMcpServer();
let closing;
async function close(){if(closing)return closing;closing=(async()=>{await service.close();await server.close();})();return closing;}
process.stdin.once('end',()=>{close().catch(e=>{console.error(e.message);process.exitCode=1;});});
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{close().then(()=>process.exit(0),e=>{console.error(e.message);process.exit(1);});});
server.onerror=error=>console.error('Frameotion MCP protocol:',error.message);
await server.connect(new StdioServerTransport(process.stdin,process.stdout,{maxBufferSize:4*1024*1024}));
