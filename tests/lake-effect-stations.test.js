"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const V=require("../lib/lake-effect-station-validation");
const sample=(values,all=3)=>({
 relative_day:1,forecast_signal:true,wind_aligned_hours:3,evidence_status:values.some(x=>x>=1)?"reported_snow_nearby":"reporting_stations_no_1in_snow",
 station_count:all,positive_by_radius:{"15km":values.filter(x=>x>=1).length,"30km":values.filter(x=>x>=1).length,"65km":values.filter(x=>x>=1).length},
 gauge_reports:values.map((x,i)=>({snow_in:x,km:10+i,station:"X"+i})),
 provenance:{source:"https://mesonet.agron.iastate.edu/cgi-bin/request/daily.py?network=MI_COOP"}
});
test("Independent station snow within reporting radius is positive even if some stations zero",()=>{
 assert.equal(V.truth(sample([0,1.5,0])),true);
 assert.equal(V.truth(sample([0,0,0])),false);
});
test("Absence of reports and sparse gauges must not become a negative/no snow",()=>{
 assert.equal(V.truth(sample([0,0],2)),null);
 const g=sample([0,0,0]);g.gauge_reports=[];assert.equal(V.truth(g),null);
});
test("Stations outside the selected radius do not establish exact snowband placement",()=>{
 const g=sample([0,0,3]);g.positive_by_radius={"15km":0,"30km":0,"65km":1};
 g.gauge_reports[2].km=45;
 assert.equal(V.truth(g,15),null);
 assert.equal(V.truth(g,65),true);
});
test("Reject inconsistent or unverified forecast and report provenance",()=>{
 const g=sample([0,0,0]);g.provenance.source="https://example.com/fake.csv";
 assert.throws(()=>V.truth(g),/Station source/);
});
