const spots=[
{id:'tofukuji',name:'東福寺',en:'TOFUKU-JI TEMPLE',area:'京都東南',map:'東福寺 京都',url:'https://tofukuji.jp/',note:'通天橋等區域可能限制攝影與停留；旺季排隊請預留時間。特別拜觀票務與夜間場次須另行確認。',hours:'通常日間開放，秋季特別拜觀時間依年度公告'},
{id:'sennyuji',name:'泉涌寺',en:'SENNYU-JI TEMPLE',area:'京都東南',map:'泉涌寺 京都',url:'https://mitera.org/',note:'山路有坡度，穿著好走的鞋。特別公開區域可能另收費，預約依當期活動公告。',hours:'日間拜觀；季節性開放及最後入場時間請查官網'},
{id:'kiyomizu',name:'清水寺',en:'KIYOMIZU-DERA TEMPLE',area:'京都東山',map:'清水寺 京都',url:'https://www.kiyomizudera.or.jp/',note:'周邊坡道與石階多，行李寄放後再前往。夜間特別拜觀的日期、票務與開放範圍另行公告。',hours:'通常清晨開門；閉門及夜間拜觀時間依季節變動'},
{id:'eikando',name:'永觀堂',en:'EIKAN-DO TEMPLE',area:'京都東山',map:'永観堂 京都',url:'https://www.eikando.or.jp/',note:'秋季寺寶展與夜間拜觀可能分場收費；請查當年度票務及入場規則。部分區域需脫鞋。',hours:'日間與秋季夜間場次依官網公告'},
{id:'nanzenji',name:'南禪寺',en:'NANZEN-JI TEMPLE',area:'京都東山',map:'南禅寺 京都',url:'https://www.nanzenji.or.jp/',note:'三門樓梯陡峭，行動不便者請斟酌。境內、方丈與三門開放範圍和收費各異。',hours:'境內與付費拜觀區時間不同，請查官網'},
{id:'bishamondo',name:'毘沙門堂',en:'BISHAMON-DO TEMPLE',area:'京都東山',map:'毘沙門堂 山科',url:'https://www.bishamon.or.jp/',note:'參道坡度與石階較多，雨後留意濕滑。攝影、特別拜觀及預約規定請查當期公告。',hours:'日間拜觀，季節活動時間另行公告'},
{id:'nara',name:'奈良公園',en:'NARA PARK',area:'奈良',map:'奈良公園',url:'https://www3.pref.nara.jp/park/',note:'鹿為野生動物，勿餵食鹿仙貝以外食物。落葉及雨後地面濕滑；公園內各設施開放時間不同。',hours:'戶外散步區通常自由通行；各寺社、園區另訂時間'},
{id:'kasuga',name:'春日大社',en:'KASUGA TAISHA',area:'奈良',map:'春日大社',url:'https://www.kasugataisha.or.jp/',note:'參道有碎石與石階。特別參拜、萬葉植物園及祭典的收費與開放限制需另查。',hours:'參拜時間依季節變動；特別參拜另有受理時間'},
{id:'isuien',name:'依水園',en:'ISUIEN GARDEN',area:'奈良',map:'依水園',url:'https://isuien.or.jp/',note:'有定期休園日及臨時休園可能，請先查官網；茶席、團體與特別活動預約另行確認。',hours:'日間開園，休園日及最後入園請查官網'},
{id:'yoshikien',name:'吉城園',en:'YOSHIKIEN GARDEN',area:'奈良',map:'吉城園 奈良',url:'https://www.pref.nara.jp/',note:'庭園步道有高低差。冬季休園、入園條件及臨時公告請向奈良縣官方確認。',hours:'日間開園；季節休園資訊待官網確認'},
{id:'shogunzuka',name:'將軍塚青龍殿',en:'SHOGUNZUKA SEIRYUDEN',area:'京都東山',map:'将軍塚青龍殿',url:'https://www.shogunzuka.com/',note:'位於山上，請先確認接駁與回程交通。山上氣溫較低；特別拜觀與大舞台開放依公告。',hours:'日間拜觀時間及特別夜間開放請查官網'},
{id:'gioji',name:'祇王寺',en:'GIO-JI TEMPLE',area:'京都嵐山',map:'祇王寺 京都',url:'https://www.giouji.or.jp/',note:'苔庭與落葉為不同觀賞重點，現場是否有紅毯仍需確認。小徑狹窄，勿踏入青苔區。',hours:'日間拜觀；最後入場與臨時休止請查官網'},
{id:'jojakkoji',name:'常寂光寺',en:'JOJAKKO-JI TEMPLE',area:'京都嵐山',map:'常寂光寺',url:'https://jojakko-ji.or.jp/',note:'境內石階多，雨後注意濕滑。無保證夜間開放，活動與票務請查官網。',hours:'日間拜觀，實際開放與最後入場請查官網'}];

