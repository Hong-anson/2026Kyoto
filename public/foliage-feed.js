// Shared by the browser, synchronization command and server. Never use fetch time as observation time.
export const sourceHosts = ['weathernews.jp', 'souda-kyoto.jp', 'www.kasugataisha.or.jp', 'isuien.or.jp', 'ja.kyoto.travel', 'www.pref.nara.jp', 'www3.pref.nara.jp'];
export const foliageStates = ['青葉', '尚未見頃', '開始變色', '轉黃', '轉紅', '見頃', '開始落葉', '落葉', '未知'];
const clockSkew = 300000;
const japanDate = time => new Date(time + 9 * 3600000).toISOString().slice(0,10);
export function validSheetFeedUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && u.hostname === 'script.google.com' && !u.username && !u.password && !u.port && !u.search && !u.hash && /^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(u.pathname);
  } catch { return false; }
}
function calendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year,month,day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year,month-1,day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month-1 && date.getUTCDate() === day;
}
function zonedTime(value) {
  if (typeof value !== 'string') return false;
  const m = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.\d{1,3})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(value);
  return Boolean(m && calendarDate(m[1]) && Number.isFinite(Date.parse(value)));
}
function trustedSource(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || !sourceHosts.includes(url.hostname) || url.port) throw Error('不受信任的楓況來源');
  return url.href;
}
function scopeMetadata(row) {
  const result = {};
  for (const [key,limit] of [['sourceScope',120],['sourceSpotName',80]]) {
    if (row[key] === undefined) continue;
    if (typeof row[key] !== 'string' || !row[key].trim() || row[key].length > limit) throw Error('來源涵蓋範圍或景點名稱不正確');
    result[key] = row[key].trim();
  }
  return result;
}
// A date-only record has no known observation instant. Japan midnight is a
// conservative ordering/freshness bound only; never output it as observedAt.
export function observationTime(row) {
  if (row?.observationPrecision === 'day') {
    return row.observedAt === undefined && calendarDate(row.observedDate) ? Date.parse(row.observedDate+'T00:00:00+09:00') : NaN;
  }
  return row?.observationPrecision === undefined && row?.observedDate === undefined && zonedTime(row?.observedAt) ? Date.parse(row.observedAt) : NaN;
}
export function observationIsStale(row,now = Date.now()) {
  const time = observationTime(row);
  return !Number.isFinite(time) || time > now + clockSkew || now - time > 86400000;
}
export function validateLiveFeed(feed, ids, now = Date.now()) {
  if (!feed || feed.version !== 1 || !Array.isArray(feed.results)) throw Error('楓況資料格式不正確');
  const seen = new Set();
  const results = feed.results.map(row => {
    if (!row || !ids.includes(row.id) || seen.has(row.id)) throw Error('景點 ID 不正確或重複');
    seen.add(row.id);
    if (!['ok','unavailable','not_configured'].includes(row.state)) throw Error('來源狀態不正確');
    const scope = scopeMetadata(row);
    if (row.state !== 'ok') {
      const result = {id:row.id,state:row.state,message:typeof row.message === 'string' ? row.message.slice(0,200) : '來源暫無可用觀測',...scope};
      if (row.sourceUrl !== undefined) result.sourceUrl = trustedSource(row.sourceUrl);
      if (row.checkedAt !== undefined) {
        if (!zonedTime(row.checkedAt) || Date.parse(row.checkedAt) > now + clockSkew) throw Error('來源查詢時間不正確');
        result.checkedAt = new Date(row.checkedAt).toISOString();
      }
      return result;
    }
    if (!foliageStates.includes(row.status)) throw Error('不支援的楓況');
    if (!zonedTime(row.fetchedAt)) throw Error('來源讀取時間必須包含有效時區');
    const fetched = Date.parse(row.fetchedAt);
    if (fetched > now + clockSkew) throw Error('來源讀取時間不正確');
    let observation;
    if (row.observedDate !== undefined) {
      if (row.observedAt !== undefined || row.observationPrecision !== 'day' || !calendarDate(row.observedDate)) throw Error('日期精度的觀測必須只有有效日期，不可填入推測時間');
      if (row.observedDate > japanDate(now) || row.observedDate > japanDate(fetched)) throw Error('來源觀測日期位於未來或晚於讀取日期');
      observation = {observedDate:row.observedDate,observationPrecision:'day'};
    } else {
      if (row.observationPrecision !== undefined || !zonedTime(row.observedAt)) throw Error('來源觀測時間必須包含有效時區');
      const observed = Date.parse(row.observedAt);
      if (observed > now + clockSkew || observed > fetched + clockSkew) throw Error('來源觀測或讀取時間不正確');
      observation = {observedAt:new Date(observed).toISOString()};
    }
    const sourceUrl = trustedSource(row.sourceUrl);
    if (typeof row.rawStatus !== 'string' || !row.rawStatus.trim()) throw Error('缺少來源原始狀態');
    if (row.recordingMethod !== undefined && !['manual','automatic','unspecified'].includes(row.recordingMethod)) throw Error('來源記錄方式不正確');
    return {id:row.id,state:'ok',recordingMethod:row.recordingMethod || 'unspecified',status:row.status,...observation,fetchedAt:new Date(fetched).toISOString(),sourceUrl,rawStatus:row.rawStatus.slice(0,100),retrievalError:typeof row.retrievalError === 'string' ? row.retrievalError.slice(0,200) : null,...scope};
  });
  return {version:1,results};
}
