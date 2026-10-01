import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fabricPrice} from '../public/admin/quotation-pricing.js';
import {validateQuote} from '../quotes.mjs';
// Synthetic rates: production price rules are stored privately in the database.
const config={general:{frame:{numerator:2,denominator:100},print:{numerator:1,denominator:100}},contract:{frame:{numerator:17,denominator:1000},print:{numerator:7,denominator:1000}},dispatch:{perMeter:12345,print:{numerator:1,denominator:100}}};
test('fabric modes calculate actual area, ceiling-width frames, separate components, and whole-won rounding',()=>{
 const p={width:1500,height:2500,mode:'general',component:'both'};
 assert.deepEqual(fabricPrice(p,config),{frame:75000,printing:37500,price:112500,meters:2,area:3.75});
 assert.equal(fabricPrice({...p,mode:'contract'},config).price,90000);
 for(const [width,meters]of [[970,1],[1000,1],[1001,2],[1500,2],[2000,2],[2500,3]])for(const height of [2500,3000]){
  const r=fabricPrice({...p,width,height,mode:'dispatch'},config);assert.equal(r.frame,meters*12345);assert.equal(r.printing,Math.round(width*height/100));
 }
 assert.equal(fabricPrice({...p,component:'frame'},config).price,75000);
 assert.equal(fabricPrice({...p,component:'print'},config).price,37500);
 assert.equal(fabricPrice({...p,width:1,height:25,component:'frame'},config).price,1);
 for(const change of [{width:0},{width:1.5},{height:-1},{mode:'unknown'},{component:'unknown'}])assert.throws(()=>fabricPrice({...p,...change},config));
});
test('export recomputes automatic prices and dimensions, leaving explicit manual lines unchanged',()=>{
 const pricing={mode:'dispatch',component:'both',width:1500,height:2500,thickness:'T140'};
 const q=validateQuote({date:'2026-10-01',customer:'테스트',items:[{name:'패브릭',quantity:2,price:1,size:'wrong',pricing},{name:'기타',quantity:1,price:500,size:'직접 입력'}]},config);
 assert.equal(q.items[0].price,62190);assert.equal(q.items[0].size,'1500x2500xT140');assert.equal(q.items[0].quantity,2);assert.equal(q.items[1].price,500);
 assert.throws(()=>validateQuote({date:'2026-10-01',customer:'테스트',items:[{name:'패브릭',quantity:1,pricing:{...pricing,mode:'other'}}]},config));
});
