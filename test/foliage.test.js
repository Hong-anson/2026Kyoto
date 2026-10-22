import test from 'node:test';
import assert from 'node:assert/strict';
import {createFoliageService} from '../lib/foliage-service.js';
import {validateLiveFeed} from '../public/foliage-feed.js';
const at=Date.parse('2026-10-22T09:00:00Z');
const row={id:'tofukuji',state:'ok',status:'見頃',rawStatus:'見頃',observedAt:'2026-10-22T07:00:00.000Z',fetchedAt:'2026-10-22T08:59:00.000Z',sourceUrl:'https://weathernews.jp/koyo/'};
// Synthetic records exercise the contract only; these are NOT observations from the source.
test('reject invented dates, disallowed domains, duplicate ids and unknown statuses',()=>{
  for(const change of [{observedAt:'invalid'},{observedAt:'2027-10-22T07:00:00Z'},{fetchedAt:'2027-10-22T07:00:00Z'},{sourceUrl:'https://example.org/'},{sourceUrl:'https://user:password@weathernews.jp/'},{status:'紅葉100%'},{rawStatus:''}]){
    assert.throws(()=>validateLiveFeed({version:1,results:[{...row,...change}]},['tofukuji'],at));
  }
  assert.throws(()=>validateLiveFeed({version:1,results:[row,row]},['tofukuji'],at));
});
test('absence of verified adapters returns unknown rather than fake current observations',async()=>{
  const result=await createFoliageService({clock:()=>at}).get();
  assert.equal(result.results.length,13);
  assert.ok(result.results.every(r=>r.state==='not_configured'&&!r.observedAt&&!r.status));
});
test('deduplicate concurrent refreshes and cache without fabricating a new observation time',async()=>{
  let calls=0,now=at;
  const provider={ids:['tofukuji'],async read(){calls++;await new Promise(r=>setTimeout(r,5));return [{...row}];}};
  const service=createFoliageService({providers:[provider],clock:()=>now,ttl:1000});
  const [first,second]=await Promise.all([service.get(),service.get()]);
  assert.equal(calls,1);assert.deepEqual(first,second);
  now+=500;await service.get();assert.equal(calls,1);
  now+=1000;const refreshed=await service.get();assert.equal(calls,2);
  assert.equal(refreshed.results[0].observedAt,row.observedAt);
});
test('upstream failure preserves last record and timestamp with explicit retrieval error',async()=>{
  let broken=false,now=at;
  const provider={ids:['tofukuji'],async read(){if(broken)throw Error('403');return [{...row}];}};
  const service=createFoliageService({providers:[provider],clock:()=>now,ttl:1});
  await service.get();broken=true;now+=2;
  const result=await service.get();const retained=result.results.find(r=>r.id==='tofukuji');
  assert.equal(retained.observedAt,row.observedAt);assert.equal(retained.fetchedAt,row.fetchedAt);assert.match(retained.retrievalError,/失敗/);
});
test('first-time source denial reports unavailable, without guessed foliage',async()=>{
  const result=await createFoliageService({providers:[{ids:['nara'],read:async()=>{throw Error('unavailable');}}],clock:()=>at}).get();
  const nara=result.results.find(r=>r.id==='nara');assert.equal(nara.state,'unavailable');assert.equal(nara.status,undefined);
});
test('missing upstream spot preserves prior record rather than marking it fresh',async()=>{
  let missing=false,now=at;
  const service=createFoliageService({providers:[{ids:['tofukuji'],read:async()=>missing?[]:[{...row}]}],clock:()=>now,ttl:1});
  await service.get();now+=2;missing=true;
  const result=await service.get();assert.equal(result.results[0].observedAt,row.observedAt);assert.match(result.results[0].retrievalError,/缺少景點/);
});
