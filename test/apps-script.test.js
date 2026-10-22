import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const template = readFileSync(new URL('../integrations/google-apps-script/Code.gs',import.meta.url),'utf8');
const now = Date.parse('2026-10-22T08:00:00Z');
const fixture = (changes={}) => ({id:'tofukuji',state:'ok',status:'見頃',rawStatus:'見頃',observedAt:'2026-10-22T06:00:00Z',fetchedAt:'2026-10-22T07:00:00Z',sourceUrl:'https://weathernews.jp/koyo/',...changes});

// Exercise the exact deployable .gs template using the Apps Script APIs it calls.
// All observations and Google services in this suite are synthetic fixtures.
function harness({records=[],empty=false,formulas={}}={}) {
  class FixedDate extends Date {static now() {return now;}}
  const context = vm.createContext({Date:FixedDate});
  vm.runInContext(template,context,{filename:'Code.gs'});
  const headers = Array.from(context.FOLIAGE_HEADERS);
  let cells = empty ? [] : [headers,...records.map(row=>headers.map(key=>row[key]??''))];
  let writes = 0;
  let formatWrites = 0;
  let lastWritten;
  let held = false;
  const props = {FOLIAGE_SPREADSHEET_ID:'test-spreadsheet'};
  const sheet = {
    getLastRow:()=>cells.length,
    getDataRange:()=>({getValues:()=>cells.map(row=>[...row])}),
    getRange:(row,col,count=1,width=1)=>({
      getValues:()=>Array.from({length:count},(_,r)=>Array.from({length:width},(_,c)=>cells[row-1+r]?.[col-1+c]??'')),
      getFormula:()=>formulas[`${row}:${col}`]??'',
      setValue(value) { writes++; cells[row-1]??=[]; cells[row-1][col-1]=value; delete formulas[`${row}:${col}`]; },
      setNumberFormat(){formatWrites++;},
      setValues(values) {
        assert.equal(values.length,count);
        assert.ok(values.every(value=>value.length===width));
        writes++;
        lastWritten=Array.from(values,row=>Array.from(row));
        values.forEach((values,r)=>{
          cells[row-1+r] ??= [];
          values.forEach((value,c)=>{
            // Sheets stores a leading apostrophe as a literal text marker.
            cells[row-1+r][col-1+c]=typeof value==='string' && value.startsWith("'") ? value.slice(1) : value;
          });
        });
      }
    }),
    setFrozenRows(){}
  };
  const spreadsheet = {getId:()=>props.FOLIAGE_SPREADSHEET_ID,getSheetByName:()=>sheet};
  context.SpreadsheetApp = {getActiveSpreadsheet:()=>spreadsheet,openById:id=>{
    assert.equal(id,props.FOLIAGE_SPREADSHEET_ID);return spreadsheet;
  }};
  context.PropertiesService = {getScriptProperties:()=>({
    getProperty:key=>props[key],setProperty:(key,value)=>{props[key]=value;},setProperties:values=>Object.assign(props,values)
  })};
  context.LockService = {getScriptLock:()=>({waitLock(){held=true;},hasLock:()=>held,releaseLock(){held=false;}})};
  context.ContentService = {MimeType:{JSON:'application/json'},createTextOutput:text=>({text,setMimeType(mime){this.mime=mime;return this;}})};
  const requests = [];
  context.UrlFetchApp = {fetch(url,options) {
    requests.push({url,options});
    if (!api.response) throw Error('Unexpected network request in fixture');
    return api.response(url,options);
  }};
  const api = {
    context,props,requests,headers,formulas,
    snapshot:()=>structuredClone(cells),
    get writes(){return writes;},
    get formatWrites(){return formatWrites;},
    get lastWritten(){return lastWritten;},
    read:()=>JSON.parse(context.doGet().text),
    configure(feed) {
      props.FOLIAGE_UPSTREAM_URL='https://trusted.example/feed';
      props.FOLIAGE_UPSTREAM_HOSTS='trusted.example';
      api.response=()=>({getResponseCode:()=>200,getContentText:()=>JSON.stringify(feed)});
    }
  };
  return api;
}

test('Apps Script setup is repeatable and preserves existing data or incompatible headers',()=>{
  const blank = harness({empty:true});
  blank.context.setupBridge();
  assert.equal(blank.snapshot().length,14);
  assert.equal(blank.read().results.filter(row=>row.state==='not_configured').length,13);
  const writes=blank.writes;
  blank.context.setupBridge();
  assert.equal(blank.writes,writes);

  const existing=harness({records:[fixture()]});
  const before=existing.snapshot();existing.context.setupBridge();
  assert.deepEqual(existing.snapshot(),before);assert.equal(existing.writes,0);
  existing.context.FOLIAGE_HEADERS[0]='incompatible';
  assert.throws(()=>existing.context.setupBridge(),/欄位/);
  assert.deepEqual(existing.snapshot(),before);
});

