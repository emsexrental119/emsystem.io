import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const origin=process.argv[2] || '';
if(origin && (new URL(origin).protocol!=='https:' || new URL(origin).origin!==origin))throw Error('Provide an HTTPS origin without a trailing slash.');
let source=fs.readFileSync(path.join(root,'assets/index-odc-20260921.js'),'utf8');
function replace(before,after){if(!source.includes(before))throw Error('Missing integration anchor: '+before.slice(0,80));source=source.replace(before,after);}
replace('{label:"카카오 상담",href:"http://pf.kakao.com/_SxlTzX"}];return c.jsx("footer"','{label:"카카오 상담",href:"http://pf.kakao.com/_SxlTzX"},{label:"관리자 로그인",href:"/admin/"}];return c.jsx("footer"');
replace('children:["전시부스 · 사인물 · 인포데스크",', 'children:["이엠시스템 · EM시스템",c.jsx("br",{}),"전시부스 · 사인물 · 인포데스크",');
const helper=`
const cmsOrigin=${JSON.stringify(origin)};
let cmsContent=null;const cmsListeners=new Set();
if(cmsOrigin)fetch(cmsOrigin+'/api/public/content',{signal:AbortSignal.timeout(5000),cache:'no-store'}).then(r=>{if(!r.ok)throw Error('CMS unavailable');return r.json()}).then(data=>{if(!Array.isArray(data.works)||!data.hero||!data.hero.images.length)return;cmsContent=data;for(const notify of cmsListeners)notify();}).catch(()=>{});
function useCMSContent(){const [data,setData]=y.useState(cmsContent);y.useEffect(()=>{const update=()=>setData(cmsContent);cmsListeners.add(update);update();return()=>cmsListeners.delete(update)},[]);return data;}
function cmsImage(src){return src.startsWith('/media/')?cmsOrigin+src:src;}
`;
replace('c.jsx("div",{style:{fontSize:10,color:"rgba(255,255,255,0.2)",marginTop:64', 'c.jsx("a",{href:"/admin/",style:{display:"inline-block",fontSize:11,color:"#888",marginTop:24,textDecoration:"none"},children:"관리자 로그인"}),c.jsx("div",{style:{fontSize:10,color:"rgba(255,255,255,0.2)",marginTop:64');
replace('function HeroRotatingBackground({backgroundRef}){',helper+'function HeroRotatingBackground({backgroundRef}){const cms=useCMSContent(),images=cms?cms.hero.images.map(p=>cmsImage(p.src)):[1,2,3].map(n=>"/images/hero/exhibition-"+n+".jpg");');
replace('setIndex(n=>(n+1)%3)','setIndex(n=>(n+1)%images.length)');
replace('},[reduced]);return c.jsx("div",{ref:backgroundRef','},[reduced,images.length]);return c.jsx("div",{ref:backgroundRef');
replace('children:[1,2,3].map((n,i)=>c.jsx("img",{src:"/images/hero/exhibition-"+n+".jpg"','children:images.map((n,i)=>c.jsx("img",{src:n');
replace('opacity:index===i?1:0','opacity:index%images.length===i?1:0');
replace('function Mh(){','function Mh(){const cms=useCMSContent();');
replace('children:Lh.map((a,s)=>','children:(cms&&Array.isArray(cms.services)&&cms.services.length===8?cms.services.map(a=>({...a,img:cmsImage(a.img)})):Lh).map((a,s)=>');
const title='[{text:"전시의",color:"#f0ede8",delay:"0ms"},{text:"완성도를",color:"#c8a96e",delay:"100ms"},{text:"높이다",color:"#f0ede8",delay:"200ms"}]';
replace(title,'(cms?cms.hero.title.split("\\n").map((text,i)=>({text,color:i===1?"#c8a96e":"#f0ede8",delay:i*100+"ms"})):'+title+')');
replace('},s)),c.jsxs("div",{className:On("flex gap-4 justify-center mt-12','},s)),cms&&cms.hero.description?c.jsx("p",{style:{whiteSpace:"pre-line",lineHeight:1.8,maxWidth:600,margin:"24px auto 0",color:"#f0ede8",fontSize:15},children:cms.hero.description}):null,c.jsxs("div",{className:On("flex gap-4 justify-center mt-12');
replace('function Bh(){return','function Bh(){const cms=useCMSContent(),groups=cms?cms.works.map(w=>({slug:w.id,expo:w.title,venue:w.venue,date:w.date,items:w.images.map((p,i)=>({id:w.id+"-"+i,img:cmsImage(p.src),title:p.alt||w.title}))})):Gh;return');
replace('children:Gh.map(g=>','children:groups.map(g=>');
replace('children:g.expo}),g.date?', 'children:c.jsx("a",{href:"/works/"+g.slug+"/",style:{color:"inherit",textDecoration:"underline",textUnderlineOffset:6},children:g.expo+" · 상세보기 →"})}),g.date?');
replace('function Bh(){', 'function WorkDetailRoute(){const id=decodeURIComponent(location.pathname.split("/")[2]||"");y.useEffect(()=>{import("/assets/work-detail.js").then(m=>m.refreshDetail(document.getElementById("work-detail-root"),id))},[id]);return c.jsxs("div",{className:"case-page",children:[c.jsx(vr,{}),c.jsx("main",{id:"work-detail-root",style:{paddingTop:100,minHeight:"70vh"}})]});}function Bh(){');
replace('path:"/works",element:c.jsx(Bh,{})}),', 'path:"/works",element:c.jsx(Bh,{})}),c.jsx(Vt,{path:"/works/:id",element:c.jsx(WorkDetailRoute,{})}),');

