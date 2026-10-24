import test from 'node:test';
import assert from 'node:assert/strict';
import {createFoliageService} from '../lib/foliage-service.js';
import {validateLiveFeed,observationTime,observationIsStale,foliageStates} from '../public/foliage-feed.js';
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
  const result=await createFoliageService({providers:[],clock:()=>at}).get();
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

test('synchronized records preserve provenance and require timezone-aware real calendar dates',()=>{
  const manual=validateLiveFeed({version:1,results:[{...row,recordingMethod:'manual'}]},['tofukuji'],at).results[0];
  assert.equal(manual.recordingMethod,'manual');assert.equal(manual.observedAt,row.observedAt);
  assert.equal(validateLiveFeed({version:1,results:[row]},['tofukuji'],at).results[0].recordingMethod,'unspecified');
  for(const patch of [{recordingMethod:'guessed'},{observedAt:'2026-10-22'},{observedAt:'2026-10-22T07:00:00'},{observedAt:'2026-02-30T07:00:00Z'},{fetchedAt:'2026-10-22T24:00:00Z'}]) {
    assert.throws(()=>validateLiveFeed({version:1,results:[{...row,...patch}]},['tofukuji'],at));
  }
});


test('older source observations cannot replace a newer successful record',async()=>{
  let time=at,older=false;
  const service=createFoliageService({clock:()=>time,ttl:1,providers:[{ids:['tofukuji'],read:async()=>[{...row,...(older?{status:'青葉',observedAt:'2026-10-21T07:00:00.000Z'}:{})}]}]});
  await service.get();older=true;time+=2;
  const kept=(await service.get()).results[0];assert.equal(kept.status,'見頃');assert.equal(kept.observedAt,row.observedAt);assert.equal(kept.fetchedAt,row.fetchedAt);assert.match(kept.retrievalError,/較舊/);
});


