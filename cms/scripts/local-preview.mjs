// Local preview uses the same Worker handlers with persistent SQLite and files.
// Production deployment always uses Cloudflare D1/R2 and Worker secrets.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
import worker from '../worker.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dataDir=path.join(root,'.wrangler','preview');fs.mkdirSync(dataDir,{recursive:true});
const secrets=JSON.parse(fs.readFileSync(path.join(root,'.dev.vars'),'utf8'));
const db=new DatabaseSync(path.join(dataDir,'content.sqlite'));db.exec(fs.readFileSync(path.join(root,'migrations/0001_content.sql'),'utf8'));
const statement=(sql,values=[])=>({bind:(...args)=>statement(sql,args),first:async()=>db.prepare(sql).get(...values)||null,run:async()=>({meta:db.prepare(sql).run(...values)})});
const env={...secrets,ADMIN_USERNAME:'exrental119',DB:{prepare:statement,batch:async rows=>{db.exec('BEGIN');try{const out=[];for(const r of rows)out.push(await r.run());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}},IMAGES:{
  put:async(k,bytes,metadata)=>{fs.writeFileSync(path.join(dataDir,k),bytes);fs.writeFileSync(path.join(dataDir,k+'.json'),JSON.stringify(metadata));},
  head:async k=>fs.existsSync(path.join(dataDir,k))?{}:null,
  get:async k=>fs.existsSync(path.join(dataDir,k))?{body:fs.readFileSync(path.join(dataDir,k)),...JSON.parse(fs.readFileSync(path.join(dataDir,k+'.json'),'utf8'))}:null,
},ASSETS:{fetch:async request=>{
  let name=new URL(request.url).pathname;if(name.endsWith('/'))name+='index.html';
  if(!/^\/admin\/(index\.html|style\.css|local-preview\.css|app\.js)$/.test(name))return new Response('Not found',{status:404});
  const file=path.join(root,'public',name);let bytes=fs.readFileSync(file);
  if(name.endsWith('.html'))bytes=Buffer.from(bytes.toString().replace('</head>','<link rel="stylesheet" href="/admin/local-preview.css"></head>').replace('<body>','<body><div class="local-notice" role="status">테스트 화면입니다. 저장하거나 적용해도 실제 홈페이지는 변경되지 않습니다.</div>'));
  return new Response(bytes,{headers:{'Content-Type':name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.css')?'text/css':'text/javascript'}});
}}};
http.createServer(async(req,res)=>{
  try{const chunks=[];for await(const chunk of req)chunks.push(chunk);const bytes=Buffer.concat(chunks);const request=new Request('http://localhost:8979'+req.url,{method:req.method,headers:req.headers,...(bytes.length?{body:bytes}:{})});const response=await worker.fetch(request,env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}
  catch{res.writeHead(500);res.end('Preview error');}
}).listen(8979,'127.0.0.1',()=>console.log('Admin preview ready at http://localhost:8979/admin/'));
