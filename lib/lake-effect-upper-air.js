"use strict";
// Fail-closed reader of independently refreshed, verified NOAA GFS pressure levels.
// JSON is produced by GitHub Actions using NOAA NOMADS GRIB filter + ecCodes.
const RELEASE="https://github.com/izworskic/national-snowpack-melt/releases/download/lake-effect-gfs/upper-air.json";
const LAKES=new Set(["Superior","Michigan","Huron","Erie","Ontario"]);
const HOUR=3600000;
const n=(x,a,b)=>typeof x==="number"&&Number.isFinite(x)&&x>=a&&x<=b?x:null;
const time=s=>typeof s==="string"&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(s)?Date.parse(s):NaN;
const rounded=x=>Math.round(x*10)/10;
function decode(document,lake,lakeTemperature,now=Date.now()){
 const missing=(reason)=>({status:"unavailable",reason,source:RELEASE,scope:"GFS offshore lake reference point"});
 if(!LAKES.has(lake)||!document||document.schema!=="lake-effect-upper-air-v1"||document.model!=="NCEP GFS 0.25 degree")return missing("Unverified model format");
 const issued=time(document.issued_at),made=time(document.generated_at);
 if(!Number.isFinite(issued)||!Number.isFinite(made)||issued>now+HOUR||now-issued>18*HOUR||made>now+HOUR||made<issued||now-made>18*HOUR)
  return {status:"stale",reason:"Model cycle is outside the verified 18-hour freshness window",issued_at:document.issued_at,source:RELEASE};
 if(!Array.isArray(document.samples)||document.samples.length<5||document.samples.length>30)return missing("No complete GFS forecast series");
 const samples=[];const times=new Set();
 for(const s of document.samples){
  const valid=time(s?.valid_at),d=s?.lakes?.[lake];
  if(!Number.isFinite(valid)||valid<issued||valid>issued+84*HOUR||times.has(valid)||!d)return missing("Invalid or duplicate GFS forecast valid time");
  times.add(valid);
  const temp=n(d.temp_850_c,-90,45),d850=n(d.wind_850_from_deg,0,360),d925=n(d.wind_925_from_deg,0,360);
  const s850=n(d.wind_850_mps,0,100),s925=n(d.wind_925_mps,0,100),shear=n(d.directional_shear_925_850_deg,0,180);
  const lat=n(d.sample_lat,40,49),lon=n(d.sample_lon,-94,-75);
  if([temp,d850,d925,s850,s925,shear,lat,lon].some(x=>x===null))return missing("Missing or out-of-range GFS pressure-level fields");
  const expected=Math.abs(((d925-d850+540)%360)-180);
  if(Math.abs(expected-shear)>0.25)return missing("Directional shear inconsistent with model winds");
  const tempC=n(lakeTemperature?.celsius,-2,36);
  const delta=lakeTemperature?.status==="available"&&tempC!==null?rounded(tempC-temp):null;
  samples.push({valid_at:s.valid_at,temp_850_c:temp,wind_850_from_deg:d850,
   wind_850_mps:s850,wind_925_from_deg:d925,wind_925_mps:s925,
   shear_925_850_deg:shear,delta_t_c:delta,
   instability_screen:delta===null?"unavailable":delta>=13?"favorable-contrast":delta>=8?"marginal-contrast":"limited-contrast",
   shear_screen:shear<=30?"modest-turning":shear<=60?"moderate-turning":"strong-turning"});
 }
 samples.sort((a,b)=>a.valid_at.localeCompare(b.valid_at));
 const near=samples.find(s=>{const t=time(s.valid_at);return t>=now-HOUR&&t<=now+12*HOUR;});
 if(!near)return {status:"stale",reason:"No nearby valid GFS pressure-level forecast for the current 12-hour window",issued_at:document.issued_at,source:RELEASE};
 return {status:"available",model:"NCEP GFS 0.25 degree",issued_at:document.issued_at,generated_at:document.generated_at,
  source:RELEASE,scope:"one representative offshore GFS grid point for Lake "+lake,
  lake_temperature_date:lakeTemperature?.date||null,
  current:near,forecast:samples.filter(s=>time(s.valid_at)>=now-HOUR&&time(s.valid_at)<=now+72*HOUR),
  limitations:"Model 850/925-mb air is sampled offshore at one coarse grid point; NOAA GLSEA temperature is a dated lakewide average. 13°C is a screening guideline, not a snow forecast. 925-to-850-mb turning is not a full vertical-shear profile, and neither measure locates a snowband."};
}
function fetchUpperAir(fetcher=fetch,timeout=4000){
 return fetcher(RELEASE,{headers:{"accept":"application/json","user-agent":"ChrisIzworskiLakeEffect/2.0"},signal:AbortSignal.timeout(timeout)})
 .then(async res=>{if(!res.ok)throw Error("Model data release unavailable");const bytes=await res.text();if(bytes.length>90000)throw Error("Model JSON exceeds size limit");return JSON.parse(bytes)});
}
module.exports={RELEASE,decode,fetchUpperAir};
