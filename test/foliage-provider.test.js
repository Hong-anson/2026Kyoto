import test from 'node:test';
import assert from 'node:assert/strict';
import {configuredProviders, createSheetsProvider, validateAppsScriptUrl} from '../lib/foliage-provider.js';
import {createFoliageService} from '../lib/foliage-service.js';
import {defaultSheetFeedUrl} from '../public/source-config.js';

const feedUrl = 'https://script.google.com/macros/s/TEST_DEPLOYMENT/exec';
const delivered = 'https://script.googleusercontent.com/macros/echo?user_content_key=SYNTHETIC&lib=TEST';
const at = Date.parse('2026-10-22T09:00:00Z');
// Synthetic contract fixtures, not actual foliage observations or Google responses.
const row = {id:'tofukuji', state:'ok', status:'見頃', rawStatus:'見頃', observedAt:'2026-10-22T07:00:00.000Z', fetchedAt:'2026-10-22T08:00:00.000Z', sourceUrl:'https://weathernews.jp/koyo/'};
const json = value => new Response(JSON.stringify(value), {headers:{'Content-Type':'application/json; charset=utf-8'}});

test('only a public Apps Script exec deployment is accepted as initial URL', () => {
  assert.equal(validateAppsScriptUrl(feedUrl).href, feedUrl);
  for (const value of [undefined, '', 'http://script.google.com/macros/s/TEST/exec', 'https://127.0.0.1/', 'https://localhost/', 'https://example.org/data.json', 'https://script.google.com.evil.test/macros/s/TEST/exec', 'https://user:secret@script.google.com/macros/s/TEST/exec', `${feedUrl}?key=secret`, `${feedUrl}#secret`, 'https://script.google.com:443/macros/s/TEST/exec', 'https://script.google.com/macros/s/TEST/dev', delivered]) {
    assert.throws(() => validateAppsScriptUrl(value));
  }
  assert.equal(validateAppsScriptUrl(delivered, {redirect:true}).href, delivered);
  for (const value of ['http://script.googleusercontent.com/macros/echo?x=1', 'https://script.googleusercontent.com/anything?x=1', 'https://secret@script.googleusercontent.com/macros/echo?x=1', 'https://docs.google.com/macros/echo?x=1']) {
    assert.throws(() => validateAppsScriptUrl(value, {redirect:true}));
  }
});

test('Apps Script content redirect is controlled and original timestamps survive validation', async () => {
  const calls = [];
  const provider = createSheetsProvider({feedUrl, clock:()=>at, fetchImpl:async (url, options) => {
    calls.push(url);
    assert.equal(options.redirect, 'manual');
    assert.ok(options.signal instanceof AbortSignal);
    return calls.length === 1 ? new Response(null, {status:302, headers:{location:delivered}}) : json({version:1, results:[row]});
  }});
  const results = await provider.read();
  assert.deepEqual(calls, [feedUrl, delivered]);
  assert.equal(results[0].observedAt, row.observedAt);
  assert.equal(results[0].fetchedAt, row.fetchedAt);
});

test('unexpected redirects and redirect loops are rejected without following arbitrary hosts', async () => {
  let calls = 0;
  const blocked = createSheetsProvider({feedUrl, fetchImpl:async () => {
    calls++;
    return new Response(null, {status:302, headers:{location:'https://127.0.0.1/private'}});
  }});
  await assert.rejects(blocked.read());
  assert.equal(calls, 1);
  calls = 0;
  const loop = createSheetsProvider({feedUrl, fetchImpl:async () => {
    calls++;
    return new Response(null, {status:302, headers:{location:feedUrl}});
  }});
  await assert.rejects(loop.read(), /重新導向/);
  assert.equal(calls, 4);
});

