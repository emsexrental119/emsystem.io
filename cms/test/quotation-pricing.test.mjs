import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fabricPrice,fabricProducts} from '../public/admin/quotation-pricing.js';
import {validateQuote} from '../quotes.mjs';
// Synthetic rates: production price rules are stored privately in the database.
const config={general:{frame:{numerator:2,denominator:100},print:{numerator:1,denominator:100}},contract:{frame:{numerator:17,denominator:1000},print:{numerator:7,denominator:1000}},dispatch:{perMeter:12345,print:{numerator:1,denominator:100}}};
test('fabric names and print presentation are enforced on export with identical combined totals',()=>{
 for(const mode of ['general','contract','dispatch'])for(const [product,name]of Object.entries(fabricProducts)){
  const pricing={mode,component:'frame',product,printStyle:'included',width:970,height:2500,thickness:'T100'};
  const item={name:'untrusted name',price:1,quantity:3,note:'메모',pricing};
  const quote=items=>validateQuote({date:'2026-10-01',customer:'테스트',items},config);
  const included=quote([item]).items,separate=quote([{...item,pricing:{...pricing,printStyle:'separate'}}]).items;
  assert.equal(included.length,1);assert.equal(included[0].name,name);assert.equal(included[0].note,'메모 / 인쇄비 포함');
  assert.deepEqual(separate.map(i=>i.name),[name,'인쇄비']);assert.deepEqual(separate.map(i=>i.quantity),[3,3]);
  assert.deepEqual(separate.map(i=>i.size),['970x2500xT100','970x2500xT100']);
  assert.equal(separate[0].note,'메모');assert.equal(separate[1].note,'');
  assert.equal(included[0].price,separate[0].price+separate[1].price);
  assert.equal(separate[0].price,fabricPrice({...pricing,component:'frame'},config).price);
  assert.equal(separate[1].price,fabricPrice({...pricing,component:'print'},config).price);
  assert.throws(()=>quote([{...item,pricing:{...pricing,product:'invalid'}}]));
  assert.throws(()=>quote([{...item,pricing:{...pricing,printStyle:'invalid'}}]));
  assert.equal(quote(Array(50).fill({...item,pricing:{...pricing,printStyle:'separate'}})).items.length,100);
  assert.throws(()=>quote(Array(51).fill({...item,pricing:{...pricing,printStyle:'separate'}})));
 }
});
test('one quote-level pricing mode overrides every fabric row including split printing',()=>{
 const item=mode=>({name:'ignored',quantity:2,price:1,pricing:{mode,component:'both',product:'wing',printStyle:'separate',width:1500,height:2500}});
 const base={date:'2026-10-01',customer:'테스트',items:[item('general'),item('dispatch'),{name:'수동',quantity:1,price:4321}]};
 for(const pricingMode of ['general','contract','dispatch']){
  const q=validateQuote({...base,pricingMode},config),expected=fabricPrice({...base.items[0].pricing,mode:pricingMode},config);
  assert.deepEqual(q.items.map(i=>i.price),[expected.frame,expected.printing,expected.frame,expected.printing,4321]);
 }
 assert.throws(()=>validateQuote(base,config));
 assert.throws(()=>validateQuote({...base,pricingMode:'invalid'},config));
});
test('double-sided printing doubles only printing across modes, rounding and quote layouts',()=>{
 for(const mode of ['general','contract','dispatch'])for(const width of [970,1500,1]){
  const p={mode,width,height:25,component:'both',product:'backwall',printStyle:'included'};
  const one=fabricPrice(p,config),two=fabricPrice({...p,printSides:2},config);
  assert.equal(two.frame,one.frame);assert.equal(two.printing,one.printing*2);
  const quote=printStyle=>validateQuote({date:'2026-10-01',customer:'테스트',pricingMode:mode,items:[{name:'x',quantity:3,price:1,pricing:{...p,printStyle,printSides:2}}]},config).items;
  const combined=quote('included'),split=quote('separate');
  assert.equal(combined[0].price,two.price);assert.equal(combined[0].note,'인쇄비 포함');
  assert.deepEqual(split.map(i=>i.price),[one.frame,one.printing]);assert.deepEqual(split.map(i=>i.quantity),[3,6]);assert.equal(split[1].note,'');
 }
 for(const printSides of [0,3,-1,1.5,'2'])assert.throws(()=>fabricPrice({mode:'general',width:100,height:100,component:'both',printSides},config));
});
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
