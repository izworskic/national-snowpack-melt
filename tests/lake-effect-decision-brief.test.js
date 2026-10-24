"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const html=fs.readFileSync("public/lake-effect-snow/index.html","utf8"),
 js=fs.readFileSync("public/assets/lake-effect-explainer.js","utf8");
test("forecast has one plainly worded decision briefing inside the existing hourly panel",()=>{
 for(const id of ["story-decision-title","story-decision-copy","story-next-check","story-copy","story-copy-status","story-view-link"])
  assert.match(html,new RegExp('id="'+id+'"'));
 const start=html.indexOf('<h2>Hourly conditions: next 72 hours</h2>');
 const end=html.indexOf('<div class="two">',start);
 const decision=html.indexOf('id="story-decision-title"'),chart=html.indexOf('id="story-contrast"');
 assert.ok(start>0&&decision>start&&chart>decision&&end>chart);
 assert.match(html,/Built by <a href="https:\/\/chrisizworski.com\/chris-izworski\//);
 assert.match(html,/rel="canonical" href="https:\/\/chrisizworski.com\/lake-effect-snow\/"/);
 assert.ok(!html.includes("adsbygoogle"));
});
test("window brief relies on NWS official forecast rather than GFS temperature alone",()=>{
 assert.match(js,/kind==="converging"/);assert.match(js,/kind==="nws-snow"/);
 assert.match(js,/kind==="wind-only"/);assert.match(js,/No NWS snow signal/);
 assert.match(js,/activeWarning/);assert.match(js,/alertsMissing/);
 assert.match(js,/v\.data_ok!==false/);assert.match(js,/coverage/);
 assert.match(js,/not a prediction of snow accumulation or band location/);
 assert.match(js,/model charts cannot fill missing official forecast hours/);
 assert.match(js,/No NWS snow signal/);
 assert.doesNotMatch(js,/snow_inches|snowfall_probability|GO_NOW/);
 new Function(js);
});
test("selected forecast window is shareable but never alters canonical indexing",()=>{
 assert.match(js,/searchParams\.set\("region"/);
 assert.match(js,/searchParams\.set\("window"/);
 assert.match(js,/findIndex\(w=>w\.key===url\.searchParams\.get\("window"\)\)/);
 assert.match(js,/searchParams\.delete\("window"\)/);
 assert.match(js,/navigator\.clipboard\?\.writeText/);
 assert.match(js,/Forecast-window link copied/);
 assert.match(js,/Clipboard permission unavailable/);
});
