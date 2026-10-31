"use strict";
/* Independent live WPC data gate: never substitutes simulated polygons. */
const assert=require("node:assert/strict");
const {decodeWindow,requestParams,LAYERS}=require("../api/lake-effect-geography")._test;
async function inspect(day){
 const url=requestParams(LAYERS[day][4]);
 const r=await fetch(url,{headers:{accept:"application/json"},signal:AbortSignal.timeout(9500)});
 assert.equal(r.ok,true,"NOAA/WPC Day "+day+" service returned "+r.status);
 const j=await r.json();assert.equal(Array.isArray(j.features),true,"WPC geometry metadata must have features");
 const out=decodeWindow(j.features,day,4);
 assert.ok(out,"WPC Day "+day+" needs a current issue and authentic 24-hour start/end");
 assert.equal(Date.parse(out.validEnd)-Date.parse(out.validStart),24*3600000);
 return {day,layer:out.layer,issuedAt:out.issuedAt,validStart:out.validStart,validEnd:out.validEnd};
}
Promise.all([1,2,3].map(inspect)).then(data=>console.log("WPC_GEOGRAPHY_LIVE_PASS",JSON.stringify(data)))
.catch(e=>{console.error("WPC_GEOGRAPHY_LIVE_FAILED:",e.message);process.exitCode=1});
