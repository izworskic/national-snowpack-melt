"use strict";
const M=require("../lib/lake-effect");
const C=require("../lib/lake-effect-context");
const UA="ChrisIzworskiLakeEffect/1.1 (+https://chrisizworski.com/lake-effect-snow/)";
async function getJson(url,ms=6000){
 const u=new URL(url);
 if(u.protocol!=="https:"||!["api.weather.gov","apps.glerl.noaa.gov","mapservices.weather.noaa.gov"].includes(u.hostname))throw Error("Upstream not allowlisted");
 const r=await fetch(u,{headers:{accept:"application/geo+json,application/json,text/plain;q=0.8","user-agent":UA},signal:AbortSignal.timeout(ms)});
 if(!r.ok)throw Error("Upstream "+u.hostname+" returned "+r.status);
 return /\.(csv|dat)$/i.test(u.pathname)?r.text():r.json();
}
function lakeUrl(){
 return "https://apps.glerl.noaa.gov/coastwatch/ftp/glsea/avgtemps/glsea-temps_1024_3.dat";
}
function responseHeaders(req,res){
 res.setHeader("Content-Type","application/json; charset=utf-8");
 res.setHeader("X-Robots-Tag","noindex, nofollow");
 res.setHeader("Cache-Control","public, s-maxage=1200, stale-while-revalidate=1800");
 const origin=String(req.headers?.origin||"");
 if(origin==="https://chrisizworski.com"||origin==="https://www.chrisizworski.com"||origin==="https://chrisizworski-com-preview.vercel.app"){
  res.setHeader("Access-Control-Allow-Origin",origin);res.setHeader("Vary","Origin");
 }
}
async function report(region,now=Date.now()){
 const id=region.id,pointUrl="https://api.weather.gov/points/"+region.lat.toFixed(4)+","+region.lon.toFixed(4);
 const [point,rawAlerts,rawLake,rawWssi,rawIce]=await Promise.allSettled([
  getJson(pointUrl,6000),
  getJson("https://api.weather.gov/alerts/active?point="+region.lat.toFixed(4)+","+region.lon.toFixed(4),6500),
  getJson(lakeUrl(now),5500),
  getJson(C.wssiUrl(region.lat,region.lon),5500),
  getJson(C.iceUrl(region.lake),5500)
 ]);
 if(point.status!=="fulfilled")throw Error("NWS point metadata not currently available");
 const hourlyUrl=point.value?.properties?.forecastHourly;
 if(typeof hourlyUrl!=="string"||!hourlyUrl.startsWith("https://api.weather.gov/"))throw Error("NWS hourly endpoint missing");
 const hourly=await getJson(hourlyUrl,7000);
 const alertsStatus=rawAlerts.status==="fulfilled"?"available":"unavailable";
 const alerts=alertsStatus==="available"?M.winterAlerts(rawAlerts.value?.features):[];
 const lakeTemp=rawLake.status==="fulfilled"?M.parseLakeCsv(rawLake.value,region.lake,now):{status:"unavailable",reason:"NOAA GLSEA retrieval failed"};
 const periods=hourly?.properties?.periods||[];
 const hours=M.hourRows(periods,region.windSector,now);
 const forecastUpdated=hourly?.properties?.updated||hourly?.properties?.generatedAt||null;
 const verdict=M.assess({region,hours,alerts,lakeTemp,forecastUpdated,now});
 const wssi=rawWssi.status==="fulfilled"?C.wssiAtPoint(rawWssi.value,now):{status:"unavailable",reason:"WSSI GIS source unavailable"};
 const lakeIce=rawIce.status==="fulfilled"?C.iceAtPoint(rawIce.value,region.lake,now):{status:"unavailable",reason:"USNIC ice GIS source unavailable"};
 // These independent observations inform the reader, never the NWS warning or band verdict.
 if(alertsStatus!=="available"){
  verdict.confidence="low";
  verdict.impact="NWS alerts are unavailable. Check weather.gov before making travel plans.";
 }
 return {status:"ok",product:"lake-effect-snow-decision",generated_at:new Date(now).toISOString(),
  region,verdict,alerts,alerts_status:alertsStatus,lake_temperature:lakeTemp,lake_ice_reference:lakeIce,wssi_impact:wssi,
  hours,forecast_updated:forecastUpdated,
  sources:{nws_point:pointUrl,nws_hourly:hourlyUrl,nws_alerts:"https://api.weather.gov/alerts/active?point="+region.lat+","+region.lon,
   lake_temperatures:"https://apps.glerl.noaa.gov/coastwatch/ftp/glsea/avgtemps/glsea-temps_1024_3.dat",
   wssi:C.WSSI,ice_analysis:C.ICE,
   forecast_basis:"NWS local hourly point forecast (not an upstream band simulation)",
   lake_basis:"NOAA GLSEA daily lakewide surface average; not local fetch or 850-mb air temperature"},
  limitations:["Lake-effect snowbands can move sharply after small wind shifts; region summaries are not band forecasts.",
   "Surface wind exposure is a regional heuristic, not measured upwind flow aloft.",
   "Lakewide water temperature is context only; upstream 850-mb instability, fetch, shear and inversions are not resolved here.",
   "National Ice Center ice class samples only one offshore point, not lakewide ice coverage. Stale analysis is never current open water.",
   "WPC WSSI describes general forecast winter impacts, not lake-effect band position or an NWS warning.",
   "Weather warnings are authoritative; this tool never replaces NWS guidance, road closures or real-time traffic.",
   "Qualitative confidence measures evidence agreement, not a calibrated percent chance of snow."]};
}
async function handler(req,res){
 responseHeaders(req,res);
 if(req.method!=="GET"&&req.method!=="HEAD"){res.setHeader("Allow","GET, HEAD");return res.status(405).json({error:"Method not allowed"});}
 if(req.query?.list==="1")return res.status(200).json({regions:M.REGIONS,states:["MI","WI","OH","PA","NY"]});
 const id=String(req.query?.region||"");
 const region=M.allowed[id];
 if(!region)return res.status(400).json({error:"Select one of the listed Great Lakes snowbelt regions"});
 try{return res.status(200).json(await report(region));}
 catch{return res.status(503).json({status:"unavailable",region_id:id,error:"Current NWS forecast could not be confirmed; no lake-effect assessment issued"});}
}
handler._test={report,lakeUrl,responseHeaders};
module.exports=handler;
