"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const M=require("../lib/lake-effect"), API=require("../api/lake-effect");
const NOW=Date.parse("2026-12-14T12:00:00Z");
const mkHour=(h,dir="NW",forecast="Lake Effect Snow Showers")=>({startTime:new Date(NOW+h*3600000).toISOString(),temperature:18,windDirection:dir,windSpeed:"12 mph",shortForecast:forecast,probabilityOfPrecipitation:{value:80}});
test("catalog covers all five requested states and explicitly labels region scope",()=>{
 assert.deepEqual([...new Set(M.REGIONS.map(r=>r.state))].sort(),["MI","NY","OH","PA","WI"]);
 assert.equal(M.REGIONS.length,15);
 assert.ok(M.REGIONS.every(r=>r.description&&r.windSector));
});
test("compass sectors wrap safely; unknown wind does not become alignment",()=>{
 assert.equal(M.bearing("NW"),315);
 assert.equal(M.sectorContains(350,{from:300,to:40}),true);
 assert.equal(M.sectorContains(90,{from:300,to:40}),false);
 assert.equal(M.sectorContains(null,{from:300,to:40}),null);
 assert.equal(M.bearing("garbage"),null);
});
test("lake temperatures remain lakewide, dated and fail closed when stale",()=>{
 const csv="time,Sup,Mich,Huron,Erie,Ont\nUTC,degree_C,degree_C,degree_C,degree_C,degree_C\n2026-12-12T12:00:00Z,5.3,7.2,4.1,3.5,6.2\n";
 const v=M.parseLakeCsv(csv,"Michigan",NOW);
 assert.equal(v.status,"available");assert.equal(v.celsius,7.2);assert.equal(v.scope,"lakewide surface average");
 assert.equal(M.parseLakeCsv(csv,"Michigan",NOW+7*86400000).status,"stale");
 assert.equal(M.parseLakeCsv("garbage","Michigan",NOW).status,"unavailable");
});
test("no false confident snow from surface wind alone",()=>{
 const region=M.allowed["mi-marquette"],hours=M.hourRows(Array.from({length:12},(_,i)=>mkHour(i,"NW","Mostly Clear")),region.windSector,NOW);
 const verdict=M.assess({region,hours,alerts:[],lakeTemp:{status:"available"},forecastUpdated:new Date(NOW).toISOString(),now:NOW});
 assert.equal(verdict.level,"wind-only");
 assert.equal(verdict.official_snow_forecast,false);
 assert.notEqual(verdict.confidence,"high");
});
test("explicit NWS snow and coherent wind evidence can elevate but not pinpoint bands",()=>{
 const region=M.allowed["mi-marquette"],hours=M.hourRows(Array.from({length:12},(_,i)=>mkHour(i)),region.windSector,NOW);
 const alerts=M.winterAlerts([{properties:{event:"Winter Storm Warning",headline:"Lake effect snow expected",severity:"Severe",description:"Lake effect snow"}}]);
 const v=M.assess({region,hours,alerts,lakeTemp:{status:"available"},forecastUpdated:new Date(NOW).toISOString(),now:NOW});
 assert.equal(v.level,"winter-hazard");assert.equal(v.confidence,"high");
 assert.equal(v.first_12h.overlap_hours,12);assert.match(v.caveat,/not.*band/i);
});
test("snow forecast without aligned wind does not claim lake-effect event",()=>{
 const region=M.allowed["mi-marquette"],hours=M.hourRows(Array.from({length:12},(_,i)=>mkHour(i,"E","Snow Showers")),region.windSector,NOW);
 const v=M.assess({region,hours,alerts:[],lakeTemp:{status:"available"},forecastUpdated:new Date(NOW).toISOString(),now:NOW});
 assert.equal(v.level,"forecast-snow");assert.notEqual(v.confidence,"high");
});
test("stale NWS hourly issue time fails closed",()=>{
 const region=M.allowed["mi-marquette"],hours=M.hourRows(Array.from({length:12},(_,i)=>mkHour(i)),region.windSector,NOW);
 const v=M.assess({region,hours,alerts:[],lakeTemp:{status:"available"},forecastUpdated:new Date(NOW-20*3600000).toISOString(),now:NOW});
 assert.equal(v.level,"insufficient");assert.equal(v.confidence,"low");
});
test("alert classification distinguishes lake-effect language from a generic warning",()=>{
 const alerts=M.winterAlerts([{properties:{event:"Winter Storm Warning",headline:"Snow, ice expected"}},{properties:{event:"Winter Weather Advisory",description:"Lake-effect snow possible"}},{properties:{event:"Flood Warning"}}]);
 assert.equal(alerts.length,2);assert.equal(alerts[0].lakeEffect,false);assert.equal(alerts[1].lakeEffect,true);
});
test("endpoint integrates one NWS point, hourly, alerts and NOAA GLSEA; degraded alert feed is explicit",async()=>{
 const orig=global.fetch;let calls=[];
 global.fetch=async url=>{
  calls.push(url);let body,ok=true;
  if(url.includes("/points/"))body={properties:{forecastHourly:"https://api.weather.gov/gridpoints/MQT/20,20/forecast/hourly"}};
  else if(url.includes("/forecast/hourly"))body={properties:{updated:new Date(NOW).toISOString(),periods:Array.from({length:12},(_,i)=>mkHour(i))}};
  else if(url.includes("/alerts/active")){ok=false;body={}};
  else body="time,Sup,Mich,Huron,Erie,Ont\n2026-12-14T00:00:00Z,5,6,4,3,4\n";
  return {ok,status:ok?200:503,json:async()=>body,text:async()=>body};
 };
 try{
  const d=await API._test.report(M.allowed["mi-marquette"],NOW);
  assert.equal(d.status,"ok");assert.equal(d.alerts_status,"unavailable");
  assert.equal(d.verdict.confidence,"low");assert.match(d.verdict.impact,/unavailable/i);
  assert.equal(d.lake_temperature.scope,"lakewide surface average");
  assert.equal(calls.length,4);
 }finally{global.fetch=orig}
});
test("frontend keeps source identity, crawlable content and no fake geographic band",()=>{
 const root=path.join(__dirname,"../public/lake-effect-snow/index.html");
 const html=fs.readFileSync(root,"utf8");
 const ui=fs.readFileSync(path.join(__dirname,"../public/assets/lake-effect.js"),"utf8");
 assert.match(html,/rel="canonical" href="https:\/\/chrisizworski.com\/lake-effect-snow\/"/);
 assert.match(html,/Built by <a href="https:\/\/chrisizworski.com\/chris-izworski\/"/);
 for(const id of ["hours","state","region","alerts","confidence","lake-reading","status"])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(ui,/geolocation/);assert.match(ui,/history.replaceState/);
 assert.doesNotMatch(html,/100% chance|exact snow band/i);
 new Function(ui);
});
