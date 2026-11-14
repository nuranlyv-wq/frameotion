import path from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {load} from 'cheerio';
import {loadImage} from '@napi-rs/canvas';
import {fetchPublic} from './public-fetch.js';

const clean=value=>String(value??'').replace(/\s+/gu,' ').trim();
export function imageCandidates(html,baseUrl) {
  const $=load(html),found=[];
  const add=(input,caption,role)=>{
    if (!input) return;
    try {
      const url=new URL(input,baseUrl);
      if (!['http:','https:'].includes(url.protocol) || url.username || url.password ||
          /(?:logo|favicon|sprite|badge|tracking|pixel|spacer|payment|\.svg(?:\?|$))/iu.test(url.pathname)) return;
      if (!found.some(item=>item.url===url.href)) found.push({url:url.href,caption:clean(caption).slice(0,160),role});
    } catch { /* Invalid source attribute. */ }
  };
  $('main img,article img,section img,[class*="product"] img,figure img').each((_,el)=>{
    const img=$(el),w=Number(img.attr('width')),h=Number(img.attr('height'));
    if (w && w<140 || h && h<100 || img.closest('header,nav,footer').length) return;
    const caption=img.attr('alt') || img.closest('figure').find('figcaption').text();
    const src=img.attr('data-src') || img.attr('data-original') || img.attr('src');
    const srcset=img.attr('data-srcset') || img.attr('srcset');
    const largest=srcset?.split(',').map(item=>item.trim().split(/\s+/u)).sort((a,b)=>parseFloat(b[1]||'0')-parseFloat(a[1]||'0'))[0]?.[0];
    add(largest || src,caption,img.closest('[class*="product"],article').length?'product-photo':'site-image');
  });
  add($('meta[property="og:image"]').attr('content'),$('meta[property="og:title"]').attr('content'),'site-image');
  return found.slice(0,12);
}

export async function importSourceImages(candidates,dir,{signal,fetcher=fetchPublic,limit=5}={}) {
  await mkdir(dir,{recursive:true});
  const results=await Promise.allSettled(candidates.slice(0,limit).map(async(candidate,index)=>{
    const {body,finalUrl}=await fetcher(candidate.url,{signal,maxBytes:5*1024*1024,timeoutMs:9000,
      contentType:/^image\/(?:png|jpe?g|webp|avif)(?:;|$)/iu});
    const image=await loadImage(body);
    if (image.width<140 || image.height<100 || image.width*image.height>16e6 ||
        Math.max(image.width/image.height,image.height/image.width)>4) return null;
    const file=path.join(dir,`source-${index}.img`);await writeFile(file,body);
    return {...candidate,url:finalUrl,path:file,width:image.width,height:image.height};
  }));
  signal?.throwIfAborted();
  return results.flatMap(result=>result.status==='fulfilled'&&result.value?[result.value]:[]);
}