// Date-only fixtures represent source-reported days, not inferred observation times.
function dayRow(patch={}) {
  const {observedAt,...base}=row;
  return {...base,observedDate:'2026-10-22',observationPrecision:'day',...patch};
}
test('source date-only observations retain date precision without inventing observedAt',()=>{
  const input=dayRow({status:'尚未見頃',rawStatus:'まだ',recordingMethod:'automatic',sourceScope:'東福寺の境内',sourceSpotName:'東福寺'});
  const result=validateLiveFeed({version:1,results:[input]},['tofukuji'],at).results[0];
  assert.equal(result.observedDate,'2026-10-22');assert.equal(result.observationPrecision,'day');
  assert.equal(Object.hasOwn(result,'observedAt'),false);
  assert.equal(result.fetchedAt,row.fetchedAt);assert.equal(result.rawStatus,'まだ');
  assert.equal(result.status,'尚未見頃');assert.notEqual(result.status,'青葉');
  assert.equal(result.recordingMethod,'automatic');assert.equal(result.sourceScope,input.sourceScope);assert.equal(result.sourceSpotName,input.sourceSpotName);
  const changing=validateLiveFeed({version:1,results:[dayRow({status:'開始變色',rawStatus:'色づき始め'})]},['tofukuji'],at).results[0];
  assert.equal(changing.status,'開始變色');assert.equal(changing.rawStatus,'色づき始め');
  assert.ok(foliageStates.includes('尚未見頃'));assert.ok(foliageStates.includes('開始變色'));
});
test('date-only validation rejects ambiguous precision, impossible dates and future Japan dates',()=>{
  for (const patch of [
    {observedAt:row.observedAt}, {observationPrecision:undefined}, {observationPrecision:'hour'},
    {observedDate:'2026-02-30'}, {observedDate:'2026-13-01'}, {observedDate:'2026-1-22'},
    {observedDate:'2026-10-23'}, {observedDate:'2026-10-22T00:00:00Z'},
    {fetchedAt:'2026-10-21T14:59:00Z'}, {fetchedAt:'2026-10-22'},
    {sourceScope:'x'.repeat(121)}, {sourceSpotName:'x'.repeat(81)}, {sourceScope:42}
  ]) assert.throws(()=>validateLiveFeed({version:1,results:[dayRow(patch)]},['tofukuji'],at),JSON.stringify(patch));
  assert.throws(()=>validateLiveFeed({version:1,results:[{...row,observationPrecision:'day'}]},['tofukuji'],at));
  assert.throws(()=>validateLiveFeed({version:1,results:[dayRow({observedDate:null})]},['tofukuji'],at));
  assert.doesNotThrow(()=>validateLiveFeed({version:1,results:[dayRow({observedDate:'2024-02-29'})]},['tofukuji'],at));
});
test('date-only validation changes day at Japan midnight and compares source day with retrieval day',()=>{
  const before=Date.parse('2026-10-22T14:59:59Z'), after=Date.parse('2026-10-22T15:00:01Z');
  const nextDay=dayRow({observedDate:'2026-10-23',fetchedAt:new Date(after).toISOString()});
  assert.throws(()=>validateLiveFeed({version:1,results:[nextDay]},['tofukuji'],before));
  assert.doesNotThrow(()=>validateLiveFeed({version:1,results:[nextDay]},['tofukuji'],after));
  assert.throws(()=>validateLiveFeed({version:1,results:[{...nextDay,fetchedAt:new Date(before).toISOString()}]},['tofukuji'],after));
});
test('observation helpers use day start only as a conservative bound and retain precise 24-hour behavior',()=>{
  const dateOnly=dayRow();
  const japanStart=Date.parse('2026-10-22T00:00:00+09:00');
  assert.equal(observationTime(dateOnly),japanStart);
  assert.equal(observationTime(row),Date.parse(row.observedAt));
  assert.equal(observationIsStale(dateOnly,japanStart+86400000),false);
  assert.equal(observationIsStale(dateOnly,japanStart+86400001),true);
  assert.equal(observationIsStale(row,Date.parse(row.observedAt)+86400000),false);
  assert.equal(observationIsStale(row,Date.parse(row.observedAt)+86400001),true);
  assert.equal(observationIsStale(dateOnly,japanStart-600000),true);
  for (const invalid of [undefined,{},dayRow({observedDate:'2026-02-30'}),dayRow({observedAt:row.observedAt})]) {
    assert.ok(Number.isNaN(observationTime(invalid)));assert.equal(observationIsStale(invalid,at),true);
  }
  assert.equal(Object.hasOwn(dateOnly,'observedAt'),false);
});
test('exact verified official source hosts are accepted without trusting similar or unrelated hosts',()=>{
  for (const host of ['www.kasugataisha.or.jp','isuien.or.jp','ja.kyoto.travel','www.pref.nara.jp','www3.pref.nara.jp']) {
    const sourceUrl='https://'+host+'/source';
    assert.equal(validateLiveFeed({version:1,results:[dayRow({sourceUrl})]},['tofukuji'],at).results[0].sourceUrl,sourceUrl);
  }
  for (const host of ['kasugataisha.or.jp','www.isuien.or.jp','ja.kyoto.travel.evil.example','evil.ja.kyoto.travel','www.pref.nara.jp.evil.example']) {
    assert.throws(()=>validateLiveFeed({version:1,results:[dayRow({sourceUrl:'https://'+host+'/'})]},['tofukuji'],at));
  }
});
test('unavailable sources preserve checkedAt and trusted provenance without creating an observation',()=>{
  const unavailable={id:'tofukuji',state:'unavailable',message:'來源尚未提供本景點現況',sourceUrl:'https://ja.kyoto.travel/source',checkedAt:'2026-10-22T08:59:00Z',sourceScope:'京都市',sourceSpotName:'東福寺'};
  const result=validateLiveFeed({version:1,results:[unavailable]},['tofukuji'],at).results[0];
  assert.equal(result.sourceUrl,unavailable.sourceUrl);assert.equal(result.checkedAt,'2026-10-22T08:59:00.000Z');
  assert.equal(result.sourceScope,'京都市');assert.equal(result.sourceSpotName,'東福寺');
  assert.equal(Object.hasOwn(result,'observedAt'),false);assert.equal(Object.hasOwn(result,'observedDate'),false);
  assert.equal(Object.hasOwn(result,'status'),false);assert.ok(Number.isNaN(observationTime(result)));
  for (const patch of [{sourceUrl:'https://untrusted.example/'},{checkedAt:'2027-01-01T00:00:00Z'},{checkedAt:'2026-10-22T08:59:00'},{sourceScope:[]},{sourceSpotName:'x'.repeat(81)}]) {
    assert.throws(()=>validateLiveFeed({version:1,results:[{...unavailable,...patch}]},['tofukuji'],at));
  }
  assert.deepEqual(validateLiveFeed({version:1,results:[{id:'tofukuji',state:'not_configured'}]},['tofukuji'],at).results[0],{id:'tofukuji',state:'not_configured',message:'來源暫無可用觀測'});
});
