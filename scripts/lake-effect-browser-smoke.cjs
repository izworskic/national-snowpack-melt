"use strict";
const {chromium}=require("playwright-core"),fs=require("node:fs"),http=require("node:http"),assert=require("node:assert/strict"),path=require("node:path");
const {REGIONS}=require("../lib/lake-effect");
const now=Date.now(),ts=h=>new Date(now+h*3600000).toISOString();
const hours=Array.from({length:72},(_,i)=>({at:ts(i),temperature_f:26,wind_from:i<24?"NW":"W",wind_speed_text:"12 mph",forecast_snow:i>=18&&i<28,
 wind_aligned:true,short_forecast:i>=18&&i<28?"Snow Showers":"Cloudy",evidence:i>=18&&i<28?"snow-and-alignment":"wind-only"}));
function fixture(id){return {status:"ok",region:REGIONS.find(r=>r.id===id)||REGIONS[0],generated_at:ts(0),forecast_updated:ts(0),
 alerts_status:"available",alerts:[{event:"Lake Effect Snow Warning",headline:"Snowbelt statement",lakeEffect:true,url:"https://api.weather.gov/alerts/mock"}],
 lake_temperature:{status:"available",fahrenheit:42,celsius:5.6,date:ts(-24)},
 verdict:{headline:"Forecast change likely later",impact:"Watch changing conditions",confidence:"medium",timing_window:"12–24 hours",first_12h:{overlap_hours:0,valid_hours:12}},
 upper_air:{status:"available",issued_at:ts(-6),current:{valid_at:ts(0),temp_850_c:-10,wind_850_from_deg:310,wind_925_from_deg:320,shear_925_850_deg:10,delta_t_c:15,instability_screen:"favorable-contrast",shear_screen:"modest-turning"},forecast:[{valid_at:ts(0),temp_850_c:-10,wind_850_from_deg:310,shear_925_850_deg:10,delta_t_c:15}]},
 hours,sources:{nws_hourly:"https://api.weather.gov/points/46,-87",nws_alerts:"https://api.weather.gov/alerts/active"},
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
 const file=u.pathname==="/assets/lake-effect.js"?"assets/lake-effect.js":"lake-effect-snow/index.html";
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
  await page.goto("http://127.0.0.1:"+server.address().port+"/lake-effect-snow/",{waitUntil:"networkidle"});
  await page.locator("#headline").waitFor({state:"visible"});
  assert.equal(await page.locator("#confidence").innerText(),"MEDIUM");
  assert.equal(await page.locator("#timing-window").innerText(),"12–24 hours");
  assert.equal(await page.locator(".hour").count(),72);
  assert.match(await page.locator("#upper-air-model").innerText(),/15°C/);
  assert.match(await page.locator("#upper-air-model").innerText(),/850-mb air/);
  const d=await page.evaluate(()=>({body:document.documentElement.scrollWidth,viewport:innerWidth,timeline:document.querySelector(".hours").scrollWidth,container:document.querySelector(".hours").clientWidth}));
  assert.ok(d.body<=d.viewport+2,"Body horizontal overflow at "+width+"px: "+JSON.stringify(d));
  assert.ok(d.timeline>d.container,"Timeline must be internally scrollable");
  await page.locator("#state").selectOption("NY");
  await page.locator("#region").selectOption("ny-oswego");
  await page.locator("#check").click();
  await page.waitForFunction(()=>new URL(location.href).searchParams.get("region")==="ny-oswego");
  assert.equal((await page.locator("#lake-name").innerText()).toLowerCase(),"lake ontario");
  await page.locator("#locate").click();
  await page.locator("#region").selectOption("ny-buffalo");
  await page.locator("#check").click();
  await page.waitForFunction(()=>document.getElementById("status").textContent.includes("Forecast unavailable"));
  assert.equal(await page.locator("#dashboard").isVisible(),false);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({viewport:width,result:"PASS",timeline:true,region_switch:true,outage_fail_closed:true}));
  await context.close();
 }
 }finally{await browser.close();}
})().catch(e=>{console.error("BROWSER_SMOKE_FAILED:",e.stack);process.exitCode=1}).finally(()=>server.close());
