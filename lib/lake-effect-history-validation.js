"use strict";
/* Historical forecast skill is NOT the same as this product's NWS hourly forecast skill.
 * Scores here use frozen GFS fixed-lead model outputs vs ERA5 ANALYSIS, and are tagged
 * MODEL_PROXY_ONLY. Missing measurements are excluded, never converted to zeros.
 */
const {allowed,sectorContains}=require("./lake-effect");
const FIELDS=["valid_at","snowfall_previous_day1","snowfall_previous_day2","snowfall_previous_day3","wind_direction_10m_previous_day1","wind_direction_10m_previous_day2","wind_direction_10m_previous_day3","era5_snowfall_cm"];
const HOUR=3600000;
const finite=(n,a,b)=>typeof n==="number"&&Number.isFinite(n)&&n>=a&&n<=b;
function verifyFixture(doc){
 if(doc?.schema!=="lake-effect-model-proxy-v1"||!allowed[doc.region_id])throw Error("Unknown historical region/schema");
 if(JSON.stringify(doc.fields)!==JSON.stringify(FIELDS))throw Error("Historical columns changed");
 if(!doc.forecast_url?.startsWith("https://previous-runs-api.open-meteo.com/")||
    !doc.reference_url?.startsWith("https://archive-api.open-meteo.com/")||
    !doc.lead_semantics?.includes("NOT from one common forecast issuance"))throw Error("Forecast provenance/lead-time semantics missing");
 if(!Array.isArray(doc.rows)||doc.rows.length<24)throw Error("Missing historical timeline");
 let prev=NaN,valid=0;
 for(const row of doc.rows){
  if(!Array.isArray(row)||row.length!==FIELDS.length||typeof row[0]!=="string"||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:00$/.test(row[0]))throw Error("Bad historical row");
  const t=Date.parse(row[0]+"Z");
  if(!Number.isFinite(t)||(Number.isFinite(prev)&&t-prev!==HOUR))throw Error("Missing/duplicate/out-of-order UTC hour");
  prev=t;
  for(const index of [1,2,3,7])if(row[index]!==null&&!finite(row[index],0,300))throw Error("Invalid historical snowfall");
  for(const index of [4,5,6])if(row[index]!==null&&!finite(row[index],0,360))throw Error("Invalid historical wind");
  if(row.slice(1).every(x=>x!==null))valid++;
 }
 return {region_id:doc.region_id,hours:doc.rows.length,complete_hours:valid};
}
function empty(){return {tp:0,fp:0,fn:0,tn:0,excluded:0}}
function groupScore(doc,lead,requireWind){
 verifyFixture(doc);
 if(![1,2,3].includes(lead))throw Error("Lead must be one, two or three days");
 const out=empty(),sector=allowed[doc.region_id].windSector;
 for(let i=0;i<doc.rows.length;i+=6){
  const group=doc.rows.slice(i,i+6);
  if(group.length!==6||group.some(row=>!finite(row[lead],0,300)||!finite(row[3+lead],0,360)||!finite(row[7],0,300))){
   out.excluded++;continue;
  }
  // Both fields are six-hour point-grid sums, never station storm totals.
  const prediction=group.reduce((sum,row)=>sum+row[lead],0)>=1;
  const reference=group.reduce((sum,row)=>sum+row[7],0)>=1;
  // A separate heuristic diagnostic; NEVER label wind alignment as an official NWS lake-effect forecast.
  const aligned=group.filter(row=>sectorContains(row[3+lead],sector)===true).length>=3;
  const flag=prediction&&(!requireWind||aligned);
  if(flag&&reference)out.tp++;
  else if(flag&&!reference)out.fp++;
  else if(!flag&&reference)out.fn++;
  else out.tn++;
 }
 return out;
}
function combine(groups){return groups.reduce((out,v)=>{for(const k of Object.keys(out))out[k]+=v[k];return out},empty())}
function metrics(v){
 const frac=(a,b)=>b===0?null:Math.round(a/b*1000)/1000;
 return {...v,blocks:v.tp+v.fp+v.fn+v.tn,
  eventRate:frac(v.tp+v.fn,v.tp+v.fp+v.fn+v.tn),
  precision:frac(v.tp,v.tp+v.fp),recall:frac(v.tp,v.tp+v.fn),
  falseAlarmRatio:frac(v.fp,v.tp+v.fp),
  csi:frac(v.tp,v.tp+v.fp+v.fn),
  accuracy:frac(v.tp+v.tn,v.tp+v.fp+v.fn+v.tn)};
}
function evaluate(docs){
 const ids=new Set(),cases=[];
 for(const doc of docs){
  verifyFixture(doc);
  if(ids.has(doc.region_id))throw Error("Same checkpoint twice");
  ids.add(doc.region_id);
  cases.push(doc);
 }
 const leadScores=[1,2,3].map(lead=>{
  const snow=metrics(combine(cases.map(d=>groupScore(d,lead,false))));
  const aligned=metrics(combine(cases.map(d=>groupScore(d,lead,true))));
  return {lead_hours:lead*24,snow_forecast:snow,snow_and_surface_wind:aligned,
   wind_screen_csi_difference:Math.round((aligned.csi-snow.csi)*1000)/1000};
 });
 return {schema:"lake-effect-history-validation-v1",scope:"MODEL_PROXY_ONLY",production_engine_skill:"NOT_VERIFIED",
  validation_reference:"ERA5 gridded snowfall REANALYSIS, not observed station snow or lake-effect attribution",
  method:"Historical GFS fixed-lead forecast 24/48/72h vs ERA5 grid reference; event-enriched selected windows, six-hour bins, 1cm/6h occurrence threshold, surface wind >=3 of 6 aligned hours.",
  warning:"Previous-day products are not synchronized runs or NWS hourly point forecasts. No probability calibration, exact-band accuracy, warning timing, NWS forecast skill or user-travel verification may be claimed.",
  cases:cases.map(d=>({region_id:d.region_id,window:[d.window_start,d.window_end],hours:d.rows.length})),
  total_hours:cases.reduce((a,d)=>a+d.rows.length,0),scores:leadScores};
}
function requireProductionInputs(files){
 // Deliberately fail closed: proxy forecasts + archived discussions cannot validate
 // the NWS forecastHourly based decision engine. An exact issue-time snapshot is needed.
 if(!Array.isArray(files)||!files.length||files.some(x=>x?.source_kind!=="NWS_FORECAST_HOURLY_ISSUED_SNAPSHOT"||
   !Number.isFinite(Date.parse(x.issued_at||""))||!Number.isFinite(Date.parse(x.valid_at||""))||
   Date.parse(x.issued_at)>=Date.parse(x.valid_at)||!Array.isArray(x.periods)||x.periods.length<6)){
  throw Error("Production skill UNVERIFIED: archived issue-time NWS forecastHourly snapshots missing");
 }
 return true;
}
module.exports={FIELDS,verifyFixture,groupScore,metrics,evaluate,requireProductionInputs};
