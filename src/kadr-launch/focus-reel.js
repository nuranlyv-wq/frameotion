// A single focus timeline drives both the media belt and its word list.
export function focusReelTracks(keys,{mediaStep,labelStep}){
  if(!keys.length||keys.some((key,i)=>i&&key.t<=keys[i-1].t))throw new Error('Focus keys must increase');
  return {
    media:keys.map(({t,index,ease='fluid'})=>({t,y:-index*mediaStep,ease})),
    labels:keys.map(({t,index,ease='fluid'})=>({t,y:-index*labelStep,ease})),
    emphasis:slot=>keys.map(({t,index,ease='fluid'})=>({t,opacity:Math.max(0,1-Math.abs(index-slot)),ease})),
  };
}
