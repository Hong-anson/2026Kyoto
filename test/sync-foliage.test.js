import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {syncFoliage} from '../scripts/sync-foliage.js';

// Synthetic observations test cross-process snapshot persistence, not real foliage.
const clock=()=>Date.parse('2026-10-24T02:00:00Z');
const sample={id:'tofukuji',state:'ok',status:'尚未見頃',rawStatus:'まだ',observedDate:'2026-10-23',observationPrecision:'day',fetchedAt:'2026-10-24T01:00:00Z',sourceUrl:'https://weathernews.jp/koyo/spot/26111/',recordingMethod:'automatic'};
const failed={ids:['tofukuji'],read:async()=>{throw Error('synthetic offline');}};
async function temporary(t) {
  const directory=await mkdtemp(join(tmpdir(),'kyoto-sync-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  return pathToFileURL(join(directory,'foliage.json'));
}
test('sync preserves old snapshot bytes when no new or previous valid observation exists',async t=>{
  const target=await temporary(t), original=JSON.stringify({version:1,results:[]});
  await writeFile(target,original);
  await assert.rejects(syncFoliage({target,providers:[failed],clock}),/保留既有快照/);
  assert.equal(await readFile(target,'utf8'),original);
});
test('separate sync executions retain prior evidence and times across upstream outage',async t=>{
  const target=await temporary(t);
  const first=await syncFoliage({target,providers:[{ids:['tofukuji'],read:async()=>[sample]}],clock});
  const next=await syncFoliage({target,providers:[failed],clock});
  const before=first.results.find(r=>r.id==='tofukuji'), retained=next.results.find(r=>r.id==='tofukuji');
  for (const key of ['status','rawStatus','observedDate','observationPrecision','fetchedAt','sourceUrl']) assert.equal(retained[key],before[key]);
  assert.match(retained.retrievalError,/失敗/);
  assert.equal(Object.hasOwn(retained,'observedAt'),false);
  assert.deepEqual(JSON.parse(await readFile(target,'utf8')),next);
});
