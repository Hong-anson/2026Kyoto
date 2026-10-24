import test from 'node:test';
import assert from 'node:assert/strict';
import {weathernewsLocations,parseWeathernewsPage,createWeathernewsProviders} from '../lib/providers/weathernews.js';
import {validateLiveFeed} from '../public/foliage-feed.js';

const now=Date.parse('2026-10-22T10:00:00Z');
const tofukuji=weathernewsLocations.find(location=>location.id==='tofukuji');
const nara=weathernewsLocations.find(location=>location.id==='nara');
function page({location=tofukuji,date='10月21日時点',status='まだ',year=2026,name=location.names[0],siteId=location.siteId,extra=[],titleName=name}={}){
  const data=[['ShallowReactive',1],{data:2},['ShallowReactive',3],{spot:4,status:7}, {spotid:5,name:6},siteId,name,{success:8,data:9},true,{obs:10,rankText:11,migoro:12,rank:13},date,status,'11月23日',1,...extra];
  return `<!doctype html><title>${titleName}の紅葉情報【${year}】 - ウェザーニュース</title><script type="application/json" id="__NUXT_DATA__">${JSON.stringify(data)}</script>`;
}
const html=body=>new Response(body,{headers:{'content-type':'text/html; charset=utf-8'}});

test('Weathernews extracts only dated observed status and identity; forecasts do not become observations',()=>{
  const row=parseWeathernewsPage(page(),{location:tofukuji,now});
  assert.equal(row.status,'尚未見頃');assert.equal(row.rawStatus,'まだ');assert.equal(row.observedDate,'2026-10-21');
  assert.equal(row.observationPrecision,'day');assert.equal(row.fetchedAt,'2026-10-22T10:00:00.000Z');
  assert.equal(row.sourceUrl,'https://weathernews.jp/koyo/spot/26111/');assert.equal(row.recordingMethod,'automatic');
  assert.equal(row.sourceDateBasis,'page-season-year');assert.equal(row.sourceScope,'東福寺');assert.equal('observedAt' in row,false);
  assert.notEqual(row.observedDate,'2026-11-23');
  const validated=validateLiveFeed({version:1,results:[row]},['tofukuji'],now).results[0];assert.equal(validated.observedDate,'2026-10-21');
});

test('verified brief factual Nara extract preserves date, partial-color wording and site scope',()=>{
  // Verified at https://weathernews.jp/koyo/spot/26402/ on 2026-10-22.
  // These are only short factual status/date/name fields; the minimal Nuxt
  // wrapper is synthetic, not a retained copyrighted page or image.
  const fact={sourceSpotName:'奈良公園',rawStatus:'ほんのり色づき始め(全体の2割)',rawDate:'10月20日時点',seasonYear:2026};
  const row=parseWeathernewsPage(page({location:nara,name:fact.sourceSpotName,status:fact.rawStatus,date:fact.rawDate,year:fact.seasonYear}),{location:nara,now});
  assert.equal(row.status,'開始變色');assert.equal(row.observedDate,'2026-10-20');assert.equal(row.rawStatus,fact.rawStatus);
  assert.equal(row.sourceScope,'奈良公園');assert.equal(row.sourceSpotName,'奈良公園');
  const validated=validateLiveFeed({version:1,results:[row]},['nara'],now).results[0];assert.equal(validated.observedDate,'2026-10-20');
});

test('date precision retains old September observations without pretending the fetch is an observation',()=>{
  const row=parseWeathernewsPage(page({date:'9月3日時点'}),{location:tofukuji,now});
  assert.equal(row.observedDate,'2026-09-03');assert.equal(row.fetchedAt,'2026-10-22T10:00:00.000Z');
  assert.equal('observedAt' in row,false);assert.ok(Date.parse(row.observedDate+'T00:00:00+09:00')<now-86400000);
});

test('missing dates, impossible dates, future dates, wrong seasons and ambiguous status fail closed',()=>{
  for(const change of [{date:''},{date:'11月23日頃〜'},{date:'2月30日時点'},{date:'10月23日時点'},{date:'2025年10月21日時点'},{status:'青葉と予想'},{status:'見頃予想'}]){
    assert.throws(()=>parseWeathernewsPage(page(change),{location:tofukuji,now}),JSON.stringify(change));
  }
  const explicit=parseWeathernewsPage(page({date:'2026年10月21日時点'}),{location:tofukuji,now});assert.equal(explicit.sourceDateBasis,'explicit-source-year');
});

