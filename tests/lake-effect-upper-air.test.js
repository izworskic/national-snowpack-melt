"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const U=require("../lib/lake-effect-upper-air");
const NOW=Date.parse("2026-12-14T12:00:00Z");
const iso=n=>new Date(n).toISOString().replace(".000Z","Z");
const sample=(offset,overrides={})=>({valid_at:iso(NOW+offset*3600000),
 lakes:{Superior:{temp_850_c:-12,wind_850_from_deg:305,wind_850_mps:11,
 wind_925_from_deg:315,wind_925_mps:10,directional_shear_925_850_deg:10,
 sample_lat:47.4,sample_lon:-87.2,...overrides}}});
const document=()=>({schema:"lake-effect-upper-air-v1",model:"NCEP GFS 0.25 degree",
 issued_at:iso(NOW-6*3600000),generated_at:iso(NOW-5*3600000),
 samples:[sample(0),sample(6),sample(12),sample(24),sample(36),sample(48)]});
test("offshore 850C contrast uses only fresh lakewide water value",()=>{
 const d=U.decode(document(),"Superior",{status:"available",celsius:3,date:iso(NOW-24*3600000)},NOW);
 assert.equal(d.status,"available");
 assert.equal(d.current.delta_t_c,15);
 assert.equal(d.current.instability_screen,"favorable-contrast");
 assert.equal(d.current.wind_850_from_deg,305);
 assert.equal(d.current.shear_925_850_deg,10);
 assert.equal(d.forecast.length,6);
 assert.match(d.limitations,/13°C/);
 const noWater=U.decode(document(),"Superior",{status:"stale",celsius:3},NOW);
 assert.equal(noWater.status,"available");assert.equal(noWater.current.delta_t_c,null);
 assert.equal(noWater.current.instability_screen,"unavailable");
});
test("age, missing valid hour, malformed GRIB fields and wind shear fail closed",()=>{
 const stale=document();stale.issued_at=iso(NOW-30*3600000);
 assert.equal(U.decode(stale,"Superior",{status:"available",celsius:3},NOW).status,"stale");
 const dup=document();dup.samples[1]=sample(0);
 assert.equal(U.decode(dup,"Superior",{status:"available",celsius:3},NOW).status,"unavailable");
 const bad=document();bad.samples[0].lakes.Superior.wind_850_from_deg=390;
 assert.equal(U.decode(bad,"Superior",{status:"available",celsius:3},NOW).status,"unavailable");
 const shear=document();shear.samples[0].lakes.Superior.directional_shear_925_850_deg=101;
 assert.equal(U.decode(shear,"Superior",{status:"available",celsius:3},NOW).status,"unavailable");
 const far=document();far.samples=far.samples.map((x,i)=>sample(24+i*6));
 assert.equal(U.decode(far,"Superior",{status:"available",celsius:3},NOW).status,"stale");
});
test("unfavorable model air contrast does not claim a lake-effect snowfall event",()=>{
 const d=document();d.samples=d.samples.map((s,i)=>sample(i*6,{temp_850_c:2,wind_850_from_deg:300,wind_925_from_deg:15,directional_shear_925_850_deg:75}));
 const r=U.decode(d,"Superior",{status:"available",celsius:3},NOW);
 assert.equal(r.status,"available");assert.equal(r.current.instability_screen,"limited-contrast");
 assert.equal(r.current.shear_screen,"strong-turning");
 assert.ok(!Object.hasOwn(r,"snow_probability"));
 assert.ok(!Object.hasOwn(r,"snowfall_inches"));
});
