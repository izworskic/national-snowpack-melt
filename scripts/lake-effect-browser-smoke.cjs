"use strict";
const {chromium}=require("playwright-core"),fs=require("node:fs"),http=require("node:http"),assert=require("node:assert/strict"),path=require("node:path");
const {REGIONS}=require("../lib/lake-effect");
const now=Date.now(),ts=h=>new Date(now+h*3600000).toISOString();
const hours=Array.from({length:72},(_,i)=>({at:ts(i),temperature_f:26,wind_from:i<24?"NW":"W",wind_speed_text:"12 mph",forecast_snow:i>=18&&i<28,
 wind_aligned:true,short_forecast:i>=18&&i<28?"Snow Showers":"Cloudy",evidence:i>=18&&i<28?"snow-and-alignment":"wind-only"}));
function fixture(id){return {status:"ok",region:REGIONS.find(r=>r.id===id)||REGIONS[0],generated_at:ts(0),forecast_updated:ts(0),
 alerts_status:"available",alerts:[{event:"Lake Effect Snow Warning",headline:"Snowbelt statement",lakeEffect:true,url:"https://api.weather.gov/alerts/mock"}],
 lake_temperature:{status:"available",fahrenheit:42,celsius:5.6,date:ts(-24)},
 verdict:{headline:"Forecast change likely later",impact:"Watch changing conditions",confidence:"medium",timing_window:"12–24 hours",first_12h:{overlap_hours:0,valid_hours:12},official_warning:id==="ny-tug-hill",data_ok:id!=="mi-traverse"},
 upper_air:{status:id==="mi-gaylord"?"stale":"available",issued_at:ts(-6),current:{valid_at:ts(0),temp_850_c:-10,wind_850_from_deg:310,wind_925_from_deg:320,shear_925_850_deg:10,delta_t_c:15,instability_screen:"favorable-contrast",shear_screen:"modest-turning"},forecast:[0,6,12,18,24,36,48,60,72].map((h,i)=>({valid_at:ts(h),temp_850_c:-10+i,wind_850_from_deg:310-i*3,wind_925_from_deg:320,shear_925_850_deg:10+i*4,delta_t_c:15-i}))},
 hours:id==="mi-traverse"?hours.slice(0,3):hours,sources:{nws_hourly:"https://api.weather.gov/points/46,-87",nws_alerts:"https://api.weather.gov/alerts/active"},
 limitations:["No exact band-position forecast."]};}
