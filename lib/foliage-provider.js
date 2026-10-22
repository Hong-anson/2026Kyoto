import {spots} from '../public/spots.js';
import {validateLiveFeed} from '../public/foliage-feed.js';
import {defaultSheetFeedUrl} from '../public/source-config.js';

const ids = spots.map(spot => spot.id);
const deployment = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/;
const maxBytes = 1024 * 1024;

// A deployment URL is public configuration, never a place for an API key or token.
export function validateAppsScriptUrl(value, {redirect = false} = {}) {
  if (typeof value !== 'string') throw Error('請設定有效的 Apps Script 部署網址');
  if (deployment.test(value)) return new URL(value);
  let url;
  try { url = new URL(value); } catch { throw Error('Apps Script 網址格式不正確'); }
  if (redirect && url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.hash && url.hostname === 'script.googleusercontent.com' && url.pathname === '/macros/echo' && url.search) return url;
  throw Error('僅接受不含憑證及查詢參數的 Apps Script /exec 部署網址');
}

async function readLimitedJson(response) {
  const type = response.headers.get('content-type') || '';
  if (!/^application\/json(?:\s*;|$)/i.test(type)) {
    await response.body?.cancel();
    throw Error('楓況來源未回傳 JSON');
  }
  const length = Number(response.headers.get('content-length'));
  if (length > maxBytes) {
    await response.body?.cancel();
    throw Error('楓況來源資料過大');
  }
  if (!response.body) throw Error('楓況來源沒有內容');
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw Error('楓況來源資料過大');
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
  const data = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(data));
}

export function createSheetsProvider({feedUrl, fetchImpl = fetch, clock = Date.now, timeoutMs = 15000} = {}) {
  const initial = validateAppsScriptUrl(feedUrl);
  return {
    ids,
    async read() {
      let target = initial;
      const signal = AbortSignal.timeout(timeoutMs);
      for (let redirects = 0; redirects <= 3; redirects++) {
        const response = await fetchImpl(target.href, {redirect:'manual', signal, headers:{Accept:'application/json'}});
        if ([301,302,303,307,308].includes(response.status)) {
          const location = response.headers.get('location');
          await response.body?.cancel();
          if (!location || redirects === 3) throw Error('Apps Script 重新導向次數或目的地不正確');
          target = validateAppsScriptUrl(new URL(location, target).href, {redirect:true});
          continue;
        }
        if (!response.ok) {
          await response.body?.cancel();
          throw Error(`楓況來源回應 HTTP ${response.status}`);
        }
        const feed = await readLimitedJson(response);
        // Preserve source observation/retrieval timestamps; do not restamp old data.
        return validateLiveFeed(feed, ids, clock()).results;
      }
      throw Error('Apps Script 重新導向失敗');
    }
  };
}

export function configuredProviders({feedUrl = process.env.FOLIAGE_FEED_URL ?? defaultSheetFeedUrl, fetchImpl = fetch, clock = Date.now} = {}) {
  if (!feedUrl) return [];
  try { return [createSheetsProvider({feedUrl, fetchImpl, clock})]; }
  catch {
    // Invalid optional configuration must be visible as unavailable, not crash the app
    // or silently pretend that an upstream was never configured.
    return [{ids, async read() { throw Error('FOLIAGE_FEED_URL 不是受支援的 Apps Script 部署網址'); }}];
  }
}
