// 試算表楓況橋接：先執行 setupBridge，再部署為網頁應用程式。
var FOLIAGE_IDS = ['tofukuji','sennyuji','kiyomizu','eikando','nanzenji','bishamondo','nara','kasuga','isuien','yoshikien','shogunzuka','gioji','jojakkoji'];
var FOLIAGE_STATES = ['青葉','轉黃','轉紅','見頃','落葉','未知']; var FOLIAGE_SOURCE_HOSTS = ['weathernews.jp','souda-kyoto.jp'];
var FOLIAGE_HEADERS = ['id','state','status','rawStatus','observedAt','sourceUrl','fetchedAt','message','retrievalError','recordingMethod']; var FOLIAGE_SHEET = 'Foliage';
function setupBridge() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(); if (!ss) throw new Error('請從目標試算表的「擴充功能 → Apps Script」執行');
  var sheet = ss.getSheetByName(FOLIAGE_SHEET); if (!sheet) sheet = ss.insertSheet(FOLIAGE_SHEET);
  if (sheet.getLastRow() === 0) { sheet.getRange(1,1,1,FOLIAGE_HEADERS.length).setValues([FOLIAGE_HEADERS]);
    sheet.getRange(2,1,FOLIAGE_IDS.length,FOLIAGE_HEADERS.length).setNumberFormat('@'); sheet.getRange(2,1,FOLIAGE_IDS.length,FOLIAGE_HEADERS.length).setValues(FOLIAGE_IDS.map(function(id) {
      return [id,'not_configured','','','','','','尚未配置已驗證來源','','manual']; })); sheet.setFrozenRows(1); } else assertHeaders_(sheet);
  PropertiesService.getScriptProperties().setProperty('FOLIAGE_SPREADSHEET_ID',ss.getId()); }
function doGet() {
  var lock = LockService.getScriptLock(); var feed; try { lock.waitLock(10000); var now = Date.now(); var sheet = getSheet_();
    assertHeaders_(sheet); var rows = sheet.getDataRange().getValues().slice(1);
    feed = sheetFeed_(rows,now); var properties = PropertiesService.getScriptProperties();
    if (properties.getProperty('FOLIAGE_LAST_SYNC_STATUS') === 'error') { feed.results.forEach(function(row) {
        if (row.state === 'ok') row.retrievalError = '上次自動同步失敗；保留上次記錄與原始時間'; }); } } catch (_) {
    feed = {version:1,results:FOLIAGE_IDS.map(function(id) { return {id:id,state:'unavailable',message:'試算表暫時無法讀取或設定不正確'};
    })}; } finally { if (lock.hasLock()) lock.releaseLock(); }
  return ContentService.createTextOutput(JSON.stringify(feed)).setMimeType(ContentService.MimeType.JSON); }
function syncFromConfiguredFeed() {
  var properties = PropertiesService.getScriptProperties(); var url = properties.getProperty('FOLIAGE_UPSTREAM_URL');
  var hosts = (properties.getProperty('FOLIAGE_UPSTREAM_HOSTS') || '').split(',').map(function(h) {return h.trim().toLowerCase();}).filter(Boolean); if (!url || !hosts.length) throw new Error('尚未配置已驗證 JSON 上游；未更新試算表');
  var lock = LockService.getScriptLock(); try { lock.waitLock(10000); var incoming = fetchTrustedJson_(url,hosts);
    if (!incoming || incoming.version !== 1 || !Array.isArray(incoming.results)) throw new Error('上游格式錯誤'); var now = Date.now(), seen = {}, valid = [];
    incoming.results.forEach(function(row) { if (!row || FOLIAGE_IDS.indexOf(row.id) < 0 || seen[row.id]) throw new Error('上游景點不正確或重複');
      seen[row.id] = true; valid.push(validateRow_(row,now));
    }); if (!valid.some(function(row) {return row.state === 'ok';})) throw new Error('上游沒有可驗證觀測'); var sheet = getSheet_(); assertHeaders_(sheet);
    var previous = sheetFeed_(sheet.getDataRange().getValues().slice(1),now).results; var results = FOLIAGE_IDS.map(function(id) {
      var next = valid.find(function(row) {return row.id === id;}); var old = previous.find(function(row) {return row.id === id && row.state === 'ok';});
      if ((!next || next.state !== 'ok') && old) { old.retrievalError = '本次上游缺少可用觀測；保留上次記錄與原始時間'; return old; }
      if (next && next.state === 'ok' && old && (Date.parse(next.observedAt) < Date.parse(old.observedAt) ||
           (next.observedAt === old.observedAt && Date.parse(next.fetchedAt) < Date.parse(old.fetchedAt)))) { old.retrievalError = '來源回傳較舊記錄；保留較新觀測與原始時間';
        return old; } return next || {id:id,state:'unavailable',message:'本次上游未提供此景點'}; });
    var data = results.map(function(row) { return FOLIAGE_HEADERS.map(function(key) {return sheetText_(row[key] || '');});
    }); var count = Math.max(FOLIAGE_IDS.length,sheet.getLastRow()-1);
    while (data.length < count) data.push(FOLIAGE_HEADERS.map(function() {return ''; })); var block = sheet.getRange(2,1,count,FOLIAGE_HEADERS.length);
    block.setNumberFormat('@'); block.setValues(data);
    properties.setProperties({FOLIAGE_LAST_SYNC_STATUS:'ok',FOLIAGE_LAST_SYNC_AT:new Date(now).toISOString()}); } catch (error) {
    properties.setProperty('FOLIAGE_LAST_SYNC_STATUS','error'); throw new Error('同步失敗；未以失敗資料取代快照。請檢查上游、欄位及 Apps Script 執行紀錄');
  } finally { if (lock.hasLock()) lock.releaseLock(); } }
