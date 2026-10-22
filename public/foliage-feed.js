// Shared by the browser, synchronization command and server. Never use fetch time as observation time.
export const sourceHosts = ['weathernews.jp', 'souda-kyoto.jp'];
export const foliageStates = ['青葉', '轉黃', '轉紅', '見頃', '落葉', '未知'];
export function validateLiveFeed(feed, ids, now = Date.now()) {
  if (!feed || feed.version !== 1 || !Array.isArray(feed.results)) throw Error('楓況資料格式不正確');
  const seen = new Set();
  const results = feed.results.map(row => {
    if (!row || !ids.includes(row.id) || seen.has(row.id)) throw Error('景點 ID 不正確或重複');
    seen.add(row.id);
    if (!['ok','unavailable','not_configured'].includes(row.state)) throw Error('來源狀態不正確');
    if (row.state !== 'ok') return {id:row.id, state:row.state, message:typeof row.message === 'string' ? row.message.slice(0,200) : '來源暫無可用觀測'};
    if (!foliageStates.includes(row.status)) throw Error('不支援的楓況');
    const observed = Date.parse(row.observedAt), fetched = Date.parse(row.fetchedAt);
    if (!Number.isFinite(observed) || !Number.isFinite(fetched) || observed > now + 300000 || fetched > now + 300000 || observed > fetched + 300000) throw Error('來源觀測或讀取時間不正確');
    const url = new URL(row.sourceUrl);
    if (url.protocol !== 'https:' || url.username || url.password || !sourceHosts.includes(url.hostname) || url.port) throw Error('不受信任的楓況來源');
    if (typeof row.rawStatus !== 'string' || !row.rawStatus.trim()) throw Error('缺少來源原始狀態');
    return {id:row.id,state:'ok',status:row.status,observedAt:new Date(observed).toISOString(),fetchedAt:new Date(fetched).toISOString(),sourceUrl:url.href,rawStatus:row.rawStatus.slice(0,100),retrievalError:typeof row.retrievalError === 'string' ? row.retrievalError.slice(0,200) : null};
  });
  return {version:1,results};
}
