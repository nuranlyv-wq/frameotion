import {writeFile} from 'node:fs/promises';

// Original, frame-synced instrumental. Section changes and instrumental rests
// make room for the click, three calendar ticks and the final price/brand reads.
export async function writeImpactMusic(file, seconds) {
  const rate = 48_000, size = Math.round(rate * seconds), tau = 2*Math.PI;
  const stereo = [new Float32Array(size), new Float32Array(size)];
  const note = midi => 440 * 2**((midi-69)/12);
  let seed=0x1aba3231;
  const noise=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2147483648-1;};
  function voice(frame, length, level, pan, sample) {
    const at = Math.round(frame*rate*seconds/450), max=Math.min(size-at,Math.round(length*rate));
    const l=level*Math.sqrt((1-pan)/2), r=level*Math.sqrt((1+pan)/2);
    for(let i=0;i<max;i++) {
      const t=i/rate, u=i/max, fade=Math.min(1,t/.006,(1-u)*24);
      const value=sample(t,u)*fade;
      stereo[0][at+i]+=value*l; stereo[1][at+i]+=value*r;
    }
  }
  const kick = (f, strength=1) => voice(f,.35,.32*strength,0,t=>Math.sin(tau*(49*t+3.55*(1-Math.exp(-22*t))))*Math.exp(-11*t));
  const bass = (f,n,a=.21,d=.41) => voice(f,d,a,0,t=>{
    const q=tau*note(n)*t;
    return (Math.sin(q)+.22*Math.sin(q*2)+.08*Math.sin(q*3))*Math.exp(-4.8*t);
  });
  const bell = (f,n,a=.13,pan=.15,d=.45) => voice(f,d,a,pan,t=>{
    const q=tau*note(n)*t;
    return (Math.sin(q + .37*Math.sin(q*2.01)*Math.exp(-11*t))+.14*Math.sin(q*3.01)*Math.exp(-19*t))*Math.exp(-6*t);
  });
  const hat = (f,a=.075,pan=.35) => {
    let last=0;
    voice(f,.14,a,pan,t=>{const n=noise(),high=(n-last)*.68;last=n;return high*Math.exp(-28*t);});
  };
  const clap = f => {
    let lp=0;
    voice(f,.19,.16,-.14,t=>{const n=noise();lp+=.22*(n-lp);return (n-lp)*Math.exp(-23*t)*(.7+.3*Math.cos(tau*58*t));});
  };
  const pad=(f,notes,d,a)=>notes.forEach((n,i)=>voice(f+i*2,d,a,((i%2)*2-1)*.42,(t,u)=>{
    const q=tau*note(n)*t;
    return (.76*Math.sin(q)+.14*Math.sin(q*2.003)+.1*Math.sin(q*3))*Math.sin(Math.PI*u)**.63;
  }));
  const pluck = (f,n,a) => {bell(f,n,a,-.19);bell(f+4,n,.2*a,.58,.32);};

  // 01: a tight three-note identity, then syncopated movement under the opener.
  for (const f of [0,14,30,54,75,92,105,162,177,194,208,225,254,283,313,366,389]) kick(f,f===254?1.25:f>283?.7:.9);
  for (const f of [14,42,69,91,177,207,238,283,313,389]) clap(f);
  for (const f of [5,14,21,28,36,44,52,57,64,72,82,96,108,167,181,190,196,204,211,217,225,233,243,261,271,289,304,323,344,382,398]) hat(f,f%3?.075:.11,f%2?.45:-.42);
  for (const [f,n,a] of [[0,36,.26],[12,36,.12],[29,43,.17],[43,45,.21],[57,40,.17],[75,41,.24],[91,41,.15],[104,43,.13],
    [162,36,.28],[177,43,.17],[194,40,.16],[208,45,.23],[225,43,.18],[254,41,.31],[280,41,.17],[310,43,.19],[339,43,.15],[366,36,.24],[389,36,.16]]) bass(f,n,a);
  for (const [f,n,a] of [[0,72,.16],[6,76,.16],[13,79,.19],[26,76,.13],[37,74,.12],[51,72,.15],[60,67,.13],
    [76,69,.15],[86,72,.11],[94,77,.13],[106,74,.12],[139,72,.14],[145,76,.12],[151,79,.12],
    [163,67,.13],[174,72,.12],[185,74,.13],[195,76,.18],[209,79,.2],[219,84,.14],[236,79,.11],
    [255,65,.16],[264,69,.13],[278,72,.18],[291,77,.14],[313,74,.10],[334,71,.12],
    [367,72,.14],[373,76,.17],[380,79,.2],[389,84,.17],[403,79,.10]]) pluck(f,n,a);
  pad(0,[48,55,59,64],2.35,.055);
  pad(73,[41,48,52,57],1.62,.06);
  // Intentional near-silence under the toggle click at frame 127.
  pad(136,[43,50,57,60],.72,.055);
  pad(162,[48,55,60,64],2.8,.058);
  pad(254,[41,48,53,57],2.05,.071);
  pad(310,[43,50,55,59],1.55,.06);
  pad(366,[48,55,60,64,67],2.75,.075);
  // Soft upward intake as the parcel folds into the brand mark.
  let last=0;
  voice(354,.52,.105,-.23,(t,u)=>{const n=noise();last+=(.04+.45*u)*(n-last);return last*Math.sin(Math.PI*u)*u;});

  const wav=Buffer.alloc(44+size*4);
  wav.write('RIFF',0); wav.writeUInt32LE(wav.length-8,4); wav.write('WAVEfmt ',8);
  wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(2,22);wav.writeUInt32LE(rate,24);
  wav.writeUInt32LE(rate*4,28);wav.writeUInt16LE(4,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(size*4,40);
  for(let i=0;i<size;i++) for(let ch=0;ch<2;ch++) wav.writeInt16LE(Math.round(Math.tanh(stereo[ch][i])*32767),44+i*4+ch*2);
  await writeFile(file,wav);
}
