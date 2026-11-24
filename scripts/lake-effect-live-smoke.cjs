"use strict";
const assert=require("node:assert/strict");
const API=require("../api/lake-effect"),{allowed}=require("../lib/lake-effect");
(async()=>{
 const now=Date.now();
 for(const id of ["mi-gaylord","mi-keweenaw","mi-marquette","ny-oswego"]){
  const d=await API._test.report(allowed[id],now);
  assert.equal(d.status,"ok");
  assert.equal(d.region.id,id);
  assert.equal(d.alerts_status,"available","NWS active alert feed unavailable");
  assert.ok(d.hours.length>=12,"Fewer than 12 valid hourly rows");
  console.log(JSON.stringify({debug_region:id,forecast_updated:d.forecast_updated,hours:d.hours.length,first:d.hours.slice(0,12).map(h=>({at:h.at,wind_from:h.wind_from,degrees:h.wind_degrees,wind_speed:h.wind_speed_text,wind_state:h.wind_state,short:h.short_forecast})),verdict:d.verdict}));
  assert.equal(d.verdict.data_ok,true,"NWS forecast stale or incomplete: "+id+" "+JSON.stringify(d.verdict.first_12h));
  const first=d.verdict.first_12h;
  assert.equal(first.wind_known_hours,first.wind_direction_known_hours+first.wind_calm_hours);
  assert.equal(first.valid_hours,first.wind_known_hours+first.wind_unknown_hours);
  if(id==="mi-gaylord"||id==="mi-keweenaw")assert.equal(first.valid_hours,12,"Incomplete first 12h for "+id);
  assert.ok(d.hours.filter(h=>h.wind_state==="calm").every(h=>h.wind_degrees===null&&h.wind_aligned===false),"Calm must not establish aligned wind");
  assert.equal(d.lake_temperature.status,"available","NOAA temperature missing or stale: "+JSON.stringify(d.lake_temperature));
  assert.equal(d.lake_temperature.scope,"lakewide surface average");
  assert.ok(Date.parse(d.lake_temperature.date)<=now+3600000);
  assert.ok(d.sources.nws_hourly.startsWith("https://api.weather.gov/"));
  assert.ok(!Object.hasOwn(d.verdict,"snow_inches"));
  console.log(JSON.stringify({region:id,result:"PASS",forecast_updated:d.forecast_updated,
   lake_date:d.lake_temperature.date,hours:d.hours.length,alerts:d.alerts.length}));
 }
})().catch(e=>{console.error("LIVE_SMOKE_FAILED:",e.message);process.exitCode=1});