const $ = id => document.getElementById(id);
const byId = id => spots.find(s => s.id === id);
const esc = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const statuses = ['青葉', '轉黃', '轉紅', '見頃', '落葉'];
const labels = {'青葉':'🟢 青葉','轉黃':'🟡 微黃','轉紅':'🟠 轉紅','見頃':'🍁 見頃','落葉':'🍂 落葉'};
let plan = [['tofukuji','sennyuji','kiyomizu'],['nanzenji','eikando','bishamondo'],['nara','kasuga','isuien']];
let observations = {}, manual = {}, bookings = {}, originals = {}, day = 0, bookingId = '';
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
  const m = manual[s.id], imported = observations[s.id];
  const o = m ? {status:m.status, observedAt:m.updatedAt, manual:true} : imported;
  return o ? {...o, stale:Date.now() - Date.parse(o.observedAt) > 86400000} : null;
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
  const reason = o && !o.stale ? `目前${o.manual?'手動標記':'匯入觀測'}為${labels[o.status] || o.status}` : '缺少 24 小時內有效資料';
  const status = ao && !ao.stale ? `${ao.manual?'手動標記':'匯入觀測'}：${labels[ao.status] || ao.status}` : '楓況待確認，僅為地區備案';
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
  $('bloom-note').textContent = `手動 ${seen.filter(s=>obs(s).manual).length} 站 · 匯入 ${seen.filter(s=>!obs(s).manual).length} 站（24 小時內）`;
  // Maps transit does not reliably support waypoints; offer all stops in walking mode and transit per leg.
  const route = new URL(directions(items[0],items.at(-1))); route.searchParams.set('travelmode','walking'); route.searchParams.set('waypoints',items.slice(1,-1).map(s=>s.map).join('|'));
  $('whole-route').href = route; $('bottom-route').href = route;
  $('cards').innerHTML = items.map((s,i) => {
    const o=obs(s), key=`${day}-${i}`, booking=bookings[s.id];
    const status = o ? `${labels[o.status] || o.status} · ${o.stale?'已過期':o.manual?'手動':'匯入'}` : '◌ 紅葉待確認';
    return `<article class="card" data-spot="${s.id}"><div class="card-top"><div><div class="index">STOP 0${i+1} / ${s.area}</div><h3>${s.name}</h3><div class="english">${s.en}</div></div><span class="status">${esc(status)}</span></div>
    <div class="status-control"><label>手動標記楓況 <select data-status="${s.id}" aria-label="${s.name}手動楓況"><option value="">使用匯入資料／待確認</option>${statuses.map(v=>`<option value="${v}" ${manual[s.id]?.status===v?'selected':''}>${labels[v]}</option>`).join('')}</select></label><small>手動標記僅作個人記錄，並非自動取得現場狀況。</small></div>
    <p>${s.note}</p><div class="meta">☀ 日間｜${s.hours}<br>🌙 夜間｜${['kiyomizu','eikando','shogunzuka'].includes(s.id)?'可能有季節限定夜間拜觀；2026 場次、時間及票務待官網確認':'未確認夜間開放，請勿以日間票推定可夜間入場'}<br>▤ 預約與票務｜${link(s.url,'查閱官方公告')}<br>◉ 人潮｜尚無自動即時資料${o?`<br>楓況記錄｜${esc(new Date(o.observedAt).toLocaleString('zh-TW'))} · ${o.manual?'個人手動標記':link(o.sourceUrl,'觀測來源')}`:''}</div>
    <div class="booking"><span>預約序號：${booking?'已儲存（點編輯查看）':'尚未填寫'}</span><button data-booking="${s.id}">${booking?'編輯':'新增'}序號</button></div>
    <div class="actions">${link(map(s),'Google Maps')}${link(map(s),'Google 熱門程度')}${link(s.url,'景點官網')}</div>
    <details class="sources"><summary>查楓況照片與現場人潮</summary><div class="actions">${link('https://weathernews.jp/koyo/','Weathernews 楓況入口')}${s.area.startsWith('京都')?link('https://souda-kyoto.jp/','JR 東海京都入口'):''}${link(search(s.map+' 紅葉 今日 写真'),'搜尋最新楓況照片')}${link('https://www.youtube.com/results?search_query='+encodeURIComponent(s.map+' ライブカメラ'),'YouTube 直播搜尋')}${s.area.startsWith('京都')?link('https://ja.kyoto.travel/comfort/','京都官方快適度資訊'):''}</div><small>入口與搜尋結果不保證涵蓋此景點。請核對拍攝地點、日期及直播標記；Maps 熱門程度與官方資訊可能為預測或歷史資料。</small></details>
    ${alternativeHtml(s)}${originals[key]?`<button class="restore" data-restore="${i}">↩ 還原原景點：${byId(originals[key]).name}</button>`:''}</article>
    ${i<items.length-1?`<div class="transfer">↓ ${s.name} → ${items[i+1].name}<br>${link(directions(s,items[i+1]),'Google 路線導航 · 大眾運輸')}<small>車次、轉乘與時間由 Google Maps 即時計算</small></div>`:''}`;
  }).join('');
  $('suggestions').innerHTML = '<p>備案現在直接顯示於需要應變的景點下方。替換後可一鍵還原，並同步更新前後站導航。</p>';
  $('freshness').textContent = `手動 ${Object.keys(manual).length} 筆 · 匯入 ${Object.keys(observations).length} 筆`;
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
$('file').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>1000000)throw Error('檔案請小於 1 MB');const rows=JSON.parse(await file.text());const validated=validate(rows);observations=validated;store('kyoto-observations',rows);render();notify('已載入；如有手動標記，請選「使用匯入資料」查看。');}catch(err){notify('匯入失敗：'+err.message);}finally{e.target.value='';}};
$('refresh').onclick=()=>{render();notify('已檢查記錄時效。尚未連接自動觀測來源，請查詢來源或匯入最新資料。');};
$('sample').onclick=()=>{const example=[{id:'tofukuji',status:'未知',observedAt:new Date().toISOString(),sourceUrl:'https://tofukuji.jp/'}];const u=URL.createObjectURL(new Blob([JSON.stringify(example,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=u;a.download='observations-template.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);};
setInterval(()=>{if(!$('booking-dialog').open&&!$('cards').contains(document.activeElement))render();},60000);
render();
