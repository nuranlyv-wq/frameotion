import {useEffect,useState} from 'react';
import {delayRender,continueRender,cancelRender} from 'remotion';

export function useResourceFonts(fonts={}){
 const [ready,setReady]=useState(Object.keys(fonts).length===0);
 const [handle]=useState(()=>Object.keys(fonts).length?delayRender('Loading selected local fonts'):null);
 useEffect(()=>{
  let active=true;
  Promise.all(Object.values(fonts).map(async f=>{
   const weight=f.weight?.length===2?f.weight.join(' '):String(f.weight?.[0]||400);
   const face=new FontFace(f.family,`url(${f.src})`,{weight});await face.load();document.fonts.add(face);
  })).then(()=>{if(active)setReady(true);if(handle!==null)continueRender(handle);}).catch(cancelRender);
  return ()=>{active=false;};
 },[fonts,handle]);
 return ready;
}
