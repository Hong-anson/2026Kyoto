import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createFoliageService} from '../lib/foliage-service.js';
import {validateLiveFeed} from '../public/foliage-feed.js';
import {spots} from '../public/spots.js';

export async function syncFoliage({target=new URL('../public/data/foliage.json',import.meta.url),providers,clock=Date.now}={}) {
  let initialFeed;
  try {
    initialFeed = validateLiveFeed(JSON.parse(await readFile(target,'utf8')),spots.map(s=>s.id),clock());
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn('既有快照無法驗證；本次只使用可驗證的新來源。');
  }
  const feed = await createFoliageService({providers,clock,initialFeed}).get();
  const observations = feed.results.filter(row=>row.state==='ok');
  if (!observations.length) throw Error('來源沒有可驗證觀測，保留既有快照。');
  const temporary = new URL(target.href+'.tmp');
  await mkdir(new URL('.',target),{recursive:true});
  await writeFile(temporary,JSON.stringify(feed,null,2)+'\n');
  await rename(temporary,target);
  return feed;
}

if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    const feed = await syncFoliage();
    const records = feed.results.filter(row=>row.state==='ok');
    const retained = records.filter(row=>row.retrievalError).length;
    console.log(`已保存 ${records.length} 筆有來源及觀測日期的記錄（${retained} 筆保留舊記錄）；讀取成功不代表今日觀測。`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
