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
 observed_snowfall:id==="mi-marquette"?{status:"reported_nearby",label:"Nearby snowfall reported",detail:"Dated observations within 50 km.",source:"https://mesonet.agron.iastate.edu/geojson/lsr.geojson?wfos=MQT",reports:[{time:ts(-3),city:"4 NW Sands",amount_in:6.9,distance_km:12,source_name:"CO-OP Observer"}]}:{status:"unverified",detail:"No qualifying snow reports; this does not mean no snow fell.",reports:[],source:"https://mesonet.agron.iastate.edu/geojson/lsr.geojson?wfos=BUF"},
 upper_air:{status:id==="mi-gaylord"?"stale":"available",issued_at:ts(-6),current:{valid_at:ts(0),temp_850_c:-10,wind_850_from_deg:310,wind_925_from_deg:320,shear_925_850_deg:10,delta_t_c:15,instability_screen:"favorable-contrast",shear_screen:"modest-turning"},forecast:[0,6,12,18,24,36,48,60,72].map((h,i)=>({valid_at:ts(h),temp_850_c:-10+i,wind_850_from_deg:310-i*3,wind_925_from_deg:320,shear_925_850_deg:10+i*4,delta_t_c:15-i}))},
 hours:id==="mi-traverse"?hours.slice(0,3):id==="ny-oswego"?hours.map(h=>({...h,forecast_snow:false,short_forecast:"Cloudy",evidence:"wind-only"})):hours,sources:{nws_hourly:"https://api.weather.gov/points/46,-87",nws_alerts:"https://api.weather.gov/alerts/active"},
 limitations:["No exact band-position forecast."]};}
