// Frame sequences are discrete pictures. Shutter samples may move geometry inside
// a picture's interval, but must never average two consecutive source pictures.
export function stageImageCuts(score) {
  const cuts=[];
  for(const element of score.elements??[]) {
    if(!element.stage)continue;
    const span=element.end-element.start,groups=new Map();
    for(const node of element.stage.nodes) {
      if(node.kind!=='image'||node.track?.length||(node.end-node.start)*span>score.fps*.2+1e-6)continue;
      const signature=JSON.stringify([node.parent,node.x,node.y,node.z??0,node.w,node.h,node.rx??0,node.ry??0,node.rz??0,node.scale??1,node.anchorX,node.anchorY,node.fit,node.clipTo,node.clipToParent]);
      if(!groups.has(signature))groups.set(signature,[]);groups.get(signature).push(node);
    }
    for(const nodes of groups.values()) {
      nodes.sort((a,b)=>a.start-b.start);
      for(let i=1;i<nodes.length;i++) {
        const a=nodes[i-1],b=nodes[i];
        if(a.assetId===b.assetId||Math.abs(a.end-b.start)>1e-7)continue;
        for(const t of [a.start,a.end,b.end])cuts.push(Math.round((element.start+t*span)*1e6)/1e6);
      }
    }
  }
  return [...new Set(cuts)].sort((a,b)=>a-b);
}
export function shutterSampleTime(frame,index,count,samplesPerFrame,cuts) {
  const cut=cuts.findLastIndex(t=>t<=frame),start=cuts[cut],end=cuts[cut+1];
  const offset=count===1?0:(index/(count-1)-.5)*.5/samplesPerFrame;
  // A tiny right bias avoids floating-point equality selecting the prior picture.
  return Math.max(start+1e-6,Math.min(end-.001,frame+offset));
}
