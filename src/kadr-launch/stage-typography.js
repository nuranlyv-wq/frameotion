// Shared browser/server measurements. No fixed em-box approximations for visible ink.
export function measureStageText(c,text,{w,h,size=64,weight=600,family='Inter',mode='box',baseline,padding=0,minimum=16}={}){
  const measure=line=>{const m=c.measureText(line);return {text:line,advance:m.width,left:m.actualBoundingBoxLeft??0,right:m.actualBoundingBoxRight??m.width,ascent:m.actualBoundingBoxAscent??size*.8,descent:m.actualBoundingBoxDescent??size*.2};};
  const wrap=()=>{
    c.font=`${weight} ${size}px ${family}`;c.textBaseline='alphabetic';c.textAlign='left';
    if(mode==='baseline')return [measure(text)];
    return text.split('\n').flatMap(paragraph=>{const lines=[];let line='';for(const word of paragraph.split(/\s+/u).filter(Boolean)){const next=line?line+' '+word:word;if(line&&c.measureText(next).width>w*.96){lines.push(measure(line));line=word;}else line=next;}lines.push(measure(line));return lines;});
  };
  let lines=wrap();
  const dimensions=()=>({width:Math.max(0,...lines.map(l=>l.left+l.right)),top:Math.min(...lines.map((l,i)=>i*size*1.15-l.ascent)),bottom:Math.max(...lines.map((l,i)=>i*size*1.15+l.descent))});
  let d=dimensions();
  while(mode!=='baseline'&&(d.width>w*.96||d.bottom-d.top>h*.95)&&size>minimum){size=Math.max(minimum,size-1);lines=wrap();d=dimensions();}
  const y=mode==='baseline'?(baseline??size*1.25):(h-(d.bottom-d.top))/2-d.top;
  const positioned=lines.map((line,i)=>({...line,x:mode==='baseline'?padding:(w-line.left-line.right)/2+line.left,y:y+i*size*1.15}));
  const left=Math.min(...positioned.map(l=>l.x-l.left)),right=Math.max(...positioned.map(l=>l.x+l.right)),top=Math.min(...positioned.map(l=>l.y-l.ascent)),bottom=Math.max(...positioned.map(l=>l.y+l.descent));
  return {fontSize:size,lines:positioned,inkBox:{x:left,y:top,w:right-left,h:bottom-top},fits:mode==='baseline'||d.width<=w*.96&&d.bottom-d.top<=h*.95};
}

// Resolve geometry only after every face has loaded. The browser repeats this
// pass with its own Canvas metrics, so preparation and painting use one engine.
export function layoutStageTypography(stage,makeContext,fontFamilies){
  const byId=new Map(stage.nodes.map(n=>[n.id,n]));
  for(const node of stage.nodes.filter(n=>n.kind==='text')){
    const inline=byId.get(node.parent)?.layout;if(!inline&&node.textMode!=='baseline')continue;
    if(node.text.includes('\n'))throw Error(`${node.id}: a baseline run must be single-line native text`);
    const c=makeContext();
    const size=node.fontSize??64,padding=Math.ceil(size*.25),h=Math.ceil(size*1.8),baseline=Math.ceil(size*1.25),family=fontFamilies[node.font]??'Inter';
    c.font=`${node.weight??600} ${size}px ${family}`;c.textBaseline='alphabetic';c.textAlign='left';const advance=c.measureText(node.text).width;
    node.textMode='baseline';node.w=Math.ceil(advance+2*padding);node.h=h;node.anchorX=padding/node.w;node.anchorY=baseline/h;
    if(inline)node.advance=advance;
    node.inkBox=measureStageText(c,node.text,{w:node.w,h,size,weight:node.weight??600,family,mode:'baseline',padding,baseline}).inkBox;
  }
  for(const control of stage.nodes.filter(n=>n.control&&byId.get(n.parent)?.layout)){
    const label=byId.get(control.control.label);if(!label||label.kind!=='text')continue;
    const c=makeContext();
    const layout=measureStageText(c,label.text,{w:Math.max(1,control.w-16),h:Math.max(1,control.h-8),size:label.fontSize??32,weight:label.weight??500,family:fontFamilies[label.font]??'Inter'}),run=layout.lines[0];
    if(layout.lines.length!==1)throw Error(`${control.id}: inline control label must fit one short line`);
    control.anchorX=0;control.anchorY=.5+(run.ascent-run.descent)/(2*control.h);control.advance=control.w;
    label.textMode='box';label.z=0;label.fitToParent={x:8,y:4};label.dock={x:'center',y:'center',insetX:0,insetY:0};
  }
}
