import {stageFrame,stagePose} from './stage-player.js';

// Compile a carried image into a real overlay stage. Endpoints are measured through
// each scene's own camera, so different cameras/depths cannot move the landing.
export function projectedStagePose(element,nodeId,frame,height=562.5) {
  const t=(frame-element.start)/(element.end-element.start);
  const item=stageFrame(element.stage,t,height).find(item=>item.node.id===nodeId);
  if(!item)throw new Error(`Handoff actor ${element.id}/${nodeId} is not visible at ${frame}`);
  const p=item.points,center=item.point(.5,.5);
  return {x:center.x,y:center.y,w:(Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y)+Math.hypot(p[2].x-p[3].x,p[2].y-p[3].y))/2,
    h:(Math.hypot(p[3].x-p[0].x,p[3].y-p[0].y)+Math.hypot(p[2].x-p[1].x,p[2].y-p[1].y))/2,
    rz:Math.atan2(p[1].y-p[0].y,p[1].x-p[0].x)*180/Math.PI};
}

export function createStageHandoff({id,from,fromNode,to,toNode,start,end,width,height,fps=30}) {
  if(!(start<from.end&&end>to.start&&start<end))throw new Error('Handoff must span the joined scene boundary');
  const a=from.stage.nodes.find(node=>node.id===fromNode),b=to.stage.nodes.find(node=>node.id===toNode);
  if(!a?.assetId||!b?.assetId)throw new Error('Handoff needs two image actors');
  const A=projectedStagePose(from,fromNode,start,1000*height/width),B=projectedStagePose(to,toNode,end,1000*height/width);
  const spanFrom=from.end-from.start,cut=(start-from.start)/spanFrom;
  const originalTrack=a.track;
  a.end=cut;a.track=(originalTrack??[]).filter(key=>key.t<cut);
  if(!a.track.length){
    if(originalTrack?.length)a.track=[{...originalTrack[0],t:a.start},{...originalTrack[0],t:cut}];
    else delete a.track;
  }
  if(a.track?.length===1)a.track.push({...a.track[0],t:cut});
  const spanTo=to.end-to.start,landing=(end-to.start)/spanTo,pose=stagePose(b,landing);
  b.start=landing;b.track=[{t:landing,...Object.fromEntries(['x','y','z','rx','ry','rz','scale','w','h','opacity','blur'].map(key=>[key,pose[key]])),opacity:1,blur:0},...(b.track??[]).filter(key=>key.t>landing)];
  if(b.track.length===1)b.track.push({...b.track[0],t:b.end});
  for(const event of to.stage.events??[])if(event.actor===b.id&&event.t<landing)event.t=landing;
  // Both source and destination textures share precisely the same changing plane.
  const keys=[{t:0,...A},{t:1,...B,ease:'fluid'}];
  const plane=(node,first)=>({id:first?'departing':'arriving',kind:'image',assetId:node.assetId,x:0,y:0,w:first?A.w:B.w,h:first?A.h:B.h,start:0,end:1,fit:'contain',crop:'allow',z:0,revealDirection:first?'right':'left',
    track:keys.map((key,index)=>({...key,reveal:first?(index?0:1):(index?1:0),opacity:1,blur:0}))});
  return {id,kind:'stage',start,end,box:{x:0,y:0,w:width,h:height,radius:0},fill:'foreground',enter:'none',exit:'cut',enterFrames:1,sound:'none',evidenceIds:[],space:'screen',
    stage:{perspective:1800,nodes:[plane(a,true),plane(b,false)],events:[{t:.85,kind:'whoosh',actor:'arriving'}]}};
}
