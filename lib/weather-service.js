import {fetchWeatherFeed,validateWeatherFeed,weatherLocations} from '../public/weather-feed.js';

// Shared server cache limits upstream calls and retains the last successful values on failure.
export function createWeatherService({fetchImpl=globalThis.fetch,clock=Date.now,ttl=15*60*1000,timeoutMs=12000}={}) {
  let snapshot=null, expires=0, pending=null;
  async function refresh() {
    const previous=new Map((snapshot?.results||[]).filter(row=>row.state==='ok').map(row=>[row.id,row]));
    let incoming;
    try {
      incoming=validateWeatherFeed(await fetchWeatherFeed({fetchImpl,clock,timeoutMs}),clock());
    } catch {
      incoming={version:1,results:[]};
    }
    const fresh=new Map(incoming.results.map(row=>[row.id,row]));
    snapshot={version:1,results:weatherLocations.map(({id})=>{
      const row=fresh.get(id);
      if(row?.state==='ok') {
        const retained=previous.get(id);
        if(retained && (Date.parse(row.current.modelAt)<Date.parse(retained.current.modelAt) || (row.current.modelAt===retained.current.modelAt && Date.parse(row.fetchedAt)<Date.parse(retained.fetchedAt)))) {
          return {...retained,retrievalError:'來源回傳較舊氣象，保留較新記錄與時間'};
        }
        return row;
      }
      if(previous.has(id))return {...previous.get(id),retrievalError:'天氣更新失敗，保留上次資料與時間；不是最新現況'};
      return row||{id,state:'unavailable',message:'天氣來源暫時無法連線，尚無可用資料'};
    })};
    expires=clock()+ttl;
    return snapshot;
  }
  return {async get(){
    if(snapshot&&clock()<expires)return snapshot;
    if(!pending)pending=refresh().finally(()=>{pending=null;});
    return pending;
  }};
}