test('missing schema, invalid timestamps, duplicate IDs and untrusted observations fail closed', async () => {
  for (const data of [null, {}, {version:1,results:[{...row, observedAt:'2027-01-01T00:00:00Z'}]}, {version:1,results:[row,row]}, {version:1,results:[{...row,sourceUrl:'https://example.org/'}]}]) {
    const provider = createSheetsProvider({feedUrl,clock:()=>at, fetchImpl:async () => json(data)});
    await assert.rejects(provider.read());
  }
  const empty = createSheetsProvider({feedUrl,clock:()=>at,fetchImpl:async()=>json({version:1,results:[]})});
  assert.deepEqual(await empty.read(), []);
});

test('HTTP failures, login HTML, invalid JSON and oversized feeds are rejected', async () => {
  for (const response of [
    new Response('denied', {status:403}),
    new Response('<html>sign in</html>', {headers:{'Content-Type':'text/html'}}),
    new Response('broken', {headers:{'Content-Type':'application/json'}}),
    new Response('x'.repeat(1024*1024+1), {headers:{'Content-Type':'application/json'}}),
    new Response('{}', {headers:{'Content-Type':'application/json','Content-Length':String(1024*1024+1)}})
  ]) {
    await assert.rejects(createSheetsProvider({feedUrl,fetchImpl:async()=>response}).read());
  }
});

test('upstream timeout aborts the request', async () => {
  const provider = createSheetsProvider({feedUrl,timeoutMs:5,fetchImpl:async (_url,{signal}) => new Promise((resolve,reject) => {
    const timer = setTimeout(() => resolve(json({version:1,results:[]})), 100);
    signal.addEventListener('abort', () => {clearTimeout(timer);reject(signal.reason);}, {once:true});
  })});
  await assert.rejects(provider.read(), error => error.name === 'TimeoutError');
});

test('explicit empty configuration disables the default and invalid settings report unavailable', async () => {
  assert.deepEqual(configuredProviders({feedUrl:''}), []);
  const providers = configuredProviders({feedUrl:'https://127.0.0.1/private'});
  const result = await createFoliageService({providers,clock:()=>at}).get();
  assert.equal(result.results.length, 13);
  assert.ok(result.results.every(item => item.state === 'unavailable' && !item.status));
});

test('project default is used when environment is unset, while empty or custom environment overrides it', async () => {
  const previous = process.env.FOLIAGE_FEED_URL;
  const calls = [];
  const fetchImpl = async url => {
    calls.push(url);
    return json({version:1,results:[]}); // Synthetic transport fixture; no Google request.
  };
  try {
    delete process.env.FOLIAGE_FEED_URL;
    const defaults = configuredProviders({fetchImpl,clock:()=>at});
    assert.equal(defaults.length,1);
    await defaults[0].read();
    assert.deepEqual(calls,[defaultSheetFeedUrl]);
    process.env.FOLIAGE_FEED_URL = '';
    assert.deepEqual(configuredProviders({fetchImpl}),[]);
    process.env.FOLIAGE_FEED_URL = feedUrl;
    await configuredProviders({fetchImpl,clock:()=>at})[0].read();
    assert.deepEqual(calls,[defaultSheetFeedUrl,feedUrl]);
  } finally {
    if (previous === undefined) delete process.env.FOLIAGE_FEED_URL;
    else process.env.FOLIAGE_FEED_URL = previous;
  }
});

test('Apps Script failure preserves last known observation and reports retrieval error', async () => {
  let broken = false, now = at;
  const providers = configuredProviders({feedUrl,clock:()=>now,fetchImpl:async()=>broken ? new Response('denied',{status:403}) : json({version:1,results:[row]})});
  const service = createFoliageService({providers,clock:()=>now,ttl:1});
  await service.get();
  broken = true; now += 2;
  const retained = (await service.get()).results.find(item=>item.id === row.id);
  assert.equal(retained.observedAt, row.observedAt);
  assert.equal(retained.fetchedAt, row.fetchedAt);
  assert.match(retained.retrievalError, /失敗/);
});
