// Official garden announcements are scoped observations, never whole-shrine
// assessments. Keep only a brief factual foliage phrase, date and source link.
const kasugaHost = 'www.kasugataisha.or.jp';
const kasugaIndex = 'https://'+kasugaHost+'/category/manyous_news/plant/';
const maxBytes = 2 * 1024 * 1024;
const officialEntrances = [
  {id:'isuien',url:'https://isuien.or.jp/',name:'依水園'},
  {id:'yoshikien',url:'https://www.pref.nara.jp/',name:'吉城園（奈良縣官方入口）'}
];
function plain(value) {
  return value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
}
function datedGardenTitle(title,now) {
  const match = plain(title).match(/^萬葉植物園\s*開花情報\s*[（(](?:令和(\d+)年|(\d{4})年)(\d{1,2})月(\d{1,2})日現在[）)]$/);
  if (!match) throw Error('缺少可驗證的萬葉植物園觀測日期');
  const year = match[1] ? Number(match[1])+2018 : Number(match[2]);
  const month = Number(match[3]),day = Number(match[4]);
  const calendar = new Date(Date.UTC(year,month-1,day));
  if (year<2019 || calendar.getUTCFullYear()!==year || calendar.getUTCMonth()!==month-1 || calendar.getUTCDate()!==day) throw Error('植物園來源日期無效');
  const date = [year,String(month).padStart(2,'0'),String(day).padStart(2,'0')].join('-');
  if (date>new Date(now+9*3600000).toISOString().slice(0,10)) throw Error('植物園來源日期位於未來');
  return date;
}
export function discoverKasugaObservation(html,{now=Date.now()}={}) {
  if (typeof html!=='string' || Buffer.byteLength(html)>maxBytes) throw Error('植物園公告列表格式不正確');
  const candidates=[];
  for (const anchor of html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const title = anchor[2].match(/<(?:div|span)\b[^>]*class=["'][^"']*\bp-list__item__title\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|span)>/i)?.[1];
    if (!title) continue;
    let url,date;
    try { url=new URL(anchor[1],kasugaIndex);date=datedGardenTitle(title,now); } catch { continue; }
    if (url.protocol!=='https:' || url.hostname!==kasugaHost || url.username || url.password || url.port || url.search || url.hash || !/^\/news\/\d{4}\/\d+\/$/.test(url.pathname) || Number(url.pathname.split('/')[2])!==Number(date.slice(0,4))) continue;
    candidates.push({url:url.href,observedDate:date});
  }
  candidates.sort((a,b)=>b.observedDate.localeCompare(a.observedDate));
  if (!candidates.length) throw Error('官方列表暫無可驗證的植物園日期公告');
  return candidates[0];
}
export function parseKasugaObservation(html,{sourceUrl,now=Date.now()}={}) {
  if (typeof html!=='string' || Buffer.byteLength(html)>maxBytes) throw Error('植物園公告格式不正確');
  const url=new URL(sourceUrl);
  if (url.protocol!=='https:' || url.hostname!==kasugaHost || url.username || url.password || url.port || url.search || url.hash || !/^\/news\/\d{4}\/\d+\/$/.test(url.pathname)) throw Error('植物園公告網址不正確');
  const title=html.match(/<h2\b[^>]*class=["'][^"']*\bp-detail__title\b[^"']*["'][^>]*>([\s\S]*?)<\/h2>/i)?.[1];
  if (!title) throw Error('植物園公告缺少觀測標題');
  const observedDate=datedGardenTitle(title,now);
  if (Number(url.pathname.split('/')[2])!==Number(observedDate.slice(0,4))) throw Error('植物園公告年份不符');
  const canonical=html.match(/<link\b(?=[^>]*\brel=["']canonical["'])[^>]*\bhref=["']([^"']+)["'][^>]*>/i)?.[1];
  if (!canonical || new URL(canonical,sourceUrl).href!==sourceUrl) throw Error('植物園公告身分不符');
  const body=html.match(/<div\b[^>]*class=["'][^"']*\bp-detail__body\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1];
  if (!body) throw Error('植物園公告缺少正文');
  const paragraphs=[...body.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map(match=>plain(match[1]));
  // Deliberately narrow: flower descriptions and forecasts cannot establish
  // a foliage observation. New unsupported wording remains unverified.
  const supported=[
    {pattern:/^園内の紅葉、黄葉は、場所により少しずつ色づいてきました。$/,status:'開始變色'},
    {pattern:/^園内の紅葉(?:、黄葉)?は、?(?:色づき始めました|色付き始めました)。$/,status:'開始變色'},
    {pattern:/^園内の紅葉(?:、黄葉)?は、?(?:見頃|見ごろ)を迎えています。$/,status:'見頃'},
    {pattern:/^園内の紅葉は、?落葉が始まりました。$/,status:'開始落葉'},
    {pattern:/^園内の紅葉は、?落葉しました。$/,status:'落葉'}
  ];
  const observations=paragraphs.flatMap(rawStatus=>supported.filter(rule=>rule.pattern.test(rawStatus)).map(rule=>({rawStatus,status:rule.status})));
  if (observations.length!==1 || observations[0].rawStatus.length>90) throw Error('官方公告暫無可驗證的紅葉現況文字');
  return {id:'kasuga',state:'ok',...observations[0],observedDate,observationPrecision:'day',fetchedAt:new Date(now).toISOString(),sourceUrl,recordingMethod:'automatic',sourceSpotName:'春日大社 萬葉植物園',sourceScope:'萬葉植物園（春日大社境內；非全境）'};
}
async function readHtml(url,{fetchImpl,timeoutMs}) {
  const original=new URL(url),signal=AbortSignal.timeout(timeoutMs);let target=original;
  for (let hop=0;hop<3;hop++) {
    const response=await fetchImpl(target.href,{signal,redirect:'manual',headers:{Accept:'text/html'}});
    if ([301,302,303,307,308].includes(response.status)) {
      const next=response.headers.get('location');await response.body?.cancel();
      if (!next) throw Error('官方頁面重新導向缺少目的地');
      target=new URL(next,target);
      if (target.protocol!=='https:' || target.hostname!==original.hostname || target.username || target.password || target.port || target.pathname!==original.pathname || target.search) throw Error('官方頁面重新導向目的地不符');
      continue;
    }
    if (!response.ok) {await response.body?.cancel();throw Error('官方網站 HTTP '+response.status);}
    if (!/^text\/html(?:;|$)/i.test(response.headers.get('content-type')||'') || Number(response.headers.get('content-length'))>maxBytes) {await response.body?.cancel();throw Error('官方頁面內容格式或大小不正確');}
    if (!response.body) throw Error('官方頁面沒有內容');
    const reader=response.body.getReader(),chunks=[];let length=0;
    try {while (true) {const {done,value}=await reader.read();if(done) break;length+=value.byteLength;if(length>maxBytes) throw Error('官方頁面過大');chunks.push(value);}}
    catch(error) {await reader.cancel().catch(()=>{});throw error;}
    finally {reader.releaseLock();}
    const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks) {bytes.set(chunk,offset);offset+=chunk.byteLength;}
    return new TextDecoder().decode(bytes);
  }
  throw Error('官方頁面重新導向次數過多');
}
export function createNaraOfficialProviders({fetchImpl=globalThis.fetch,clock=Date.now,timeoutMs=15000,cacheTtl=60*60*1000}={}) {
  let cache,pending;
  const read=async()=>{
    const kasuga=(async()=>{
      let sourceUrl=kasugaIndex;
      try {
        const index=await readHtml(sourceUrl,{fetchImpl,timeoutMs});
        const latest=discoverKasugaObservation(index,{now:clock()});sourceUrl=latest.url;
        const html=await readHtml(sourceUrl,{fetchImpl,timeoutMs});
        const row=parseKasugaObservation(html,{sourceUrl,now:clock()});
        if (row.observedDate!==latest.observedDate) throw Error('官方列表與公告日期不符');
        return row;
      } catch(error) {return {id:'kasuga',state:'unavailable',sourceUrl,checkedAt:new Date(clock()).toISOString(),sourceSpotName:'春日大社 萬葉植物園',sourceScope:'萬葉植物園（春日大社境內；非全境）',message:'官方植物園公告讀取或驗證失敗：'+error.message.slice(0,100)};}
    })();
    const entrances=officialEntrances.map(async location=>{
      let message;
      try {const html=await readHtml(location.url,{fetchImpl,timeoutMs});const title=plain(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'');message=location.id==='isuien'&&title.includes('依水園')?'已查詢依水園官方入口；尚無已驗證日期與狀態的紅葉觀測':'已查詢奈良縣官方入口；尚未建立吉城園專屬紅葉觀測對應';}
      catch(error) {message='官方入口讀取失敗，尚無可驗證紅葉觀測：'+error.message.slice(0,100);}
      return {id:location.id,state:'unavailable',sourceUrl:location.url,checkedAt:new Date(clock()).toISOString(),sourceSpotName:location.name,message};
    });
    return Promise.all([kasuga,...entrances]);
  };
  return [{ids:['kasuga','isuien','yoshikien'],async read(){
    if(cache&&clock()<cache.expires)return cache.rows;
    if(pending)return pending;
    pending=read().then(rows=>{cache={rows,expires:clock()+cacheTtl};return rows;});
    try{return await pending;}finally{pending=null;}
  }}];
}
