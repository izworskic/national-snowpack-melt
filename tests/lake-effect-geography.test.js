"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {readFileSync}=require("node:fs"),{join}=require("node:path");
const api=require("../api/lake-effect-geography"),{LAYERS,decodeWindow,parseStamp,interpretPoint,requestParams}=api._test;
const now=Date.parse("2026-10-31T20:00:00Z");
const row=(day=1,ageH=1)=>({attributes:{issue_time:new Date(now-ageH*3600000).toISOString().slice(0,19).replace("T"," "),
  start_time:new Date(Date.parse("2026-11-01T00:00:00Z")+(day-1)*86400000).toISOString().slice(0,19).replace("T"," "),
  end_time:new Date(Date.parse("2026-11-02T00:00:00Z")+(day-1)*86400000).toISOString().slice(0,19).replace("T"," "),dn:1}});
test("only official WPC day / snowfall-threshold layer IDs are mapped",()=>{
 assert.deepEqual(LAYERS,{1:{4:1,8:2,12:3},2:{4:6,8:7,12:8},3:{4:11,8:12,12:13}});
 assert.match(requestParams(1),/MapServer\/1\/query\?/);
 assert.match(requestParams(6,"-84.67000,45.03000"),/esriGeometryPoint/);
});
test("WPC valid periods are actual 24-hour periods, not three-hour extrapolations",()=>{
 for(let day=1;day<=3;day++){const d=decodeWindow([row(day)],day,4,now);assert.equal(d.status,"verified");assert.equal(d.day,day);assert.equal(d.layer,LAYERS[day][4]);assert.equal(Date.parse(d.validEnd)-Date.parse(d.validStart),86400000)}
});
test("stale or malformed NOAA publication fails closed",()=>{
 assert.equal(decodeWindow([],1,4,now),null);
 assert.equal(decodeWindow([row(1,21)],1,4,now),null);
 assert.equal(decodeWindow([{attributes:{...row(1).attributes,start_time:"not a date"}}],1,4,now),null);
 assert.equal(decodeWindow([{attributes:{...row(1).attributes,end_time:"2026-11-01 03:00:00"}}],1,4,now),null);
 assert.equal(parseStamp("2026-10-31T19:00:00Z"),NaN);
});
test("only genuine WPC category codes yield a published probability",()=>{
 assert.equal(interpretPoint([]).insidePublishedContour,false);
 assert.equal(interpretPoint([{attributes:{dn:1}}]).label,"Slight: 10–39%");
 assert.equal(interpretPoint([{attributes:{dn:2}},{attributes:{dn:3}}]).label,"High: 70–100%");
 assert.equal(interpretPoint([{attributes:{dn:0}}]).insidePublishedContour,false);
 assert.equal(interpretPoint([{attributes:{dn:"bogus"}}]),null);
});
test("map and site truth is explicit",()=>{
 const js=readFileSync(join(__dirname,"../public/assets/lake-effect-geography.js"),"utf8");
 const html=readFileSync(join(__dirname,"../public/lake-effect-snow/index.html"),"utf8");
 const main=readFileSync(join(__dirname,"../public/assets/lake-effect.js"),"utf8");
 assert.match(js,/WPC published outlines/);
 assert.match(js,/not hourly snowbands/);
 assert.match(js,/validWindow/);
 assert.match(js,/mapService|NOAA|MapServer/);
 assert.match(js,/prefers-reduced-motion/);
 assert.match(js,/No contour does not mean no snow/);
 assert.match(html,/lake-effect-geography\.js/);
 assert.match(html,/lake-effect-geography\.css/);
 assert.match(main,/LakeEffectGeography\?\.render/);
 assert.match(html,/rel="canonical" href="https:\/\/chrisizworski\.com\/lake-effect-snow\/"/);
 assert.match(html,/lake-effect-radar\.js/);
});
