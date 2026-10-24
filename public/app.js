import {spots} from './spots.js';
import {defaultSheetFeedUrl,foliageReferenceUrls} from './source-config.js';
import {validateLiveFeed,validSheetFeedUrl,observationTime,observationIsStale} from './foliage-feed.js';
import {validateWeatherFeed,fetchWeatherFeed,weatherCodeLabel} from './weather-feed.js';

const $ = id => document.getElementById(id);
const byId = id => spots.find(s => s.id === id);
const esc = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const statuses = ['尚未見頃', '青葉', '開始變色', '轉黃', '轉紅', '見頃', '開始落葉', '落葉'];
const labels = {'尚未見頃':'◌ 尚未見頃','開始變色':'🍃 開始變色','開始落葉':'🍂 開始落葉','青葉':'🟢 青葉','轉黃':'🟡 微黃','轉紅':'🟠 轉紅','見頃':'🍁 見頃','落葉':'🍂 落葉'};
let plan = [['tofukuji','sennyuji','kiyomizu'],['nanzenji','eikando','bishamondo'],['nara','kasuga','isuien']];
let observations = {}, manual = {}, bookings = {}, originals = {}, day = 0, bookingId = '';
let liveRows = {}, feedState = 'loading', checkedAt = null, refreshPending = null;
let weatherRows = {}, weatherState = 'loading', weatherPending = null;
let feedGeneration = 0;
const storedSheetUrl = load('kyoto-sheet-url', '');
let sheetUrl = validSheetFeedUrl(storedSheetUrl) ? storedSheetUrl : '';
let weatherEnabled = load('kyoto-weather-enabled', true) !== false;
function load(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
const saved = load('kyoto-plan', null);
if (Array.isArray(saved) && saved.length === 3 && saved.every(a => Array.isArray(a) && a.length === 3 && a.every(byId))) plan = saved;
for (const [id, o] of Object.entries(load('kyoto-manual', {}))) if (byId(id) && statuses.includes(o?.status) && Number.isFinite(Date.parse(o.updatedAt))) manual[id] = o;
for (const [id, value] of Object.entries(load('kyoto-bookings', {}))) if (byId(id) && typeof value === 'string') bookings[id] = value.slice(0, 100);
for (const [key, id] of Object.entries(load('kyoto-originals', {}))) if (/^[0-2]-[0-2]$/.test(key) && byId(id)) originals[key] = id;
try { observations = validate(load('kyoto-observations', [])); } catch {}
try { const d = localStorage.getItem('kyoto-date'); if (/^\d{4}-\d{2}-\d{2}$/.test(d)) $('date').value = d; } catch {}
$('sheet-url').value = sheetUrl;
$('weather-enabled').checked = weatherEnabled;
try {
  const cached = load('kyoto-live-cache', null);
  if (cached?.url === (sheetUrl || defaultSheetFeedUrl)) liveRows = Object.fromEntries(validateLiveFeed(cached.feed, spots.map(s=>s.id)).results.map(row=>[row.id,row]));
} catch {}
try { weatherRows = Object.fromEntries(validateWeatherFeed(load('kyoto-weather-cache', null)).results.map(row=>[row.id,row])); } catch {}
function notify(text) { $('message').textContent = text; $('message').style.display = 'block'; clearTimeout(notify.timer); notify.timer = setTimeout(() => $('message').style.display = 'none', 6000); }
function store(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { notify('瀏覽器無法儲存；資料僅保留於目前頁面。'); return false; } }
function persist() { store('kyoto-plan', plan); store('kyoto-originals', originals); }
function validate(data) {
  if (!Array.isArray(data)) throw Error('請提供 JSON 陣列');
  const result = {};
  for (const o of data) {
    if (!o || !byId(o.id) || ![...statuses, '未知'].includes(o.status)) throw Error('景點 ID 或紅葉狀態不正確');
    const t = Date.parse(o.observedAt);
    if (!Number.isFinite(t) || t > Date.now() + 300000) throw Error('觀測時間無效或位於未來');
    const u = new URL(o.sourceUrl);
    if (u.protocol !== 'https:' || u.username || u.password) throw Error('來源必須為不含帳密的 HTTPS 網址');
    result[o.id] = {id:o.id, status:o.status, observedAt:new Date(t).toISOString(), sourceUrl:u.href};
  }
  return result;
}
function obs(s) {
  const m = manual[s.id];
  const imported = observations[s.id];
  const live = liveRows[s.id]?.state === 'ok' ? {...liveRows[s.id], automatic:true} : null;
  const sourced = live && (!imported || observationTime(live) >= observationTime(imported)) ? live : imported;
  const o = m ? {status:m.status, observedAt:m.updatedAt, manual:true} : sourced;
  return o ? {...o, stale:observationIsStale(o)} : null;
}
function origin(o) { return o?.manual ? '手動標記' : o?.automatic ? o.recordingMethod === 'manual' ? '來源人工整理' : o.recordingMethod === 'automatic' ? '自動擷取來源' : '同步來源（記錄方式未註明）' : '匯入觀測'; }
function mergeSourceRows(primary, supplement) {
  const rows = new Map(primary.map(row=>[row.id,row]));
  for (const row of supplement) {
    const old = rows.get(row.id);
    if (!old || (row.state==='ok' && (old.state!=='ok' || observationTime(row)>observationTime(old) || (observationTime(row)===observationTime(old) && Date.parse(row.fetchedAt)>=Date.parse(old.fetchedAt))))) rows.set(row.id,row);
    else if (old.state!=='ok' && row.state==='unavailable' && old.state==='not_configured') rows.set(row.id,row);
  }
  return [...rows.values()];
}
function observationLabel(row) { return row.observationPrecision==='day' ? `${row.observedDate}（日本日期；來源未提供時間）` : new Date(row.observedAt).toLocaleString('zh-TW'); }
function keepPrevious(previous, incoming, message) {
  const rows = Object.fromEntries(incoming.map(row=>[row.id,row]));
  for (const {id} of spots) {
    if (rows[id]?.state === 'ok' && previous[id]?.state === 'ok') {
      const oldTime = previous[id].current ? Date.parse(previous[id].current.modelAt) : observationTime(previous[id]);
      const nextTime = rows[id].current ? Date.parse(rows[id].current.modelAt) : observationTime(rows[id]);
      if (nextTime < oldTime || (nextTime === oldTime && Date.parse(rows[id].fetchedAt) < Date.parse(previous[id].fetchedAt))) {
        rows[id] = {...previous[id],retrievalError:'來源回傳較舊資料，保留較新記錄與原始時間'};
      }
    }
    if (rows[id]?.state !== 'ok' && previous[id]?.state === 'ok') rows[id] = {...previous[id], retrievalError:message};
    else if (!rows[id]) rows[id] = {id,state:'unavailable',message};
  }
  return rows;
}
async function refreshLive() {
  if (refreshPending) return refreshPending;
  const generation = feedGeneration, url = sheetUrl;
  refreshPending = (async () => {
    try {
      const response = await fetch(url || new URL('./data/foliage.json', import.meta.url), {cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(15000)});
      if (!response.ok) throw Error('楓況服務回應失敗');
      let feed = validateLiveFeed(await response.json(), spots.map(s=>s.id));
      // Static hosts lack the server marker: read the shared bridge directly,
      // retaining an existing deployed snapshot if the bridge cannot be read.
      if (!url && !response.headers.get('X-Kyoto-Foliage-Service') && defaultSheetFeedUrl) {
        try {
          const bridge = await fetch(defaultSheetFeedUrl, {cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(15000)});
          if (!bridge.ok) throw Error('共用來源讀取失敗');
          const extra = validateLiveFeed(await bridge.json(), spots.map(s=>s.id));
          feed = {version:1,results:mergeSourceRows(feed.results,extra.results)};
        } catch (error) {
          if (!feed.results.some(row=>row.state==='ok')) throw error;
          feed.results = feed.results.map(row=>row.state==='ok' ? {...row,retrievalError:'試算表補充資料暫時無法讀取，保留自動擷取的來源記錄與日期'} : row);
        }
      }
      if (generation !== feedGeneration) return;
      liveRows = keepPrevious(liveRows, feed.results, '本次未取得可用觀測，保留上次記錄與原始時間');
      feedState = feed.results.some(row=>row.state==='ok') ? 'available' : 'unavailable';
      checkedAt = new Date();
      store('kyoto-live-cache', {url:url || defaultSheetFeedUrl,feed:{version:1,results:Object.values(liveRows)}});
    } catch {
      if (generation !== feedGeneration) return;
      feedState = 'error';
      liveRows = keepPrevious(liveRows, [], '同步失敗，保留上次記錄與時間；請核對來源是否仍有效');
    } finally { render(); }
  })().finally(()=>{refreshPending=null;});
  return refreshPending;
}
async function refreshWeather() {
  if (!weatherEnabled) { weatherState = 'off'; return; }
  if (weatherPending) return weatherPending;
  weatherPending = (async () => {
    try {
      const response = await fetch(new URL('./data/weather.json', import.meta.url), {cache:'no-store',signal:AbortSignal.timeout(15000)});
      // GitHub Pages has no server endpoint; use the public API directly in that case.
      let feed;
      if (response.status === 404) feed = await fetchWeatherFeed();
      else {
        if (!response.ok) throw Error('天氣服務讀取失敗');
        feed = validateWeatherFeed(await response.json());
      }
      weatherRows = keepPrevious(weatherRows, feed.results, '天氣更新失敗，保留上次資料與時間');
      weatherState = feed.results.some(row=>row.state==='ok') ? 'available' : 'unavailable';
      store('kyoto-weather-cache', {version:1,results:Object.values(weatherRows)});
    } catch {
      weatherState = 'error';
      weatherRows = keepPrevious(weatherRows, [], '天氣更新失敗，保留上次資料與時間');
    } finally { render(); }
  })().finally(()=>{weatherPending=null;});
  return weatherPending;
}
async function refreshAll() {
  $('refresh').disabled = true;
  try { await Promise.allSettled([refreshLive(), refreshWeather()]); }
  finally { $('refresh').disabled = false; }
}
const japanTime = value => new Date(value).toLocaleString('zh-TW',{timeZone:'Asia/Tokyo',hour12:false});
function weatherHtml(s) {
  if (!weatherEnabled) return '';
  const row = weatherRows[s.id];
  if (row?.state !== 'ok') return `<section class="weather-panel" aria-label="${s.name}氣象參考"><strong>☁ 景點附近氣象</strong><p>${esc(weatherState==='loading'?'正在讀取天氣…':row?.message || '暫時無法讀取天氣，稍後可重試。')}</p><small>氣象與實際楓況分開；無資料時不推算楓色。</small></section>`;
  const stale = Date.now()-Date.parse(row.current.modelAt)>3*3600000 || Date.now()-Date.parse(row.fetchedAt)>3600000;
  return `<section class="weather-panel" aria-label="${s.name}氣象參考"><div class="weather-heading"><strong>☁ ${row.current.temperatureC.toFixed(1)}°C · ${esc(weatherCodeLabel(row.current.weatherCode))}</strong><span>${stale?'資料已過期':'氣象模式估計'}</span></div><small>地點附近的模式網格，並非景點現場測站；不代表紅葉狀態。</small><details><summary>查看資料涵蓋的 7 日最低溫</summary><div class="weather-days">${row.dailyMin.map(d=>`<div><time datetime="${d.date}">${d.date.slice(5).replace('-','/')}</time><strong>${d.temperatureC.toFixed(1)}°</strong></div>`).join('')}</div><small>不含讀取當日；歷史模式資料，不是樹葉觀測。</small></details><small>模式時間：${esc(japanTime(row.current.modelAt))} 日本時間<br>讀取時間：${esc(japanTime(row.fetchedAt))} 日本時間 · ${link(row.sourceUrl,'Open-Meteo（CC BY 4.0）')}</small>${row.retrievalError?`<p class="weather-error">⚠ ${esc(row.retrievalError)}</p>`:''}</section>`;
}
function score(s) { const o = obs(s); return o && !o.stale ? ({見頃:3,轉紅:2}[o.status] || 0) : 0; }
const map = s => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(s.map);
const search = text => 'https://www.google.com/search?q=' + encodeURIComponent(text);
const directions = (a,b) => 'https://www.google.com/maps/dir/?api=1&origin=' + encodeURIComponent(a.map) + '&destination=' + encodeURIComponent(b.map) + '&travelmode=transit';
const link = (url,text) => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${text} ↗</a>`;
function alternate(s) {
  const o = obs(s);
  if (o && !o.stale && ['轉紅','見頃'].includes(o.status)) return null;
  const candidates = spots.filter(a => !plan.flat().includes(a.id) && (a.area === s.area || (a.area.startsWith('京都') && s.area.startsWith('京都'))));
  const preferred = o?.status === '落葉' ? 'gioji' : 'shogunzuka';
  candidates.sort((a,b) => score(b) - score(a) || Number(b.area === s.area) - Number(a.area === s.area) || Number(b.id === preferred) - Number(a.id === preferred));
  return candidates[0] || null;
}
function alternativeHtml(s) {
  const a = alternate(s); if (!a) return '';
  const o = obs(s), ao = obs(a);
  const reason = o && !o.stale ? `目前${origin(o)}為${labels[o.status] || o.status}` : '缺少 24 小時內有效資料';
  const status = ao && !ao.stale ? `${origin(ao)}：${labels[ao.status] || ao.status}` : '楓況待確認，僅為地區備案';
  return `<div class="alternative"><strong>${esc(reason)} · 備案 ${a.name}</strong><small>${esc(status)}。${s.area === a.area ? '同區景點' : '跨京都區域，需重查交通'}；請先查最新楓況與開放資訊，再決定替換。</small><button data-replace="${s.id}" data-alt="${a.id}">🔄 一鍵切換至此備案</button> ${link(map(a),'查看位置')}</div>`;
}
function render() {
  const items = plan[day].map(byId);
  $('days').innerHTML = plan.map((_,i) => {
    const d = new Date(($('date').value || '2026-11-20') + 'T12:00:00'); d.setDate(d.getDate()+i);
    return `<button class="${day===i?'active':''}" data-day="${i}" aria-pressed="${day===i}">DAY 0${i+1}<small>${d.toLocaleDateString('zh-TW',{month:'2-digit',day:'2-digit'})} · ${i===2?'奈良漫步':'京都賞楓'}</small></button>`;
  }).join('');
  $('day-title').textContent = ['東南京都・古寺楓色','東山散步・庭園之秋','奈良一日・鹿與秋葉'][day];
  const seen = items.filter(s => { const o=obs(s); return o && !o.stale && o.status === '見頃'; });
  $('bloom-count').textContent = `${seen.length} / ${items.length} 站見頃`;
  $('bloom-note').textContent = `手動 ${seen.filter(s=>obs(s).manual).length} · 同步 ${seen.filter(s=>obs(s).automatic).length} · 匯入 ${seen.filter(s=>!obs(s).manual&&!obs(s).automatic).length}（24 小時內）`;
  // Maps transit does not reliably support waypoints; offer all stops in walking mode and transit per leg.
  const route = new URL(directions(items[0],items.at(-1))); route.searchParams.set('travelmode','walking'); route.searchParams.set('waypoints',items.slice(1,-1).map(s=>s.map).join('|'));
  $('whole-route').href = route; $('bottom-route').href = route;
  $('cards').innerHTML = items.map((s,i) => {
    const o=obs(s), key=`${day}-${i}`, booking=bookings[s.id];
    const status = o ? `${labels[o.status] || o.status} · ${o.stale?(o.observationPrecision==='day'?'較舊日期':'已過期'):o.manual?'手動':o.automatic?'同步來源':'匯入'}` : liveRows[s.id]?.checkedAt ? '◌ 尚無可用觀測' : '◌ 紅葉待確認';
    return `<article class="card" data-spot="${s.id}"><div class="card-top"><div><div class="index">STOP 0${i+1} / ${s.area}</div><h3>${s.name}</h3><div class="english">${s.en}</div></div><span class="status">${esc(status)}</span></div>
    ${o?.sourceScope?`<div class="observation-scope">來源觀測範圍：${esc(o.sourceScope)}</div>`:''}${weatherHtml(s)}<div class="status-control"><label>手動標記楓況 <select data-status="${s.id}" aria-label="${s.name}手動楓況"><option value="">使用來源資料／待確認</option>${statuses.map(v=>`<option value="${v}" ${manual[s.id]?.status===v?'selected':''}>${labels[v]}</option>`).join('')}</select></label><small>手動標記優先顯示；選「使用來源資料」可恢復自動／匯入記錄。</small></div>
    <p>${s.note}</p><div class="meta">☀ 日間｜${s.hours}<br>🌙 夜間｜${['kiyomizu','eikando','shogunzuka'].includes(s.id)?'可能有季節限定夜間拜觀；2026 場次、時間及票務待官網確認':'未確認夜間開放，請勿以日間票推定可夜間入場'}<br>▤ 預約與票務｜${link(s.url,'查閱官方公告')}<br>◉ 人潮｜尚無自動即時資料${o?`<br>楓況記錄｜${esc(observationLabel(o))} · ${o.manual?'個人手動標記':link(o.sourceUrl,origin(o))}${o.automatic?`<br>來源原文｜${esc(o.rawStatus)}${o.stale?'<br><strong>此為較舊來源記錄，不能當作今日現況。</strong>':''}<br>讀取時間｜${esc(new Date(o.fetchedAt).toLocaleString('zh-TW'))}${o.retrievalError?`<br>⚠ ${esc(o.retrievalError)}`:''}`:''}`:''}</div>
    ${liveRows[s.id]?.state!=='ok'?`<div class="feed-note">自動查詢：${esc(liveRows[s.id]?.state==='not_configured'?'尚無可驗證的楓況觀測':liveRows[s.id]?.message || (feedState==='error'?'服務讀取失敗，請稍後重試':'尚未取得來源資料'))}${liveRows[s.id]?.checkedAt?`<br>查詢時間：${esc(japanTime(liveRows[s.id].checkedAt))} 日本時間`:''} · ${link(liveRows[s.id]?.sourceUrl || foliageReferenceUrls[s.id] || s.url,'查看來源參考頁')}</div>`:''}<div class="booking"><span>預約序號：${booking?'已儲存（點編輯查看）':'尚未填寫'}</span><button data-booking="${s.id}">${booking?'編輯':'新增'}序號</button></div>
    <div class="actions">${link(map(s),'Google Maps')}${link(map(s),'Google 熱門程度')}${link(s.url,'景點官網')}</div>
    <details class="sources"><summary>查楓況照片與現場人潮</summary><div class="actions">${link('https://weathernews.jp/koyo/','Weathernews 楓況入口')}${s.area.startsWith('京都')?link(foliageReferenceUrls[s.id] || 'https://souda-kyoto.jp/',foliageReferenceUrls[s.id]?'JR 東海景點資料':'JR 東海京都入口'):''}${link(search(s.map+' 紅葉 今日 写真'),'搜尋最新楓況照片')}${link('https://www.youtube.com/results?search_query='+encodeURIComponent(s.map+' ライブカメラ'),'YouTube 直播搜尋')}${s.area.startsWith('京都')?link('https://ja.kyoto.travel/comfort/','京都官方快適度資訊'):''}</div><small>入口與搜尋結果不保證涵蓋此景點。請核對拍攝地點、日期及直播標記；Maps 熱門程度與官方資訊可能為預測或歷史資料。</small></details>
    ${alternativeHtml(s)}${originals[key]?`<button class="restore" data-restore="${i}">↩ 還原原景點：${byId(originals[key]).name}</button>`:''}</article>
    ${i<items.length-1?`<div class="transfer">↓ ${s.name} → ${items[i+1].name}<br>${link(directions(s,items[i+1]),'Google 路線導航 · 大眾運輸')}<small>車次、轉乘與時間由 Google Maps 即時計算</small></div>`:''}`;
  }).join('');
  $('suggestions').innerHTML = '<p>備案現在直接顯示於需要應變的景點下方。替換後可一鍵還原，並同步更新前後站導航。</p>';
  const sourcedRows = Object.values(liveRows).filter(row=>row.state==='ok');
  const recentRows = sourcedRows.filter(row=>!observationIsStale(row));
  $('freshness').textContent = `來源 ${Object.values(liveRows).filter(r=>r.state==='ok').length} · 手動 ${Object.keys(manual).length} · 匯入 ${Object.keys(observations).length}`;
  $('feed-status').textContent = feedState === 'loading' ? '正在檢查來源資料…' : feedState === 'error' ? '楓況同步失敗；保留既有記錄，不更新觀測時間。請檢查來源部署權限與網路。' : feedState === 'available' ? `已取得 ${sourcedRows.length} 站來源記錄，其中 ${recentRows.length} 站符合本頁時效；請核對來源日期與範圍，較舊記錄不當作今日現況。` : '資料讀取完成，目前尚無有效楓況觀測；參考網址與實際觀測分開顯示。';
  $('weather-status').textContent = !weatherEnabled ? '天氣自動更新已關閉。' : weatherState === 'loading' ? '正在讀取景點附近天氣…' : weatherState === 'available' ? '天氣每 15 分鐘讀取；為模式資料，不據此判定楓況。' : '天氣更新未成功；舊資料會保留原始時間。';
  $('source-description').textContent = sheetUrl ? '目前使用你設定的 Google Sheets 橋接來源；開啟與每 15 分鐘自動讀取。' : defaultSheetFeedUrl ? '目前讀取日本來源的自動擷取結果，每小時更新；試算表可補充觀測，較新記錄優先。' : '目前使用網站內建的楓況資料；尚未設定試算表橋接來源。';
  $('feed-checked').textContent = checkedAt ? `服務檢查：${checkedAt.toLocaleString('zh-TW')}（非觀測時間）` : '';

}
$('days').onclick = e => { const b=e.target.closest('[data-day]'); if(b){day=Number(b.dataset.day);render();} };
$('cards').onchange = e => { const id=e.target.dataset.status; if(!id)return; if(e.target.value)manual[id]={status:e.target.value,updatedAt:new Date().toISOString()};else delete manual[id];store('kyoto-manual',manual);render(); };
$('cards').onclick = e => {
  const replace=e.target.closest('[data-replace]'), restore=e.target.closest('[data-restore]'), booking=e.target.closest('[data-booking]');
  if(replace){const i=plan[day].indexOf(replace.dataset.replace),key=`${day}-${i}`;if(i<0||plan.flat().includes(replace.dataset.alt))return;originals[key]??=plan[day][i];plan[day][i]=replace.dataset.alt;persist();render();notify('已替換景點，前後站導航同步更新。');}
  if(restore){const i=Number(restore.dataset.restore),key=`${day}-${i}`;if(plan.flat().includes(originals[key])){notify('原景點已在其他行程中，請先移除重複景點。');return;}plan[day][i]=originals[key];delete originals[key];persist();render();notify('已還原原景點及導航。');}
  if(booking){bookingId=booking.dataset.booking;$('booking-title').textContent=byId(bookingId).name+' · 預約序號';$('booking-value').value=bookings[bookingId]||'';$('booking-dialog').showModal();$('booking-value').focus();}
};
$('booking-form').onsubmit = e => {e.preventDefault();const value=$('booking-value').value.trim();if(value)bookings[bookingId]=value;else delete bookings[bookingId];store('kyoto-bookings',bookings);$('booking-dialog').close();render();notify('預約序號已更新；僅儲存於此瀏覽器，不代表已完成預約。');};
$('booking-cancel').onclick=()=>$('booking-dialog').close();
$('date').onchange=()=>{try{localStorage.setItem('kyoto-date',$('date').value);}catch{}render();};
$('import').onclick=()=>$('file').click();
$('file').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>1000000)throw Error('檔案請小於 1 MB');const rows=JSON.parse(await file.text());const validated=validate(rows);observations=validated;store('kyoto-observations',rows);render();notify('已載入；如有手動標記，請選「使用來源資料」查看。');}catch(err){notify('匯入失敗：'+err.message);}finally{e.target.value='';}};
$('source-form').onsubmit = async e => {
  e.preventDefault();
  const value = $('sheet-url').value.trim();
  if (value && !validSheetFeedUrl(value)) { $('source-feedback').textContent = '請貼上 https://script.google.com/macros/s/部署ID/exec 網址，不可含帳密或查詢參數。'; return; }
  const pending = refreshPending;
  feedGeneration++;
  sheetUrl = value;
  store('kyoto-sheet-url', sheetUrl);
  liveRows = {}; checkedAt = null; feedState = 'loading';
  store('kyoto-live-cache', {url:sheetUrl || defaultSheetFeedUrl,feed:{version:1,results:[]}});
  $('source-feedback').textContent = value ? '已儲存在此瀏覽器，正在測試讀取…' : '已恢復日本來源自動擷取結果。';
  render();
  if (pending) await pending;
  await refreshLive();
  $('source-feedback').textContent = feedState === 'error' ? '設定已儲存，但讀取失敗。請確認部署可公開讀取，並查看串接說明。' : feedState === 'available' ? '設定已儲存，已取得通過驗證的來源記錄。' : '設定已儲存，目前沒有可用觀測；不會填入推測楓況。';
};
$('weather-enabled').onchange = async () => { weatherEnabled = $('weather-enabled').checked;store('kyoto-weather-enabled',weatherEnabled);render();if(weatherEnabled) await refreshWeather(); };
$('refresh').onclick=async()=>{await refreshAll();notify('已完成來源與天氣檢查；請查看各筆資料時間與更新狀態。');};
$('sample').onclick=()=>{const example=[{id:'tofukuji',status:'未知',observedAt:new Date().toISOString(),sourceUrl:'https://tofukuji.jp/'}];const u=URL.createObjectURL(new Blob([JSON.stringify(example,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=u;a.download='observations-template.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);};
setInterval(()=>{if(!$('booking-dialog').open&&!$('cards').contains(document.activeElement))render();},60000);
render();

refreshAll();
setInterval(refreshAll,15*60*1000);
