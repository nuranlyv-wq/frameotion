// A measured beat grid is supplied by the caller. This module never fabricates audio analysis.
export function createBeatClock({beats,fps=24,duration,confidence=1}={}){
  if(!Array.isArray(beats)||beats.length<2||beats.some((t,i)=>!Number.isFinite(t)||t<0||i&&t<=beats[i-1])||!Number.isInteger(fps)||fps<1||!Number.isFinite(confidence)||confidence<.3)throw Error('A reliable, strictly increasing measured beat grid and output fps are required');
  const time=index=>{if(!Number.isFinite(index)||index<0||index>beats.length-1)throw Error('Beat index outside measured grid');const i=Math.floor(index),q=index-i;return q?beats[i]+q*(beats[i+1]-beats[i]):beats[i];};
  const frame=index=>{const f=Math.round(time(index)*fps);if(duration!==undefined&&f>Math.round(duration*fps))throw Error('Beat lies outside output duration');return f;};
  return {fps,confidence,time,frame,seconds:index=>frame(index)/fps,nearest:seconds=>{let best=0;for(let i=1;i<beats.length;i++)if(Math.abs(beats[i]-seconds)<Math.abs(beats[best]-seconds))best=i;return {index:best,time:beats[best],frame:frame(best),errorMs:(frame(best)/fps-beats[best])*1000};}};
}

export function retimeStageToBeats(input,{clock,startFrame,endFrame,landmarks}={}){
  if(!clock||!(endFrame>startFrame)||!Array.isArray(landmarks)||!landmarks.length)throw Error('Retiming needs a beat clock, scene frame range and explicit landmarks');
  const pairs=[{from:0,to:0},...landmarks.map(({at,beat})=>({from:at,to:(clock.frame(beat)-startFrame)/(endFrame-startFrame)})),{from:1,to:1}].sort((a,b)=>a.from-b.from),points=[];
  for(const pair of pairs){if(!Number.isFinite(pair.from)||pair.from<0||pair.from>1||pair.to<0||pair.to>1)throw Error('Retiming landmark outside scene');const prior=points.at(-1);if(prior?.from===pair.from){if(Math.abs(prior.to-pair.to)>1e-9)throw Error('Conflicting retiming landmarks');continue;}if(prior&&pair.to<=prior.to)throw Error('Beat quantisation collapses or reverses landmarks; choose a wider musical interval');points.push(pair);}
  const map=t=>{if(t<=0)return 0;if(t>=1)return 1;const i=points.findIndex(p=>p.from>=t),a=points[i-1],b=points[i];return a.to+(b.to-a.to)*(t-a.from)/(b.from-a.from);};
  const stage=structuredClone(input);if(stage.fragments?.length)throw Error('Expand scene fragments before retiming');
  for(const node of stage.nodes){
    if(node.orbit){const original=node.orbit.timing??[{t:node.start,progress:0},...points.filter(p=>p.from>node.start&&p.from<node.end).map(p=>({t:p.from,progress:(p.from-node.start)/(node.end-node.start)})),{t:node.end,progress:1}];node.orbit.timing=original.map(k=>({...k,t:map(k.t)}));}
    node.start=map(node.start);node.end=map(node.end);if(node.track)node.track=node.track.map(k=>({...k,t:map(k.t)}));if(node.contacts)node.contacts=node.contacts.map(c=>({...c,from:map(c.from),to:map(c.to)}));if(node.control){if(node.control.from!==undefined)node.control.from=map(node.control.from);if(node.control.to!==undefined)node.control.to=map(node.control.to);}
  }
  if(stage.camera)stage.camera=stage.camera.map(k=>({...k,t:map(k.t)}));if(stage.events)stage.events=stage.events.map(event=>({...event,t:map(event.t)}));
  return {stage,landmarks:points,map};
}
