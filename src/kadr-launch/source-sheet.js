import path from 'node:path';
import {writeFile} from 'node:fs/promises';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {resolveBrandAsset} from '../production/brand-assets.js';
import {isVisualAsset} from './media.js';

// The director sees the pixels it is choosing, not just opaque asset IDs.
export async function sourceMediaSheet(source,dir) {
  const assets=source.assets.filter(isVisualAsset).slice(0,10),loaded=[];
  for(const asset of assets)try{loaded.push({asset,image:await loadImage(resolveBrandAsset(asset.id).file)});}catch{/* Missing optional media is not pictured. */}
  if(!loaded.length)return null;
  const cols=Math.min(3,loaded.length),w=360,h=300,canvas=createCanvas(cols*w,Math.ceil(loaded.length/cols)*h),c=canvas.getContext('2d');
  c.fillStyle='#EDEEF0';c.fillRect(0,0,canvas.width,canvas.height);
  loaded.forEach(({asset,image},i)=>{
    const x=i%cols*w,y=Math.floor(i/cols)*h,ratio=Math.min((w-24)/image.width,(h-72)/image.height);
    c.fillStyle='#FFFFFF';c.fillRect(x+8,y+8,w-16,h-64);
    c.drawImage(image,x+w/2-image.width*ratio/2,y+10+(h-78-image.height*ratio)/2,image.width*ratio,image.height*ratio);
    c.fillStyle='#17191C';c.font='13px sans-serif';c.fillText(asset.id,x+12,y+h-38,w-24);
    c.font='14px sans-serif';c.fillText(asset.caption || asset.name || asset.role || asset.kind,x+12,y+h-16,w-24);
  });
  const file=path.join(dir,'source-media.jpg');await writeFile(file,canvas.toBuffer('image/jpeg'));return file;
}
