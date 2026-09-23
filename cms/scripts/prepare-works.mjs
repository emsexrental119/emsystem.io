import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const origin='https://emsystem-admin.emsystem-admin.workers.dev';
const response=await fetch(origin+'/api/public/content',{signal:AbortSignal.timeout(30000)});
if(!response.ok)throw Error('Published CMS unavailable: '+response.status);
const data=await response.json();
if(!Array.isArray(data.works)||data.works.some(w=>!/^[-\w]+$/.test(w.id)||!w.title||!w.venue||!Array.isArray(w.images)||!w.images.length))throw Error('Invalid published works');
const works=data.works.filter(w=>w.visible!==false);
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const venue=w=>({COEX:'코엑스',KINTEX:'킨텍스',SETEC:'세텍'}[w.venue]||w.venue);
const description=w=>w.description||`${venue(w)}에서 진행한 ${w.title} 시공사례입니다. 행사 공간과 설치 현장을 사진으로 소개합니다.`;
const image=src=>new URL(src.startsWith('/media/')?origin+src:src,'https://emsystem.co.kr').href;
const nav='<nav class="case-nav" aria-label="주 메뉴"><a href="/"><strong>EMSYSTEM</strong></a><div><a href="/works/">시공사례</a><a href="/services/">서비스안내</a><a href="/assembly/">조립방법</a><a href="/contact/">견적문의</a></div></nav>';
const manifest=path.join(root,'works/generated.json');
const previous=fs.existsSync(manifest)?JSON.parse(fs.readFileSync(manifest,'utf8')):[];
for(const id of previous){if(!/^[-\w]+$/.test(id))throw Error('Unsafe previous route');if(!works.some(w=>w.id===id)){const dir=path.resolve(root,'works',id);if(path.dirname(dir)!==path.resolve(root,'works'))throw Error('Unsafe delete');fs.rmSync(dir,{recursive:true,force:true});}}
for(const w of works){
  const url=`https://emsystem.co.kr/works/${w.id}/`,title=`${w.title} | ${venue(w)} 시공사례 · 이엠시스템`,desc=description(w);
  const photos=w.images.map((p,i)=>{const alt=p.alt&&p.alt!==w.title?p.alt:`${venue(w)} · ${w.title} 현장 사진 ${i+1}`;return `<figure><img src="${esc(image(p.src))}" alt="${esc(alt)}" loading="${i?'lazy':'eager'}" decoding="async"><figcaption>${esc(alt)}</figcaption></figure>`;}).join('');
  const schema={'@context':'https://schema.org','@type':'WebPage',name:title,url,description:desc,isPartOf:{'@type':'WebSite',name:'이엠시스템',url:'https://emsystem.co.kr/'},primaryImageOfPage:{'@type':'ImageObject',contentUrl:image(w.images[0].src)},breadcrumb:{'@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:'홈',item:'https://emsystem.co.kr/'},{'@type':'ListItem',position:2,name:'시공사례',item:'https://emsystem.co.kr/works/'},{'@type':'ListItem',position:3,name:w.title,item:url}]}};
  const html=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="description" content="${esc(desc.slice(0,180))}"><link rel="canonical" href="${url}"><meta name="robots" content="index,follow"><meta property="og:type" content="website"><meta property="og:site_name" content="이엠시스템"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc.slice(0,180))}"><meta property="og:url" content="${url}"><meta property="og:image" content="${esc(image(w.images[0].src))}"><link rel="stylesheet" href="/assets/work-detail.css"><script data-case-schema type="application/ld+json">${JSON.stringify(schema).replaceAll('<','\\u003c')}</script><script type="module" src="/assets/work-detail.js"></script></head><body class="case-page">${nav}<main data-case-id="${w.id}"><article class="case-detail"><a class="case-back" href="/works/">← 시공사례 전체 보기</a><p class="case-eyebrow">EMSYSTEM · PORTFOLIO</p><h1>${esc(w.title)}</h1><p class="case-meta">${esc(venue(w))}${w.date?' · '+esc(w.date):''}</p><p class="case-description">${esc(desc)}</p><div class="case-gallery">${photos}</div><aside class="case-cta"><h2>이런 전시 공간을 준비하고 계신가요?</h2><p>행사 장소와 일정, 필요한 구성을 알려주세요.</p><a class="case-button" href="/contact/">견적 문의하기 →</a><a class="case-back" href="/works/">시공사례 더 보기</a></aside></article></main><footer class="case-footer">주식회사 이엠시스템 · 031-528-3119 · 경기도 남양주시 화도읍</footer></body></html>`;
  fs.mkdirSync(path.join(root,'works',w.id),{recursive:true});fs.writeFileSync(path.join(root,'works',w.id,'index.html'),html);
}
fs.writeFileSync(manifest,JSON.stringify(works.map(w=>w.id))+'\n');
const list=works.map(w=>`<article><h2><a href="/works/${w.id}/">${esc(w.title)}</a></h2><p>${esc(venue(w))}${w.date?' · '+esc(w.date):''}</p><p>${esc(description(w))}</p></article>`).join('');
let index=fs.readFileSync(path.join(root,'works/index.html'),'utf8');index=index.replace(/<div id="root">[\s\S]*?<\/div>/,'<div id="root"><main class="case-directory"><h1>이엠시스템 시공사례</h1>'+list+'</main></div>');fs.writeFileSync(path.join(root,'works/index.html'),index);
const basic=['/','/services/','/works/','/assembly/','/contact/'];
fs.writeFileSync(path.join(root,'sitemap.xml'),'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+[...basic,...works.map(w=>`/works/${w.id}/`)].map(p=>`<url><loc>https://emsystem.co.kr${p}</loc></url>`).join('\n')+'\n</urlset>\n');
console.log(`Generated ${works.length} published case pages and ${works.length+basic.length} sitemap URLs.`);
