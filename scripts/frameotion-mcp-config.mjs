import {fileURLToPath} from 'node:url';
// stdout is a client configuration snippet, not the MCP protocol transport.
console.log(JSON.stringify({mcpServers:{frameotion:{command:process.execPath,args:[fileURLToPath(new URL('./frameotion-mcp.mjs',import.meta.url))]}}},null,2));
