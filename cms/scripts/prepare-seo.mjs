import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const pages = JSON.parse(fs.readFileSync(path.join(root, 'cms/scripts/seo-pages.json'), 'utf8'));
const escape = s => s.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
let template = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
template = template.replace(/\s*<link rel="canonical"[^>]*>/g, '').replace(/\s*<script src="\/assets\/seo.js"[^>]*><\/script>/g, '');
for (const [route, title, description, heading] of pages) {
  const url = 'https://emsystem.co.kr/' + (route ? route + '/' : '');
  let html = template.replace(/<title>[^<]*<\/title>/, '<title>' + escape(title) + '</title>');
  for (const [key,value] of [['description',description],['og:title',title],['og:description',description],['og:url',url],['twitter:title',title],['twitter:description',description]]) {
    html = html.replace(new RegExp('(<meta (?:name|property)="'+key+'" content=")[^"]*(")'), '$1'+escape(value)+'$2');
  }
  html = html.replace('</head>', '    <link rel="canonical" href="'+url+'">\n    <script src="/assets/seo.js"></script>\n  </head>');
  const nav = pages.map(([r,,,h]) => '<a href="/'+(r?r+'/':'')+'">'+escape(h)+'</a>').join(' · ');
  html = html.replace(/<div id="root">[\s\S]*?<\/div>/, '<div id="root"><main style="padding:2rem;font-family:sans-serif"><h1>'+escape(heading)+'</h1><p>'+escape(description)+'</p><nav>'+nav+'</nav><p>주식회사 이엠시스템 · 031-528-3119</p></main></div>');
  fs.mkdirSync(path.join(root,route),{recursive:true});
  fs.writeFileSync(path.join(root,route,'index.html'),html);
}
// Keep metadata in sync when the SPA navigates without a document reload.
const client = `(function(){const pages=${JSON.stringify(pages)};function update(){const route=location.pathname.replace(/^\\/|\\/$/g,'');const page=pages.find(p=>p[0]===route);if(!page)return;const url='https://emsystem.co.kr/'+(route?route+'/':'');document.title=page[1];for(const [key,value] of [['description',page[2]],['og:title',page[1]],['og:description',page[2]],['og:url',url],['twitter:title',page[1]],['twitter:description',page[2]]]){const el=document.querySelector('meta[name="'+key+'"],meta[property="'+key+'"]');if(el)el.content=value;}document.querySelector('link[rel="canonical"]').href=url;}for(const name of ['pushState','replaceState']){const original=history[name];history[name]=function(){const result=original.apply(this,arguments);update();return result;};}addEventListener('popstate',update);addEventListener('DOMContentLoaded',update);})();\n`;
fs.writeFileSync(path.join(root,'assets/seo.js'),client);
fs.writeFileSync(path.join(root,'robots.txt'),'User-agent: *\nAllow: /\nDisallow: /admin/\n\nSitemap: https://emsystem.co.kr/sitemap.xml\n');
fs.writeFileSync(path.join(root,'sitemap.xml'),'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+pages.map(([r])=>'  <url><loc>https://emsystem.co.kr/'+(r?r+'/':'')+'</loc></url>').join('\n')+'\n</urlset>\n');
console.log('Generated five crawlable entry pages, metadata, robots and sitemap.');
