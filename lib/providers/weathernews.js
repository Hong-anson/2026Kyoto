// Read only the public spot identity and dated foliage status, never forecasts,
// photographs, report bodies or fetchedAt wrappers from the page's Nuxt payload.
export const weathernewsLocations = [
  {id:'tofukuji',siteId:'26111',names:['東福寺']},
  {id:'sennyuji',siteId:'26165',names:['総本山御寺泉涌寺','泉涌寺']},
  {id:'kiyomizu',siteId:'26112',names:['清水寺']},
  {id:'eikando',siteId:'26120',names:['永観堂禅林寺','永観堂']},
  {id:'nanzenji',siteId:'26105',names:['南禅寺']},
  {id:'bishamondo',siteId:'26152',names:['毘沙門堂門跡','毘沙門堂']},
  {id:'nara',siteId:'26402',names:['奈良公園']},
  {id:'shogunzuka',siteId:'26141',names:['将軍塚青龍殿']},
  {id:'gioji',siteId:'26133',names:['祇王寺']},
  {id:'jojakkoji',siteId:'26134',names:['常寂光寺']}
];
const allIds=['tofukuji','sennyuji','kiyomizu','eikando','nanzenji','bishamondo','nara','kasuga','isuien','yoshikien','shogunzuka','gioji','jojakkoji'];
const states=new Map([
  ['まだ','尚未見頃'],['青葉','青葉'],['色づき始め','開始變色'],['色付き始め','開始變色'],
  ['見頃','見頃'],['見ごろ','見頃'],['落葉始め','開始落葉'],['落ち葉始め','開始落葉'],
  ['落葉','落葉'],['落葉中','落葉'],['落葉しました','落葉']
]);
function normalizeStatus(raw) {
  if(states.has(raw))return states.get(raw);
  if(/^(?:ほんのり)?色づき始め(?:[（(]全体の[1-9]割[）)])?$/.test(raw))return '開始變色';
  return null;
}
const maxBytes=2*1024*1024;
const sourceUrl=location=>'https://weathernews.jp/koyo/spot/'+location.siteId+'/';
const own=(value,key)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.hasOwn(value,key);
const decodeTitle=text=>text.replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"').trim();

