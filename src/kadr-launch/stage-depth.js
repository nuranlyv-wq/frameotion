import {clipPolygon} from './stage-safety.js';

// Perspective-correct plane depth at a shared screen point. Average quad depth
// is insufficient when a small glass surface passes under a wide text plane.
export function depthAt(item,p){
  for(const indices of [[0,1,2],[0,2,3]]){
    const [a,b,c]=indices.map(i=>item.points[i]),den=(b.y-c.y)*(a.x-c.x)+(c.x-b.x)*(a.y-c.y);
    if(Math.abs(den)<1e-10)continue;
    const u=((b.y-c.y)*(p.x-c.x)+(c.x-b.x)*(p.y-c.y))/den,v=((c.y-a.y)*(p.x-c.x)+(a.x-c.x)*(p.y-c.y))/den,w=1-u-v;
    if(Math.min(u,v,w)<-1e-6)continue;
    const weights=[u,v,w],f=item.focal??1800,vertices=[a,b,c];let z=0,d=0;
    for(let i=0;i<3;i++){const q=weights[i]/(f-vertices[i].z);z+=q*vertices[i].z;d+=q;}
    return Math.abs(d)>1e-10?z/d:null;
  }
  return null;
}
export function surfaceDepthEdges(items){
  const visible=items.filter(i=>i.node.kind!=='group'),edges=[];
  const boxes=new Map(visible.map(i=>[i,{l:Math.min(...i.points.map(p=>p.x)),r:Math.max(...i.points.map(p=>p.x)),t:Math.min(...i.points.map(p=>p.y)),b:Math.max(...i.points.map(p=>p.y))}]));
  for(let i=0;i<visible.length;i++)for(let j=i+1;j<visible.length;j++){
    const a=visible[i],b=visible[j],A=boxes.get(a),B=boxes.get(b);
    if(A.r<=B.l||B.r<=A.l||A.b<=B.t||B.b<=A.t)continue;
    const overlap=clipPolygon(a.points,b.points);if(overlap.length<3)continue;
    const depths=overlap.map(p=>{const x=depthAt(a,p),y=depthAt(b,p);return x===null||y===null?null:x-y;});
    if(depths.some(d=>d===null))continue;
    if(depths.every(d=>d<-.0001))edges.push({from:a.node.id,to:b.node.id,separation:Math.min(...depths.map(d=>-d))});
    else if(depths.every(d=>d>.0001))edges.push({from:b.node.id,to:a.node.id,separation:Math.min(...depths)});
  }
  return edges.sort((a,b)=>b.separation-a.separation);
}
