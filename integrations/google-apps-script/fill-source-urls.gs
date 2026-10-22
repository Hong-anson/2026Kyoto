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