test('Apps Script source helper fills 13 reference URLs without claiming observations',()=>{
  const bridge=harness({empty:true});
  bridge.context.setupBridge();
  assert.equal(bridge.context.fillSourceUrls(),13);
  const rows=bridge.snapshot().slice(1);
  assert.equal(rows.length,13);
  assert.equal(rows.filter(row=>row[5].startsWith('https://souda-kyoto.jp/guide/spot/')).length,9);
  assert.equal(rows.find(row=>row[0]==='nara')[5],'https://www3.pref.nara.jp/park/');
  assert.equal(rows.find(row=>row[0]==='kasuga')[5],'https://www.kasugataisha.or.jp/');
  assert.equal(rows.find(row=>row[0]==='isuien')[5],'https://isuien.or.jp/');
  assert.equal(rows.find(row=>row[0]==='yoshikien')[5],'https://www.pref.nara.jp/');
  for (const row of rows) {
    assert.equal(row[1],'not_configured');
    for (const index of [2,3,4,6]) assert.equal(row[index],'');
  }
  assert.ok(bridge.read().results.every(row=>row.state==='not_configured' && !row.sourceUrl && !row.observedAt));
});

test('Apps Script source helper follows row IDs and preserves existing cells, formulas and incomplete ok rows',()=>{
  const records=[
    {id:'nara',state:'not_configured',message:'Existing custom note'},
    {id:'tofukuji',state:'ok',status:'見頃',observedAt:'2026-10-22T06:00:00Z'},
    {id:'unknown',state:'not_configured'},
    {id:'eikando',state:'unavailable',sourceUrl:'https://example.org/user-choice',message:'Keep me'},
    {id:'kiyomizu',state:'not_configured'},
    {id:'kasuga',state:'not_configured'}
  ];
  const formulas={'2:4':'=1+1','6:6':'=IF(FALSE,"https://example.org/","")'};
  const bridge=harness({records,formulas:{...formulas}});
  // Exercise the standalone append-only snippet provided to existing Google scripts.
  vm.runInContext(readFileSync(new URL('../integrations/google-apps-script/fill-source-urls.gs',import.meta.url),'utf8'),bridge.context);
  const before=bridge.snapshot();
  assert.equal(bridge.context.fillSourceUrls(),2);
  const expected=structuredClone(before);
  expected[1][5]='https://www3.pref.nara.jp/park/';
  expected[6][5]='https://www.kasugataisha.or.jp/';
  assert.deepEqual(bridge.snapshot(),expected);
  assert.deepEqual(bridge.formulas,formulas);
  assert.equal(bridge.formatWrites,0);
  assert.equal(bridge.context.fillSourceUrls(),0);
  assert.equal(bridge.writes,2);
  bridge.context.FOLIAGE_HEADERS[0]='incompatible';
  assert.throws(()=>bridge.context.fillSourceUrls(),/欄位/);
  assert.equal(bridge.writes,2);
});

test('Apps Script public feed preserves actual times and marks manually maintained observations',()=>{
  const bridge=harness({records:[fixture()]});
  const output=bridge.context.doGet({parameter:{url:'https://untrusted.example',spreadsheetId:'other'}});
  assert.equal(output.mime,'application/json');
  const feed=JSON.parse(output.text);
  assert.equal(feed.version,1);assert.equal(feed.results.length,13);
  const row=feed.results.find(row=>row.id==='tofukuji');
  assert.equal(row.recordingMethod,'manual');
  assert.equal(row.observedAt,fixture().observedAt.replace('Z','.000Z'));
  assert.equal(row.fetchedAt,fixture().fetchedAt.replace('Z','.000Z'));
  assert.equal(bridge.requests.length,0);assert.equal(bridge.writes,0);
});

test('Apps Script rejects malformed/future dates, sources and duplicate IDs in public output',()=>{
  for (const change of [
    {observedAt:'2026-02-30T06:00:00Z'},
    {observedAt:'2026-10-22T06:00:00'},
    {observedAt:'2026-10-23T06:00:00Z'},
    {fetchedAt:'2026-10-23T06:00:00Z'},
    {observedAt:'2026-10-22T07:30:00Z'},
    {sourceUrl:'https://weathernews.jp@untrusted.example/'},
    {sourceUrl:'https://weathernews.jp:444/'},
    {status:'invented'},
    {recordingMethod:'predicted'}
  ]) {
    const bridge=harness({records:[fixture(change)]});
    assert.equal(bridge.read().results[0].state,'unavailable',JSON.stringify(change));
  }
  assert.equal(harness({records:[fixture(),fixture()]}).read().results[0].state,'unavailable');
});

