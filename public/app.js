import {spots} from './spots.js';
import {validateLiveFeed} from './foliage-feed.js';

const $ = id => document.getElementById(id);
const byId = id => spots.find(s => s.id === id);
const esc = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const statuses = ['青葉', '轉黃', '轉紅', '見頃', '落葉'];
const labels = {'青葉':'🟢 青葉','轉黃':'🟡 微黃','轉紅':'🟠 轉紅','見頃':'🍁 見頃','落葉':'🍂 落葉'};
let plan = [['tofukuji','sennyuji','kiyomizu'],['nanzenji','eikando','bishamondo'],['nara','kasuga','isuien']];
let observations = {}, manual = {}, bookings = {}, originals = {}, day = 0, bookingId = '';
let liveRows = {}, feedState = 'loading', checkedAt = null, refreshPending = null;
function load(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
const saved = load('kyoto-plan', null);
if (Array.isArray(saved) && saved.length === 3 && saved.every(a => Array.isArray(a) && a.length === 3 && a.every(byId))) plan = saved;
for (const [id, o] of Object.entries(load('kyoto-manual', {}))) if (byId(id) && statuses.includes(o?.status) && Number.isFinite(Date.parse(o.updatedAt))) manual[id] = o;
for (const [id, value] of Object.entries(load('kyoto-bookings', {}))) if (byId(id) && typeof value === 'string') bookings[id] = value.slice(0, 100);
for (const [key, id] of Object.entries(load('kyoto-originals', {}))) if (/^[0-2]-[0-2]$/.test(key) && byId(id)) originals[key] = id;
try { observations = validate(load('kyoto-observations', [])); } catch {}
try { const d = localStorage.getItem('kyoto-date'); if (/^\d{4}-\d{2}-\d{2}$/.test(d)) $('date').value = d; } catch {}
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
  const sourced = live && (!imported || Date.parse(live.observedAt) >= Date.parse(imported.observedAt)) ? live : imported;
  const o = m ? {status:m.status, observedAt:m.updatedAt, manual:true} : sourced;
  return o ? {...o, stale:Date.now() - Date.parse(o.observedAt) > 86400000} : null;
}
function origin(o) { return o?.manual ? '手動標記' : o?.automatic ? '自動來源' : '匯入觀測'; }
async function refreshLive() {
  if (refreshPending) return refreshPending;
  $('refresh').disabled = true;
  refreshPending = (async () => {
    try {
      const response = await fetch(new URL('./data/foliage.json', import.meta.url), {cache:'no-store',signal:AbortSignal.timeout(15000)});
      if (!response.ok) throw Error('楓況服務回應失敗');
      const feed = validateLiveFeed(await response.json(), spots.map(s=>s.id));
      liveRows = Object.fromEntries(feed.results.map(row=>[row.id,row]));
      feedState = feed.results.some(row=>row.state==='ok') ? 'available' : 'unavailable';
      checkedAt = new Date();
    } catch { feedState = 'error'; }
    finally { $('refresh').disabled = false; render(); }
  })().finally(()=>{refreshPending=null;});
  return refreshPending;
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
  $('bloom-note').textContent = `手動 ${seen.filter(s=>obs(s).manual).length} · 自動 ${seen.filter(s=>obs(s).automatic).length} · 匯入 ${seen.filter(s=>!obs(s).manual&&!obs(s).automatic).length}（24 小時內）`;
  // Maps transit does not reliably support waypoints; offer all stops in walking mode and transit per leg.
  const route = new URL(directions(items[0],items.at(-1))); route.searchParams.set('travelmode','walking'); route.searchParams.set('waypoints',items.slice(1,-1).map(s=>s.map).join('|'));
  $('whole-route').href = route; $('bottom-route').href = route;
  $('cards').innerHTML = items.map((s,i) => {
    const o=obs(s), key=`${day}-${i}`, booking=bookings[s.id];
    const status = o ? `${labels[o.status] || o.status} · ${o.stale?'已過期':o.manual?'手動':o.automatic?'自動來源':'匯入'}` : '◌ 紅葉待確認';
    return `<article class="card" data-spot="${s.id}"><div class="card-top"><div><div class="index">STOP 0${i+1} / ${s.area}</div><h3>${s.name}</h3><div class="english">${s.en}</div></div><span class="status">${esc(status)}</span></div>
    <div class="status-control"><label>手動標記楓況 <select data-status="${s.id}" aria-label="${s.name}手動楓況"><option value="">使用來源資料／待確認</option>${statuses.map(v=>`<option value="${v}" ${manual[s.id]?.status===v?'selected':''}>${labels[v]}</option>`).join('')}</select></label><small>手動標記優先顯示；選「使用來源資料」可恢復自動／匯入記錄。</small></div>
    <p>${s.note}</p><div class="meta">☀ 日間｜${s.hours}<br>🌙 夜間｜${['kiyomizu','eikando','shogunzuka'].includes(s.id)?'可能有季節限定夜間拜觀；2026 場次、時間及票務待官網確認':'未確認夜間開放，請勿以日間票推定可夜間入場'}<br>▤ 預約與票務｜${link(s.url,'查閱官方公告')}<br>◉ 人潮｜尚無自動即時資料${o?`<br>楓況記錄｜${esc(new Date(o.observedAt).toLocaleString('zh-TW'))} · ${o.manual?'個人手動標記':link(o.sourceUrl,origin(o))}${o.automatic?`<br>來源原文｜${esc(o.rawStatus)}<br>讀取時間｜${esc(new Date(o.fetchedAt).toLocaleString('zh-TW'))}${o.retrievalError?`<br>⚠ ${esc(o.retrievalError)}`:''}`:''}`:''}</div>
    ${liveRows[s.id]?.state!=='ok'?`<div class="feed-note">自動楓況：${esc(liveRows[s.id]?.message || (feedState==='error'?'服務讀取失敗，請稍後重試':'尚未取得來源資料'))}</div>`:''}<div class="booking"><span>預約序號：${booking?'已儲存（點編輯查看）':'尚未填寫'}</span><button data-booking="${s.id}">${booking?'編輯':'新增'}序號</button></div>
    <div class="actions">${link(map(s),'Google Maps')}${link(map(s),'Google 熱門程度')}${link(s.url,'景點官網')}</div>
    <details class="sources"><summary>查楓況照片與現場人潮</summary><div class="actions">${link('https://weathernews.jp/koyo/','Weathernews 楓況入口')}${s.area.startsWith('京都')?link('https://souda-kyoto.jp/','JR 東海京都入口'):''}${link(search(s.map+' 紅葉 今日 写真'),'搜尋最新楓況照片')}${link('https://www.youtube.com/results?search_query='+encodeURIComponent(s.map+' ライブカメラ'),'YouTube 直播搜尋')}${s.area.startsWith('京都')?link('https://ja.kyoto.travel/comfort/','京都官方快適度資訊'):''}</div><small>入口與搜尋結果不保證涵蓋此景點。請核對拍攝地點、日期及直播標記；Maps 熱門程度與官方資訊可能為預測或歷史資料。</small></details>
    ${alternativeHtml(s)}${originals[key]?`<button class="restore" data-restore="${i}">↩ 還原原景點：${byId(originals[key]).name}</button>`:''}</article>
    ${i<items.length-1?`<div class="transfer">↓ ${s.name} → ${items[i+1].name}<br>${link(directions(s,items[i+1]),'Google 路線導航 · 大眾運輸')}<small>車次、轉乘與時間由 Google Maps 即時計算</small></div>`:''}`;
  }).join('');
  $('suggestions').innerHTML = '<p>備案現在直接顯示於需要應變的景點下方。替換後可一鍵還原，並同步更新前後站導航。</p>';
  $('freshness').textContent = `自動 ${Object.values(liveRows).filter(r=>r.state==='ok').length} · 手動 ${Object.keys(manual).length} · 匯入 ${Object.keys(observations).length}`;
  $('feed-status').textContent = feedState === 'loading' ? '正在檢查自動資料…' : feedState === 'error' ? '自動資料讀取失敗；保留既有記錄，不更新觀測時間。' : feedState === 'available' ? '已讀取來源快照；各景點顯示原始觀測時間，超過 24 小時標記過期。' : '自動讀取尚未就緒：真實來源仍待驗證，目前沒有自動楓況。';
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
$('refresh').onclick=async()=>{await refreshLive();notify(feedState==='available'?'已重新讀取來源資料；請確認每筆觀測時間。':'自動來源尚無可用資料；未更改或推測任何楓況。');};
$('sample').onclick=()=>{const example=[{id:'tofukuji',status:'未知',observedAt:new Date().toISOString(),sourceUrl:'https://tofukuji.jp/'}];const u=URL.createObjectURL(new Blob([JSON.stringify(example,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=u;a.download='observations-template.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);};
setInterval(()=>{if(!$('booking-dialog').open&&!$('cards').contains(document.activeElement))render();},60000);
render();

refreshLive();
setInterval(refreshLive,15*60*1000);