const pageStart=source.indexOf('function Oh(){'),pageEnd=source.indexOf('const Fh=',pageStart);
if(pageStart<0||pageEnd<0)throw Error('Service page anchors missing');
let page=source.slice(pageStart,pageEnd);
const pageDefaults=JSON.parse(fs.readFileSync(path.join(root,'cms/service-page-defaults.json'),'utf8'));
function pageReplace(before,after){if(!page.includes(before))throw Error('Service page anchor missing: '+before);page=page.replace(before,after);}
pageReplace('function Oh(){return','function Oh(){const cms=useCMSContent(),p=cms&&cms.servicePage?cms.servicePage:'+JSON.stringify(pageDefaults)+';return');
for(const [key,value] of Object.entries(pageDefaults)){
  if(typeof value==='string')pageReplace('children:'+JSON.stringify(value),'children:p.'+key);
}
pageReplace('Ih.map((e,t)=>','p.items.map((e,t)=>');
pageReplace('Dh.map((e,t)=>','p.steps.map((e,t)=>');
pageReplace('src:e.img','src:cmsImage(e.img)');
pageReplace('children:["견적 문의하기 ",','children:[e.btn," ",');
source=source.slice(0,pageStart)+page+source.slice(pageEnd);
fs.writeFileSync(path.join(root,'assets/index-cms-20260921.js'),source);
const html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/assets\/index-(?:odc|cms)-20260921\.js/,'assets/index-cms-20260921.js');fs.writeFileSync(path.join(root,'index.html'),html);
fs.mkdirSync(path.join(root,'admin'),{recursive:true});
fs.writeFileSync(path.join(root,'admin/index.html'),'<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EMSYSTEM 관리자</title><body><p>관리자 화면으로 이동합니다.</p><script src="/admin/redirect.js"></script></body></html>');
fs.writeFileSync(path.join(root,'admin/redirect.js'),origin?'location.replace('+JSON.stringify(origin+'/admin/')+');':'document.querySelector("p").textContent="관리자 서비스 연결을 준비 중입니다.";');
console.log('CMS integration prepared. Connected:',Boolean(origin));

await import('./prepare-seo.mjs');

await import("./prepare-works.mjs");
