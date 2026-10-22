"use strict";
/** Official GIS context: WPC WSSI is a potential impact layer, never an NWS warning;
 * NIC point ice class is ONE over-water checkpoint, never lakewide percent cover. */
const ROOT="https://mapservices.weather.noaa.gov/vector/rest/services";
const WSSI=ROOT+"/outlooks/wpc_wssi/MapServer/4";
const ICE=ROOT+"/obs/usnic_greatlakes_ice_chart/MapServer/0";
const HOUR=3600000;
const SITES=Object.freeze({
 Superior:{lat:47.4,lon:-87.2},Michigan:{lat:44,lon:-86},Huron:{lat:45,lon:-82.5},
 Erie:{lat:42,lon:-80.5},Ontario:{lat:43.6,lon:-77.5}
});
function queryUrl(base,lat,lon,fields) {
 const point=encodeURIComponent(lon+","+lat);
 return base+"/query?geometry="+point+"&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields="+encodeURIComponent(fields)+"&returnGeometry=false&f=json";
}
function iceUrl(lake) {
 const site=SITES[lake];return site?queryUrl(ICE,site.lat,site.lon,"ct,idp_filedate,idp_ingestdate"):null;
}
function wssiUrl(lat,lon){return queryUrl(WSSI,lat,lon,"impact,issue_time,start_time,end_time,valid_time,idp_filedate")}
function iso(value) {
 const ms=typeof value==="number" ? value:Date.parse(String(value||""));
 return Number.isFinite(ms)?new Date(ms).toISOString():null;
}
const categories={
 "00":"ice-free water","55":"ice-free water","01":"trace ice (<1/10)",
 "10":"1/10–3/10 ice","12":"1/10–3/10 ice","13":"1/10–3/10 ice","20":"1/10–3/10 ice","23":"1/10–3/10 ice","24":"1/10–3/10 ice","30":"1/10–3/10 ice",
 "34":"4/10–6/10 ice","35":"4/10–6/10 ice","40":"4/10–6/10 ice","45":"4/10–6/10 ice","46":"4/10–6/10 ice","50":"4/10–6/10 ice","56":"4/10–6/10 ice","57":"4/10–6/10 ice","60":"4/10–6/10 ice","67":"4/10–6/10 ice",
 "68":"7/10–8/10 ice","70":"7/10–8/10 ice","78":"7/10–8/10 ice","79":"7/10–8/10 ice","80":"7/10–8/10 ice",
 "81":"9/10–10/10 ice","89":"9/10–10/10 ice","90":"9/10–10/10 ice","91":"9/10–10/10 ice",
 "92":"fast ice","99":"undetermined"
};
const errors=status=>({status,reason:status==="unavailable"?"No verified GIS analysis for this reference point":"Dated GIS analysis is stale"});
function iceAtPoint(payload,lake,now=Date.now()){
 const site=SITES[lake];
 if(!site||!payload||payload.error||!Array.isArray(payload.features))return errors("unavailable");
 // No polygon on a point does NOT mean 0% ice.
 const features=payload.features.map(x=>x?.attributes||{}).filter(x=>typeof x.ct==="string");
 if(!features.length)return {...errors("unavailable"),scope:"single reference water point",reference_point:site};
 features.sort((a,b)=>Number(b.idp_filedate||0)-Number(a.idp_filedate||0));
 const row=features[0],date=iso(row.idp_filedate),label=categories[row.ct];
 if(!label||label==="undetermined"||!date)return {...errors("unavailable"),scope:"single reference water point",reference_point:site};
 const age=now-Date.parse(date);
 if(age< -HOUR || age>72*HOUR)return {status:"stale",date,category:label,code:row.ct,scope:"single reference water point",reference_point:site,
  reason:"Chart is older than 72 hours (or dated in the future); not evidence of current open water"};
 return {status:"available",date,category:label,code:row.ct,scope:"single reference water point",reference_point:site,
  reason:"A single over-water sample cannot establish ice coverage elsewhere on the lake"};
}
const IMPACTS={"WINTER WEATHER AREA":0,MINOR:1,MODERATE:2,MAJOR:3,EXTREME:4};
function wssiAtPoint(payload,now=Date.now()){
 if(!payload||payload.error||!Array.isArray(payload.features))return errors("unavailable");
 if(!payload.features.length)return {status:"not-depicted",impact:null,
  reason:"No polygon returned at this point; this is not a zero-risk assertion or evidence the product is up to date"};
 let candidates=[];
 for(const f of payload.features){
  const a=f?.attributes||{},impact=String(a.impact||"").trim().toUpperCase();
  const issue=iso(a.issue_time||a.idp_filedate),start=iso(a.start_time),end=iso(a.end_time);
  if(!Object.hasOwn(IMPACTS,impact)||!issue||!start||!end)continue;
  const validIssue=Date.parse(issue)<=now+HOUR&&now-Date.parse(issue)<=12*HOUR;
  const overlaps=Date.parse(end)>=now-HOUR&&Date.parse(start)<=now+72*HOUR;
  if(validIssue&&overlaps)candidates.push({impact,issue_time:issue,start_time:start,end_time:end,rank:IMPACTS[impact]});
 }
 if(!candidates.length)return {status:"stale",impact:null,reason:"Overlapping polygon has no sufficiently recent, valid WSSI issue/period"};
 candidates.sort((a,b)=>b.rank-a.rank);
 const best=candidates[0];
 return {status:"available",impact:best.impact,issue_time:best.issue_time,start_time:best.start_time,end_time:best.end_time,
  scope:"WPC WSSI point intersection; days 1–3",
  reason:"Potential winter storm impact; NOT an official warning and NOT specifically a lake-effect forecast"};
}
module.exports={WSSI,ICE,SITES,iceUrl,wssiUrl,iceAtPoint,wssiAtPoint};