function installRefreshTrigger() {
  var properties = PropertiesService.getScriptProperties(); if (!properties.getProperty('FOLIAGE_UPSTREAM_URL') || !properties.getProperty('FOLIAGE_UPSTREAM_HOSTS')) throw new Error('請先配置並手動測試 JSON 上游');
  ScriptApp.getProjectTriggers().filter(function(t) {return t.getHandlerFunction() === 'syncFromConfiguredFeed';}).forEach(function(t) {ScriptApp.deleteTrigger(t);}); ScriptApp.newTrigger('syncFromConfiguredFeed').timeBased().everyMinutes(30).create();
}
function getSheet_() { var id = PropertiesService.getScriptProperties().getProperty('FOLIAGE_SPREADSHEET_ID'); if (!id) throw new Error('請先執行 setupBridge');
  var sheet = SpreadsheetApp.openById(id).getSheetByName(FOLIAGE_SHEET); if (!sheet) throw new Error('找不到資料工作表'); return sheet; }
function assertHeaders_(sheet) { var headers = sheet.getRange(1,1,1,FOLIAGE_HEADERS.length).getValues()[0]; if (!FOLIAGE_HEADERS.every(function(h,i) {return headers[i] === h;})) throw new Error('資料欄位不正確；未覆寫既有工作表');
}
function sheetFeed_(values,now) {
  var grouped = {}; values.forEach(function(cells) {
    if (!cells.some(function(v) {return v !== '';}) || !cells[0]) return; var id = String(cells[0]);
    if (FOLIAGE_IDS.indexOf(id) < 0) return; var row = {};
    FOLIAGE_HEADERS.forEach(function(key,i) {row[key] = cells[i];}); if (!row.recordingMethod) row.recordingMethod = 'manual';
    (grouped[id] || (grouped[id] = [])).push(row); });
  return {version:1,results:FOLIAGE_IDS.map(function(id) { if (!grouped[id]) return {id:id,state:'not_configured',message:'尚未配置已驗證來源'};
    try { if (grouped[id].length !== 1) throw new Error('重複景點');
      return validateRow_(grouped[id][0],now); } catch (_) {return {id:id,state:'unavailable',message:'試算表記錄無效或重複；請檢查欄位、來源與時間'};} })}; }
function validateRow_(row,now) {
  if (!row || FOLIAGE_IDS.indexOf(row.id) < 0 || ['ok','unavailable','not_configured'].indexOf(row.state) < 0) throw new Error('景點或狀態錯誤'); if (row.state !== 'ok') return {id:row.id,state:row.state,message:typeof row.message === 'string' ? row.message.slice(0,200) : '來源暫無可用觀測'};
  if (row.recordingMethod && ['manual','automatic','unspecified'].indexOf(row.recordingMethod) < 0) throw new Error('記錄方式錯誤'); if (FOLIAGE_STATES.indexOf(row.status) < 0 || typeof row.rawStatus !== 'string' || !row.rawStatus.trim()) throw new Error('楓況欄位錯誤');
  var observed = timestamp_(row.observedAt), fetched = timestamp_(row.fetchedAt); if (observed > now+300000 || fetched > now+300000 || observed > fetched+300000) throw new Error('時間在未來或次序錯誤');
  var host = httpsHost_(row.sourceUrl); if (FOLIAGE_SOURCE_HOSTS.indexOf(host) < 0) throw new Error('觀測來源尚未驗證');
  var result = {id:row.id,state:'ok',status:row.status,recordingMethod:row.recordingMethod || 'unspecified',rawStatus:row.rawStatus.slice(0,100),observedAt:new Date(observed).toISOString(),fetchedAt:new Date(fetched).toISOString(),sourceUrl:row.sourceUrl,retrievalError:typeof row.retrievalError === 'string' && row.retrievalError ? row.retrievalError.slice(0,200) : null}; if (now-observed > 24*60*60*1000) result.retrievalError = '觀測超過 24 小時；保留原始時間，請確認現況';
  return result; }
