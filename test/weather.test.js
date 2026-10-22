import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchWeatherFeed,validateWeatherFeed,weatherLocations,weatherCodeLabel} from '../public/weather-feed.js';
import {createWeatherService} from '../lib/weather-service.js';

// Model-shaped synthetic fixtures test parsing. They are not real weather observations.
const now=Date.parse('2026-10-22T09:00:00Z');
function fixture() {
  return weatherLocations.map(location=>({
    latitude:location.latitude,longitude:location.longitude,timezone:'Asia/Tokyo',utc_offset_seconds:32400,
    current_units:{time:'unixtime',temperature_2m:'°C',weather_code:'wmo code'},
    current:{time:now/1000,temperature_2m:18.2,weather_code:2},
    daily_units:{time:'unixtime',temperature_2m_min:'°C'},
    daily:{time:Array.from({length:8},(_,index)=>Date.parse(`2026-10-${15+index}T00:00:00+09:00`)/1000),temperature_2m_min:[12.5,11.5,10.5,9.5,8.5,7.5,6.5,5.5]}
  }));
}
function responder(body=fixture()) {
  return async()=>({ok:true,status:200,json:async()=>structuredClone(body)});
}

test('weather request batches actual location coordinates, and excludes today from seven complete Japan days',async()=>{
  let request;
  const feed=await fetchWeatherFeed({clock:()=>now,fetchImpl:async(url,options)=>{
    request=new URL(url);assert.equal(options.headers.Accept,'application/json');assert.ok(options.signal instanceof AbortSignal);
    return responder()();
  }});
  assert.equal(request.origin,'https://api.open-meteo.com');
  assert.equal(request.searchParams.get('latitude').split(',').length,13);
  assert.equal(request.searchParams.get('timezone'),'Asia/Tokyo');
  assert.equal(request.searchParams.get('past_days'),'7');
  assert.equal(request.searchParams.get('current'),'temperature_2m,weather_code');
  assert.equal(feed.results.length,13);assert.ok(feed.results.every(row=>row.state==='ok'));
  const row=feed.results[0];assert.equal(row.current.temperatureC,18.2);assert.equal(row.current.modelAt,'2026-10-22T09:00:00.000Z');
  assert.equal(row.fetchedAt,'2026-10-22T09:00:00.000Z');assert.equal(row.dailyMin.length,7);
  assert.equal(row.dailyMin[0].date,'2026-10-15');assert.equal(row.dailyMin.at(-1).date,'2026-10-21');assert.equal(row.dailyMin.at(-1).temperatureC,6.5);
  assert.equal('status' in row,false);assert.equal(weatherCodeLabel(row.current.weatherCode),'局部多雲');
});

test('weather response rejects incorrect units, wrong grids, missing minimums, malformed timestamps and unknown codes',async()=>{
  const changes=[data=>{data.current_units.temperature_2m='°F';},data=>{data.current_units.weather_code='other';},data=>{data.location_id=1;},data=>{data.daily.time[0]+=3600;},data=>{data.longitude=140;},data=>{data.daily.temperature_2m_min[0]=null;},data=>{data.current.time='bad';},data=>{data.current.weather_code=1000;},data=>{data.utc_offset_seconds=0;},data=>{data.daily.time[0]=data.daily.time[1];}];
  for(const change of changes){
    const body=fixture();change(body[0]);const feed=await fetchWeatherFeed({clock:()=>now,fetchImpl:responder(body)});
    assert.equal(feed.results[0].state,'unavailable');assert.equal(feed.results[1].state,'ok');
    assert.equal('current' in feed.results[0],false);
  }
});

test('weather validation rejects tampered source, duplicate spots, future model timestamps and incomplete history',async()=>{
  const feed=await fetchWeatherFeed({clock:()=>now,fetchImpl:responder()});
  const row=feed.results[0];
  for(const patch of [{sourceUrl:'https://example.org/'},{latitude:0},{current:{...row.current,temperatureC:NaN}},{current:{...row.current,modelAt:'2027-01-01T00:00:00Z'}},{current:{...row.current,modelAt:'2026-10-22T09:00:00'}},{current:{...row.current,modelAt:'2026-02-30T09:00:00Z'}},{current:{...row.current,modelAt:'2026-10-20T09:00:00Z'}},{dailyMin:row.dailyMin.slice(1)},{dailyMin:row.dailyMin.map((day,index)=>index===6?{...day,date:'2026-10-22'}:day)}]){
    assert.throws(()=>validateWeatherFeed({version:1,results:[{...row,...patch}]},now));
  }
  assert.throws(()=>validateWeatherFeed({version:1,results:[row,row]},now));
});

