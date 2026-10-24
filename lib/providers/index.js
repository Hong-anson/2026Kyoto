import {createWeathernewsProviders} from './weathernews.js';
import {createNaraOfficialProviders} from './nara-official.js';

// Server/CI fetch public factual status and dates; browsers read the snapshot.
export function automaticProviders(options = {}) {
  return [...createWeathernewsProviders(options), ...createNaraOfficialProviders(options)];
}
