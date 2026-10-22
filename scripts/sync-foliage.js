import {writeFile,rename,mkdir} from 'node:fs/promises';
import {createFoliageService,adapters} from '../lib/foliage-service.js';
import {configuredProviders} from '../lib/foliage-provider.js';
const providers = [...adapters,...configuredProviders()];
// An unsuccessful sync must not overwrite a previously deployed snapshot.
if (!providers.length) {
  console.error('尚未配置楓況來源。未更新快照；請設定 FOLIAGE_FEED_URL，或完成真實來源解析器驗證。');
  process.exitCode = 2;
} else {
  const feed = await createFoliageService({providers}).get();
  if(!feed.results.some(row=>row.state==='ok')) {
    console.error('來源沒有可驗證觀測，保留既有快照。');
    process.exitCode = 1;
  } else {
    const target = new URL('../public/data/foliage.json',import.meta.url);
    await mkdir(new URL('../public/data/',import.meta.url),{recursive:true});
    await writeFile(new URL('../public/data/foliage.json.tmp',import.meta.url),JSON.stringify(feed,null,2)+'\n');
    await rename(new URL('../public/data/foliage.json.tmp',import.meta.url),target);
    console.log(`已寫入 ${feed.results.filter(r=>r.state==='ok').length} 筆已驗證來源記錄。`);
  }
}
