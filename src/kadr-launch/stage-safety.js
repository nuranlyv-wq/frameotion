// Convex projected geometry, rather than overlapping axis-aligned boxes for rotated text.
const cross=(a,b,p)=>(b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);
export function insidePolygon(points,p,padding=0){
  const area=points.reduce((s,a,i)=>{const b=points[(i+1)%points.length];return s+a.x*b.y-b.x*a.y;},0),sign=Math.sign(area)||1;
  return points.every((a,i)=>{const b=points[(i+1)%points.length];return sign*cross(a,b,p)>=padding*Math.hypot(b.x-a.x,b.y-a.y)-.01;});
}
export function clipPolygon(subject,clip){
  const sign=Math.sign(clip.reduce((s,a,i)=>{const b=clip[(i+1)%clip.length];return s+a.x*b.y-b.x*a.y;},0))||1;let out=subject;
  for(let i=0;i<clip.length;i++){
    const a=clip[i],b=clip[(i+1)%clip.length],input=out;out=[];
    for(let j=0;j<input.length;j++){
      const p=input[j],q=input[(j+1)%input.length],dp=sign*cross(a,b,p),dq=sign*cross(a,b,q),pin=dp>=0,qin=dq>=0;
      if(pin)out.push(p);if(pin!==qin){const u=dp/(dp-dq);out.push({x:p.x+(q.x-p.x)*u,y:p.y+(q.y-p.y)*u});}
    }
  }
  return out;
}
const area=points=>Math.abs(points.reduce((s,a,i)=>{const b=points[(i+1)%points.length];return s+a.x*b.y-b.x*a.y;},0))/2;
const bounds=p=>({left:Math.min(...p.map(v=>v.x)),right:Math.max(...p.map(v=>v.x)),top:Math.min(...p.map(v=>v.y)),bottom:Math.max(...p.map(v=>v.y))});
export function stageSafety(items,painted,{height=562.5,t=0}={}){
  const findings=[],byId=new Map(items.map(i=>[i.node.id,i])),text=[];
  for(const item of items){
    const node=item.node;if(item.opacity<.2||item.blur>2)continue;
    if(node.kind==='text'){
      let polygon=painted.get(node.id);const mask=byId.get(node.clipTo??(node.clipToParent?node.parent:null));
      if(polygon&&mask)polygon=clipPolygon(polygon,mask.points);
      if(polygon?.length>=3&&area(polygon)>1)text.push({id:node.id,points:polygon});
    }
    if(!node.control||t<(node.control.from??node.start)||t>=(node.control.to??node.end))continue;
    const label=byId.get(node.control.label),ink=painted.get(node.control.label),parent=byId.get(node.parent),pad=node.control.padding??4;
    if(!label||label.opacity<.025)findings.push({code:'control_empty',target:node.id,related:node.control.label});
    if(ink&&!ink.every(p=>insidePolygon(item.points,p,pad)))findings.push({code:'control_label_outside',target:node.id,related:node.control.label});
    if(parent&&!item.points.every(p=>insidePolygon(parent.points,p,2)))findings.push({code:'control_outside_parent',target:node.id,related:parent.node.id});
    if(!item.points.every(p=>p.x>=2&&p.x<=998&&p.y>=2&&p.y<=height-2))findings.push({code:'control_outside_frame',target:node.id});
  }
  for(let i=0;i<text.length;i++)for(let j=i+1;j<text.length;j++){
    const a=text[i],b=text[j],overlap=clipPolygon(a.points,b.points);
    const contact=(from,to)=>(byId.get(from)?.node.contacts??[]).some(c=>c.target===to&&t>=c.from&&t<=c.to);
    if(contact(a.id,b.id)||contact(b.id,a.id))continue;
    if(overlap.length>=3&&area(overlap)>1)findings.push({code:'stage_text_collision',target:a.id,related:b.id,bounds:bounds(a.points),relatedBounds:bounds(b.points)});
  }
  return findings;
}
