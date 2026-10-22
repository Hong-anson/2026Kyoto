// Shared by the browser, synchronization command and server. Never use fetch time as observation time.
export const sourceHosts = ['weathernews.jp', 'souda-kyoto.jp'];
export const foliageStates = ['青葉', '轉黃', '轉紅', '見頃', '落葉', '未知'];
export function validSheetFeedUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && u.hostname === 'script.google.com' && !u.username && !u.password && !u.port && !u.search && !u.hash && /^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(u.pathname);
  } catch { return false; }
}
function zonedTime(value) {
  if (typeof value !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.\d{1,3})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2])-1 && d.getUTCDate() === Number(m[3]);
}
export function validateLiveFeed(feed, ids, now = Date.now()) {
  if (!feed || feed.version !== 1 || !Array.isArray(feed.results)) throw Error('楓況資料格式不正確');
  const seen = new Set();
  const results = feed.results.map(row => {
    if (!row || !ids.includes(row.id) || seen.has(row.id)) throw Error('景點 ID 不正確或重複');
    seen.add(row.id);
    if (!['ok','unavailable','not_configured'].includes(row.state)) throw Error('來源狀態不正確');
    if (row.state !== 'ok') return {id:row.id, state:row.state, message:typeof row.message === 'string' ? row.message.slice(0,200) : '來源暫無可用觀測'};
    if (!foliageStates.includes(row.status)) throw Error('不支援的楓況');
    if (!zonedTime(row.observedAt) || !zonedTime(row.fetchedAt)) throw Error('來源時間必須包含時區，不可用讀取時間取代觀測時間');
    const observed = Date.parse(row.observedAt), fetched = Date.parse(row.fetchedAt);
    if (!Number.isFinite(observed) || !Number.isFinite(fetched) || observed > now + 300000 || fetched > now + 300000 || observed > fetched + 300000) throw Error('來源觀測或讀取時間不正確');
    const url = new URL(row.sourceUrl);
    if (url.protocol !== 'https:' || url.username || url.password || !sourceHosts.includes(url.hostname) || url.port) throw Error('不受信任的楓況來源');
    if (typeof row.rawStatus !== 'string' || !row.rawStatus.trim()) throw Error('缺少來源原始狀態');
    if (row.recordingMethod !== undefined && !['manual','automatic','unspecified'].includes(row.recordingMethod)) throw Error('來源記錄方式不正確');
    return {id:row.id,state:'ok',recordingMethod:row.recordingMethod || 'unspecified',status:row.status,observedAt:new Date(observed).toISOString(),fetchedAt:new Date(fetched).toISOString(),sourceUrl:url.href,rawStatus:row.rawStatus.slice(0,100),retrievalError:typeof row.retrievalError === 'string' ? row.retrievalError.slice(0,200) : null};
  });
  return {version:1,results};
}
