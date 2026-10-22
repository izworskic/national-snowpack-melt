"use strict";
const assert=require("node:assert/strict");
const API=require("../api/lake-effect"),{allowed}=require("../lib/lake-effect");
(async()=>{
 const now=Date.now();
 for(const id of ["mi-marquette","ny-oswego"]){
  const d=await API._test.report(allowed[id],now);
  assert.equal(d.status,"ok");
  assert.equal(d.region.id,id);
  assert.equal(d.alerts_status,"available","NWS active alert feed unavailable");
  assert.ok(d.hours.length>=12,"Fewer than 12 valid hourly rows");
  assert.equal(d.verdict.data_ok,true,"NWS forecast stale or incomplete");
  assert.equal(d.lake_temperature.status,"available","NOAA temperature missing or stale: "+JSON.stringify(d.lake_temperature));
  assert.equal(d.lake_temperature.scope,"lakewide surface average");
  assert.ok(Date.parse(d.lake_temperature.date)<=now+3600000);
  assert.ok(d.sources.nws_hourly.startsWith("https://api.weather.gov/"));
  assert.ok(!Object.hasOwn(d.verdict,"snow_inches"));
  console.log(JSON.stringify({region:id,result:"PASS",forecast_updated:d.forecast_updated,
   lake_date:d.lake_temperature.date,hours:d.hours.length,alerts:d.alerts.length}));
 }
})().catch(e=>{console.error("LIVE_SMOKE_FAILED:",e.message);process.exitCode=1});
