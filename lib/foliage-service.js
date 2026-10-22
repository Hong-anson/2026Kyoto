import {spots} from '../public/spots.js';
import {validateLiveFeed} from '../public/foliage-feed.js';
import {configuredProviders} from './foliage-provider.js';

// Register adapters only after their per-spot identity, observed date and status fields
// have been checked against a real source response. No guessed status or timestamp.
export const adapters = [];
export const unresolved = '待確認來源頁面與欄位；目前尚未取得可驗證的景點觀測';
export function createFoliageService({providers=[...adapters,...configuredProviders()],clock=Date.now,ttl=30*60*1000}={}) {
  let snapshot = null, expires = 0, pending = null;
  async function refresh() {
    const previous = new Map((snapshot?.results || []).filter(r=>r.state==='ok').map(r=>[r.id,r]));
    const rows = new Map();
    for (const provider of providers) {
      const ids = provider.ids.filter(id=>spots.some(s=>s.id===id));
      try {
        const raw = await provider.read();
        const validated = validateLiveFeed({version:1,results:raw},ids,clock());
        for (const row of validated.results) {
          if (row.state === 'ok') {
            const old = previous.get(row.id);
            if (old && (Date.parse(row.observedAt) < Date.parse(old.observedAt) || (row.observedAt === old.observedAt && Date.parse(row.fetchedAt) < Date.parse(old.fetchedAt)))) rows.set(row.id,{...old,retrievalError:'來源回傳較舊觀測，保留較新記錄與原始時間'});
            else rows.set(row.id,row);
          }
          else if (!rows.has(row.id)) rows.set(row.id,previous.has(row.id)?{...previous.get(row.id),retrievalError:'來源未提供可用觀測，保留上次記錄與時間'}:row);
        }
        for (const id of ids) if(!validated.results.some(r=>r.id===id) && !rows.has(id)) rows.set(id,previous.has(id)?{...previous.get(id),retrievalError:'本次來源缺少景點，保留上次記錄與時間'}:{id,state:'unavailable',message:'本次來源未提供此景點'});
      } catch {
        for (const id of ids) if(!rows.has(id)) rows.set(id,previous.has(id)?{...previous.get(id),retrievalError:'來源讀取失敗；保留上次記錄與時間'}:{id,state:'unavailable',message:'來源讀取或格式驗證失敗'});
      }
    }
    snapshot = {version:1,results:spots.map(s=>rows.get(s.id)||{id:s.id,state:'not_configured',message:unresolved})};
    expires = clock()+ttl;
    return snapshot;
  }
  return {async get() {
    if(snapshot && clock()<expires)return snapshot;
    if(!pending)pending=refresh().finally(()=>{pending=null;});
    return pending;
  }};
}
