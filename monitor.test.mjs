import test from 'node:test';
import assert from 'node:assert/strict';
import {dateAvailable,priceAvailable,eligible,robotsAllowed} from './monitor.mjs';
const dates=n=>({success:true,availabilityByDate:{'426820-2026-12-05':{date:'2026-12-05',start:'07:00',end:'19:30',available:n,status:'success'}}});
const price=n=>({success:true,available:n,status:'warning',priceGroups:[{id:'0866401',title:'Participant',price:5}]});
test('requires explicit numeric inventory of two, never generic availability',()=>{
  for (const n of [0,1,undefined,null,'2',-1]) {assert.equal(dateAvailable(dates(n)),false);assert.equal(priceAvailable(price(n)),false);}
  assert.equal(dateAvailable(dates(2)),true);assert.equal(priceAvailable(price(2)),true);
  assert.equal(dateAvailable({success:true,availability:'InStock'}),false);
});
test('wrong date, product price, failures and conflicting statuses fail closed',()=>{
  const d=dates(3);d.availabilityByDate['426820-2026-12-05'].date='2025-12-05';assert.equal(dateAvailable(d),false);
  const p=price(3);p.priceGroups[0].price=45;assert.equal(priceAvailable(p),false);
  const q=price(3);q.success=false;assert.equal(priceAvailable(q),false);
  const r=dates(3);r.availabilityByDate['426820-2026-12-05'].status='danger';assert.equal(dateAvailable(r),false);
});
test('Swiss weekdays and automatic end',()=>{
  assert.equal(eligible(new Date('2026-11-07T12:00:00Z')),false);
  assert.equal(eligible(new Date('2026-11-09T12:00:00Z')),true);
  assert.equal(eligible(new Date('2026-11-08T23:02:00Z')),true);
  assert.equal(eligible(new Date('2026-12-07T12:00:00Z')),false);
});
test('honors wildcard and specific robots exclusions',()=>{
  assert.equal(robotsAllowed('User-agent: *\nDisallow: /*ajax/*','/fr/ajax/data'),false);
  assert.equal(robotsAllowed('User-agent: *\nDisallow: /shop\nAllow: /shop/product','/shop/product/a'),true);
  assert.equal(robotsAllowed('User-agent: *\nDisallow:\nUser-agent: VerbierTicketMonitor\nDisallow: /','/fr'),false);
});
