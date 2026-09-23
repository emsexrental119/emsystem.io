const origin = 'https://emsystem-admin.emsystem-admin.workers.dev';
export const venueName = v => ({COEX:'코엑스',KINTEX:'킨텍스',SETEC:'세텍'}[v] || v);
export const summary = w => w.description || `${venueName(w.venue)}에서 진행한 ${w.title} 시공사례입니다. 행사 공간과 설치 현장을 사진으로 소개합니다.`;
const node = (tag,text,cls) => {const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e;};
const link = (text,href,cls) => {const a=node('a',text,cls);a.href=href;return a;};
const imageURL = src => src.startsWith('/media/')?origin+src:src;
export function drawDetail(target,w){
  const wrap=node('article',null,'case-detail');
  wrap.append(link('← 시공사례 전체 보기','/works/','case-back'),node('p','EMSYSTEM · PORTFOLIO','case-eyebrow'),node('h1',w.title));
  const meta=node('p',venueName(w.venue)+(w.date?' · '+w.date:''),'case-meta');wrap.append(meta,node('p',summary(w),'case-description'));
  const gallery=node('div',null,'case-gallery');
  w.images.forEach((p,i)=>{const figure=node('figure');const caption=p.alt&&p.alt!==w.title?p.alt:`${venueName(w.venue)} · ${w.title} 현장 사진 ${i+1}`;const img=node('img');img.src=imageURL(p.src);img.alt=caption;img.loading=i?'lazy':'eager';img.decoding='async';figure.append(img,node('figcaption',caption));gallery.append(figure);});
  wrap.append(gallery);const cta=node('aside',null,'case-cta');cta.append(node('h2','이런 전시 공간을 준비하고 계신가요?'),node('p','행사 장소와 일정, 필요한 구성을 알려주세요.'),link('견적 문의하기 →','/contact/','case-button'),link('시공사례 더 보기','/works/','case-back'));wrap.append(cta);target.replaceChildren(wrap);
  document.title=`${w.title} | ${venueName(w.venue)} 시공사례 · 이엠시스템`;
  for(const [key,value] of [['description',summary(w).slice(0,180)],['og:title',document.title],['og:description',summary(w).slice(0,180)],['og:image',new URL(imageURL(w.images[0].src),location.origin).href],['og:url',`https://emsystem.co.kr/works/${w.id}/`]]){let e=document.querySelector(`meta[name="${key}"],meta[property="${key}"]`);if(!e){e=node('meta');e.setAttribute(key.startsWith('og:')?'property':'name',key);document.head.append(e);}e.content=value;}
  const schema=document.querySelector('script[data-case-schema]');if(schema){const data=JSON.parse(schema.textContent);data.name=document.title;data.description=summary(w);data.primaryImageOfPage.contentUrl=new URL(imageURL(w.images[0].src),location.origin).href;data.breadcrumb.itemListElement[2].name=w.title;schema.textContent=JSON.stringify(data);}
  let canonical=document.querySelector('link[rel="canonical"]');if(!canonical){canonical=node('link');canonical.rel='canonical';document.head.append(canonical);}canonical.href=`https://emsystem.co.kr/works/${w.id}/`;
}
export async function refreshDetail(target,id){
  try{const r=await fetch(origin+'/api/public/content',{cache:'no-store',signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error();const data=await r.json();const w=data.works.find(w=>w.id===id);if(w){drawDetail(target,w);}else{target.replaceChildren(node('h1','공개되지 않은 시공사례입니다.'),link('시공사례 전체 보기','/works/'));const meta=node('meta');meta.name='robots';meta.content='noindex';document.head.append(meta);document.querySelectorAll('script[data-case-schema]').forEach(e=>e.remove());}}
  catch {if(!target.textContent.trim())target.append(node('p','사진을 불러오지 못했습니다. 잠시 후 다시 방문해 주세요.'),link('시공사례 전체 보기','/works/'));}
}
const initial=document.querySelector('[data-case-id]');if(initial)refreshDetail(initial,initial.dataset.caseId);
