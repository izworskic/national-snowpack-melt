#!/usr/bin/env node
"use strict";
/* Replay production snow/wind decisions against genuine pre-event NWS NDFD Wx grids.
 * NDFD weather category -> shortForecast translation is explicitly NOT original
 * NWS /forecast/hourly point API text. Historical warnings/lake temps unavailable.
 */
const fs=require("node:fs");
const path=require("node:path");
const M=require("../lib/lake-effect");
const DATA=path.join(__dirname,"../tmp/lake-effect-nws-ndfd-history.json");
const OUTPUT=path.join(__dirname,"../tmp/lake-effect-nws-ndfd-result.json");
const HOUR=3600000;
const empty=()=>({tp:0,fp:0,fn:0,tn:0,excluded:0});
const add=(o,k)=>{o[k]++;return o};
const summary=v=>{
 const div=(a,b)=>b?Math.round(a/b*1000)/1000:null;
 return {...v,coverage:v.tp+v.fp+v.fn+v.tn,precision:div(v.tp,v.tp+v.fp),
   recall:div(v.tp,v.tp+v.fn),csi:div(v.tp,v.tp+v.fp+v.fn),
   false_alarm_ratio:div(v.fp,v.tp+v.fp)};
};
function classify(o,pred,obs){
 if(pred&&obs)add(o,"tp");else if(pred&&!obs)add(o,"fp");
 else if(!pred&&obs)add(o,"fn");else add(o,"tn");
}
function main(){
 const root=JSON.parse(fs.readFileSync(DATA,"utf8"));
 if(root.schema!=="nws-ndfd-historical-point-replay-v1"||root.cases?.length!==14)
  throw Error("Expected 14 genuine NDFD archive checkpoint snapshots");
 const ids=new Set(),scores=Object.fromEntries(["0-24h","24-48h","48-72h"].map(x=>[x,{wx:empty(),wind:empty(),amount:empty()}]));
 let snapshots=[],snapshotScores=empty();
 for(const c of root.cases){
  if(c.forecast_provenance!=="NWS_NDFD_WMO_GRIB2_5KM_RECONSTRUCTED_NOT_NWS_POINT_API_JSON"||
   !M.allowed[c.region_id]||c.source_keys?.length!==3)throw Error("Unrecognized official archive provenance");
  const unique=c.region_id+":"+c.issue_day;if(ids.has(unique))throw Error("Duplicate issue snapshot");
  ids.add(unique);
  const now=Date.parse(c.issued_cycle_utc),published=Date.parse(c.published_at_utc);
  if(!(Number.isFinite(now)&&Number.isFinite(published)&&published<=now+HOUR))
   throw Error("Source could post-date decision timestamp: "+unique);
  const hours=M.hourRows(c.periods,M.allowed[c.region_id].windSector,now);
  const assessed=M.assess({region:M.allowed[c.region_id],hours,alerts:[],
    lakeTemp:{status:"unavailable"},forecastUpdated:c.published_at_utc,now});
  const byTime=new Map(hours.map(h=>[Date.parse(h.at),h]));
  const truth=c.reference_era5_cm_by_hour||{};
  const original=JSON.stringify(c.periods);
  for(let horizon=0;horizon<3;horizon++){
   let label=["0-24h","24-48h","48-72h"][horizon],bucket=scores[label];
   for(let b=0;b<4;b++){
    const times=Array.from({length:6},(_,i)=>now+(horizon*24+b*6+i)*HOUR);
    const refs=times.map(t=>truth[new Date(t).toISOString().slice(0,19)+"Z"]);
    const rows=times.map(t=>byTime.get(t));
    if(rows.some(x=>!x||x.wind_degrees===null)||refs.some(x=>typeof x!=="number"||!Number.isFinite(x))){
     bucket.wx.excluded++;bucket.wind.excluded++;continue;
    }
    const actual=refs.reduce((a,x)=>a+x,0)>=1;
    const forecast=rows.filter(x=>x.forecast_snow).length>=2;
    const aligned=rows.filter(x=>x.forecast_snow&&x.wind_aligned).length>=2;
    classify(bucket.wx,forecast,actual);
    classify(bucket.wind,aligned,actual);
   }
   // Optional original NWS forecast snow amount is 6-hour accumulation.
   for(const s of c.snow_amount_periods||[]){
    let end=Date.parse(s.endTime);
    if(!(end>now+horizon*24*HOUR&&end<=now+(horizon+1)*24*HOUR))continue;
    const refs=Array.from({length:6},(_,i)=>truth[new Date(end-(6-i)*HOUR).toISOString().slice(0,19)+"Z"]);
    if(refs.some(x=>typeof x!=="number"||!Number.isFinite(x))){bucket.amount.excluded++;continue}
    classify(bucket.amount,s.accumulation_m>=0.01,refs.reduce((a,x)=>a+x,0)>=1);
   }
  }
  const first12=Array.from({length:12},(_,i)=>truth[new Date(now+i*HOUR).toISOString().slice(0,19)+"Z"]);
  const observed12=first12.every(x=>typeof x==="number"&&Number.isFinite(x))?
    first12.reduce((a,x)=>a+x,0)>=1:null;
  const forecast12=assessed.first_12h.snow_forecast_hours>=2;
  if(observed12===null||!assessed.data_ok)snapshotScores.excluded++;
  else classify(snapshotScores,forecast12,observed12);
  if(JSON.stringify(c.periods)!==original)throw Error("Replay mutated original archived periods");
  snapshots.push({id:unique,issue_utc:c.issued_cycle_utc,published_utc:c.published_at_utc,
   hours:hours.length,first12:assessed.first_12h,level:assessed.level,
   data_ok:assessed.data_ok,observed_first12_snow_ge_1cm:observed12,
   forecast_first12_snow_ge_2_hours:forecast12});
 }
 const result={
  schema:"nws-ndfd-actual-history-skill-v1",
  source:"Authentic 2024-25 NWS issued categorical-weather and wind WMO NDFD GRIB2",
  temporal_validation:"Original NOAA-published forecast, never ERA5 or later revision used as forecast",
  warning:"Real NWS 5km NDFD weather grid, reconstructed to NWS-style shortForecast text. NOT original API-issued /forecast/hourly JSON. Archived alerts and lake temperatures excluded. This is not warning or exact point-API verification.",
  reference:"Frozen ERA5 reanalysis snowfall at approximate site grid center, not independent gauge observations",
  scoring:"Two or more NWS hours indicating falling snow in a six-hour bin vs >=1cm ERA5 snowfall; wind overlap >=2 hours. Original NDFD six-hour snow accumulation >=1cm separately. Horizons relative to dated forecast reference cycle.",
  issue_snapshots:root.cases.length,source_files:root.sources.length,
  by_horizon:Object.fromEntries(Object.entries(scores).map(([k,v])=>[k,{forecast_weather:summary(v.wx),weather_and_wind:summary(v.wind),official_snow_amount:summary(v.amount)}])),
  first12h_production_assess:summary(snapshotScores),cases:snapshots
 };
 fs.mkdirSync(path.dirname(OUTPUT),{recursive:true});fs.writeFileSync(OUTPUT,JSON.stringify(result,null,2)+"\n");
 console.log("NDFD_HISTORICAL_REPLAY_SCORES_START");
 console.log(JSON.stringify({...result,cases:result.cases.map(x=>({id:x.id,hours:x.hours,data_ok:x.data_ok,level:x.level,observed:x.observed_first12_snow_ge_1cm}))},null,2));
 console.log("NDFD_HISTORICAL_REPLAY_SCORES_END");
 if(!Object.values(scores).some(x=>x.wx.tp+x.wx.fp+x.wx.fn+x.wx.tn>0))throw Error("No verified historical forecast-versus-reference matches");
}
try{main()}catch(e){console.error("NDFD_HISTORY_VALIDATION_FAILED",e.stack);process.exitCode=1}
