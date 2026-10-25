"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const O=require("../lib/lake-effect-observations");
const M=require("../lib/lake-effect");
const NOW=Date.parse("2026-12-07T16:00:00Z"),region=M.allowed["mi-marquette"];
const sample=(inches=3,shift=2,lat=46.54,lon=-87.4)=>({type:"Feature",properties:{
 typetext:"SNOW",magf:inches,unit:"Inch",valid:new Date(NOW-shift*3600000).toISOString(),
 city:"Near Marquette",source:"CO-OP Observer",lat,lon
},geometry:{coordinates:[lon,lat]}});
test("Official time-bounded regional snowfall report proves only nearby measured snow",()=>{
 const report=O.interpret({features:[sample()]},region,NOW);
 assert.equal(report.status,"reported_nearby");assert.equal(report.reports[0].amount_in,3);
 assert.ok(report.reports[0].distance_km<=1);
 assert.match(report.detail,/Not a measurement at your selected point/);
});
test("No qualifying report never means zero snow and never creates a forecast conclusion",()=>{
 const o=O.interpret({features:[]},region,NOW);
 assert.equal(o.status,"unverified");assert.match(o.detail,/does not mean no snow fell/);
 assert.equal(O.interpret(null,region,NOW).status,"unavailable");
});
test("Exclude stale, future, off-location, incorrect units and drifting snow",()=>{
 const wrong={type:"Feature",properties:{...sample().properties,typetext:"NON-TSTM WND GST"}};
 const r=O.interpret({features:[sample(3,39),sample(2,-4),sample(3,2,44.6,-84),{...sample(),properties:{...sample().properties,unit:"CM"}},wrong]},region,NOW);
 assert.equal(r.status,"unverified");
});
test("One report may not be reused for every snowbelt region",()=>{
 assert.equal(O.interpret({features:[sample()]},M.allowed["ny-buffalo"],NOW).status,"unverified");
});
test("Never make a historical report appear current; explicit window is bounded",()=>{
 const u=new URL(O.url(region,NOW));
 assert.equal(u.searchParams.get("wfos"),"MQT");
 assert.equal(Date.parse(u.searchParams.get("ets"))-Date.parse(u.searchParams.get("sts")),36*3600000);
});
