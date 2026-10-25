"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const M=require("../lib/lake-effect");
const NOW=Date.parse("2026-12-14T12:00:00Z");
const region=M.allowed["mi-marquette"];
const hour=(n,wind="NW",forecast="Mostly Clear")=>({
 startTime:new Date(NOW+n*3600000).toISOString(),windDirection:wind,
 temperature:22,windSpeed:"15 mph",shortForecast:forecast,
 probabilityOfPrecipitation:{value:forecast.includes("Snow")?80:5}
});
const verdict=(periods,updated=NOW)=>M.assess({region,hours:M.hourRows(periods,region.windSector,NOW),alerts:[],
 lakeTemp:{status:"available"},forecastUpdated:new Date(updated).toISOString(),now:NOW});
test("duplicate NWS valid times do not manufacture a covered storm window",()=>{
 const periods=Array.from({length:24},()=>hour(0,"NW","Snow Showers"));
 const rows=M.hourRows(periods,region.windSector,NOW);
 assert.equal(rows.length,1);
 const v=verdict(periods);
 assert.equal(v.level,"insufficient");
 assert.equal(v.first_12h.valid_hours,1);
 assert.equal(v.first_12h.overlap_hours,1);
 assert.equal(v.data_ok,false);
});
test("missing first-12h rows cannot borrow wind metadata from later hours",()=>{
 const periods=[...Array.from({length:6},(_,i)=>hour(i)),
  ...Array.from({length:12},(_,i)=>hour(i+12,"NW","Snow Showers"))];
 const v=verdict(periods);
 assert.equal(v.first_12h.valid_hours,6);
 assert.equal(v.first_12h.wind_known_hours,6);
 assert.equal(v.first_12h.wind_unknown_hours,0);
 assert.equal(v.first_12h.overlap_hours,0);
 assert.equal(v.data_ok,true);
 assert.equal(v.timing_window,"12–24 hours");
});
test("two favorable storm rows in a nearly empty 48–72h window are not a verified event",()=>{
 const periods=[...Array.from({length:12},(_,i)=>hour(i)),hour(50,"NW","Snow Showers"),hour(55,"NW","Snow Showers")];
 const v=verdict(periods);
 assert.equal(v.data_ok,true);
 assert.equal(v.windows[3].valid_hours,2);
 assert.equal(v.windows[3].overlap_hours,2);
 assert.notEqual(v.level,"favored");
 assert.notEqual(v.timing_window,"48–72 hours");
 assert.equal(v.official_snow_forecast,true);
});
test("stale NWS issuance does not leak unverified snowfall impacts",()=>{
 const periods=Array.from({length:12},(_,i)=>hour(i,"NW","Snow Showers"));
 const v=verdict(periods,NOW-14*3600000);
 assert.equal(v.level,"insufficient");
 assert.equal(v.data_ok,false);
 assert.match(v.impact,/stale or incomplete/);
});
test("storm shifts from aligned flow to off-lake flow without inventing a band",()=>{
 const periods=[...Array.from({length:12},(_,i)=>hour(i,"NW")),
  ...Array.from({length:12},(_,i)=>hour(12+i,"E","Snow Showers"))];
 const v=verdict(periods);
 assert.equal(v.official_snow_forecast,true);
 assert.equal(v.windows[1].snow_hours,12);
 assert.equal(v.windows[1].overlap_hours,0);
 assert.equal(v.level,"forecast-snow");
 assert.notEqual(v.confidence,"high");
});
