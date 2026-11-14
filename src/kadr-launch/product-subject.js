// Conservative edge-connected neutral matte removal, only for explicitly tagged
// product photographs. Interior white printing remains enclosed and untouched.
export function productSubject(input,width,height) {
 if(width*height>12_000_000)return null;
 const neutral=i=>input[i+3]<8||Math.min(input[i],input[i+1],input[i+2])>=235&&Math.max(input[i],input[i+1],input[i+2])-Math.min(input[i],input[i+1],input[i+2])<=18;
 let edges=0,neutralEdges=0;
 for(let x=0;x<width;x++)for(const y of[0,height-1]){edges++;if(neutral((y*width+x)*4))neutralEdges++;}
 for(let y=1;y<height-1;y++)for(const x of[0,width-1]){edges++;if(neutral((y*width+x)*4))neutralEdges++;}
 if(neutralEdges/edges<.9)return null;
 const data=new Uint8ClampedArray(input),seen=new Uint8Array(width*height),queue=new Uint32Array(width*height);let head=0,tail=0;
 const add=p=>{if(!seen[p]){seen[p]=1;queue[tail++]=p;}};
 for(let x=0;x<width;x++){add(x);add((height-1)*width+x);}for(let y=0;y<height;y++){add(y*width);add(y*width+width-1);}
 while(head<tail){const p=queue[head++],i=p*4;if(!neutral(i))continue;data[i+3]=0;const x=p%width,y=Math.floor(p/width);if(x)add(p-1);if(x+1<width)add(p+1);if(y)add(p-width);if(y+1<height)add(p+width);}
 let left=width,right=0,top=height,bottom=0,count=0;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(data[(y*width+x)*4+3]>24){count++;left=Math.min(left,x);right=Math.max(right,x+1);top=Math.min(top,y);bottom=Math.max(bottom,y+1);}
 if(count<width*height*.01||count>width*height*.9)return null;
 return {data,bounds:{x:left,y:top,w:right-left,h:bottom-top}};
}
