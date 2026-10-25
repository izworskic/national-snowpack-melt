"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const H=require("../lib/lake-effect-history-validation");
const BASE=path.join(__dirname,"fixtures/lake-effect-history");
const read=name=>JSON.parse(fs.readFileSync(path.join(BASE,name+".json"),"utf8"));
const cases=["buf-2025-11","oswego-2025-11","cle-2025-01","erie-2025-01","marquette-2025-11","gaylord-2025-12","milwaukee-2025-11"];
test("seven real issued-before-valid model proxy archives retain 1272 hourly rows and explicit provenance",()=>{
 const docs=cases.map(read),result=H.evaluate(docs);
 assert.equal(result.total_hours,1272);
 assert.equal(result.cases.length,7);
 assert.equal(result.scope,"MODEL_PROXY_ONLY");
 assert.equal(result.production_engine_skill,"NOT_VERIFIED");
 assert.match(result.warning,/not synchronized runs or NWS hourly point forecasts/);
 for(const d of docs){const meta=H.verifyFixture(d);assert.equal(meta.complete_hours,meta.hours);}
});
test("frozen 24/48/72h retrospective scores are reproducible, wind screen may worsen skill",()=>{
 const s=H.evaluate(cases.map(read)).scores;
 const snow=s.map(x=>[x.snow_forecast.tp,x.snow_forecast.fp,x.snow_forecast.fn,x.snow_forecast.tn]);
 const wind=s.map(x=>[x.snow_and_surface_wind.tp,x.snow_and_surface_wind.fp,x.snow_and_surface_wind.fn,x.snow_and_surface_wind.tn]);
 assert.deepEqual(snow,[[12,7,8,185],[8,14,12,178],[8,7,12,185]]);
 assert.deepEqual(wind,[[7,6,13,186],[5,12,15,180],[7,7,13,185]]);
 assert.ok(s.every(x=>x.wind_screen_csi_difference<0));
 assert.ok(s.every(x=>x.snow_forecast.blocks===212&&x.snow_and_surface_wind.blocks===212));
});
test("historical missing snow or wind is excluded, never treated as a zero/quiet interval",()=>{
 const a=structuredClone(read(cases[0]));
 a.rows[0][1]=null;
 assert.equal(H.groupScore(a,1,false).excluded,1);
 assert.equal(H.groupScore(a,1,true).excluded,1);
 const old=structuredClone(read(cases[0]));old.rows[1][0]=old.rows[0][0];
 assert.throws(()=>H.verifyFixture(old),/Missing\/duplicate\/out-of-order/);
 old.rows[1][0]="2025-11-24T01:00";
 old.rows[1][7]=-1;
 assert.throws(()=>H.verifyFixture(old),/Invalid historical snowfall/);
});
test("an absent issue-time NWS point forecast cannot be mislabeled validated",()=>{
 assert.throws(()=>H.requireProductionInputs([]),/Production skill UNVERIFIED/);
 assert.throws(()=>H.requireProductionInputs([{source_kind:"GFS",issued_at:"2025-01-01T00:00:00Z",valid_at:"2025-01-02T00:00:00Z",periods:[]}]),/UNVERIFIED/);
 assert.throws(()=>H.requireProductionInputs([{source_kind:"NWS_FORECAST_HOURLY_ISSUED_SNAPSHOT",issued_at:"2025-01-03T00:00:00Z",valid_at:"2025-01-02T00:00:00Z",periods:Array(12).fill({})}]),/UNVERIFIED/);
});
test("official issued discussion and independent snowfall reports are dated context, not hourly ground truth",()=>{
 const w=read("nws-issued-discussions"),reports=["ny-2025-11","oh-pa-2025-01","mi-2025-11","mi-2025-12","wi-2025-11"].map(x=>read("lsr-"+x));
 assert.equal(w.discussions.length,5);
 assert.ok(reports.every(x=>x.reports.length>0));
 assert.ok(reports.flatMap(x=>x.reports).some(x=>x.inches>=10));
 assert.ok(w.discussions.every(x=>x.issued_at_utc.endsWith("Z")&&x.classification.includes("not the NWS forecastHourly")));
});
