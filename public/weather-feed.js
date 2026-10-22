// Coordinates identify the requested temple/park area, not a physical weather station.
// Open-Meteo returns weather model/grid data; never interpret it as observed foliage.
export const weatherLocations = [
  {id:'tofukuji',latitude:34.9762,longitude:135.7730},
  {id:'sennyuji',latitude:34.9784,longitude:135.7789},
  {id:'kiyomizu',latitude:34.9949,longitude:135.7850},
  {id:'eikando',latitude:35.0156,longitude:135.7937},
  {id:'nanzenji',latitude:35.0114,longitude:135.7945},
  {id:'bishamondo',latitude:35.0050,longitude:135.8171},
  {id:'nara',latitude:34.6851,longitude:135.8430},
  {id:'kasuga',latitude:34.6814,longitude:135.8484},
  {id:'isuien',latitude:34.6854,longitude:135.8395},
  {id:'yoshikien',latitude:34.6851,longitude:135.8387},
  {id:'shogunzuka',latitude:35.0000,longitude:135.7884},
  {id:'gioji',latitude:35.0268,longitude:135.6624},
  {id:'jojakkoji',latitude:35.0216,longitude:135.6652}
];
const locationById = new Map(weatherLocations.map(location=>[location.id,location]));
const dayMs = 86400000;
const japanOffset = 9*3600000;
const weatherCodes = new Set([0,1,2,3,45,48,51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,99]);
const temperature = value => typeof value==='number' && Number.isFinite(value) && value>=-90 && value<=60;
const japanDate = time => new Date(time+japanOffset).toISOString().slice(0,10);
function previousDates(now) {
  const today = Date.parse(japanDate(now)+'T00:00:00+09:00');
  return Array.from({length:7},(_,index)=>japanDate(today-(7-index)*dayMs));
}
function timestamp(value,now,futureAllowance=5*60000) {
  const parts=typeof value==='string' && value.match(/^(\d{4}-\d\d-\d\d)T(\d\d):(\d\d)(?::(\d\d)(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/);
  if (!parts) throw Error('氣象時間缺少有效時區');
  const calendar=Date.parse(parts[1]+'T00:00:00Z');
  const parsed=Date.parse(value);
  if (!Number.isFinite(calendar) || new Date(calendar).toISOString().slice(0,10)!==parts[1] || Number(parts[2])>23 || Number(parts[3])>59 || Number(parts[4]||0)>59 || !Number.isFinite(parsed) || parsed>now+futureAllowance) throw Error('氣象時間不正確');
  return new Date(parsed).toISOString();
}
export function validateWeatherFeed(feed,now=Date.now()) {
  if (!feed || feed.version!==1 || !Array.isArray(feed.results)) throw Error('氣象資料格式不正確');
  const seen = new Set();
  const results=feed.results.map(row=>{
    const location=locationById.get(row?.id);
    if (!location || seen.has(row.id)) throw Error('氣象景點 ID 不正確或重複');
    seen.add(row.id);
    if (row.state==='unavailable') return {id:row.id,state:'unavailable',message:typeof row.message==='string'?row.message.slice(0,200):'天氣暫時無法更新'};
    if (row.state!=='ok' || row.sourceUrl!=='https://open-meteo.com/' || row.latitude!==location.latitude || row.longitude!==location.longitude) throw Error('氣象來源或景點座標不正確');
    const fetchedAt=timestamp(row.fetchedAt,now);
    const modelAt=timestamp(row.current?.modelAt,now,30*60000);
    if (Date.parse(modelAt)>Date.parse(fetchedAt)+30*60000 || Date.parse(fetchedAt)-Date.parse(modelAt)>6*3600000 || !temperature(row.current?.temperatureC) || !weatherCodes.has(row.current?.weatherCode)) throw Error('目前氣象數值不正確');
    const dates=previousDates(Date.parse(fetchedAt));
    if (!Array.isArray(row.dailyMin) || row.dailyMin.length!==7 || row.dailyMin.some((day,index)=>day?.date!==dates[index] || !temperature(day.temperatureC))) throw Error('過去七日最低溫不完整');
    return {id:row.id,state:'ok',latitude:location.latitude,longitude:location.longitude,current:{temperatureC:row.current.temperatureC,weatherCode:row.current.weatherCode,modelAt},dailyMin:row.dailyMin.map(day=>({date:day.date,temperatureC:day.temperatureC})),fetchedAt,sourceUrl:'https://open-meteo.com/',retrievalError:typeof row.retrievalError==='string'?row.retrievalError.slice(0,200):null};
  });
  return {version:1,results};
}
export function weatherCodeLabel(code) {
  if(code===0)return '晴';
  if(code>=1&&code<=3)return ['','大致晴朗','局部多雲','陰'][code];
  if([45,48].includes(code))return '霧';
  if([51,53,55,56,57].includes(code))return '毛毛雨';
  if([61,63,65,66,67,80,81,82].includes(code))return '雨';
  if([71,73,75,77,85,86].includes(code))return '雪';
  if([95,96,99].includes(code))return '雷雨';
  return '天氣未明';
}
export async function fetchWeatherFeed({fetchImpl=globalThis.fetch,clock=Date.now,timeoutMs=12000}={}) {
  const url=new URL('https://api.open-meteo.com/v1/forecast');
  url.search=new URLSearchParams({latitude:weatherLocations.map(p=>p.latitude).join(','),longitude:weatherLocations.map(p=>p.longitude).join(','),current:'temperature_2m,weather_code',daily:'temperature_2m_min',past_days:'7',forecast_days:'1',timezone:'Asia/Tokyo',temperature_unit:'celsius',timeformat:'unixtime'}).toString();
  const response=await fetchImpl(url.href,{signal:AbortSignal.timeout(timeoutMs),headers:{Accept:'application/json'}});
  if(!response.ok)throw Error(`氣象來源 HTTP ${response.status}`);
  const body=await response.json();
  if(!Array.isArray(body) || body.length!==weatherLocations.length)throw Error('氣象來源景點數量不正確');
  const now=clock(), fetchedAt=new Date(now).toISOString(), dates=previousDates(now);
  const results=body.map((data,index)=>{
    const location=weatherLocations[index];
    try {
      // Multiple-location responses follow the requested order. Check grid proximity too.
      if(!data || (data.location_id!==undefined && data.location_id!==index) || !Number.isFinite(data.latitude) || !Number.isFinite(data.longitude) || Math.abs(data.latitude-location.latitude)>0.2 || Math.abs(data.longitude-location.longitude)>0.2 || data.timezone!=='Asia/Tokyo' || data.utc_offset_seconds!==32400 || data.current_units?.temperature_2m!=='°C' || data.current_units?.weather_code!=='wmo code' || data.daily_units?.temperature_2m_min!=='°C' || data.current_units?.time!=='unixtime' || data.daily_units?.time!=='unixtime')throw Error('氣象來源單位或位置不正確');
      if(!Number.isFinite(data.current?.time) || !Array.isArray(data.daily?.time) || !Array.isArray(data.daily?.temperature_2m_min) || data.daily.time.length!==data.daily.temperature_2m_min.length)throw Error('氣象來源缺少時間或溫度');
      const history=new Map();
      for(let day=0;day<data.daily.time.length;day++) {
        const seconds=data.daily.time[day];
        if(!Number.isFinite(seconds) || !Number.isInteger(seconds) || (seconds*1000+japanOffset)%dayMs!==0)throw Error('每日時間必須為日本午夜');
        const date=japanDate(seconds*1000);
        if(history.has(date))throw Error('每日時間重複');
        history.set(date,data.daily.temperature_2m_min[day]);
      }
      return validateWeatherFeed({version:1,results:[{id:location.id,state:'ok',latitude:location.latitude,longitude:location.longitude,current:{temperatureC:data.current.temperature_2m,weatherCode:data.current.weather_code,modelAt:new Date(data.current.time*1000).toISOString()},dailyMin:dates.map(date=>({date,temperatureC:history.get(date)})),fetchedAt,sourceUrl:'https://open-meteo.com/'}]},now).results[0];
    } catch {
      return {id:location.id,state:'unavailable',message:'來源氣象資料缺漏或格式不符，未顯示推測數值'};
    }
  });
  return {version:1,results};
}