test('weather service coalesces requests, caches and retains prior values and times when the network fails',async()=>{
  let calls=0,time=now,broken=false;
  const service=createWeatherService({clock:()=>time,ttl:1000,fetchImpl:async()=>{
    calls++;await new Promise(resolve=>setTimeout(resolve,5));if(broken)throw Error('offline');return responder()();
  }});
  const [first,second]=await Promise.all([service.get(),service.get()]);assert.equal(calls,1);assert.deepEqual(first,second);
  time+=500;await service.get();assert.equal(calls,1);
  broken=true;time+=1000;const failed=await service.get();assert.equal(calls,2);
  assert.equal(failed.results[0].current.modelAt,first.results[0].current.modelAt);
  assert.equal(failed.results[0].fetchedAt,first.results[0].fetchedAt);assert.match(failed.results[0].retrievalError,/更新失敗/);
});

test('weather service keeps successful locations while preserving the failed location with explicit error',async()=>{
  let time=now,body=fixture();
  const service=createWeatherService({clock:()=>time,ttl:1,fetchImpl:async()=>responder(body)()});
  const first=await service.get();time+=1000;body=fixture();body[0].current.temperature_2m=null;body[1].current.temperature_2m=19;
  const partial=await service.get();assert.equal(partial.results[0].current.temperatureC,18.2);assert.equal(partial.results[0].fetchedAt,first.results[0].fetchedAt);assert.match(partial.results[0].retrievalError,/更新失敗/);
  assert.equal(partial.results[1].current.temperatureC,19);assert.equal(partial.results[1].fetchedAt,new Date(time).toISOString());assert.equal(partial.results[1].retrievalError,null);
});

test('HTTP errors or first-time denial produce unavailable weather without fabricated values',async()=>{
  for(const fetchImpl of [async()=>{throw Error('proxy denial');},async()=>({ok:false,status:403}),responder([])]){
    const service=createWeatherService({clock:()=>now,fetchImpl});
    const feed=await service.get();assert.equal(feed.results.length,13);assert.ok(feed.results.every(row=>row.state==='unavailable'&&!row.current&&!row.fetchedAt));
  }
});


test('seven-day history follows the Japan date before the UTC date rolls over',async()=>{
  const time=Date.parse('2026-10-22T15:05:00Z'); // October 23, 00:05 in Japan.
  const body=fixture();
  for(const data of body){
    data.current.time=time/1000;
    data.daily.time=data.daily.time.map(seconds=>seconds+86400);
  }
  const feed=await fetchWeatherFeed({clock:()=>time,fetchImpl:responder(body)});
  assert.ok(feed.results.every(row=>row.state==='ok'));
  assert.equal(feed.results[0].dailyMin[0].date,'2026-10-16');
  assert.equal(feed.results[0].dailyMin.at(-1).date,'2026-10-22');
});

test('cache failure through Japan midnight preserves the original history and timestamps',async()=>{
  let time=Date.parse('2026-10-22T14:59:00Z'),broken=false;
  const body=fixture();for(const data of body)data.current.time=time/1000;
  const service=createWeatherService({clock:()=>time,ttl:1,fetchImpl:async()=>{
    if(broken)throw Error('offline');return responder(body)();
  }});
  const first=await service.get();broken=true;time+=120000;
  const retained=await service.get();
  assert.equal(retained.results[0].fetchedAt,first.results[0].fetchedAt);
  assert.equal(retained.results[0].dailyMin.at(-1).date,'2026-10-21');
  assert.match(retained.results[0].retrievalError,/更新失敗/);
  assert.doesNotThrow(()=>validateWeatherFeed(retained,time));
});


test('weather model rollback retains newer values and times, but newer fetches of the same model can update',async()=>{
  let time=now,body=fixture();
  const service=createWeatherService({clock:()=>time,ttl:1,fetchImpl:async()=>responder(body)()});
  const first=await service.get();
  time+=1000;body=fixture();body[0].current.time-=900;body[0].current.temperature_2m=5;
  const rolledBack=await service.get();
  assert.equal(rolledBack.results[0].current.temperatureC,18.2);
  assert.equal(rolledBack.results[0].current.modelAt,first.results[0].current.modelAt);
  assert.equal(rolledBack.results[0].fetchedAt,first.results[0].fetchedAt);
  assert.match(rolledBack.results[0].retrievalError,/較舊氣象/);
  time+=1000;body=fixture();body[0].current.temperature_2m=19;
  const sameModel=await service.get();
  assert.equal(sameModel.results[0].current.modelAt,first.results[0].current.modelAt);
  assert.equal(sameModel.results[0].current.temperatureC,19);
  assert.equal(sameModel.results[0].fetchedAt,new Date(time).toISOString());
  assert.equal(sameModel.results[0].retrievalError,null);
});

test('a clock adjustment during refresh cannot replace a same-model row with an older fetch timestamp',async()=>{
  let time=now,adjust=false;
  const body=fixture();
  const service=createWeatherService({clock:()=>time,ttl:1,fetchImpl:async()=>{
    if(adjust)time=now-1000;
    return responder(body)();
  }});
  const first=await service.get();
  time+=1000;adjust=true;body[0].current.temperature_2m=5;
  const retained=await service.get();
  assert.equal(retained.results[0].current.temperatureC,18.2);
  assert.equal(retained.results[0].fetchedAt,first.results[0].fetchedAt);
  assert.match(retained.results[0].retrievalError,/較舊氣象/);
});
