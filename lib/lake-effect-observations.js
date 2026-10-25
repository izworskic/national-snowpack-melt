"use strict";
const {allowed}=require("./lake-effect");
const KM=6371.0088,WINDOW_HOURS=36;
const WFO={
 "mi-keweenaw":"MQT","mi-marquette":"MQT","mi-paradise":"MQT","mi-gaylord":"APX",
 "mi-traverse":"APX","mi-grand-rapids":"GRR","mi-benton-harbor":"IWX",
 "wi-ashland":"DLH","wi-milwaukee":"MKX",
 "oh-cleveland":"CLE","oh-ashtabula":"CLE","pa-erie":"CLE",
 "ny-buffalo":"BUF","ny-tug-hill":"BUF","ny-oswego":"BUF"
};
function distance(lat1,lon1,lat2,lon2){
 const d=Math.PI/180,a=Math.sin((lat2-lat1)*d/2)**2+Math.cos(lat1*d)*Math.cos(lat2*d)*Math.sin((lon2-lon1)*d/2)**2;
 return 2*KM*Math.asin(Math.min(1,Math.sqrt(a)));
}
function url(region,now=Date.now()){
 if(!allowed[region.id]||!WFO[region.id])throw Error("Unknown observation region");
 const start=new Date(now-WINDOW_HOURS*3600000).toISOString().slice(0,19)+"Z";
 const end=new Date(now).toISOString().slice(0,19)+"Z";
 const q=new URLSearchParams({wfos:WFO[region.id],sts:start,ets:end});
 return "https://mesonet.agron.iastate.edu/geojson/lsr.geojson?"+q;
}
function interpret(feed,region,now=Date.now(),source=url(region,now)){
 if(!feed||!Array.isArray(feed.features))return {status:"unavailable",label:"Observation feed unavailable",detail:"No observation-based snowfall conclusion available.",window_hours:WINDOW_HOURS};
 const records=feed.features.map(f=>{
  const p=f?.properties||{},lat=Number(p.lat??f?.geometry?.coordinates?.[1]),lon=Number(p.lon??f?.geometry?.coordinates?.[0]);
  const valid=Date.parse(p.valid||"");
  const amount=Number(p.magf);
  if(p.typetext!=="SNOW"||!Number.isFinite(valid)||valid>now||valid<now-WINDOW_HOURS*3600000||
   !Number.isFinite(lat)||!Number.isFinite(lon)||!Number.isFinite(amount)||amount<=0||amount>150||
   !["Inch","Inches","IN"].includes(p.unit))return null;
  const km=distance(region.lat,region.lon,lat,lon);
  if(km>50)return null;
  return {time:new Date(valid).toISOString(),city:String(p.city||"Nearby report").slice(0,85),
   amount_in:Math.round(amount*10)/10,distance_km:Math.round(km),source_name:String(p.source||"Storm report").slice(0,65)};
 }).filter(Boolean).sort((a,b)=>Date.parse(b.time)-Date.parse(a.time));
 const dedup=[...new Map(records.map(x=>[x.city+"|"+x.amount_in+"|"+x.time,x])).values()].slice(0,8);
 if(!dedup.length)return {status:"unverified",label:"No recent nearby snowfall report verified",
  detail:"The storm-report feed returned no qualifying snowfall reports within 50 km during the previous 36 hours. This does not mean no snow fell.",
  reports:[],window_hours:WINDOW_HOURS,source};
 return {status:"reported_nearby",label:"Nearby snowfall reported",
   detail:"Dated storm reports confirm snow was measured within 50 km. Not a measurement at your selected point, and not proof of current snowfall or road conditions.",
   reports:dedup,window_hours:WINDOW_HOURS,source};
}
module.exports={WFO,WINDOW_HOURS,distance,url,interpret};
