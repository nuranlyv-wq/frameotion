import {writeFile} from 'node:fs/promises';
// Original deterministic synthesized effects; no third-party recordings.
export async function synthesize(cues,seconds,file,fps){
 const rate=48000,n=Math.ceil(seconds*rate),samples=new Float32Array(n*2);let seed=0x1234abcd;
 const noise=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2147483648-1;};
 for(const cue of cues){const length=cue.kind==='whoosh'?.35:cue.kind==='ding'?.5:.12,start=Math.max(0,Math.round((cue.frame/fps-(cue.kind==='whoosh'?.2:0))*rate));let smooth=0;
  for(let i=0;i<Math.floor(length*rate)&&start+i<n;i++){const t=i/rate,u=t/length;let v;
   if(cue.kind==='whoosh'){smooth+=.12*(noise()-smooth);v=smooth*Math.sin(Math.PI*u)*.35;}
   else if(cue.kind==='ding')v=Math.sin(2*Math.PI*850*t)*Math.exp(-7*t)*.2;
   else if(cue.kind==='pop')v=Math.sin(2*Math.PI*(480-180*u)*t)*Math.exp(-22*t)*.35;
   else v=(Math.sin(2*Math.PI*1100*t)+noise()*.3)*Math.exp(-55*t)*.25;
   const amplitude=(cue.gain||35)/100; samples[(start+i)*2]+=v*amplitude;samples[(start+i)*2+1]+=v*amplitude;
  }
 }
 const data=Buffer.alloc(44+n*4);data.write('RIFF',0);data.writeUInt32LE(36+n*4,4);data.write('WAVEfmt ',8);data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(2,22);data.writeUInt32LE(rate,24);data.writeUInt32LE(rate*4,28);data.writeUInt16LE(4,32);data.writeUInt16LE(16,34);data.write('data',36);data.writeUInt32LE(n*4,40);for(let i=0;i<samples.length;i++)data.writeInt16LE(Math.round(Math.max(-1,Math.min(1,samples[i]))*32767),44+i*2);await writeFile(file,data);
}
