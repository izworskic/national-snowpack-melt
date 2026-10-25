"use strict";
const M=require("./lake-effect");
// This daily gauge network is independent of NWS point forecasts.
// A 24h COOP report is not a UTC-valid snowband track.
const RADII=[15,30,65];
function verifyWindow(w){
 if(!w||!Array.isArray(w.gauge_reports)||!RADII.every(r=>Number.isInteger(w.positive_by_radius?.[r+"km"]))||
  typeof w.forecast_signal!=="boolean"||!Number.isInteger(w.relative_day)||
  !["reported_snow_nearby","reporting_stations_no_1in_snow","insufficient_station_coverage"].includes(w.evidence_status))
  throw Error("Malformed independent snowfall evidence");
 if(w.station_count<w.gauge_reports.length||!w.provenance?.source?.startsWith("https://mesonet.agron.iastate.edu/cgi-bin/request/daily.py"))
  throw Error("Station source or coverage missing");
 for(const x of w.gauge_reports){
  if(!M.num(x.snow_in,0,120)&&x.snow_in!==0)throw Error("Bad measured snowfall");
  if(M.num(x.km,0,65)===null)throw Error("Geographically distant report");
 }
 return true;
}
function truth(w,radius=65){
 verifyWindow(w);
 if(!RADII.includes(radius))throw Error("Uncalibrated footprint radius");
 // Insufficient network coverage must not generate a negative label.
 const positives=w.positive_by_radius[radius+"km"];
 // One dated positive station is direct evidence of nearby snowfall.
 if(positives>0)return true;
 // Claiming quiet requires several actual numeric reports, never missing rows.
 if(w.station_count<3)return null;
 // If stations within radius don't report, zero is NOT verified.
 const covered=w.gauge_reports.filter(x=>x.km<=radius).length;
 return covered>=3?false:null;
}
function empty(){return{tp:0,fp:0,fn:0,tn:0,excluded:0}}
function record(m,pred,seen){
 if(seen===null){m.excluded++;return}
 if(pred&&seen)m.tp++;
 else if(pred&&!seen)m.fp++;
 else if(!pred&&seen)m.fn++;
 else m.tn++;
}
function metrics(v){
 const div=(a,b)=>b?Math.round(a/b*1000)/1000:null;
 return {...v,evaluated:v.tp+v.fp+v.fn+v.tn,precision:div(v.tp,v.tp+v.fp),
  recall:div(v.tp,v.tp+v.fn),falseAlarmRatio:div(v.fp,v.tp+v.fp),
  csi:div(v.tp,v.tp+v.fp+v.fn)};
}
function compare(data){
 if(data?.schema!=="lake-effect-independent-station-evidence-v1"||!Array.isArray(data.events))throw Error("Unknown historical ground truth");
 const dataSites=new Set(data.events.map(x=>x.region_id));
 if(dataSites.size<7||data.events.length<14)throw Error("Missing historical geography or forecast cases");
 const holdout=new Set(["ny-oswego","pa-erie","mi-gaylord"]);
 const aggregate=()=>({baseline:empty(),wind:empty()});
 const groups={development:aggregate(),holdout:aggregate(),all:aggregate()};
 const radii=Object.fromEntries(RADII.map(r=>[r,aggregate()]));
 let knownDays=0,positiveDays=0,nohrsc=0;
 for(const c of data.events){
  if(!M.allowed[c.region_id]||c.daily_windows?.length!==3||
    !c.original_nws_source_keys?.every(x=>x.includes("/")))throw Error("Missing original dated NDFD case");
  for(const w of c.daily_windows){
   verifyWindow(w);
   if(w.nohrsc_24h?.status==="available")nohrsc++;
   const label=truth(w);if(label!==null){knownDays++;if(label)positiveDays++}
   // Original published NDFD categorical snow forecast is baseline.
   const pred=w.forecast_signal===true;
   // Stricter variant: no wind proof in COOP snapshot. It cannot be scored
   // honestly; do not infer alignment from static surface wind sectors.
   // For this benchmark, wind is a separate source-only screen sourced from
   // issued NDFD valid-hour Wx and wind grids, not a trained intervention.
   const wind=pred&&(w.wind_aligned_hours??0)>=2;
   for(const group of [groups.all,holdout.has(c.region_id)?groups.holdout:groups.development]){
    record(group.baseline,pred,label);record(group.wind,wind,label);
   }
   for(const r of RADII){
    const t=truth(w,r);
    record(radii[r].baseline,pred,t);
    record(radii[r].wind,wind,t);
   }
  }
 }
 return {schema:"lake-effect-station-verification-score-v1",
  labels:"Actual station-day snow measured >=1 inch within 65km; 3+ reporting gauges required to call regional quiet; no hourly or town-specific attribution",
  observation_coverage:{known_days:knownDays,positive_days:positiveDays,nohrsc_analyses:nohrsc},
  groups:Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,{baseline:metrics(v.baseline),wind:metrics(v.wind)}])),
  sensitivity:Object.fromEntries(Object.entries(radii).map(([k,v])=>[k+"km",{baseline:metrics(v.baseline),wind:metrics(v.wind)}])),
  decision:"Do not promote wind screen or change prediction thresholds without an independent improvement in recall and CSI on holdout sites.",
  caveat:"Samples overlap storms, reporting days are not UTC 24h forecast windows; absence of nearby reports is unknown unless >=3 stations reported within radius. Positive reports elsewhere in 65km footprint are not exact point snowfall."};
}
module.exports={RADII,verifyWindow,truth,compare};
