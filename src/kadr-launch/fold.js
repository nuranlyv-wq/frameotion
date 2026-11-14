import {projectVolume} from './spatial.js';

const mix = (a,b,t) => a + (b-a)*t;

// Hinged panels share their inner edge with the centre sheet. The last part of a
// package fold settles these panels onto the lit faces of the closed box.
export function foldFaces(box, progress, material) {
  const {x,y,w,h} = box;
  const p = Math.max(0,Math.min(1,progress));
  const angle = p * Math.PI / 2;
  const reach = Math.cos(angle) * .6;
  const lift = Math.sin(angle) * .24;
  const a=[x,y], b=[x+w,y], d=[x,y+h], e=[x+w,y+h];
  const panels = [
    {points:[a,b,e,d],light:.05,front:true},
    {points:[a,[x-w*reach,y-h*lift],[x-w*reach,y+h-h*lift],d],light:-.12},
    {points:[b,[x+w+w*reach,y-h*lift],[x+w+w*reach,y+h-h*lift],e],light:.12},
    {points:[a,[x+w*lift,y-h*reach],[x+w+w*lift,y-h*reach],b],light:.2},
    {points:[d,[x+w*lift,y+h+h*reach],[x+w+w*lift,y+h+h*reach],e],light:-.06},
  ];
  if (material === 'paper') return panels;
  const closed = projectVolume(box,'box',Math.round(w*.46),-16,28);
  const settle = Math.max(0,(p-.72)/.28);
  return panels.map((panel,index) => {
    const target = closed[index % closed.length];
    return {...panel,
      points:panel.points.map((point,i) => point.map((value,axis) => mix(value,target.points[i][axis],settle))),
      light:mix(panel.light,target.light,settle),
      front:settle < .5 ? Boolean(panel.front) : target.front && index < closed.length,
      opacity:index >= closed.length ? 1-settle : 1,
    };
  });
}
