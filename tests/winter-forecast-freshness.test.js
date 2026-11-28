"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const lake=fs.readFileSync("public/assets/lake-effect.js","utf8");
const snow=fs.readFileSync("public/national-tools/snow/index.html","utf8");
function lakeGuard(){const ctx={document:{addEventListener(){}},window:{}};vm.createContext(ctx);vm.runInContext(lake.replace('document.addEventListener("DOMContentLoaded",init);','globalThis.guardForecast=guardForecast;globalThis.evidenceReadout=evidenceReadout;'),ctx);return ctx;}
test("expired lake packet cannot surface old favorable forecast, alerts or observations",()=>{
 const {guardForecast,evidenceReadout}=lakeGuard(),now=Date.parse("2026-11-28T02:00:00Z");
 const d={generated_at:"2020-01-01T00:00:00Z",forecast_updated:"2020-01-01T00:00:00Z",hours:[{at:"2020-01-01T01:00:00Z"}],verdict:{data_ok:true,official_snow_forecast:true,headline:"Favorable",official_warning:true},alerts:[{}],alerts_status:"available",lake_temperature:{status:"available",fahrenheit:40}};
 const safe=guardForecast(d,now);assert.equal(safe.verdict.headline,"Current forecast unavailable");assert.equal(safe.verdict.data_ok,false);assert.equal(safe.verdict.official_warning,false);assert.equal(safe.hours.length,0);assert.equal(safe.alerts.length,0);assert.equal(safe.lake_temperature.status,"unavailable");assert.equal(evidenceReadout(safe,now).freshness,"Stale or unverified");assert.equal(evidenceReadout(safe,now).snow,"Not verified");
});
test("fresh packet keeps verified forecast; fresh packet with stale forecast retains independent alert",()=>{
 const {guardForecast}=lakeGuard(),now=Date.parse("2026-11-28T02:00:00Z"),d={generated_at:"2026-11-28T01:40:00Z",forecast_updated:"2026-11-28T01:00:00Z",hours:[{}],verdict:{data_ok:true,official_warning:true,headline:"Warning"},alerts:[{}]};
 assert.equal(guardForecast(d,now),d);
 const old=guardForecast({...d,forecast_updated:"2026-11-27T00:00:00Z"},now);assert.equal(old.verdict.official_warning,true);assert.equal(old.verdict.data_ok,false);assert.equal(old.hours.length,0);assert.equal(old.alerts.length,1);
 for(const generated_at of [null,"bad","2026-11-28T02:02:00Z","2026-11-28T01:09:00Z"])assert.equal(guardForecast({...d,generated_at},now).verdict.official_warning,false);
});
test("snowpack null forecast counts remain unknown; explicit zero remains zero",()=>{
 const match=snow.match(/function hoursMetric\(v\)\{[^}]+\}/);assert.ok(match);
 const hour=vm.runInNewContext("("+match[0]+")");
 for(const x of [null,undefined,NaN,"0",-1,49])assert.equal(hour(x),"Unavailable");
 assert.equal(hour(0),"0 hr");assert.equal(hour(48),"48 hr");
 for(const field of ["above_freezing_hours","freezing_hours","rain_signal_hours","snow_signal_hours"])assert.ok(snow.includes("hoursMetric(f."+field+")"));
 assert.match(snow,/Hourly forecast unavailable; freeze\/thaw crossings cannot be assessed/);
});
