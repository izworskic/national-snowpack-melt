"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const rules=require("../public/assets/lake-effect-time-lens.js");
const NOW=Date.parse("2026-12-12T12:00:00Z"),AT="2026-12-12T15:00:00.000Z";
function point(name,snow,wind,{stale=false,missing=false,alerts=true}={}){
 return {status:"ok",region:{id:name,name,lat:45,lon:-85},
  forecast_updated:new Date(NOW-(stale?13:2)*3600000).toISOString(),
  verdict:{data_ok:true,official_warning:false},alerts_status:alerts?"available":"unavailable",
  hours:missing?[]:[{at:AT,forecast_snow:snow,wind_aligned:wind,wind_from:"WNW",temperature_f:24,short_forecast:snow?"Snow Showers Likely":"Mostly Cloudy"}]};
}
test("only fresh verified NWS point forecasts are considered",()=>{
 assert.equal(rules.verified(point("A",true,true),NOW),true);
 assert.equal(rules.verified(point("A",true,true,{stale:true}),NOW),false);
 const incomplete=point("A",true,true);incomplete.verdict.data_ok=false;
 assert.equal(rules.verified(incomplete,NOW),false);
 assert.equal(rules.signal(point("A",true,true,{stale:true}),AT,NOW).rank,null);
});
test("wind alone never becomes forecast snow, and exact hour must exist",()=>{
 assert.equal(rules.signal(point("A",false,true),AT,NOW).rank,1);
 assert.match(rules.signal(point("A",false,true),AT,NOW).label,/does not forecast snow/);
 assert.equal(rules.signal(point("A",false,true,{missing:true}),AT,NOW).rank,null);
 assert.equal(rules.signal(point("A",true,true),AT,NOW).rank,3);
 assert.equal(rules.signal(point("A",true,false),AT,NOW).rank,2);
});
test("two-point decisions remain qualitative and fail closed on missing data",()=>{
 const a=point("A",true,true),b=point("B",false,true);
 const result=rules.judge(a,b,AT,NOW);
 assert.equal(result.winner,"a");
 assert.match(result.detail,/does not determine road safety/i);
 assert.equal(rules.judge(b,a,AT,NOW).winner,"b");
 assert.equal(rules.judge(a,point("B",false,true,{missing:true}),AT,NOW).winner,null);
 assert.match(rules.judge(a,point("B",false,true,{stale:true}),AT,NOW).headline,/unavailable/i);
 assert.equal(rules.judge(point("A",false,false),point("B",false,false),AT,NOW).winner,null);
});
test("source page retains one canonical, existing hourly panel, and independent radar",()=>{
 const html=fs.readFileSync("public/lake-effect-snow/index.html","utf8");
 const base=fs.readFileSync("public/assets/lake-effect.js","utf8");
 const lens=fs.readFileSync("public/assets/lake-effect-time-lens.js","utf8");
 const css=fs.readFileSync("public/assets/lake-effect-time-lens.css","utf8");
 assert.match(html,/lake-effect-time-lens\.css/);
 assert.match(html,/lake-effect-time-lens\.js/);
 assert.match(html,/id="radar-explorer"/);
 assert.match(html,/id="story-periods"/);
 assert.match(base,/LakeEffectTimeLens\.render\(d\)/);
 assert.equal((html.match(/rel="canonical"/g)||[]).length,1);
 assert.match(lens,/prefers-reduced-motion/);
 assert.match(lens,/api\/carto-basemap-config/);
 assert.match(lens,/tile\.openstreetmap\.org/);
 assert.match(lens,/aria-label="NWS forecast hour/);
 assert.doesNotMatch(lens,/Math\.random|snowfall_inches|probability_pct|adsbygoogle|localStorage|geolocation/);
 assert.match(css,/@media\(max-width:700px\)/);
 assert.match(css,/focus-visible/);
 new Function(lens);
});
