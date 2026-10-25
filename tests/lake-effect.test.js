"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const M=require("../lib/lake-effect"), API=require("../api/lake-effect"), C=require("../lib/lake-effect-context");
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
 const csv="Year,Day,Sup,Mich,Huron,Erie,Ont\n, ,degree_C,degree_C,degree_C,degree_C,degree_C\n2026,346,5.3,7.2,4.1,3.5,6.2\n";
 const v=M.parseLakeCsv(csv,"Michigan",NOW);
 assert.equal(v.status,"available");assert.equal(v.celsius,7.2);assert.equal(v.scope,"lakewide surface average");assert.match(API._test.lakeUrl(NOW),/glsea-temps_1024_3\.dat$/);
 assert.equal(M.parseLakeCsv(csv,"Michigan",NOW+7*86400000).status,"stale");
 assert.equal(M.parseLakeCsv("garbage","Michigan",NOW).status,"unavailable");
});
test("official GLSEA rolling whitespace text feed parses dated temperatures without inventing daily updates",()=>{
 const text="Daily Lake Average Surface Water Temperature\nFrom Great Lakes Surface Environmental Analysis maps\nSurf. Water Temp. (degrees C)\nYear Day Sup. Mich. Huron Erie Ont. St.Clr\n2026 346 4.18 5.21 4.71 4.43 5.14 1.74\n2026 347 4.16 5.02 4.70 4.20 5.06 1.61\n2026 348 4.09 4.92 4.42 3.79 4.94 0.20\n";
 const r=M.parseLakeCsv(text,"Superior",NOW);
 assert.equal(r.status,"available");assert.equal(r.celsius,4.1);assert.equal(r.date,"2026-12-14T00:00:00.000Z");
 assert.equal(M.parseLakeCsv(text,"Ontario",NOW).celsius,4.9);
 assert.equal(M.parseLakeCsv(text,"Superior",NOW+7*86400000).status,"stale");
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
test("later snow-band possibility is not hidden by a quiet first 12 hours",()=>{
 const region=M.allowed["mi-marquette"],periods=Array.from({length:60},(_,i)=>mkHour(i,"NW",i>=25&&i<39?"Snow Showers":"Mostly Clear"));
 const hours=M.hourRows(periods,region.windSector,NOW);
 const v=M.assess({region,hours,alerts:[],lakeTemp:{status:"available"},forecastUpdated:new Date(NOW).toISOString(),now:NOW});
 assert.equal(v.level,"favored");assert.equal(v.timing_window,"24–48 hours");assert.notEqual(v.confidence,"high");
 assert.equal(v.first_12h.overlap_hours,0);assert.ok(v.next_72h.snow_forecast_hours>=14);
});
test("partial wind forecasts retain usable evidence but lower confidence",()=>{
 const region=M.allowed["mi-marquette"],periods=Array.from({length:12},(_,i)=>mkHour(i,i<8?"NW":"",i<8?"Snow Showers":"Cloudy"));
 const rows=M.hourRows(periods,region.windSector,NOW);
 const v=M.assess({region,hours:rows,alerts:[],lakeTemp:{status:"available"},forecastUpdated:new Date(NOW).toISOString(),now:NOW});
 assert.equal(v.data_ok,true);assert.equal(v.first_12h.wind_known_hours,8);
 assert.equal(v.first_12h.wind_unknown_hours,4);assert.equal(v.confidence,"low");
});
test("less than six hours of known wind does not allow a full assessment",()=>{
 const region=M.allowed["mi-marquette"],periods=Array.from({length:12},(_,i)=>mkHour(i,i<4?"NW":"", "Snow Showers"));
 const v=M.assess({region,hours:M.hourRows(periods,region.windSector,NOW),alerts:[],lakeTemp:{status:"available"},forecastUpdated:new Date(NOW).toISOString(),now:NOW});
 assert.equal(v.data_ok,false);assert.equal(v.level,"insufficient");
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
 global.fetch=async input=>{
  const url=String(input);
  calls.push(url);let body,ok=true;
  if(url.includes("/points/"))body={properties:{forecastHourly:"https://api.weather.gov/gridpoints/MQT/20,20/forecast/hourly"}};
  else if(url.includes("/forecast/hourly"))body={properties:{updated:new Date(NOW).toISOString(),periods:Array.from({length:12},(_,i)=>mkHour(i))}};
  else if(url.includes("/alerts/active")){ok=false;body={}}
  else if(url.includes("mapservices.weather.noaa.gov"))body={features:[]};
  else if(url.includes("mesonet.agron.iastate.edu"))body={features:[{properties:{typetext:"SNOW",magf:3,unit:"Inch",valid:new Date(NOW-3600000).toISOString(),lat:46.54,lon:-87.4,city:"Marquette",source:"CO-OP Observer"}}]};
  else body="Year,Day,Sup,Mich,Huron,Erie,Ont\n2026,348,5,6,4,3,4\n";
  return {ok,status:ok?200:503,json:async()=>body,text:async()=>body};
 };
 try{
  const d=await API._test.report(M.allowed["mi-marquette"],NOW);
  assert.equal(d.status,"ok");assert.equal(d.alerts_status,"unavailable");
  assert.equal(d.verdict.confidence,"low");assert.match(d.verdict.impact,/unavailable/i);
  assert.equal(d.lake_temperature.scope,"lakewide surface average");
  assert.equal(calls.length,8);assert.equal(d.observed_snowfall.status,"reported_nearby");assert.equal(d.observed_snowfall.reports[0].amount_in,3);assert.equal(d.upper_air.status,"unavailable");assert.equal(d.wssi_impact.status,"not-depicted");assert.equal(d.lake_ice_reference.status,"unavailable");
 }finally{global.fetch=orig}
});
test("frontend keeps source identity, crawlable content and no fake geographic band",()=>{
 const root=path.join(__dirname,"../public/lake-effect-snow/index.html");
 const html=fs.readFileSync(root,"utf8");
 const ui=fs.readFileSync(path.join(__dirname,"../public/assets/lake-effect.js"),"utf8");
 assert.match(html,/rel="canonical" href="https:\/\/chrisizworski.com\/lake-effect-snow\/"/);
 assert.match(html,/Built by <a href="https:\/\/chrisizworski.com\/chris-izworski\/"/);
 for(const id of ["hours","state","region","alerts","confidence","lake-reading","status","wssi-impact","lake-ice"])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(ui,/geolocation/);assert.match(ui,/renderUpperAir/);assert.match(ui,/850-mb air/);assert.match(ui,/history.replaceState/);
 assert.doesNotMatch(html,/100% chance|exact snow band/i);
 new Function(ui);
});

test("WSSI is a dated impact field, not a lake-effect alert",()=>{
 const q=C.wssiUrl(46.54,-87.4);assert.match(q,/wpc_wssi\/MapServer\/4\/query/);
 assert.match(q,/returnGeometry=false/);
 assert.equal(C.wssiAtPoint({features:[]},NOW).status,"not-depicted");
 const f={features:[{attributes:{impact:"MAJOR",issue_time:new Date(NOW-3600000).toISOString(),start_time:new Date(NOW).toISOString(),end_time:new Date(NOW+24*3600000).toISOString()}}]};
 const r=C.wssiAtPoint(f,NOW);assert.equal(r.status,"available");assert.equal(r.impact,"MAJOR");assert.match(r.reason,/NOT an official warning/);
 f.features[0].attributes.issue_time=new Date(NOW-48*3600000).toISOString();assert.equal(C.wssiAtPoint(f,NOW).status,"stale");
});
test("USNIC ice chart categorizes only a reference point, and old autumn product fails closed",()=>{
 const f={features:[{attributes:{ct:"00",idp_filedate:NOW-24*3600000}}]};
 const r=C.iceAtPoint(f,"Superior",NOW);assert.equal(r.status,"available");assert.equal(r.category,"ice-free water");
 assert.equal(r.scope,"single reference water point");
 assert.equal(C.iceAtPoint({features:[]},"Superior",NOW).status,"unavailable");
 assert.equal(C.iceAtPoint({features:[{attributes:{ct:"00",idp_filedate:NOW-120*86400000}}]},"Superior",NOW).status,"stale");
 assert.equal(C.iceAtPoint({features:[{attributes:{ct:"99",idp_filedate:NOW}}]},"Superior",NOW).status,"unavailable");
 assert.match(C.iceUrl("Superior"),/usnic_greatlakes_ice_chart\/MapServer\/0\/query/);
});