const root=path.resolve(__dirname,"../public");
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,"http://localhost");
 if(u.pathname==="/api/lake-effect"){
  res.setHeader("Content-Type","application/json");
  if(u.searchParams.has("list"))return res.end(JSON.stringify({regions:REGIONS}));
  if(u.searchParams.get("region")==="ny-buffalo"){res.statusCode=503;return res.end(JSON.stringify({status:"unavailable"}));}
  return res.end(JSON.stringify(fixture(u.searchParams.get("region"))));
 }
 const file=u.pathname==="/assets/lake-effect.js"?"assets/lake-effect.js":u.pathname==="/assets/lake-effect-explainer.js"?"assets/lake-effect-explainer.js":u.pathname==="/assets/lake-effect-radar.js"?"assets/lake-effect-radar.js":"lake-effect-snow/index.html";
 res.setHeader("Content-Type",file.endsWith(".js")?"text/javascript":"text/html");
 fs.createReadStream(path.join(root,file)).pipe(res);
});
(async()=>{
 await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||"/usr/bin/google-chrome",headless:true,args:["--no-sandbox"]});
 try{
 for(const width of [390,1280]){
  const context=await browser.newContext({viewport:{width,height:800},permissions:[]});
  const page=await context.newPage(),errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  const tileRequests=[];
  const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==","base64");
  await page.route("**/api/carto-basemap-config",async route=>{
   await route.fulfill({status:width===390?200:503,contentType:"application/json",body:width===390?JSON.stringify({provider:"CARTO",key:"carto-public-browser-test-key-12345"}):JSON.stringify({error:"No public key"})});
  });
  await page.route(/https:\/\/[a-d]\.basemaps\.cartocdn\.com\/.*/,async route=>{
   tileRequests.push(route.request().url());
   await route.fulfill({status:200,contentType:"image/png",body:png});
  });
  await page.route("https://tile.openstreetmap.org/**",async route=>{await route.fulfill({status:200,contentType:"image/png",body:png})});
  await page.route("https://mapservices.weather.noaa.gov/**",async route=>{
   const u=new URL(route.request().url()),isQuery=u.pathname.endsWith("/query");
   if(isQuery){
    const now=Date.now(),isStale=u.searchParams.get("geometry")==="-84.67,45.03";
    const stamps=Array.from({length:11},(_,i)=>now-(isStale?480:110-i*10)*60000);
    await route.fulfill({status:200,contentType:"application/json",headers:{"access-control-allow-origin":"*"},body:JSON.stringify({features:stamps.map(t=>({attributes:{idp_validtime:t,idp_filedate:t+30000}}))})});
   }else if(u.pathname.endsWith("/exportImage")){
    await route.fulfill({status:200,contentType:"image/png",headers:{"access-control-allow-origin":"*"},body:Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==","base64")});
   }else await route.continue();
  });
  await page.goto("http://127.0.0.1:"+server.address().port+"/lake-effect-snow/?region=mi-marquette",{waitUntil:"networkidle"});
  await page.locator("#headline").waitFor({state:"visible"});
  assert.equal(await page.locator("#confidence").innerText(),"MEDIUM");
  assert.equal(await page.locator("#timing-window").innerText(),"12–24 hours");
  assert.equal(await page.locator(".hour").count(),72);
  assert.equal(await page.locator(".story-period").count(),4);
  assert.equal(await page.locator(".story-hour").count(),72);
  assert.match(await page.locator("#story-decision-title").innerText(),/First snow-and-wind overlap: 12–24h/);
  assert.equal(await page.locator(".story-period[aria-pressed=true]").count(),1);
  assert.match(await page.locator("#story-decision-copy").innerText(),/not a prediction/);
  assert.match(await page.locator("#story-next-check").innerText(),/NWS forecast/);
  assert.ok(await page.locator("#story-contrast circle").count()>=8);
  assert.ok(await page.locator("#story-shear circle").count()>=8);
  assert.match(await page.locator("#story-title").innerText(),/wind|snow/i);
  const initial=await page.locator("#story-range").innerText();
  await page.locator(".story-period").nth(2).click();
  assert.equal(await page.locator(".story-period[aria-pressed=true]").count(),1);
  assert.equal(new URL(page.url()).searchParams.get("window"),"24-48h");
  const deepLink=await page.locator("#story-view-link").getAttribute("href");
  assert.match(deepLink,/region=mi-marquette/);assert.match(deepLink,/window=24-48h/);
  await page.locator("#story-copy").click();
  await page.waitForFunction(()=>document.getElementById("story-copy-status").textContent.length>0);
  await page.goto(deepLink,{waitUntil:"networkidle"});
  await page.locator("#story-decision-title").waitFor({state:"visible"});
  assert.equal(await page.locator(".story-period").nth(2).getAttribute("aria-pressed"),"true");
  assert.match(await page.locator("#story-next-check").innerText(),/NWS forecast/);
  assert.notEqual(await page.locator("#story-range").innerText(),initial);
  await page.locator(".story-hour").nth(20).click();
  assert.match(await page.locator("#story-model").innerText(),/Selected NWS hour/);
  await page.locator("#story-contrast circle").nth(3).click();
  assert.match(await page.locator("#story-model").innerText(),/Selected offshore model snapshot/);
  await page.locator("#story-shear circle").nth(4).focus();
  await page.keyboard.press("Enter");
  assert.match(await page.locator("#story-model").innerText(),/Selected offshore model snapshot/);
  assert.match(await page.locator("#story-model-note").innerText(),/not interpolated hourly/);
  assert.match(await page.locator("#upper-air-model").innerText(),/15°C/);
  assert.match(await page.locator("#upper-air-model").innerText(),/850-mb air/);
  await page.locator("#radar-load").click();
  await page.waitForFunction(()=>document.getElementById("radar-time").max!=="0",{timeout:18000});
  assert.match(await page.locator("#radar-status").innerText(),/verified MRMS observations/);
  assert.match(await page.locator("#radar-frame-time").innerText(),/Radar observation:/);
  assert.ok(await page.locator("#radar-map .leaflet-map-pane").count()>0,"Radar should have an interactive Leaflet/CARTO map");
  if(width===390){
   await page.waitForFunction(()=>document.getElementById("radar-basemap-status").textContent.includes("CARTO Positron"),{timeout:10000});
   assert.ok(tileRequests.length>0,"CARTO keyed tile images must be requested");
   assert.ok(tileRequests.every(url=>new URL(url).searchParams.get("key")==="carto-public-browser-test-key-12345"),"Never request keyless CARTO tiles");
  }else{
   await page.waitForFunction(()=>document.getElementById("radar-basemap-status").textContent.includes("OpenStreetMap"),{timeout:10000});
   assert.equal(tileRequests.length,0,"No CARTO tile requests when public config is missing");
  }
  assert.equal(await page.locator("#radar-play").isDisabled(),false);
  await page.locator("#radar-play").click();
  assert.equal(await page.locator("#radar-play").innerText(),"Pause radar");
  await page.locator("#radar-play").click();
  await page.locator("#radar-time").fill("1");
  await page.locator("#radar-latest").click();
  assert.match(await page.locator("#radar-frame-time").innerText(),/of \d+ confirmed frames/);
  assert.match(await page.locator("#radar-directions").getAttribute("href"),/google\.com\/maps/);
  const d=await page.evaluate(()=>({body:document.documentElement.scrollWidth,viewport:innerWidth,timeline:document.querySelector(".hours").scrollWidth,container:document.querySelector(".hours").clientWidth}));
  assert.ok(d.body<=d.viewport+2,"Body horizontal overflow at "+width+"px: "+JSON.stringify(d));
  assert.ok(d.timeline>d.container,"Timeline must be internally scrollable");
  await page.locator("#state").selectOption("NY");
  await page.locator("#region").selectOption("ny-oswego");
  await page.locator("#check").click();
  await page.waitForFunction(()=>new URL(location.href).searchParams.get("region")==="ny-oswego");
  assert.equal((await page.locator("#lake-name").innerText()).toLowerCase(),"lake ontario");
  await page.waitForFunction(()=>document.getElementById("radar-directions").href.includes("43.45"));
  assert.match(await page.locator("#radar-directions").getAttribute("href"),/43\.45/);
  assert.match(await page.locator("#radar-frame-time").innerText(),/Radar observation:/);
  assert.equal(new URL(page.url()).searchParams.has("window"),false,"Change region should clear previous deep-linked window");
  assert.ok(await page.locator("#story-contrast circle").count()>=8);
  assert.match(await page.locator("#story-model").innerText(),/GFS offshore snapshot/);
  await page.locator("#state").selectOption("MI");await page.locator("#region").selectOption("mi-gaylord");await page.locator("#check").click();
  await page.waitForFunction(()=>new URL(location.href).searchParams.get("region")==="mi-gaylord");
  assert.equal(await page.locator("#story-contrast circle").count(),0,"Stale model must never leave old plotted values");
  assert.match(await page.locator("#story-model-note").innerText(),/unavailable or stale/);
  await page.waitForFunction(()=>document.getElementById("radar-status").textContent.includes("No sufficiently recent"),{timeout:15000});
  assert.equal(await page.locator("#radar-play").isDisabled(),true,"Stale radar must not play old frames");
  await page.locator("#region").selectOption("mi-traverse");await page.locator("#check").click();
  await page.waitForFunction(()=>new URL(location.href).searchParams.get("region")==="mi-traverse");
  assert.match(await page.locator("#story-decision-title").innerText(),/fresh check/);
  assert.match(await page.locator("#story-decision-copy").innerText(),/incomplete or stale/);
  await page.locator("#state").selectOption("NY");await page.locator("#region").selectOption("ny-tug-hill");await page.locator("#check").click();
  await page.waitForFunction(()=>new URL(location.href).searchParams.get("region")==="ny-tug-hill");
  assert.match(await page.locator("#story-decision-title").innerText(),/Active NWS warning/);
  assert.match(await page.locator("#story-next-check").innerText(),/Read the original NWS warning/);
  await page.locator("#locate").click();
  await page.locator("#state").selectOption("NY");await page.locator("#region").selectOption("ny-buffalo");
  await page.locator("#check").click();
  await page.waitForFunction(()=>document.getElementById("status").textContent.includes("Forecast unavailable"));
  assert.equal(await page.locator("#dashboard").isVisible(),false);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({viewport:width,result:"PASS",timeline:true,region_switch:true,outage_fail_closed:true}));
  await context.close();
 }
 }finally{await browser.close();}
})().catch(e=>{console.error("BROWSER_SMOKE_FAILED:",e.stack);process.exitCode=1}).finally(()=>server.close());
