#!/usr/bin/env node
"use strict";
/* Deterministic offline archive benchmark. No HTTP calls or production model changes. */
const fs=require("node:fs"),path=require("node:path");
const H=require("../lib/lake-effect-history-validation");
const ROOT=path.join(__dirname,"../tests/fixtures/lake-effect-history");
const IDS=["buf-2025-11","oswego-2025-11","cle-2025-01","erie-2025-01",
 "marquette-2025-11","gaylord-2025-12","milwaukee-2025-11"];
const LSR=["ny-2025-11","oh-pa-2025-01","mi-2025-11","mi-2025-12","wi-2025-11"];
const load=name=>JSON.parse(fs.readFileSync(path.join(ROOT,name+".json"),"utf8"));
function main(){
 const archives=IDS.map(load),out=H.evaluate(archives);
 if(out.total_hours!==1272||out.cases.length!==7||out.scores.some(x=>x.snow_forecast.blocks!==212||x.snow_and_surface_wind.blocks!==212))
  throw Error("Coverage regression in frozen historical inputs");
 const discussions=load("nws-issued-discussions");
 if(discussions.schema!=="nws-discussion-historical-context-v1"||discussions.discussions.length!==5)
  throw Error("Original NWS issuance evidence unavailable");
 for(const d of discussions.discussions){
  if(!d.source.startsWith("https://mesonet.agron.iastate.edu/cgi-bin/afos/retrieve.py")||
    !Number.isFinite(Date.parse(d.issued_at_utc))||!d.nws_wmo_header||
    !d.nws_issued_text_excerpt||!d.classification.includes("not the NWS forecastHourly"))
   throw Error("Invalid issued NWS source provenance");
 }
 const stormReports=LSR.map(id=>load("lsr-"+id));
 for(const entry of stormReports){
  if(entry.schema!=="lake-effect-independent-storm-reports-v1"||
     !(entry.source||entry.source_urls)?.length||!entry.reports.length||
     entry.reports.some(r=>!Number.isFinite(Date.parse(r.valid_at))||!Number.isFinite(r.inches)||r.inches<=0))
   throw Error("Invalid IEM independent snow report");
 }
 out.context={
  issued_nws_forecast_discussions:discussions.discussions.length,
  independent_lsr_report_records:stormReports.reduce((a,x)=>a+x.reports.length,0),
  station_snow_reports_used_as_negative_truth:false,
  discussions_used_as_hourly_forecast_inputs:false,
  storm_report_magnitudes_used_as_hourly_snowfall:false,
  warning_footprint_verified:false,
  radar_historical_track_verified:false
 };
 out.release_assessment={
  historical_fixed_lead_model_skill:"MEASURED_AGAINST_REANALYSIS",
  exact_nws_hourly_engine_skill:"NOT_VERIFIED",
  interpretation:"The surface wind exposure screen does not demonstrate incremental snow occurrence skill in this sample; never promote wind/GFS context into a snow event."
 };
 if(process.argv.includes("--strict-production"))H.requireProductionInputs([]);
 console.log(JSON.stringify(out,null,2));
 if(process.argv.includes("--check")&&out.scores.some(x=>x.wind_screen_csi_difference===null))
  throw Error("Missing lead-time CSI comparison");
}
try{main()}catch(e){console.error("HISTORICAL_VALIDATION_FAILED:",e.message);process.exitCode=1}
