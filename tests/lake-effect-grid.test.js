"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const G=require("../api/lake-effect-grid"),{ELEMENTS,exactMinute,candidateTimes,checkIssuance,inventory}=G._test;
const now=Date.parse("2026-10-31T21:10:00Z"),SIX=6*3600000;
test("Official gridded variables distinguish six-hour accumulation from instantaneous snapshots",()=>{
 assert.equal(ELEMENTS.snowamt.periodHours,6);assert.equal(ELEMENTS.t.periodHours,0);
 assert.equal(ELEMENTS.winddir.periodHours,0);assert.equal(ELEMENTS.windspd.unit,"knots");
 assert.deepEqual(Object.keys(ELEMENTS),["snowamt","winddir","windspd","t"]);
});
test("Only exact valid dates and six-hour UTC boundaries are eligible",()=>{
 assert.equal(exactMinute("2026-11-01T00:00"),true);
 assert.equal(exactMinute("2026-11-01T03:00"),true);
 for(const invalid of ["2034-20-01T06:00","2026-02-31T00:00","2026-11-01T00:00Z","2026-11-01T00","2026-11-01T00:10",null])assert.equal(exactMinute(invalid),invalid==="2026-11-01T00:10");
 const times=candidateTimes(now);
 assert.equal(times[0],"2026-11-01T00:00");
 assert.equal(times[1],"2026-11-01T06:00");
 assert.ok(times.length>=11&&times.length<=13);
 assert.ok(times.every(v=>Date.parse(v+":00Z")%SIX===0));
});
test("Invalid hours never pass even if NOAA returns a spurious issuance",()=>{
 assert.equal(checkIssuance(["2026-10-31T21:00"],"2026-11-01T03:00",now),null);
 assert.equal(checkIssuance(["2026-10-31T21:00"],"2026-11-01T06:00",now)?.vTIT,"2026-11-01T06:00_2026-10-31T21:00");
 assert.equal(checkIssuance([],"2026-11-01T06:00",now),null);
 assert.equal(checkIssuance(["2026-10-30T00:00"],"2026-11-01T06:00",now),null);
 assert.equal(checkIssuance(["2026-11-02T09:00"],"2026-11-01T06:00",now),null);
 assert.equal(checkIssuance(["invalid date"],"2026-11-01T06:00",now),null);
});
test("Valid inventory never interpolates unavailable published frames",async()=>{
 const dates=candidateTimes(now);
 const d=await inventory("snowamt",now,async(_el,vt)=>vt===dates[1]?[]:["2026-10-31T21:00"]);
 assert.equal(d.status,"verified");assert.equal(d.frames.length,dates.length-1);
 assert.equal(d.unavailableSlots,1);
 assert.ok(!d.frames.some(x=>x.validAt.startsWith(dates[1])));
 assert.ok(d.frames.every(x=>Date.parse(x.validAt)-Date.parse(x.periodStart)===SIX));
 assert.ok(d.frames.every(x=>x.vTIT.includes("_")));
});
test("All unavailable or out-of-date NOAA issuance lists fail closed",async()=>{
 assert.equal(await inventory("snowamt",now,async()=>[]),null);
 assert.equal(await inventory("snowamt",now,async()=>{throw Error("source down")}),null);
 await assert.rejects(()=>inventory("unknown",now),/Unknown/);
});
test("Map source never interpolates and existing canonical WPC/radar remain",()=>{
 const script=fs.readFileSync(path.join(__dirname,"../public/assets/lake-effect-grid.js"),"utf8");
 const html=fs.readFileSync(path.join(__dirname,"../public/lake-effect-snow/index.html"),"utf8");
 const main=fs.readFileSync(path.join(__dirname,"../public/assets/lake-effect.js"),"utf8");
 assert.match(script,/only render server-|Only render server-/i);
 assert.match(script,/VTIT/);assert.match(script,/prefers-reduced-motion/);
 assert.match(script,/No exact local snowfall number|does not give an exact snowfall number/);
 assert.match(script,/Wind direction/);assert.match(script,/Air temperature/);
 assert.match(html,/lake-effect-grid\.css/);assert.match(html,/lake-effect-grid\.js/);
 assert.match(html,/lake-effect-geography\.js/);assert.match(html,/lake-effect-radar\.js/);
 assert.match(main,/LakeEffectGrid\?\.render/);
 assert.match(html,/rel="canonical" href="https:\/\/chrisizworski\.com\/lake-effect-snow\/"/);
});

test("Browser strictly accepts verified accumulation and instantaneous grids for every field",()=>{
 const client=require("../public/assets/lake-effect-grid.js");
 const live=Date.now(),first=Math.ceil(live/SIX)*SIX,issuedAt=new Date(live-3600000).toISOString();
 for(const element of Object.keys(ELEMENTS)){
  const frames=Array.from({length:8},(_,i)=>{
   const validAt=new Date(first+i*SIX).toISOString();
   return {validAt,issuedAt,vTIT:validAt.slice(0,16)+"_"+issuedAt.slice(0,16),
    periodStart:element==="snowamt"?new Date(Date.parse(validAt)-SIX).toISOString():null};
  });
  assert.equal(client.validInventory({status:"verified",element,periodType:element==="snowamt"?"accumulation":"instantaneous",frames},element),true,element);
 }
});
