import test from 'node:test';
import assert from 'node:assert/strict';
import {createFoliageService} from '../lib/foliage-service.js';
import {validateLiveFeed} from '../public/foliage-feed.js';

// Synthetic source records verify merging; none are real foliage observations.
const now = Date.parse('2026-10-22T09:00:00Z');
const precise = patch=>({id:'tofukuji',state:'ok',status:'見頃',rawStatus:'見頃',observedAt:'2026-10-22T08:00:00Z',fetchedAt:'2026-10-22T08:59:00Z',sourceUrl:'https://weathernews.jp/koyo/',recordingMethod:'automatic',...patch});
const day = patch=>{
  const {observedAt,...base}=precise();
  return {...base,status:'尚未見頃',rawStatus:'まだ',observedDate:'2026-10-22',observationPrecision:'day',sourceScope:'合成 fixture 的來源範圍',sourceSpotName:'東福寺',...patch};
};
const provider = rows=>({ids:['tofukuji'],read:async()=>rows});
const feed = row=>({version:1,results:[row]});
const validated = row=>validateLiveFeed(feed(row),['tofukuji'],now).results[0];

test('all current providers are merged by newest observation independent of their order',async()=>{
  const newest=precise({sourceScope:'最新來源'}), older=precise({observedAt:'2026-10-22T06:00:00Z',status:'青葉',rawStatus:'青葉'});
  for (const candidates of [[newest,older],[older,newest],[newest,day(),older]]) {
    const service=createFoliageService({providers:candidates.map(row=>provider([row])),clock:()=>now});
    const result=(await service.get()).results[0];
    assert.equal(result.status,'見頃');assert.equal(result.observedAt,'2026-10-22T08:00:00.000Z');
    assert.equal(result.sourceScope,'最新來源');assert.equal(result.recordingMethod,'automatic');
  }
});
test('date-only and precise source ordering uses Japan day bounds without inventing timestamps',async()=>{
  const beforeDay=precise({observedAt:'2026-10-21T14:00:00Z'});
  const dateWinner=(await createFoliageService({providers:[provider([day()]),provider([beforeDay])],clock:()=>now}).get()).results[0];
  assert.equal(dateWinner.observedDate,'2026-10-22');assert.equal(dateWinner.observationPrecision,'day');
  assert.equal(Object.hasOwn(dateWinner,'observedAt'),false);
  const preciseWinner=(await createFoliageService({providers:[provider([precise()]),provider([day()])],clock:()=>now}).get()).results[0];
  assert.equal(preciseWinner.observedAt,'2026-10-22T08:00:00.000Z');
  const newerDay=(await createFoliageService({providers:[provider([day()]),provider([day({observedDate:'2026-10-21'})])],clock:()=>now}).get()).results[0];
  assert.equal(newerDay.observedDate,'2026-10-22');
});
test('equal observation bounds prefer the newest retrieval without allowing later older fetches to win',async()=>{
  const newer=day({fetchedAt:'2026-10-22T08:59:00Z',rawStatus:'まだ（新しい取得）'});
  const older=day({fetchedAt:'2026-10-22T07:00:00Z',status:'青葉',rawStatus:'青葉'});
  for (const records of [[newer,older],[older,newer]]) {
    const result=(await createFoliageService({providers:records.map(row=>provider([row])),clock:()=>now}).get()).results[0];
    assert.equal(result.rawStatus,newer.rawStatus);assert.equal(result.fetchedAt,'2026-10-22T08:59:00.000Z');
  }
});
test('validated seed forces a real first refresh and retains original precision and provenance on failure',async()=>{
  let calls=0,time=now;
  const seed=day();
  const failing={ids:['tofukuji'],read:async()=>{calls++;throw Error('offline');}};
  const service=createFoliageService({providers:[failing],clock:()=>time,ttl:1000,initialFeed:feed(seed)});
  const result=(await service.get()).results[0];
  assert.equal(calls,1);assert.match(result.retrievalError,/失敗/);
  const {retrievalError,...preserved}=result;
  const {retrievalError:seedError,...seedEvidence}=validated(seed);
  assert.deepEqual(preserved,seedEvidence);
  assert.equal(result.observedDate,seed.observedDate);assert.equal(Object.hasOwn(result,'observedAt'),false);
  await service.get();assert.equal(calls,1);
  time+=1001;await service.get();assert.equal(calls,2);
  assert.throws(()=>createFoliageService({providers:[],clock:()=>now,initialFeed:feed(day({observedDate:'2026-10-23'}))}));
});
test('seed is replaced by a current newer observation and retained against source rollback',async()=>{
  const seed=precise();
  let calls=0;
  const refreshed=precise({observedAt:'2026-10-22T08:30:00Z',sourceScope:'new scope'});
  const current=createFoliageService({providers:[{ids:['tofukuji'],read:async()=>{calls++;return [refreshed];}}],clock:()=>now,initialFeed:feed(seed)});
  assert.equal((await current.get()).results[0].observedAt,'2026-10-22T08:30:00.000Z');assert.equal(calls,1);
  const rollback=createFoliageService({providers:[provider([day()])],clock:()=>now,initialFeed:feed(seed)});
  const retained=(await rollback.get()).results[0];
  assert.equal(retained.observedAt,'2026-10-22T08:00:00.000Z');assert.match(retained.retrievalError,/較舊/);
});
test('unavailable source attempts survive later not_configured providers with original coverage and check time',async()=>{
  const attempted={id:'tofukuji',state:'unavailable',message:'來源未提供當年度觀測',sourceUrl:'https://weathernews.jp/koyo/',checkedAt:'2026-10-22T08:30:00Z',sourceScope:'境内',sourceSpotName:'東福寺'};
  const unconfigured={id:'tofukuji',state:'not_configured',message:'尚未填入試算表',checkedAt:'2026-10-22T08:59:00Z'};
  for (const rows of [[attempted,unconfigured],[unconfigured,attempted]]) {
    const result=(await createFoliageService({providers:rows.map(row=>provider([row])),clock:()=>now}).get()).results[0];
    assert.equal(result.state,'unavailable');assert.equal(result.sourceUrl,attempted.sourceUrl);
    assert.equal(result.checkedAt,'2026-10-22T08:30:00.000Z');assert.equal(result.sourceScope,'境内');assert.equal(result.sourceSpotName,'東福寺');
    assert.equal(Object.hasOwn(result,'observedAt'),false);assert.equal(Object.hasOwn(result,'status'),false);
  }
});
test('non-observation merges prefer newest check and retain richer seed evidence over an unlabelled failure',async()=>{
  const older={id:'tofukuji',state:'unavailable',message:'old check',sourceUrl:'https://weathernews.jp/koyo/',checkedAt:'2026-10-22T07:00:00Z'};
  const newer={...older,message:'new check',sourceUrl:'https://ja.kyoto.travel/source',checkedAt:'2026-10-22T08:00:00Z',sourceScope:'東福寺境内'};
  for (const rows of [[newer,older],[older,newer]]) {
    const result=(await createFoliageService({providers:rows.map(row=>provider([row])),clock:()=>now}).get()).results[0];
    assert.equal(result.message,'new check');assert.equal(result.checkedAt,'2026-10-22T08:00:00.000Z');assert.equal(result.sourceScope,newer.sourceScope);
  }
  const failing={ids:['tofukuji'],read:async()=>{throw Error('failed');}};
  const retained=(await createFoliageService({providers:[failing],clock:()=>now,initialFeed:feed(newer)}).get()).results[0];
  assert.equal(retained.checkedAt,'2026-10-22T08:00:00.000Z');assert.equal(retained.sourceUrl,newer.sourceUrl);
});
test('a successful alternative source is not marked failed when another provider throws',async()=>{
  const failing={ids:['tofukuji'],read:async()=>{throw Error('failed');}};
  const result=(await createFoliageService({providers:[provider([day()]),failing],clock:()=>now,initialFeed:feed(day({observedDate:'2026-10-21'}))}).get()).results[0];
  assert.equal(result.retrievalError,null);assert.equal(result.observedDate,'2026-10-22');
});
test('seed observations remain with explicit missing-spot warnings and exact literal early-fall state',async()=>{
  const seed=day({status:'開始落葉',rawStatus:'落葉始め'});
  const result=(await createFoliageService({providers:[provider([])],clock:()=>now,initialFeed:feed(seed)}).get()).results[0];
  assert.equal(result.status,'開始落葉');assert.equal(result.rawStatus,'落葉始め');assert.match(result.retrievalError,/缺少景點/);
  assert.equal(result.observedDate,'2026-10-22');assert.equal(result.observationPrecision,'day');
});