test('wrong spot identity, malformed Nuxt refs, duplicate status objects and non-JSON payloads are rejected',()=>{
  for(const value of [page({siteId:'26402'}),page({name:'奈良公園'}),page({titleName:'奈良公園'}),page().replace('"status":7','"status":7,"duplicate":7'),page().replace('"spotid":5','"spotid":9999'),'<title>東福寺の紅葉情報【2026】</title><script>globalThis.untrusted=true</script>']){
    assert.throws(()=>parseWeathernewsPage(value,{location:tofukuji,now}));
  }
  // Detached lookalikes cannot override the actual root async-data status.
  assert.equal(parseWeathernewsPage(page({extra:[{obs:10,rankText:11}]}),{location:tofukuji,now}).status,'尚未見頃');
  assert.equal(globalThis.untrusted,undefined);
});

test('provider limits concurrency to two and isolates a failed spot from valid source rows',async()=>{
  const locations=weathernewsLocations.slice(0,4);let active=0,peak=0,calls=0;
  const provider=createWeathernewsProviders({locations,clock:()=>now,fetchImpl:async url=>{
    calls++;active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,5));active--;
    const location=locations.find(location=>url.includes('/'+location.siteId+'/'));
    return location.id==='kiyomizu'?new Response('unavailable',{status:503}):html(page({location}));
  }})[0];
  const rows=await provider.read();assert.equal(rows.length,13);assert.equal(calls,4);assert.equal(peak,2);
  assert.equal(rows.find(row=>row.id==='tofukuji').state,'ok');assert.equal(rows.find(row=>row.id==='kiyomizu').state,'unavailable');
  assert.ok(rows.find(row=>row.id==='kiyomizu').checkedAt);assert.match(rows.find(row=>row.id==='kiyomizu').message,/503/);
  assert.equal(rows.find(row=>row.id==='kasuga').state,'not_configured');assert.equal('status' in rows.find(row=>row.id==='kasuga'),false);
});

test('hourly cache and concurrent reads do not re-fetch or fabricate new source/fetch dates',async()=>{
  let time=now,calls=0;
  const provider=createWeathernewsProviders({locations:[tofukuji],clock:()=>time,fetchImpl:async()=>{
    calls++;await new Promise(resolve=>setTimeout(resolve,5));return html(page({date:'9月3日時点'}));
  }})[0];
  const [a,b]=await Promise.all([provider.read(),provider.read()]);assert.equal(calls,1);assert.deepEqual(a,b);
  time+=1800000;const cached=await provider.read();assert.equal(calls,1);assert.equal(cached[0].fetchedAt,a[0].fetchedAt);
  time+=1800001;const fresh=await provider.read();assert.equal(calls,2);assert.equal(fresh[0].observedDate,'2026-09-03');assert.notEqual(fresh[0].fetchedAt,a[0].fetchedAt);
});

test('unexpected redirect, response type, overlarge body and abort cannot create observations',async()=>{
  const samples=[
    async()=>new Response(null,{status:302,headers:{location:'https://example.org/private'}}),
    async()=>new Response('{}',{headers:{'content-type':'application/json'}}),
    async()=>new Response('x'.repeat(2*1024*1024+1),{headers:{'content-type':'text/html'}}),
    async()=>new Response('<html></html>',{headers:{'content-type':'text/html','content-length':String(2*1024*1024+1)}})
  ];
  for(const fetchImpl of samples){const row=(await createWeathernewsProviders({locations:[tofukuji],clock:()=>now,fetchImpl})[0].read())[0];assert.equal(row.state,'unavailable');assert.equal('status' in row,false);}
  const fetchImpl=async(_url,{signal})=>new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>resolve(html(page())),100);signal.addEventListener('abort',()=>{clearTimeout(timer);reject(signal.reason);},{once:true});
  });
  const row=(await createWeathernewsProviders({locations:[tofukuji],clock:()=>now,fetchImpl,timeoutMs:5})[0].read())[0];assert.equal(row.state,'unavailable');
});
