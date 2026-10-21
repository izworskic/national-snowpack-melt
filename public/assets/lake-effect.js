/* Great Lakes lake-effect reader: no client-side snow probabilities or band maps. */
(function(){
"use strict";
const ENDPOINT="https://national-snowpack-melt.vercel.app/api/lake-effect";
const $=id=>document.getElementById(id);
const regions=[];let current=null,requestId=0;
const STATES={MI:"Michigan",WI:"Wisconsin",OH:"Ohio",PA:"Pennsylvania",NY:"New York"};
const formatTime=iso=>{const d=new Date(iso);return Number.isNaN(+d)?"Unknown time":new Intl.DateTimeFormat(undefined,{weekday:"short",hour:"numeric",hour12:true}).format(d)};
const formatDate=iso=>{const d=new Date(iso);return Number.isNaN(+d)?"unknown":new Intl.DateTimeFormat(undefined,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}).format(d)};
const label=(value,fallback="Not available")=>value===null||value===undefined||value===""?fallback:String(value);
function text(id,value){$(id).textContent=value}
function status(message,error=false){$("status").textContent=message;$("status").setAttribute("role",error?"alert":"status")}
function clear(id){$(id).replaceChildren()}
function child(tag,content,cls){const e=document.createElement(tag);if(cls)e.className=cls;if(content!=null)e.textContent=content;return e}
function link(textContent,url){
 const a=child("a",textContent);
 try{const u=new URL(url);if(u.protocol==="https:"&&["www.weather.gov","api.weather.gov"].includes(u.hostname)){a.href=u.href;a.target="_blank";a.rel="noopener"}}catch{}
 return a;
}
function options(){
 const regionList=regions.filter(r=>r.state===$("state").value);
 clear("region");regionList.forEach(r=>{const o=document.createElement("option");o.value=r.id;o.textContent=r.name;$("region").appendChild(o)});
}
function hours(hs){
 clear("hours");
 if(!hs.length){$("hours").appendChild(child("p","Hourly forecast unavailable."));return}
 hs.forEach(h=>{
  const item=child("div",null,"hour"+(h.evidence==="snow-and-alignment"?" match":h.evidence==="official-snow-forecast"?" snow":h.evidence==="wind-only"?" wind":""));
  const title=formatTime(h.at);
  item.appendChild(child("em",title));
  item.appendChild(child("strong",h.temperature_f==null?"—":h.temperature_f+"°F"));
  item.appendChild(child("p","Wind: "+label(h.wind_from,"?")+" "+(h.wind_mph==null?"":h.wind_mph+" mph")));
  item.appendChild(child("p",h.forecast_snow?"NWS: snow":h.wind_aligned?"Wind favorable":"No overlap"));
  item.title=title+" · "+label(h.short_forecast)+" · wind "+label(h.wind_from);
  $("hours").appendChild(item);
 });
}
function render(d){
 const v=d.verdict||{},region=d.region||{};
 text("headline",label(v.headline));text("impact",label(v.impact));
 text("confidence",label(v.confidence).toUpperCase());
 text("matched",label(v.first_12h?.overlap_hours,"0")+" / "+label(v.first_12h?.valid_hours,"0"));
 text("alert-count",d.alerts_status==="available"?String(d.alerts?.length||0):"Unknown");
 text("alert-status",d.alerts_status==="available"?"Active regional point alerts":"Alert source unavailable");
 text("method",(region.description||region.name)+". Confidence is qualitative evidence agreement, not a probability or a forecast of exact band placement.");
 clear("alerts");
 if(d.alerts_status!=="available"){
  $("alerts").appendChild(child("p","Official alert feed unavailable. Verify with weather.gov before travel.")); 
 }else if(!d.alerts?.length){$("alerts").appendChild(child("p","No active winter alerts returned for this representative point. Other nearby counties can still be affected."))}
 else d.alerts.forEach(a=>{const article=child("article",null,"alert");article.appendChild(child("strong",a.event));article.appendChild(child("p",label(a.headline)));article.appendChild(child("p",a.lakeEffect?"Alert specifically mentions lake effect.":"Winter alert; lake-effect origin not established."));article.appendChild(link("Read the NWS alert",a.url));$("alerts").appendChild(article)});
 const t=d.lake_temperature||{};
 text("lake-name","Lake "+label(region.lake));
 text("lake-reading",t.status==="available"?"NOAA lakewide average: "+t.fahrenheit+"°F ("+t.celsius+"°C)":t.status==="stale"?"Last NOAA lake reading is stale.": "Current lake temperature is unavailable.");
 text("lake-note",t.date?"GLSEA analysis dated "+formatDate(t.date)+". Lakewide, satellite-derived; not a shoreline thermometer or instability measurement.":"NOAA lakewide analysis could not be verified. No temperature value was substituted.");
 text("source-age","NWS hourly forecast updated: "+formatDate(d.forecast_updated)+". Data retrieved: "+formatDate(d.generated_at)+".");
 text("limitations",(d.limitations||[]).join(" "));
 const f=$("forecast-link"),a=$("alert-link");
 f.href=d.sources?.nws_hourly&&d.sources.nws_hourly.startsWith("https://api.weather.gov/")?d.sources.nws_hourly:"https://www.weather.gov/";
 a.href=d.sources?.nws_alerts&&d.sources.nws_alerts.startsWith("https://api.weather.gov/")?d.sources.nws_alerts:"https://www.weather.gov/";
 hours(d.hours||[]);
 $("dashboard").hidden=false;
}
async function selectRegion(id){
 const r=regions.find(r=>r.id===id);if(!r)return;
 $("state").value=r.state;options();$("region").value=id;
 const seq=++requestId;$("dashboard").hidden=true;
 status("Checking NWS forecast and NOAA lake observations for "+r.name+"…");
 try{
  const res=await fetch(ENDPOINT+"?region="+encodeURIComponent(id),{headers:{accept:"application/json"}});
  if(!res.ok)throw Error("A fresh forecast cannot be confirmed right now.");
  const data=await res.json();if(seq!==requestId)return;
  if(data.status!=="ok")throw Error("Current conditions not verified");
  render(data);
  status("Using NWS forecast for "+r.name+". This is a regional signal, not a band track.");
  const u=new URL(location.href);u.searchParams.set("region",id);history.replaceState(null,"",u);
 }catch(err){if(seq!==requestId)return;$("dashboard").hidden=true;status("Forecast unavailable: "+label(err.message)+ " Check your NWS forecast before travel.",true)}
}
function miles(a,b,c,d){
 const r=Math.PI/180,x=(c-a)*r,y=(d-b)*r,q=Math.sin(x/2)**2+Math.cos(a*r)*Math.cos(c*r)*Math.sin(y/2)**2;
 return 3958.7613*2*Math.asin(Math.min(1,Math.sqrt(q)));
}
async function nearest(){
 if(!navigator.geolocation){status("Device location is not available in this browser.",true);return}
 status("Requesting device location locally…");
 navigator.geolocation.getCurrentPosition(p=>{
  const sorted=regions.map(r=>({r,d:miles(p.coords.latitude,p.coords.longitude,r.lat,r.lon)})).sort((a,b)=>a.d-b.d);
  if(!sorted.length||sorted[0].d>200){status("No represented Great Lakes snowbelt is within 200 miles. Select a region manually.");return}
  selectRegion(sorted[0].r.id);
 },()=>status("Location was denied or unavailable. You can select a region manually.",true),{enableHighAccuracy:false,timeout:9000,maximumAge:600000});
}
async function init(){
 $("check").addEventListener("click",()=>selectRegion($("region").value));
 $("state").addEventListener("change",options);
 $("locate").addEventListener("click",nearest);
 try{
  const response=await fetch(ENDPOINT+"?list=1");
  if(!response.ok)throw Error("Region list unavailable");
  const data=await response.json();
  for(const r of data.regions||[])if(STATES[r.state]&&typeof r.id==="string")regions.push(r);
  if(!regions.length)throw Error("No configured regions");
  const requested=new URL(location.href).searchParams.get("region");
  const selected=regions.find(r=>r.id===requested)||regions.find(r=>r.id==="mi-gaylord")||regions[0];
  await selectRegion(selected.id);
 }catch(e){status("Could not load the regional catalog. "+label(e.message),true)}
}
document.addEventListener("DOMContentLoaded",init);
})();
