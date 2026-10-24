import {spots} from '../public/spots.js';
import {validateLiveFeed,observationTime} from '../public/foliage-feed.js';
import {configuredProviders} from './foliage-provider.js';
import {automaticProviders} from './providers/index.js';

// Registered sources verify spot identity, source status and observation date.
export const unresolved = '來源尚未提供可驗證的景點觀測';
const spotIds = spots.map(spot=>spot.id);
function compareObservations(a,b) {
  return observationTime(a)-observationTime(b) || Date.parse(a.fetchedAt)-Date.parse(b.fetchedAt);
}
function selectRow(current,candidate) {
  if (!current) return candidate;
  if (current.state === 'ok' || candidate.state === 'ok') {
    if (current.state !== candidate.state) return candidate.state === 'ok' ? candidate : current;
    return compareObservations(candidate,current) >= 0 ? candidate : current;
  }
  if (current.state !== candidate.state) return candidate.state === 'unavailable' ? candidate : current;
  const checked = row=>row.checkedAt ? Date.parse(row.checkedAt) : -Infinity;
  if (checked(current) !== checked(candidate)) return checked(candidate) > checked(current) ? candidate : current;
  const specificity = row=>Number(Boolean(row.sourceUrl))*4+Number(Boolean(row.sourceScope))*2+Number(Boolean(row.sourceSpotName));
  return specificity(candidate) > specificity(current) ? candidate : current;
}
export function createFoliageService({clock=Date.now,providers=[...automaticProviders({clock}),...configuredProviders({clock})],ttl=60*60*1000,initialFeed}={}) {
  // Seeded data is evidence to retain on failure, never a successful current refresh.
  let snapshot = initialFeed === undefined ? null : validateLiveFeed(initialFeed,spotIds,clock());
  let expires = -Infinity, pending = null;
  async function refresh() {
    const previous = new Map((snapshot?.results || []).map(row=>[row.id,row]));
    const rows = new Map(), retentionReasons = new Map();
    function remember(row,reason) {
      const selected = selectRow(rows.get(row.id),row);
      if (selected === row) {
        rows.set(row.id,row);
        if (reason) retentionReasons.set(row.id,reason);
        else retentionReasons.delete(row.id);
      }
    }
    for (const provider of providers) {
      const ids = provider.ids.filter(id=>spotIds.includes(id));
      try {
        const raw = await provider.read();
        const validated = validateLiveFeed({version:1,results:raw},ids,clock());
        const returned = new Set(validated.results.map(row=>row.id));
        for (const row of validated.results) remember(row,row.state === 'ok' ? undefined : '本次來源未提供可用觀測；保留上次記錄與原始時間');
        for (const id of ids) if (!returned.has(id)) remember({id,state:'unavailable',message:'本次來源未提供此景點'},'本次來源缺少景點；保留上次記錄與原始時間');
      } catch {
        for (const id of ids) remember({id,state:'unavailable',message:'來源讀取或格式驗證失敗'},'來源讀取或格式驗證失敗；保留上次記錄與原始時間');
      }
    }
    snapshot = {version:1,results:spotIds.map(id=>{
      const next = rows.get(id), old = previous.get(id);
      if (next?.state === 'ok') {
        if (old?.state === 'ok' && compareObservations(next,old) < 0) return {...old,retrievalError:'來源回傳較舊觀測，保留較新記錄與原始時間'};
        return next;
      }
      if (old?.state === 'ok') return {...old,retrievalError:retentionReasons.get(id) || '本次尚未取得更新；保留上次記錄與原始時間'};
      return (next ? selectRow(old,next) : old) || {id,state:'not_configured',message:unresolved};
    })};
    expires = clock()+ttl;
    return snapshot;
  }
  return {async get() {
    if(snapshot && clock()<expires)return snapshot;
    if(!pending)pending=refresh().finally(()=>{pending=null;});
    return pending;
  }};
}
