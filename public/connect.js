const status=document.querySelector('#status'),output=document.querySelector('#config');
try {
 const response=await fetch('/api/mcp/config');
 if(!response.ok)throw Error('Open this page from your local Frameotion server after npm start.');
 const config=await response.json(),text=JSON.stringify(config,null,2);
 output.textContent=text;status.textContent='Local installation found. Choose your client.';
 const cursor=document.querySelector('#cursor');
 const bytes=new TextEncoder().encode(JSON.stringify(config.mcpServers.frameotion));
 cursor.href='cursor://anysphere.cursor-deeplink/mcp/install?name=frameotion&config='+encodeURIComponent(btoa(Array.from(bytes,b=>String.fromCharCode(b)).join('')));cursor.hidden=false;
 const copy=document.querySelector('#copy');copy.disabled=false;copy.onclick=async()=>{try{await navigator.clipboard.writeText(text);status.textContent='Copied. Merge into your MCP settings and restart your client.';}catch{status.textContent='Clipboard unavailable. Select the configuration below or download JSON.';}};
 const download=document.querySelector('#download');download.disabled=false;download.onclick=()=>{const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='frameotion-mcp.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
}catch(error){status.textContent=error.message;output.textContent='Run npm run mcp:config in the project directory to print your configuration.';}
