import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {zipSync,strToU8,unzipSync,strFromU8} from 'fflate';
import worker from '../worker.mjs';
import {validateQuote,exportQuote} from '../quotes.mjs';
const input=()=>({date:'2026-10-01',customer:'테스트 업체',items:[{name:'장치',size:'2500x2500',quantity:7,price:1000,note:'인쇄비 포함'},{name:'장치',quantity:2,price:2000},{name:'장치',quantity:1,price:3000}]});
function template(){let rows='';for(let r=1;r<=37;r++){rows+='<x:row r="'+r+'" ht="15">';for(const c of 'ABCDEFGH')rows+='<x:c r="'+c+r+'" s="1" />';rows+='</x:row>';}return zipSync({'xl/worksheets/sheet1.xml':strToU8('<x:worksheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:sheetViews/><x:sheetData>'+rows+'</x:sheetData><x:mergeCells count="1"><x:mergeCell ref="G27:H27" /></x:mergeCells></x:worksheet>'),'xl/workbook.xml':strToU8('<x:workbook></x:workbook>')});}
test('quote validates inputs, preserves amounts and emits safe literal strings with formulas',()=>{
 const q=validateQuote(input()),files=unzipSync(exportQuote(template(),q)),xml=strFromU8(files['xl/worksheets/sheet1.xml']);
 assert.match(xml,/<x:c r="G26"[^>]*><x:f>SUM\(G13:G25\)<\/x:f><x:v>14000<\/x:v>/);
 assert.match(xml,/<x:c r="H26"[^>]*><x:f>ROUND\(G26\*10%,0\)<\/x:f><x:v>1400<\/x:v>/);
 assert.match(xml,/<x:c r="B10"[^>]*><x:f>G27<\/x:f><x:v>15400<\/x:v>/);
 q.customer='=HYPERLINK("x")<&';const safe=strFromU8(unzipSync(exportQuote(template(),q))['xl/worksheets/sheet1.xml']);assert.match(safe,/t="inlineStr"><x:is><x:t xml:space="preserve">=HYPERLINK\(&quot;x&quot;\)&lt;&amp;/);
 q.items=Array.from({length:16},()=>({name:'추가',size:'',quantity:1,price:101,note:''}));const extended=strFromU8(unzipSync(exportQuote(template(),q))['xl/worksheets/sheet1.xml']);assert.match(extended,/SUM\(G13:G28\)/);assert.match(extended,/ref="G30:H30"/);assert.match(extended,/ref="C28:D28"/);assert.match(extended,/<x:v>1778<\/x:v>/);
 const rows=[...extended.matchAll(/<x:row r="(\d+)"/g)].map(m=>+m[1]);assert.equal(new Set(rows).size,40);assert.deepEqual(rows,[...rows].sort((a,b)=>a-b));
 for(const d of [{...input(),date:'2026-02-30'},{...input(),customer:''},{...input(),items:[]},{...input(),items:[{name:'x',quantity:1.2,price:1}]},{...input(),items:[{name:'x',quantity:1,price:-1}]},{...input(),items:[{name:'x',quantity:1000000,price:1000000000}]}])assert.throws(()=>validateQuote(d));
});
test('quote screen and export require admin session; employee token and missing CSRF are rejected',async()=>{
 const db=new DatabaseSync(':memory:');for(const f of ['0001_content.sql','0005_quote_template.sql'])db.exec(readFileSync(new URL('../migrations/'+f,import.meta.url),'utf8'));
 const statement=(s,p=[])=>({bind:(...p)=>statement(s,p),first:async()=>db.prepare(s).get(...p)||null});
 const token='a'.repeat(64),csrf='b'.repeat(64);db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(createHash('sha256').update(token).digest('hex'),csrf,Date.now()+60000);
 db.prepare('INSERT INTO quote_template VALUES (1,?,?)').run(Buffer.from(template()).toString('base64'),Date.now());
 const env={DB:{prepare:statement},ASSETS:{fetch:async()=>new Response('private form')}},h={Cookie:'__Host-ems-admin='+token,Origin:'https://cms.test','X-CSRF-Token':csrf};
 const req=(path,opts={})=>worker.fetch(new Request('https://cms.test'+path,opts),env),payload=JSON.stringify(input());
 assert.equal((await req('/admin/quotation.html')).status,302);assert.equal((await req('/admin/quotation.js')).status,401);assert.equal((await req('/admin/quotation.html',{headers:h})).status,200);
 assert.equal((await req('/api/admin/quotes/export',{method:'POST',headers:{Authorization:'Bearer employee-link'},body:payload})).status,401);
 assert.equal((await req('/api/admin/quotes/export',{method:'POST',headers:{Cookie:h.Cookie,Origin:h.Origin},body:payload})).status,403);
 assert.equal((await req('/api/admin/quotes/export',{method:'POST',headers:{...h,Origin:'https://other.test'},body:payload})).status,403);
 const r=await req('/api/admin/quotes/export',{method:'POST',headers:h,body:payload});assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'private, no-store');assert.match(r.headers.get('content-disposition'),/attachment/);assert.equal(new Uint8Array(await r.arrayBuffer())[0],80);
 db.prepare('UPDATE sessions SET expires_at=0').run();assert.equal((await req('/api/admin/quotes/export',{method:'POST',headers:h,body:payload})).status,401);
});