export function parseWeathernewsPage(html,{location,now=Date.now()}={}) {
  if(!location || !allIds.includes(location.id) || !/^\d{5}$/.test(location.siteId) || !Array.isArray(location.names))throw Error('Weathernews 景點設定不正確');
  if(typeof html!=='string' || Buffer.byteLength(html)>maxBytes)throw Error('Weathernews 頁面內容不正確');
  const title=html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const identity=title&&decodeTitle(title).match(/^(.+?)の紅葉情報【(\d{4})】(?:\s*[-－].*)?$/);
  if(!identity || !location.names.includes(identity[1]))throw Error('Weathernews 頁面景點身分不符');
  const payload=html.match(/<script\b(?=[^>]*\bid=["']__NUXT_DATA__["'])[^>]*>([\s\S]*?)<\/script>/i)?.[1];
  if(!payload)throw Error('Weathernews 缺少可驗證的資料區塊');
  const data=JSON.parse(payload);
  if(!Array.isArray(data) || data.length>30000)throw Error('Weathernews 資料格式不正確');
  const dereference=ref=>{
    if(!Number.isInteger(ref)||ref<0||ref>=data.length)throw Error('Weathernews 資料索引不正確');
    return data[ref];
  };
  const unwrap=value=>Array.isArray(value)&&value.length===2&&value[0]==='ShallowReactive'?dereference(value[1]):value;
  const root=unwrap(data[0]);
  if(!own(root,'data'))throw Error('Weathernews 缺少頁面資料根節點');
  const asyncData=unwrap(dereference(root.data));
  if(!asyncData||typeof asyncData!=='object'||Array.isArray(asyncData))throw Error('Weathernews 頁面資料根節點不正確');
  const entries=Object.values(asyncData).map(dereference);
  const identities=entries.filter(value=>own(value,'spotid')&&own(value,'name')&&String(dereference(value.spotid))===location.siteId);
  if(identities.length!==1 || !location.names.includes(dereference(identities[0].name)))throw Error('Weathernews 資料景點身分不符');
  const statuses=entries.filter(value=>own(value,'success')&&own(value,'data')&&dereference(value.success)===true).map(value=>dereference(value.data)).filter(value=>own(value,'obs')&&own(value,'rankText'));
  if(statuses.length!==1)throw Error('Weathernews 景況資料缺少或重複');
  const rawStatus=dereference(statuses[0].rankText);
  const asOf=dereference(statuses[0].obs);
  if(typeof rawStatus!=='string'||rawStatus.length>30||!normalizeStatus(rawStatus))throw Error('Weathernews 景況尚未提供或不受支援');
  if(typeof asOf!=='string')throw Error('Weathernews 缺少來源日期');
  const date=asOf.trim().match(/^(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日時点$/);
  if(!date)throw Error('Weathernews 來源日期格式尚未驗證');
  const seasonYear=Number(identity[2]),year=Number(date[1]||identity[2]),month=Number(date[2]),day=Number(date[3]);
  if(year!==seasonYear)throw Error('Weathernews 來源年份與頁面季節不符');
  const calendar=new Date(Date.UTC(year,month-1,day));
  if(calendar.getUTCFullYear()!==year||calendar.getUTCMonth()!==month-1||calendar.getUTCDate()!==day)throw Error('Weathernews 來源日期無效');
  const observedDate=[year,String(month).padStart(2,'0'),String(day).padStart(2,'0')].join('-');
  const japanToday=new Date(now+9*3600000).toISOString().slice(0,10);
  if(observedDate>japanToday)throw Error('Weathernews 來源日期位於未來');
  return {id:location.id,state:'ok',status:normalizeStatus(rawStatus),rawStatus,observedDate,observationPrecision:'day',fetchedAt:new Date(now).toISOString(),sourceUrl:sourceUrl(location),recordingMethod:'automatic',sourceSpotName:identity[1],sourceScope:identity[1],sourceDateBasis:date[1]?'explicit-source-year':'page-season-year'};
}

async function readBoundedHtml(response) {
  if(!/^text\/html(?:;|$)/i.test(response.headers.get('content-type')||'')){await response.body?.cancel();throw Error('Weathernews 未回傳 HTML');}
  if(Number(response.headers.get('content-length'))>maxBytes){await response.body?.cancel();throw Error('Weathernews 頁面過大');}
  if(!response.body)throw Error('Weathernews 未回傳內容');
  const reader=response.body.getReader(),chunks=[];let length=0;
  try{
    while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>maxBytes)throw Error('Weathernews 頁面過大');chunks.push(value);}
  }catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return new TextDecoder().decode(bytes);
}
async function fetchSpot(location,{fetchImpl,timeoutMs}) {
  let target=new URL(sourceUrl(location));const signal=AbortSignal.timeout(timeoutMs);
  for(let hop=0;hop<3;hop++){
    const response=await fetchImpl(target.href,{signal,redirect:'manual',headers:{Accept:'text/html'}});
    if([301,302,303,307,308].includes(response.status)){
      const next=response.headers.get('location');await response.body?.cancel();
      if(!next)throw Error('Weathernews 重新導向缺少目的地');
      target=new URL(next,target);
      if(target.protocol!=='https:'||target.hostname!=='weathernews.jp'||target.username||target.password||target.port||target.pathname!==new URL(sourceUrl(location)).pathname)throw Error('Weathernews 重新導向目的地不符');
      continue;
    }
    if(!response.ok){await response.body?.cancel();throw Error('Weathernews HTTP '+response.status);}
    return readBoundedHtml(response);
  }
  throw Error('Weathernews 重新導向次數過多');
}

export function createWeathernewsProviders({fetchImpl=globalThis.fetch,clock=Date.now,timeoutMs=15000,locations=weathernewsLocations,cacheTtl=60*60*1000}={}) {
  const seen=new Set();
  for(const location of locations){
    if(!location||!allIds.includes(location.id)||seen.has(location.id)||!/^\d{5}$/.test(location.siteId)||!Array.isArray(location.names)||!location.names.length||location.names.some(name=>typeof name!=='string'||!name))throw Error('Weathernews 景點設定不正確');
    seen.add(location.id);
  }
  const cache=new Map(),pending=new Map();
  const readSpot=async location=>{
    const cached=cache.get(location.id);if(cached&&clock()<cached.expires)return cached.row;
    if(pending.has(location.id))return pending.get(location.id);
    const task=(async()=>{
      let row;
      try{const html=await fetchSpot(location,{fetchImpl,timeoutMs});row=parseWeathernewsPage(html,{location,now:clock()});}
      catch(error){row={id:location.id,state:'unavailable',sourceUrl:sourceUrl(location),checkedAt:new Date(clock()).toISOString(),sourceSpotName:location.names[0],message:'Weathernews 讀取或驗證失敗：'+error.message.slice(0,100)};}
      cache.set(location.id,{row,expires:clock()+(row.state==='ok'?cacheTtl:Math.min(cacheTtl,5*60*1000))});return row;
    })();
    pending.set(location.id,task);try{return await task;}finally{pending.delete(location.id);}
  };
  return [{ids:[...allIds],async read(){
    const rows=new Map();let next=0;
    const worker=async()=>{while(next<locations.length){const location=locations[next++];rows.set(location.id,await readSpot(location));}};
    await Promise.all([worker(),worker()]);
    return allIds.map(id=>rows.get(id)||{id,state:'not_configured',message:'Weathernews 尚未建立此景點的專屬頁對應，未套用其他景點資料'});
  }}];
}
