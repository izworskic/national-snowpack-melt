"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const js=fs.readFileSync("public/assets/lake-effect-radar.js","utf8"),
 html=fs.readFileSync("public/lake-effect-snow/index.html","utf8"),
 base=fs.readFileSync("public/assets/lake-effect.js","utf8");
const hook=()=>{
 const window={},events={},document={readyState:"loading",addEventListener:(type,fn)=>{events[type]=fn}};
 vm.runInNewContext(js,{window,document,URLSearchParams,Date,Math,Number,Promise,setTimeout,clearTimeout,setInterval,clearInterval,console});
 return window.LakeEffectRadar;
};
test("one radar inside forecast story, not a new ad section or extra API credentials",()=>{
 for(const id of ["radar-explorer","radar-map","radar-status","radar-frame-time","radar-time","radar-play","radar-latest","radar-refresh","radar-directions"])
  assert.match(html,new RegExp('id="'+id+'"'));
 const story=html.indexOf('id="forecast-explainer"'),radar=html.indexOf('id="radar-explorer"'),end=html.indexOf('<div class="two">',story);
 assert.ok(story>=0&&radar>story&&end>radar);
 assert.match(html,/NOAA\/NWS MRMS radar/);
 assert.match(html,/Radar reflectivity \(dBZ\) does not by itself distinguish rain from snow/);
 assert.match(html,/radar\.weather\.gov/);
 assert.match(html,/lake-effect-radar\.js/);
 assert.match(base,/LakeEffectRadar\.render\(d\)/);
 assert.doesNotMatch(html,/adsbygoogle|paid\.api/i);
 new Function(js);
});
test("official radar query remains point-scoped and source URLs allowlisted by design",()=>{
 const radar=hook();
 const url=new URL(radar.queryUrl({lat:46.54,lon:-87.4}));
 assert.equal(url.protocol,"https:");
 assert.equal(url.hostname,"mapservices.weather.noaa.gov");
 assert.match(url.pathname,/radar_base_reflectivity_time\/ImageServer\/query$/);
 assert.equal(url.searchParams.get("geometry"),"-87.4,46.54");
 assert.equal(url.searchParams.get("orderByFields"),"idp_validtime DESC");
 assert.equal(url.searchParams.get("outFields"),"idp_validtime,idp_filedate");
 assert.equal(url.searchParams.get("f"),"json");
 assert.match(js,/basemaps\.cartocdn\.com\/light_all/);
 assert.match(js,/exportImage/);
 assert.match(js,/transparent/);
 assert.doesNotMatch(js,/Math\.random|track_prediction|precip_probability|snow_inches/);
});
test("playback admits only fresh verified NOAA timestamps, skips duplicates and stale observations",()=>{
 const radar=hook(), now=Date.parse("2026-10-24T13:00:00Z");
 const item=v=>({attributes:{idp_validtime:v}});
 const times=[now-90*60000,now-65*60000,now-40*60000,now-39*60000,now-10*60000];
 const frames=radar.parseFrames({features:times.map(item)},now);
 assert.equal(frames.length,4);
 assert.equal(frames[0],now-90*60000);assert.equal(frames.at(-1),now-10*60000);
 assert.equal(radar.parseFrames({features:[item(now-65*60000)]},now).length,0);
 assert.equal(radar.parseFrames({features:[item(now+10*60000)]},now).length,0);
 assert.equal(radar.parseFrames({features:[item(now-7*3600000)]},now).length,0);
 assert.equal(radar.parseFrames({error:{code:503}},now).length,0);
 assert.equal(radar.parseFrames({features:[]},now).length,0);
 const many=Array.from({length:30},(_,i)=>item(now-(29-i)*5*60000));
 assert.ok(radar.parseFrames({features:many},now).length<=13);
});

test("CARTO browser key must come from the site configuration and every tile must be keyed",()=>{
 const radar=hook();
 const template=radar.publicTileUrl("carto-public-basemap-demo-key-12345");
 assert.match(template,/^https:\/\/\{s\}\.basemaps\.cartocdn\.com\/light_all\/\{z\}\/\{x\}\/\{y\}\.png\?key=/);
 assert.equal(new URL(template.replace("{s}","a").replace("{z}","5").replace("{x}","9").replace("{y}","12")).searchParams.get("key"),"carto-public-basemap-demo-key-12345");
 assert.equal(radar.publicTileUrl(""),null);
 assert.equal(radar.publicTileUrl("bad?query"),null);
 assert.equal(radar.publicTileUrl("private key"),null);
 assert.equal(radar.publicTileUrl(undefined),null);
 assert.match(js,/fetch\("\/api\/carto-basemap-config"/);
 assert.match(js,/OpenStreetMap street map/);
 assert.match(html,/id="radar-basemap-status"/);
 assert.match(html,/lake-effect-radar\.js\?v=20261024-2/);
 assert.doesNotMatch(js,/tileLayer\("https:\/\/basemaps\.cartocdn\.com\/light_all/);
});