function timestamp_(value) { if (value instanceof Date && Number.isFinite(value.getTime())) return value.getTime(); if (typeof value !== 'string') throw new Error('時間格式錯誤');
  var m = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d{1,3})?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(value); if (!m) throw new Error('時間須為含時區的 ISO 8601');
  var day = new Date(Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3]))); var parsed = Date.parse(value);
  if (day.getUTCFullYear() !== Number(m[1]) || day.getUTCMonth() !== Number(m[2])-1 || day.getUTCDate() !== Number(m[3]) || !Number.isFinite(parsed)) throw new Error('無效日期'); return parsed;
}
function httpsHost_(url) {
  if (typeof url !== 'string' || /[\s\\]/.test(url)) throw new Error('網址格式錯誤'); var match = /^https:\/\/([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?:[/?#]|$)/i.exec(url);
  if (!match || match[1].indexOf('.') < 0 || match[1].indexOf('..') >= 0) throw new Error('僅接受明確 HTTPS 網域，不能有帳密或自訂埠'); return match[1].toLowerCase(); }
function fetchTrustedJson_(initialUrl,hosts) {
  var url = initialUrl; for (var hop=0;hop<4;hop++) {
    if (hosts.indexOf(httpsHost_(url)) < 0) throw new Error('上游或重新導向網域未獲允許'); var response = UrlFetchApp.fetch(url,{method:'get',followRedirects:false,validateHttpsCertificates:true,muteHttpExceptions:true,headers:{Accept:'application/json'}});
    var code = response.getResponseCode(); if ([301,302,303,307,308].indexOf(code) >= 0) {
      var headers = response.getAllHeaders(); var key = Object.keys(headers).find(function(k) {return k.toLowerCase() === 'location';});
      url = key ? String(headers[key]) : ''; continue; } if (code !== 200) throw new Error('上游 HTTP 錯誤');
    var text = response.getContentText(); if (text.length > 1024*1024) throw new Error('上游資料過大');
    return JSON.parse(text); } throw new Error('重新導向次數過多'); }
function sheetText_(value) {
  var text = String(value); return /^[=+\-@]/.test(text) ? "'"+text : text; }
function fillSourceUrls() {
  var urls = {tofukuji:'https://souda-kyoto.jp/guide/spot/tofukuji.html',sennyuji:'https://souda-kyoto.jp/guide/spot/sennyuji.html',kiyomizu:'https://souda-kyoto.jp/guide/spot/kiyomizudera.html',eikando:'https://souda-kyoto.jp/guide/spot/eikando.html',nanzenji:'https://souda-kyoto.jp/guide/spot/nanzenji.html',bishamondo:'https://souda-kyoto.jp/guide/spot/bishamondo.html',shogunzuka:'https://souda-kyoto.jp/guide/spot/shogunzukaseiryuden.html',gioji:'https://souda-kyoto.jp/guide/spot/giouji.html',jojakkoji:'https://souda-kyoto.jp/guide/spot/jojakkoji.html',nara:'https://www3.pref.nara.jp/park/',kasuga:'https://www.kasugataisha.or.jp/',isuien:'https://isuien.or.jp/',yoshikien:'https://www.pref.nara.jp/'};
  var lock = LockService.getScriptLock(), filled = 0; try { lock.waitLock(10000);
    var sheet = getSheet_(); assertHeaders_(sheet);
    sheet.getDataRange().getValues().slice(1).forEach(function(row,index) {
      if (FOLIAGE_IDS.indexOf(row[0]) < 0 || row[1] === 'ok' || row[5] !== '') return;
      var cell = sheet.getRange(index+2,6); if (!cell.getFormula()) { cell.setValue(urls[row[0]]); filled++; }
    }); console.log('已補入 '+filled+' 筆參考連結；沒有更新楓況或觀測時間'); return filled;
  } finally { if (lock.hasLock()) lock.releaseLock(); }
}
// END KYOTO BRIDGE - 請確認已複製到這一行