test('Apps Script retains original timestamps while explicitly marking stale observations',()=>{
  const old=fixture({observedAt:'2026-10-20T06:00:00Z',fetchedAt:'2026-10-20T07:00:00Z'});
  const result=harness({records:[old]}).read().results[0];
  assert.equal(result.state,'ok');assert.match(result.retrievalError,/24/);
  assert.equal(result.observedAt,'2026-10-20T06:00:00.000Z');
  assert.equal(result.fetchedAt,'2026-10-20T07:00:00.000Z');
});

test('Apps Script synchronization keeps missing old observations and upstream provenance',()=>{
  const bridge=harness({records:[fixture()]});
  bridge.configure({version:1,results:[fixture({id:'nara',recordingMethod:'automatic'})]});
  bridge.context.syncFromConfiguredFeed();
  assert.equal(bridge.writes,1);
  assert.equal(bridge.props.FOLIAGE_LAST_SYNC_STATUS,'ok');
  const feed=bridge.read();
  const previous=feed.results.find(row=>row.id==='tofukuji');
  assert.equal(previous.recordingMethod,'manual');assert.match(previous.retrievalError,/保留/);
  assert.equal(previous.observedAt,'2026-10-22T06:00:00.000Z');
  assert.equal(previous.fetchedAt,'2026-10-22T07:00:00.000Z');
  assert.equal(feed.results.find(row=>row.id==='nara').recordingMethod,'automatic');
  assert.equal(bridge.requests[0].options.validateHttpsCertificates,true);
  assert.equal(bridge.requests[0].options.followRedirects,false);
});

test('Apps Script source rollback cannot replace a newer observation or retrieval timestamp',()=>{
  for (const changes of [
    {observedAt:'2026-10-21T06:00:00Z'},
    {fetchedAt:'2026-10-22T06:30:00Z'}
  ]) {
    const previous=fixture({recordingMethod:'automatic'});
    const bridge=harness({records:[previous]});
    bridge.configure({version:1,results:[fixture({...changes,status:'青葉',rawStatus:'青葉',recordingMethod:'manual'})]});
    bridge.context.syncFromConfiguredFeed();
    const retained=bridge.read().results[0];
    assert.equal(retained.status,'見頃');assert.equal(retained.rawStatus,'見頃');
    assert.equal(retained.recordingMethod,'automatic');
    assert.equal(retained.observedAt,'2026-10-22T06:00:00.000Z');
    assert.equal(retained.fetchedAt,'2026-10-22T07:00:00.000Z');
    assert.match(retained.retrievalError,/較舊/);
  }
});

test('Apps Script refuses invalid or wholly unavailable upstream without overwriting sheet',()=>{
  for (const results of [
    [fixture({id:'nara'}),fixture({sourceUrl:'https://untrusted.example/observations'})],
    [{id:'tofukuji',state:'unavailable',message:'Upstream unavailable'}],
    [fixture(),fixture()],
    []
  ]) {
    const bridge=harness({records:[fixture()]});const before=bridge.snapshot();
    bridge.configure({version:1,results});
    assert.throws(()=>bridge.context.syncFromConfiguredFeed(),/同步失敗/);
    assert.equal(bridge.writes,0);assert.deepEqual(bridge.snapshot(),before);
    assert.equal(bridge.props.FOLIAGE_LAST_SYNC_STATUS,'error');
    const retained=bridge.read().results[0];
    assert.equal(retained.state,'ok');assert.match(retained.retrievalError,/失敗/);
    assert.equal(retained.observedAt,'2026-10-22T06:00:00.000Z');
  }
});

test('Apps Script blocks redirect outside configured hosts and writes source text literally',()=>{
  const bridge=harness({records:[fixture()]});
  bridge.configure({version:1,results:[fixture({rawStatus:'=IMPORTXML("untrusted")'})]});
  bridge.context.syncFromConfiguredFeed();
  assert.equal(bridge.read().results[0].rawStatus,'=IMPORTXML("untrusted")');
  assert.equal(bridge.lastWritten[0][bridge.headers.indexOf('rawStatus')],"'=IMPORTXML(\"untrusted\")");
  const before=bridge.snapshot(), writes=bridge.writes;
  bridge.response=()=>({getResponseCode:()=>302,getAllHeaders:()=>({Location:'https://untrusted.example/feed'})});
  assert.throws(()=>bridge.context.syncFromConfiguredFeed(),/同步失敗/);
  assert.equal(bridge.writes,writes);assert.deepEqual(bridge.snapshot(),before);
  assert.equal(bridge.requests.length,2); // valid fetch + blocked redirect's initial request
});
