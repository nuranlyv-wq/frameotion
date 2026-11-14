const status=document.querySelector('#status'),output=document.querySelector('#config');
function configure(config){
 const text=JSON.stringify(config,null,2);
 output.textContent=text;status.textContent='Local installation found. Choose your client.';
 const cursor=document.querySelector('#cursor');
 const bytes=new TextEncoder().encode(JSON.stringify(config.mcpServers.frameotion));
 cursor.href='cursor://anysphere.cursor-deeplink/mcp/install?name=frameotion&config='+encodeURIComponent(btoa(Array.from(bytes,b=>String.fromCharCode(b)).join('')));cursor.hidden=false;
 const copy=document.querySelector('#copy');copy.disabled=false;copy.onclick=async()=>{try{await navigator.clipboard.writeText(text);status.textContent='Copied. Merge into your MCP settings and restart your client.';}catch{status.textContent='Clipboard unavailable. Select the configuration below or download JSON.';}};
 const download=document.querySelector('#download');download.disabled=false;download.onclick=()=>{const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='frameotion-mcp.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
}
document.querySelector('#manual').onsubmit=event=>{event.preventDefault();const folder=document.querySelector('#folder').value.trim().replace(/[\\/]+$/,''),node=document.querySelector('#node').value.trim();if(!(/^(\/|[A-Za-z]:[\\/])/.test(folder))||!node){status.textContent='Enter an absolute project folder and your Node executable.';return;}configure({mcpServers:{frameotion:{command:node,args:[folder+'/scripts/frameotion-mcp.mjs']}}});};
try {const response=await fetch('/api/mcp/config');if(!response.ok)throw Error();const config=await response.json();configure(config);document.querySelector('#manual').hidden=true;}
catch {status.textContent='Enter the absolute folder of your installed Frameotion copy to connect.';output.textContent='Alternatively, run npm run mcp:config in the project directory.';}

