import test from 'node:test';
import assert from 'node:assert/strict';
import {createNaraOfficialProviders,discoverKasugaObservation,parseKasugaObservation} from '../lib/providers/nara-official.js';
const now=Date.parse('2026-10-24T03:00:00Z');
const sourceUrl='https://www.kasugataisha.or.jp/news/2026/16870/';
const indexUrl='https://www.kasugataisha.or.jp/category/manyous_news/plant/';
const foliage='園内の紅葉、黄葉は、場所により少しずつ色づいてきました。';
const title='萬葉植物園　開花情報（令和8年10月19日現在）';
const announcement=(text=foliage,heading=title)=>`<link rel="canonical" href="${sourceUrl}"><h2 class="p-detail__title">${heading}</h2><div class="p-detail__body c-editorview"><p>架空の花が見ごろです。</p><p>${text}</p></div>`;
const link=(date,url=sourceUrl)=>`<a href="${url}"><div class="p-list__item__title">萬葉植物園 開花情報（${date}現在）</div></a>`;
const response=html=>new Response(html,{headers:{'content-type':'text/html; charset=UTF-8'}});
test('official garden record preserves date precision and restricted scope',()=>{
  const row=parseKasugaObservation(announcement(),{sourceUrl,now});
  assert.equal(row.status,'開始變色');assert.equal(row.observedDate,'2026-10-19');
  assert.equal(row.observationPrecision,'day');assert.equal(row.observedAt,undefined);
  assert.equal(row.rawStatus,foliage);assert.ok(row.rawStatus.length<=90);
  assert.equal(row.sourceScope,'萬葉植物園（春日大社境內；非全境）');
  assert.equal(row.sourceUrl,sourceUrl);assert.equal(row.fetchedAt,'2026-10-24T03:00:00.000Z');
});
test('flower peak, predictions, unsupported and contradictory paragraphs do not become foliage records',()=>{
  for(const text of ['架空の花が見頃を迎えています。','園内の紅葉は見頃を迎える予定です。','園内の紅葉はまだです。',foliage+'</p><p>園内の紅葉は落葉しました。']) {
    assert.throws(()=>parseKasugaObservation(announcement(text),{sourceUrl,now}),/紅葉現況/);
  }
});
test('official observation dates, source identity and calendar are verified',()=>{
  for(const heading of ['萬葉植物園 開花情報（令和8年10月25日現在）','萬葉植物園 開花情報（令和8年2月30日現在）','春日大社 開花情報（令和8年10月19日現在）','萬葉植物園 開花情報（10月19日現在）']) assert.throws(()=>parseKasugaObservation(announcement(foliage,heading),{sourceUrl,now}));
  assert.throws(()=>parseKasugaObservation(announcement(),{sourceUrl:sourceUrl.replace('2026','2025'),now}),/年份/);
  assert.throws(()=>parseKasugaObservation(announcement().replace('rel="canonical"','rel="other"'),{sourceUrl,now}),/身分/);
  assert.throws(()=>parseKasugaObservation(announcement(),{sourceUrl:'https://evil.example/news/2026/16870/',now}),/網址/);
});
test('latest garden announcement is discovered by valid date, not fixed ID or list order',()=>{
  const latest='https://www.kasugataisha.or.jp/news/2026/20000/';
  const html=link('令和8年10月10日')+link('令和8年10月23日',latest)+link('令和8年10月24日','https://evil.example/news/2026/777/')+link('令和8年10月25日','https://www.kasugataisha.or.jp/news/2026/30000/');
  assert.deepEqual(discoverKasugaObservation(html,{now}),{url:latest,observedDate:'2026-10-23'});
  assert.throws(()=>discoverKasugaObservation('<a href="'+sourceUrl+'">花が見頃</a>',{now}),/暫無/);
});
test('provider isolates missing entrance observations, discovers announcement and caches hourly',async()=>{
  let calls=0,time=now;
  const provider=createNaraOfficialProviders({clock:()=>time,fetchImpl:async url=>{
    calls++;
    if(url===indexUrl)return response(link('令和8年10月19日'));
    if(url===sourceUrl)return response(announcement());
    if(url==='https://isuien.or.jp/')return response('<title>奈良の日本庭園 | 依水園</title><p>新しいお知らせはありません</p>');
    throw Error('simulated TLS verification failure');
  }})[0];
  const [one,two]=await Promise.all([provider.read(),provider.read()]);
  assert.deepEqual(one,two);assert.equal(calls,4);
  assert.equal(one[0].state,'ok');assert.equal(one[1].state,'unavailable');assert.equal(one[2].state,'unavailable');
  assert.equal(one[1].checkedAt,'2026-10-24T03:00:00.000Z');assert.equal(one[1].observedAt,undefined);
  assert.match(one[2].message,/入口讀取失敗/);
  await provider.read();assert.equal(calls,4);
  time+=3600000;await provider.read();assert.equal(calls,8);
});
test('official provider rejects cross-host redirect without following it',async()=>{
  const calls=[];
  const provider=createNaraOfficialProviders({clock:()=>now,fetchImpl:async url=>{calls.push(url);return new Response(null,{status:302,headers:{location:'https://evil.example/'}});}})[0];
  const rows=await provider.read();
  assert.equal(calls.length,3);assert.ok(calls.every(url=>!url.includes('evil.example')));
  assert.ok(rows.every(row=>row.state==='unavailable'&&row.checkedAt));
});
test('official provider refuses oversized and non-HTML pages',async()=>{
  for(const headers of [{'content-type':'application/json'},{'content-type':'text/html','content-length':String(2*1024*1024+1)}]) {
    const rows=await createNaraOfficialProviders({clock:()=>now,fetchImpl:async()=>new Response('x',{headers})})[0].read();
    assert.ok(rows.every(row=>row.state==='unavailable'));
  }
});
test('list and detail observation dates must agree',async()=>{
  const rows=await createNaraOfficialProviders({clock:()=>now,fetchImpl:async url=>response(url===indexUrl?link('令和8年10月20日'):announcement())})[0].read();
  assert.equal(rows[0].state,'unavailable');assert.match(rows[0].message,/日期不符/);
});
