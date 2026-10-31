"use strict";
/* Independent live NOAA issuance-time verification: no invented frames. */
const assert=require("node:assert/strict");
const {inventory,checkIssuance,candidateTimes}=require("../api/lake-effect-grid")._test;
(async()=>{
 const now=Date.now(),first=candidateTimes(now)[0];
 for(const element of ["snowamt","winddir","t"]){
  const d=await inventory(element,now);
  assert.ok(d&&d.status==="verified","No verifiable NOAA/NDFD "+element+" frames");
  assert.ok(d.frames.length>=2,"Insufficient NDFD "+element+" progression for visitor display");
  assert.ok(d.frames.every(f=>f.vTIT===f.validAt.slice(0,16)+"_"+f.issuedAt.slice(0,16)));
  assert.ok(d.frames.every(f=>Date.parse(f.issuedAt)<=now+15*60000));
  if(element==="snowamt")assert.ok(d.frames.every(f=>Date.parse(f.validAt)-Date.parse(f.periodStart)===6*3600000));
  console.log("LIVE_NDFD_PASS",JSON.stringify({element,frames:d.frames.length,checked:d.checkedSlots,missing:d.unavailableSlots,firstValid:d.frames[0].validAt,issuedAt:d.frames[0].issuedAt,lastValid:d.frames[d.frames.length-1].validAt}));
 }
 console.log("LIVE_NDFD_SOURCE",first);
})().catch(e=>{console.error("LIVE_NDFD_FAILED:",e.message);process.exitCode=1});
