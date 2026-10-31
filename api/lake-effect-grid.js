"use strict";
/* EXPERIENCE_OS_V1: verified NOAA/NDFD gridded forecast frame inventory.
 * WMS GetMap silently defaults when VTIT is not available. Every valid-time /
 * issuance pair MUST first be witnessed by NOAA's own issuance-time API. */
const H=3600000,SIX=6*H,MAX_LEAD=72*H;
const BASE="https://digital.weather.gov";
const ELEMENTS=Object.freeze({
 snowamt:{label:"Six-hour new snowfall",periodHours:6,periodType:"accumulation",unit:"inches",description:"NWS/NDFD expected new snowfall accumulated during the six hours ending at the map time."},
 winddir:{label:"Surface wind direction",periodHours:0,periodType:"instantaneous",unit:"degrees",description:"NWS/NDFD surface wind direction forecast valid at the selected hour, not a measured wind observation."},
 windspd:{label:"Surface wind speed",periodHours:0,periodType:"instantaneous",unit:"knots",description:"NWS/NDFD surface wind speed valid at the selected hour. One knot is approximately 1.15 mph."},
 t:{label:"Air temperature",periodHours:0,periodType:"instantaneous",unit:"°F",description:"NWS/NDFD two-meter air temperature forecast valid at the selected hour."}
});
const exactMinute=s=>typeof s==="string"&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)&&new Date(s+":00Z").toISOString().slice(0,16)===s;
const utcMillis=s=>exactMinute(s)?Date.parse(s+":00Z"):NaN;
const minute=ms=>new Date(ms).toISOString().slice(0,16);
function candidateTimes(now){
 const start=Math.ceil(now/SIX)*SIX,limit=now+MAX_LEAD,arr=[];
 for(let time=start;time<=limit&&arr.length<=13;time+=SIX)arr.push(minute(time));
 return arr;
}
function checkIssuance(response,valid,now=Date.now()){
 if(!exactMinute(valid)||!Array.isArray(response)||response.length===0||response.length>600)return null;
 const vt=utcMillis(valid);
 if(!Number.isFinite(vt)||vt<now-15*60000||vt>now+MAX_LEAD+60000||vt%(SIX)!==0)return null;
 const available=response.filter(exactMinute).map(utcMillis).filter(t=>t<=now+15*60000&&t>=now-12*H&&t<=vt);
 if(!available.length)return null;
 const issued=Math.max(...available);
 return {validAt:new Date(vt).toISOString(),issuedAt:new Date(issued).toISOString(),
  vTIT:minute(vt)+"_"+minute(issued)};
}
async function fetchIssuances(element,vt,ms=6800){
 if(!ELEMENTS[element]||!exactMinute(vt))throw Error("Unapproved NOAA element/time");
 const u=new URL(BASE+"/scripts/get_issuancetimes.php");
 u.searchParams.set("grid","ndfd");u.searchParams.set("elmt",element);
 u.searchParams.set("region","conus");u.searchParams.set("vt",vt);
 if(u.hostname!=="digital.weather.gov")throw Error("Unapproved host");
 const r=await fetch(u,{headers:{accept:"application/json,text/plain;q=0.9", "user-agent":"ChrisIzworski-LakeEffectGrid/1.0 (https://chrisizworski.com/lake-effect-snow/)"},signal:AbortSignal.timeout(ms)});
 if(!r.ok)throw Error("NOAA issuance HTTP "+r.status);
 const content=await r.text();
 if(content.length>24000)throw Error("NOAA issuance oversized");
 let decoded;
 try{decoded=JSON.parse(content)}catch{throw Error("Invalid NOAA issuance response")}
 if(!Array.isArray(decoded))throw Error("Malformed NOAA issue list");
 return decoded;
}
async function inventory(element,now=Date.now(),lookup=fetchIssuances){
 if(!ELEMENTS[element])throw Error("Unknown forecast layer");
 const slots=candidateTimes(now),frames=Array(slots.length).fill(null);
 let cursor=0,unavailable=0;
 async function worker(){
  while(cursor<slots.length){const i=cursor++,vt=slots[i];
   try{
    const issues=await lookup(element,vt);
    const frame=checkIssuance(issues,vt,now);
    if(frame){frames[i]={...frame,periodStart:ELEMENTS[element].periodHours?new Date(Date.parse(frame.validAt)-SIX).toISOString():null}}
    else unavailable++;
   }catch{unavailable++}
  }
 }
 await Promise.all(Array.from({length:Math.min(5,slots.length)},()=>worker()));
 const available=frames.filter(Boolean);
 if(!available.length)return null;
 return {status:"verified",element,label:ELEMENTS[element].label,
  validPeriodHours:ELEMENTS[element].periodHours,periodType:ELEMENTS[element].periodType,
  unit:ELEMENTS[element].unit,description:ELEMENTS[element].description,
  frames:available,checkedSlots:slots.length,unavailableSlots:unavailable,
  retrievedAt:new Date(now).toISOString(),geography:"CONUS · Great Lakes focus",
  source:{name:"NOAA/NWS National Digital Forecast Database (NDFD)",agency:"National Weather Service",
   documentation:"https://digital.weather.gov/staticpages/mapservices.php",
   metadata:"https://www.weather.gov/gis/NDFD_metadata.html",
   issuanceEndpoint:BASE+"/scripts/get_issuancetimes.php",
   wms:BASE+"/ndfd.conus/wms"},
  warning:element==="snowamt"?
   "Each map frame is the official forecast of six-hour new snow ending at the labeled UTC-valid time. It is NOT a predicted moving lake-effect band, current snowfall observation, road condition or local guarantee.":
   "This is an NWS forecast snapshot at its published valid time. It is not a snowfall forecast, observed wind, radar or road-condition report."};
}
function headers(res,good){res.setHeader("Cache-Control",good?"public, s-maxage=240, stale-while-revalidate=120":"no-store");res.setHeader("X-Robots-Tag","noindex, nofollow");res.setHeader("X-Content-Type-Options","nosniff")}
async function handler(req,res){
 if(req.method!=="GET"&&req.method!=="HEAD"){res.setHeader("Allow","GET, HEAD");headers(res,false);return res.status(405).json({status:"unavailable",error:"Method not allowed"})}
 const element=String(req.query?.element||"snowamt");
 if(!ELEMENTS[element]){headers(res,false);return res.status(400).json({status:"unavailable",error:"Unrecognized NOAA forecast variable"})}
 try{
  const d=await inventory(element);
  if(!d){headers(res,false);return res.status(503).json({status:"unavailable",error:"No recently issued exact NOAA gridded forecast frames could be verified"})}
  headers(res,true);return res.status(200).json(d);
 }catch{headers(res,false);return res.status(503).json({status:"unavailable",error:"Official NDFD timing source unavailable; existing NWS and WPC forecasts remain independent"})}
}
handler._test={ELEMENTS,candidateTimes,checkIssuance,inventory,exactMinute,minute,utcMillis};
module.exports=handler;