const root=path.resolve(__dirname,"../public");
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,"http://localhost");
 if(u.pathname==="/api/lake-effect-grid"){
  res.setHeader("Content-Type","application/json");
  const element=u.searchParams.get("element")||"snowamt";
  const H=3600000,SIX=6*H,start=Math.ceil(now/SIX)*SIX,issuedAt=ts(-1),fields={
   snowamt:{label:"Six-hour new snowfall",kind:"accumulation",period:6},
   winddir:{label:"Surface wind direction",kind:"instantaneous",period:0},
   windspd:{label:"Surface wind speed",kind:"instantaneous",period:0},
   t:{label:"Air temperature",kind:"instantaneous",period:0}
  };
  const fld=fields[element];if(!fld){res.statusCode=400;return res.end(JSON.stringify({status:"unavailable"}))}
  const frames=Array.from({length:10},(_,i)=>{const validAt=new Date(start+i*SIX).toISOString();return{
   validAt,issuedAt,vTIT:validAt.slice(0,16)+"_"+issuedAt.slice(0,16),periodStart:fld.period?new Date(Date.parse(validAt)-SIX).toISOString():null
  }});
  return res.end(JSON.stringify({status:"verified",element,label:fld.label,periodType:fld.kind,validPeriodHours:fld.period,frames,checkedSlots:12,unavailableSlots:2,retrievedAt:ts(0)}));
 }
 if(u.pathname==="/api/lake-effect-geography"){
  const day=Number(u.searchParams.get("day")||1),threshold=Number(u.searchParams.get("threshold")||4);
  res.setHeader("Content-Type","application/json");
  const start=new Date(now+(4+(day-1)*24)*3600000).toISOString(),end=new Date(now+(28+(day-1)*24)*3600000).toISOString();
  const info={status:"verified",day,thresholdInches:threshold,layer:{1:{4:1,8:2,12:3},2:{4:6,8:7,12:8},3:{4:11,8:12,12:13}}[day][threshold],
   issuedAt:ts(-2),validStart:start,validEnd:end,retrievedAt:ts(0),validity:"24-hour accumulation window",
   source:{agency:"NOAA/NWS Weather Prediction Center",url:"https://www.wpc.ncep.noaa.gov/wwd/winter_wx.shtml"}};
  if(u.searchParams.get("mode")==="point")info.risk={code:1,label:"Slight: 10–39%",insidePublishedContour:true};
  return res.end(JSON.stringify(info));
 }
 if(u.pathname==="/api/lake-effect"){
  res.setHeader("Content-Type","application/json");
  if(u.searchParams.has("list"))return res.end(JSON.stringify({regions:REGIONS}));
  if(u.searchParams.get("region")==="ny-buffalo"){res.statusCode=503;return res.end(JSON.stringify({status:"unavailable"}));}
  return res.end(JSON.stringify(fixture(u.searchParams.get("region"))));
 }
 const file=u.pathname==="/assets/lake-effect.js"?"assets/lake-effect.js":u.pathname==="/assets/lake-effect-explainer.js"?"assets/lake-effect-explainer.js":u.pathname==="/assets/lake-effect-radar.js"?"assets/lake-effect-radar.js":u.pathname==="/assets/lake-effect-time-lens.js"?"assets/lake-effect-time-lens.js":u.pathname==="/assets/lake-effect-time-lens.css"?"assets/lake-effect-time-lens.css":u.pathname==="/assets/lake-effect-geography.js"?"assets/lake-effect-geography.js":u.pathname==="/assets/lake-effect-geography.css"?"assets/lake-effect-geography.css":u.pathname==="/assets/lake-effect-grid.js"?"assets/lake-effect-grid.js":u.pathname==="/assets/lake-effect-grid.css"?"assets/lake-effect-grid.css":"lake-effect-snow/index.html";
 res.setHeader("Content-Type",file.endsWith(".js")?"text/javascript":file.endsWith(".css")?"text/css":"text/html");
 fs.createReadStream(path.join(root,file)).pipe(res);
});
(async()=>{
 await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||"/usr/bin/google-chrome",headless:true,args:["--no-sandbox"]});
 try{
 for(const width of [360,390,768,1280]){
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
   }else if((u.pathname.endsWith("/exportImage")||u.pathname.endsWith("/export"))){
    await route.fulfill({status:200,contentType:"image/png",headers:{"access-control-allow-origin":"*"},body:Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==","base64")});
   }else await route.continue();
  });
  const gridRequests=[];
  await page.route("https://digital.weather.gov/ndfd.conus/wms**",async route=>{
   const u=new URL(route.request().url());gridRequests.push(u);
   const vt=u.searchParams.get("VTIT")||"";
   assert.match(vt,/^20\d\d-\d\d-\d\dT\d\d:00_20\d\d-\d\d-\d\dT\d\d:\d\d$/,"Gridded forecast must pin valid AND issuance times");
   assert.equal(u.searchParams.get("REQUEST"),"GetMap");
   assert.equal(u.searchParams.get("CRS"),"EPSG:3857");
   await route.fulfill({status:200,contentType:"image/png",body:png});
  });
  await page.goto("http://127.0.0.1:"+server.address().port+"/lake-effect-snow/?region=mi-marquette",{waitUntil:"networkidle"});
  await page.locator("#headline").waitFor({state:"visible"});
  assert.equal(await page.locator("#confidence").innerText(),"MEDIUM");
  assert.equal(await page.locator("#snow-evidence-layers .snow-evidence-item").count(),3);
  assert.match(await page.locator("#snow-evidence-layers").innerText(),/Snow reported nearby/);
  assert.match(await page.locator("#snow-evidence-layers").innerText(),/6.9 inches reported at 4 NW Sands/);
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
  // EXPERIENCE_OS time lens: exact forecast hour, second NWS point, keyboard and map.
  await page.locator("#le-lens-select").waitFor({state:"visible"});
  await page.locator("#le-lens-select").selectOption("ny-oswego");
  await page.waitForFunction(()=>document.getElementById("le-lens-b-name").textContent.includes("Oswego"));
  await page.locator("#le-lens-slider").focus();
  for(let i=0;i<6;i++)await page.keyboard.press("ArrowRight");
  assert.equal(await page.locator("#le-lens-slider").inputValue(),"6");
  assert.match(await page.locator("#le-lens-heading").innerText(),/Marquette/i);
  assert.match(await page.locator("#le-lens-b-state").innerText(),/does not forecast snow/i);
  assert.equal(new URL(page.url()).searchParams.get("lead"),"18");
  await page.locator("#le-lens-next").click();
  assert.equal(new URL(page.url()).searchParams.get("lead"),"21");
  await page.locator("#le-lens-prev").click();
  await page.locator("#le-lens-play").click();
  assert.equal(await page.locator("#le-lens-play").innerText(),"Pause forecast");
  await page.locator("#le-lens-play").click();
  await page.locator("#le-lens-toggle").click();
  await page.locator("#le-lens-map .leaflet-map-pane").waitFor({state:"attached",timeout:16000});
  assert.equal(await page.locator("#le-lens-map .leaflet-interactive").count(),2);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),"Time lens must fit viewport");
  await page.locator("#le-lens-toggle").click();
  await page.locator("#le-lens-select").selectOption("mi-traverse");
  await page.waitForFunction(()=>document.getElementById("le-lens-b-name").textContent.includes("Traverse"));
  assert.match(await page.locator("#le-lens-heading").innerText(),/unavailable/i);
  await page.locator("#le-lens-select").selectOption("ny-buffalo");
  await page.waitForFunction(()=>document.getElementById("le-lens-b-name").textContent.includes("Buffalo"));
  await page.waitForFunction(()=>document.getElementById("le-lens-heading").textContent.includes("unavailable"));
  assert.match(await page.locator("#le-lens-b-state").innerText(),/cannot be verified/i);
  await page.locator("#le-lens-select").selectOption("ny-oswego");
  await page.waitForFunction(()=>document.getElementById("le-lens-b-state").textContent.toLowerCase().includes("wind"));
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.locator("#le-lens-play").click();
  assert.equal(await page.locator("#le-lens-play").innerText(),"Play forecast");
  assert.match(await page.locator("#le-lens-map-status").innerText(),/Motion reduced/);
  await page.emulateMedia({reducedMotion:"no-preference"});
  fs.mkdirSync(path.join(__dirname,"../artifacts/lake-effect-lens"),{recursive:true});
  await page.screenshot({path:path.join(__dirname,"../artifacts/lake-effect-lens/lens-"+width+".png"),fullPage:false});
  // NDFD grid progression: exact six-hour times and issuance pinned in WMS
  await page.locator("#le-grid").scrollIntoViewIfNeeded();
  await page.locator("#le-grid-time").waitFor({state:"visible"});
  await page.waitForFunction(()=>document.getElementById("le-grid-issue")?.textContent.includes("Issued"),null,{timeout:15000});
  await page.waitForFunction(()=>document.getElementById("le-grid-map-status")?.textContent.includes("image valid"),null,{timeout:12000});
  assert.match(await page.locator("#le-grid-time").innerText(),/to/);
  assert.match(await page.locator("#le-grid-status").innerText(),/10 exact forecast times verified/);
  assert.equal(await page.locator("#le-grid-map .leaflet-image-layer").count(),1);
  assert.ok(gridRequests.some(u=>u.searchParams.get("LAYERS")==="ndfd.conus.snowamt"));
  assert.match(await page.locator("#le-grid-nws-context").innerText(),/NWS hourly point|NWS hourly forecast/i);
  await page.locator("#le-grid-slider").focus();
  for(let i=0;i<3;i++)await page.keyboard.press("ArrowRight");
  assert.equal(await page.locator("#le-grid-slider").inputValue(),"3");
  assert.ok(new URL(page.url()).searchParams.get("gridAt"),"Deep link stores exact verified time");
  assert.ok(gridRequests.some(u=>u.searchParams.get("VTIT")?.includes("_")),"WMS image must be issuance pinned");
  await page.locator("#le-grid-layer").selectOption("winddir");
  await page.waitForFunction(()=>document.getElementById("le-grid-issue").textContent.includes("Wind direction"),null,{timeout:10000});
  assert.doesNotMatch(await page.locator("#le-grid-time").innerText(),/ to /);
  assert.equal(new URL(page.url()).searchParams.get("gridField"),"winddir");
  await page.waitForFunction(()=>document.getElementById("le-grid-map-status").textContent.includes("image valid"),null,{timeout:15000});
  assert.ok(gridRequests.some(u=>u.searchParams.get("LAYERS")==="ndfd.conus.winddir"));
  await page.locator("#le-grid-layer").selectOption("t");
  await page.waitForFunction(()=>document.getElementById("le-grid-issue").textContent.includes("Air temperature"),null,{timeout:15000});
  await page.waitForFunction(()=>document.getElementById("le-grid-map-status").textContent.includes("image valid"),null,{timeout:15000});
  assert.ok(gridRequests.some(u=>u.searchParams.get("LAYERS")==="ndfd.conus.t"));
  await page.locator("#le-grid-layer").selectOption("snowamt");
  await page.waitForFunction(()=>document.getElementById("le-grid-issue").textContent.includes("New snow · 6 hours"),null,{timeout:15000});
  await page.locator("#le-grid-next").click();
  assert.equal(new URL(page.url()).searchParams.get("gridField"),"snowamt");
  await page.locator("#le-grid-overview").click();
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.locator("#le-grid-play").click();
  assert.equal(await page.locator("#le-grid-play").innerText(),"Play 6-hour forecast");
  assert.match(await page.locator("#le-grid-status").innerText(),/Reduced motion/);
  await page.emulateMedia({reducedMotion:"no-preference"});
  await page.locator("#le-grid-play").click();
  assert.equal(await page.locator("#le-grid-play").innerText(),"Pause progression");
  await page.locator("#le-grid-play").click();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),"Grid controls must not overflow viewport");
  await page.locator("#le-grid").screenshot({path:path.join(__dirname,"../artifacts/lake-effect-lens/grid-"+width+".png")});
  await page.route("**/api/lake-effect-grid?**",async route=>{
   if(route.request().url().includes("element=windspd"))return route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({status:"unavailable"})});
   return route.continue();
  });
  await page.locator("#le-grid-layer").selectOption("windspd");
  await page.waitForFunction(()=>document.getElementById("le-grid-time").textContent.includes("unavailable"),null,{timeout:14000});
  assert.equal(await page.locator("#le-grid-map .leaflet-image-layer").count(),0,"Stale NDFD image must be removed after outage");
  assert.match(await page.locator("#le-grid-status").innerText(),/No gridded map is displayed/);
  await page.unroute("**/api/lake-effect-grid?**");
  // A real NOAA WMS image can stall. The UI must fail closed without waiting forever,
  // and a late response must not resurrect the abandoned forecast image.
  if(width===390){
   await page.route("https://digital.weather.gov/ndfd.conus/wms**",async route=>{
    await new Promise(ok=>setTimeout(ok,14500));
    try{await route.fulfill({status:200,contentType:"image/png",body:png})}catch{}
   });
   await page.locator("#le-grid-layer").selectOption("snowamt");
   await page.waitForFunction(()=>document.getElementById("le-grid-map-fallback").textContent.includes("did not load in time"),null,{timeout:16500});
   assert.equal(await page.locator("#le-grid-map .leaflet-image-layer").count(),0);
   await page.waitForTimeout(3000);
   assert.match(await page.locator("#le-grid-map-status").innerText(),/No image substituted/);
   assert.equal(await page.locator("#le-grid-map .leaflet-image-layer").count(),0);
   await page.unroute("https://digital.weather.gov/ndfd.conus/wms**");
  }
  // WPC map: official day/threshold layers, point checks, reduced-motion, fail closed.
  await page.locator("#le-geo").scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>document.getElementById("le-geo-valid")?.textContent.includes("to"),{timeout:15000});
  assert.match(await page.locator("#le-geo-issue").innerText(),/Weather Prediction Center/);
  await page.locator("#le-geo-map .leaflet-map-pane").waitFor({state:"attached",timeout:15000});
  await page.locator("#le-geo-map .leaflet-image-layer").waitFor({state:"attached",timeout:15000});
  assert.match(await page.locator("#le-geo-probe").innerText(),/Slight: 10–39%/);
  await page.locator('[data-geo-day="2"]').click();
  await page.waitForFunction(()=>document.getElementById("le-geo-issue").textContent.includes("Day 2"));
  assert.equal(new URL(page.url()).searchParams.get("geoDay"),"2");
  await page.locator('[data-geo-inches="8"]').click();
  await page.waitForFunction(()=>document.getElementById("le-geo-issue").textContent.includes("≥8 inches"));
  assert.equal(new URL(page.url()).searchParams.get("geoSnow"),"8");
  assert.equal(await page.locator('[data-geo-day="2"]').getAttribute("aria-pressed"),"true");
  assert.ok((await page.locator("#le-geo-map .leaflet-image-layer").getAttribute("src")).includes("layers=show%3A7"),"Day 2 >=8 inches must use WPC layer 7");
  await page.locator("#le-geo-home").click();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),"Geographic outlook must fit viewport");
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.locator("#le-geo-play").click();
  assert.equal(await page.locator("#le-geo-play").innerText(),"Play progression");
  assert.match(await page.locator("#le-geo-status").innerText(),/Reduced motion/);
  await page.emulateMedia({reducedMotion:"no-preference"});
  await page.locator("#le-geo-play").click();
  assert.equal(await page.locator("#le-geo-play").innerText(),"Pause progression");
  await page.locator("#le-geo-play").click();
  await page.locator("#le-geo").screenshot({path:path.join(__dirname,"../artifacts/lake-effect-lens/geography-"+width+".png")});
  await page.route("**/api/lake-effect-geography?**",async route=>{
   if(route.request().url().includes("day=3")&&route.request().url().includes("threshold=12"))
    return route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({status:"unavailable"})});
   return route.continue();
  });
  await page.locator('[data-geo-day="3"]').click();
  await page.locator('[data-geo-inches="12"]').click();
  await page.waitForFunction(()=>document.getElementById("le-geo-valid").textContent.includes("unavailable"),{timeout:12000});
  assert.equal(await page.locator("#le-geo-map .leaflet-image-layer").count(),0,"Stale outlook must be removed");
  assert.match(await page.locator("#le-geo-probe").innerText(),/No probability is inferred/);
  await page.unroute("**/api/lake-effect-geography?**");
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

  // Expired observation frames must not survive in a long-open tab.
  await page.evaluate(()=>{
   const realNow=Date.now;window.__lakeRadarRealNow=realNow;
   Date.now=()=>realNow()+60*60000;
  });
  await page.locator("#radar-latest").click();
  assert.match(await page.locator("#radar-status").innerText(),/expired/);
  assert.equal(await page.locator("#radar-play").isDisabled(),true);
  assert.match(await page.locator("#radar-frame-time").innerText(),/No verified frame/);
  await page.evaluate(()=>{Date.now=window.__lakeRadarRealNow;delete window.__lakeRadarRealNow});
  await page.locator("#radar-refresh").click();
  await page.waitForFunction(()=>document.getElementById("radar-time").max!=="0");
  await page.locator("#radar-map .leaflet-control-zoom-in").click();
  await page.waitForTimeout(200);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),
   "Map zoom must not shift the document horizontally");
  assert.match(await page.locator("#radar-directions").getAttribute("href"),/google\.com\/maps/);
  const d=await page.evaluate(()=>({body:document.documentElement.scrollWidth,viewport:innerWidth,timeline:document.querySelector(".hours").scrollWidth,container:document.querySelector(".hours").clientWidth}));
  assert.ok(d.body<=d.viewport+2,"Body horizontal overflow at "+width+"px: "+JSON.stringify(d));
  assert.ok(d.timeline>d.container,"Timeline must be internally scrollable");
  await page.locator("#state").selectOption("NY");
  await page.locator("#region").selectOption("ny-oswego");
  await page.locator("#check").click();
  await page.waitForFunction(()=>new URL(location.href).searchParams.get("region")==="ny-oswego");
  assert.equal((await page.locator("#lake-name").innerText()).toLowerCase(),"lake ontario");
  assert.match(await page.locator("#snow-evidence-layers").innerText(),/Not verified/);
  assert.doesNotMatch(await page.locator("#snow-evidence-layers").innerText(),/6.9 inches reported/);
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
