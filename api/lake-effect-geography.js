"use strict";
/* EXPERIENCE_OS_V1: NOAA/WPC published 24-hour snowfall probability polygons.
 * This is NOT an hourly lake-effect band, weather radar, or custom risk model.
 * Only official WPC day/threshold layer IDs are accepted. */
const WPC="https://mapservices.weather.noaa.gov/vector/rest/services/precip/wpc_prob_winter_precip/MapServer";
const LAYERS={1:{4:1,8:2,12:3},2:{4:6,8:7,12:8},3:{4:11,8:12,12:13}};
const H=3600000,DAY=24*H;
const CATEGORIES={
 0:{code:0,label:"Below 10% contour",detail:"No WPC 10% or higher probability contour is established here for this accumulation threshold."},
 1:{code:1,label:"Slight: 10–39%",detail:"WPC maps a 10–39% probability of meeting or exceeding this 24-hour snowfall threshold."},
 2:{code:2,label:"Moderate: 40–69%",detail:"WPC maps a 40–69% probability of meeting or exceeding this 24-hour snowfall threshold."},
 3:{code:3,label:"High: 70–100%",detail:"WPC maps at least a 70% probability of meeting or exceeding this 24-hour snowfall threshold."}
};
const parseStamp=v=>typeof v==="string"&&/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v)?Date.parse(v.replace(" ","T")+"Z"):NaN;
const iso=ms=>new Date(ms).toISOString();
function decodeWindow(features,day,threshold,now=Date.now()){
 if(!Array.isArray(features)||!features.length)return null;
 const a=features[0]?.attributes||{};
 const issue=parseStamp(a.issue_time),start=parseStamp(a.start_time),end=parseStamp(a.end_time);
 if(![issue,start,end].every(Number.isFinite))return null;
 // This WPC service is not ArcGIS time-enabled. Use each layer's actual
 // publication and 24-hour validity fields, not an assumed lead or archive.
 if(issue<now-20*H||issue>now+H||start<now-DAY||start>now+(day*DAY)+12*H||
  Math.abs(end-start-DAY)>60000||end<now||end>now+5*DAY)return null;
 return {status:"verified",day,thresholdInches:threshold,layer:LAYERS[day][threshold],
  issuedAt:iso(issue),validStart:iso(start),validEnd:iso(end),
  retrievedAt:iso(now),validity:"24-hour accumulation window",
  source:{agency:"NOAA/NWS Weather Prediction Center",name:"WPC probabilistic winter precipitation",
   url:"https://www.wpc.ncep.noaa.gov/wwd/winter_wx.shtml",
   mapService:WPC},
  caveat:"Official 24-hour probabilities for snow accumulation at or above the chosen threshold. Boundaries are WPC outlook contours, not snowband tracks, hourly snowfall, radar or road-safety predictions."};
}
function requestParams(layer,geometry){
 const q=new URLSearchParams({where:"1=1",outFields:"dn,outlook,issue_time,start_time,end_time",returnGeometry:"false",f:"json"});
 if(geometry){q.set("geometry",geometry);q.set("geometryType","esriGeometryPoint");q.set("inSR","4326");q.set("spatialRel","esriSpatialRelIntersects")}
 else q.set("resultRecordCount","1");
 return WPC+"/"+layer+"/query?"+q.toString();
}
async function sourceJson(url,timeout=6500){
 const u=new URL(url);if(u.origin!=="https://mapservices.weather.noaa.gov"||!u.pathname.startsWith("/vector/rest/services/precip/wpc_prob_winter_precip/MapServer/"))throw Error("NOAA source not allowlisted");
 const r=await fetch(u,{headers:{accept:"application/json", "user-agent":"ChrisIzworski-WPCGeography/1.0 (https://chrisizworski.com/lake-effect-snow/)"},signal:AbortSignal.timeout(timeout)});
 if(!r.ok)throw Error("NOAA upstream HTTP "+r.status);
 const j=await r.json();if(j?.error||!Array.isArray(j?.features))throw Error("NOAA layer query could not be verified");
 return j.features;
}
function interpretPoint(features){
 if(!Array.isArray(features))return null;
 const valid=features.map(x=>Number(x?.attributes?.dn)).filter(x=>Number.isInteger(x)&&x>=0&&x<=3);
 if(features.length&&!valid.length)return null;
 const code=valid.length?Math.max(...valid):0;
 return {...CATEGORIES[code],insidePublishedContour:code>=1,
  observed:false,geographicResolution:"WPC published probability polygon"};
}
function responseHeaders(res,ok){res.setHeader("Cache-Control",ok?"public, s-maxage=480, stale-while-revalidate=120":"no-store");res.setHeader("X-Robots-Tag","noindex, nofollow");res.setHeader("X-Content-Type-Options","nosniff")}
async function handler(req,res){
 if(req.method!=="GET"&&req.method!=="HEAD"){res.setHeader("Allow","GET, HEAD");return res.status(405).json({status:"unavailable",error:"Method not allowed"})}
 const day=Number(req.query?.day??1),threshold=Number(req.query?.threshold??4);
 if(!Number.isInteger(day)||!Number.isInteger(threshold)||!LAYERS[day]?.[threshold]){responseHeaders(res,false);return res.status(400).json({status:"unavailable",error:"Choose WPC Day 1–3 and a 4, 8 or 12 inch threshold"})}
 const mode=String(req.query?.mode||"window"),layer=LAYERS[day][threshold];
 if(!["window","point"].includes(mode)){responseHeaders(res,false);return res.status(400).json({status:"unavailable",error:"Unknown mode"})}
 let geometry=null;
 if(mode==="point"){
  const lat=Number(req.query?.lat),lon=Number(req.query?.lon);
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat<40||lat>50||lon< -96||lon> -73){responseHeaders(res,false);return res.status(400).json({status:"unavailable",error:"Select a Great Lakes map point"})}
  geometry=lon.toFixed(5)+","+lat.toFixed(5);
 }
 try{
  const [sample,point]=await Promise.all([sourceJson(requestParams(layer)),geometry?sourceJson(requestParams(layer,geometry)):Promise.resolve(null)]);
  const window=decodeWindow(sample,day,threshold);
  if(!window){responseHeaders(res,false);return res.status(503).json({status:"unavailable",error:"WPC issuance or 24-hour validity is stale or cannot be verified"})}
  const risk=geometry?interpretPoint(point):null;
  if(geometry&&!risk)throw Error("WPC probability category malformed");
  const data=geometry?{...window,point:{lat:Number(req.query.lat),lon:Number(req.query.lon)},risk}:window;
  responseHeaders(res,true);return res.status(200).json(data);
 }catch(e){responseHeaders(res,false);return res.status(503).json({status:"unavailable",error:"Official WPC geographic forecast unavailable; existing NWS hourly forecast remains usable"})}
}
handler._test={LAYERS,CATEGORIES,parseStamp,decodeWindow,interpretPoint,requestParams};
module.exports=handler;
