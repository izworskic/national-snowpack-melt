"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const html=fs.readFileSync("public/lake-effect-snow/index.html","utf8");
const js=fs.readFileSync("public/assets/lake-effect-explainer.js","utf8");
const base=fs.readFileSync("public/assets/lake-effect.js","utf8");
test("interpretive chart experience is part of existing 72-hour section, not extra ad panels",()=>{
 for(const id of ["forecast-explainer","story-periods","story-title","story-what","story-model","story-evidence","story-contrast","story-shear","story-model-note","story-range"])
 assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/aria-live="polite"/);
 const section=html.indexOf('<h2>Hourly conditions: next 72 hours</h2>'),
       explainer=html.indexOf('id="forecast-explainer"'),scroll=html.indexOf('id="hours"');
 assert.ok(section<explainer&&explainer<scroll,"Story is inside existing hourly panel");
 assert.match(html,/lake-effect-explainer\.js/);
 assert.match(base,/LakeEffectExplainer\.render\(d\)/);
 assert.doesNotMatch(html,/chart\.js|d3\.js|recharts|canvas|adsbygoogle/i);
 new Function(js);
});
test("chart never implies precise bands or invented hourly GFS samples",()=>{
 assert.match(js,/No interpolated line/);
 assert.match(js,/NWS forecasts no snow/);
 assert.match(js,/wind direction/);
 assert.match(js,/model valid time|Model valid|GFS offshore snapshot/i);
 assert.match(js,/13°C/);
 assert.match(js,/no hourly GFS values have been interpolated/);
 assert.match(js,/status==="available"/);
 assert.doesNotMatch(js,/Math\.random|snowfall_inches|probability_pct/);
});
