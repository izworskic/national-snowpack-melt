/* Great Lakes lake-effect reader: no client-side snow probabilities or band maps. */
(function(){
"use strict";
const ENDPOINT="/api/lake-effect";
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
  item.appendChild(child("p","Wind: "+label(h.wind_from,"?")+" "+(h.wind_speed_text||"")));
  item.appendChild(child("p",h.forecast_snow?"NWS: snow":h.wind_aligned?"Wind favorable":"No overlap"));
  item.title=title+" · "+label(h.short_forecast)+" · wind "+label(h.wind_from);
  $("hours").appendChild(item);
 });
}
function renderTruthLayers(d){
 const v=d.verdict||{},obs=d.observed_snowfall||{status:"unavailable",detail:"Observation feed unavailable."};
 let strip=$("snow-evidence-layers");
 if(!strip){
  const css=document.createElement("style");
  css.textContent=".snow-evidence-layers{border:1px solid #cbdde4;border-radius:11px;padding:15px;background:#f7fafb;margin:17px 0}.snow-evidence-layers h3{font:600 1rem/1.3 system-ui;margin:0 0 9px;color:#15465a}.snow-evidence-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.snow-evidence-item{border:1px solid #d0e1e5;border-radius:8px;background:#fff;padding:12px;min-width:0}.snow-evidence-item small{display:block;font-size:.77rem;line-height:1.4;color:#536975}.snow-evidence-item strong{display:block;font-size:1rem;line-height:1.35;margin:6px 0;color:#214456}.snow-evidence-note{font-size:.8rem;line-height:1.5;margin:10px 0 0;color:#526576}.snow-evidence-source{font-size:.79rem;display:inline-block;margin-top:7px}@media(max-width:650px){.snow-evidence-cards{grid-template-columns:1fr}}";
  document.head.appendChild(css);
  strip=child("div",null,"snow-evidence-layers");strip.id="snow-evidence-layers";
  strip.setAttribute("aria-label","Forecast and observation evidence");
  $("impact").after(strip);
 }
 strip.replaceChildren();
 strip.appendChild(child("h3","Three different kinds of snow evidence"));
 const cards=child("div",null,"snow-evidence-cards");
 const one=(name,value,detail)=>{
  const item=child("div",null,"snow-evidence-item");
  item.appendChild(child("small",name));item.appendChild(child("strong",value));
  item.appendChild(child("small",detail));cards.appendChild(item);
 };
 const setup=v.level==="wind-only"?"Wind setup only":
  v.level==="favored"?"Potential lake effect":v.level==="winter-hazard"?"Winter hazard alert":
  v.level==="insufficient"?"Not verified":"No confirmed setup";
 one("1 · Lake-effect setup",setup,"Forecast/model evidence, not observed snow or a predicted band path");
 one("2 · Official NWS forecast",v.data_ok?(v.official_snow_forecast?"Snow forecast":"Snow not forecast at checkpoint"):"Forecast unavailable",
   "Forecast conditions can change; this is not a measured snow total");
 const observed=obs.status==="reported_nearby"?"Snow reported nearby":
   obs.status==="unverified"?"Not verified":"Feed unavailable";
 one("3 · Recent field reports",observed,
   obs.status==="reported_nearby"?"Dated reports within 50 km, not necessarily at this point":
   "No verified point snowfall conclusion can be made");
 strip.appendChild(cards);
 const note=child("p",label(obs.detail,"Recent field observations could not be verified."),"snow-evidence-note");
 strip.appendChild(note);
 for(const report of (Array.isArray(obs.reports)?obs.reports.slice(0,3):[])){
  strip.appendChild(child("p",formatDate(report.time)+": "+report.amount_in+" inches reported at "+
    report.city+" ("+report.distance_km+" km from checkpoint). Source: "+report.source_name+".","snow-evidence-note"));
 }
 try{
  const url=new URL(obs.source||"");
  if(url.protocol==="https:"&&url.hostname==="mesonet.agron.iastate.edu"){
   const a=child("a","View dated storm-report source","snow-evidence-source");
   a.href=url.href;a.target="_blank";a.rel="noopener";strip.appendChild(a);
  }
 }catch{}
}
function renderUpperAir(d){
 const air=d.upper_air||{};
 let box=$("upper-air-model");
 if(!box){box=child("div",null,"upper-air-model");box.id="upper-air-model";$("lake-note").after(box)}
 box.replaceChildren();
 box.appendChild(child("h3","Air above the lake · 850 mb GFS"));
 if(air.status!=="available"){
  box.appendChild(child("p",air.status==="stale"?"Upper-air forecast is stale or does not cover the next 12 hours. No instability values shown.":"Upper-air model data unavailable. No air temperature, stability or shear values have been estimated.","small"));
  return;
 }
 const model=air.current||{};
 const asDegrees=x=>typeof x==="number"?Math.round(x)+"°":"—";
 box.appendChild(child("p","Model valid "+formatDate(model.valid_at)+" · Run "+formatDate(air.issued_at)+". A representative offshore model point, not your town or an exact snowband."));
 box.appendChild(child("p","850-mb air: "+label(model.temp_850_c)+"°C · 850-mb wind from "+asDegrees(model.wind_850_from_deg)+" · 925-mb wind from "+asDegrees(model.wind_925_from_deg)+"."));
 box.appendChild(child("p","925–850-mb directional turning: "+asDegrees(model.shear_925_850_deg)+" ("+label(model.shear_screen).replaceAll("-"," ")+"). This is a two-level shear screen, not a full sounding.","small"));
 if(model.delta_t_c===null||model.delta_t_c===undefined){
  box.appendChild(child("p","Air–lake temperature contrast unavailable because a fresh NOAA water reading could not be verified.","small"));
 }else{
  box.appendChild(child("p","Lakewide water minus offshore GFS 850-mb air: "+model.delta_t_c+"°C ("+label(model.instability_screen).replaceAll("-"," ")+"). Around 13°C is a conventional instability screening threshold, not a prediction of snowfall."));
 }
 const detail=child("details");detail.appendChild(child("summary","Explore "+(air.forecast||[]).length+" model forecast snapshots (up to 72h)"));
 const list=child("div",null,"small");
 (air.forecast||[]).forEach(h=>list.appendChild(child("p",formatDate(h.valid_at)+" · 850 mb "+h.temp_850_c+"°C · wind from "+asDegrees(h.wind_850_from_deg)+" · turning "+asDegrees(h.shear_925_850_deg)+(h.delta_t_c===null?"":" · contrast "+h.delta_t_c+"°C"))));
 detail.appendChild(list);box.appendChild(detail);
 box.appendChild(child("p","The water value is a dated lakewide average; air and shear are coarse GFS model values. Inversions, humidity and local fetch remain unresolved.","small"));
 const cite=child("a","NOAA GFS pressure-level model data");cite.href="https://nomads.ncep.noaa.gov/";cite.target="_blank";cite.rel="noopener";box.appendChild(cite);
}
function render(d){
 const v=d.verdict||{},region=d.region||{};
 text("headline",label(v.headline));text("impact",label(v.impact)+(v.model_caution?" "+v.model_caution:""));text("timing-window",label(v.timing_window));
 text("confidence",label(v.confidence).toUpperCase());
 text("matched",label(v.first_12h?.overlap_hours,"0")+" / "+label(v.first_12h?.valid_hours,"0"));
 text("alert-count",d.alerts_status==="available"?String(d.alerts?.length||0):"Unknown");
 text("alert-status",d.alerts_status==="available"?"Active regional point alerts":"Alert source unavailable");
 text("method",(region.description||region.name)+". Confidence is qualitative evidence agreement, not a probability or a forecast of exact band placement."+(v.first_12h?.wind_unknown_hours>0?" NWS wind direction is missing in "+v.first_12h.wind_unknown_hours+" of the next "+v.first_12h.valid_hours+" hours; confidence is reduced.":""));
 clear("alerts");
 if(d.alerts_status!=="available"){
  $("alerts").appendChild(child("p","Official alert feed unavailable. Verify with weather.gov before travel.")); 
 }else if(!d.alerts?.length){$("alerts").appendChild(child("p","No active winter alerts returned for this representative point. Other nearby counties can still be affected."))}
 else d.alerts.forEach(a=>{const article=child("article",null,"alert");article.appendChild(child("strong",a.event));article.appendChild(child("p",label(a.headline)));article.appendChild(child("p",a.lakeEffect?"Alert specifically mentions lake effect.":"Winter alert; lake-effect origin not established."));article.appendChild(link("Read the NWS alert",a.url));$("alerts").appendChild(article)});
 const w=d.wssi_impact||{},ice=d.lake_ice_reference||{};
 text("wssi-impact",w.status==="available"?"WPC "+label(w.impact)+": potential overall winter impacts at this forecast point. Issued "+formatDate(w.issue_time)+". Not a warning.":w.status==="not-depicted"?"No WSSI impact polygon depicted at this point. That does not prove safe travel or current guidance.":w.status==="stale"?"WPC WSSI layer returned outdated/unverifiable guidance. Consult the official WSSI map.":"WPC winter impacts are unavailable; no level inferred.");
 text("lake-ice",ice.status==="available"?label(ice.category)+" at one sampled offshore point (chart "+formatDate(ice.date)+"). Not lakewide ice coverage.":ice.status==="stale"?"Latest mapped ice at this offshore reference point is stale ("+formatDate(ice.date)+"); not evidence of current ice-free water.":"Current ice analysis unavailable at the offshore reference point; no open-water assertion.");
 const t=d.lake_temperature||{};
 text("lake-name","Lake "+label(region.lake));
 text("lake-reading",t.status==="available"?"NOAA lakewide average: "+t.fahrenheit+"°F ("+t.celsius+"°C)":t.status==="stale"?"Last NOAA lake reading is stale.": "Current lake temperature is unavailable.");
 text("lake-note",t.date?"GLSEA analysis dated "+formatDate(t.date)+". Lakewide, satellite-derived; not a shoreline thermometer or instability measurement.":"NOAA lakewide analysis could not be verified. No temperature value was substituted.");
 renderUpperAir(d);
 renderTruthLayers(d);
 text("source-age","NWS hourly forecast updated: "+formatDate(d.forecast_updated)+". Data retrieved: "+formatDate(d.generated_at)+".");
 text("limitations",(d.limitations||[]).join(" "));
 const f=$("forecast-link"),a=$("alert-link");
 f.href=d.sources?.nws_hourly&&d.sources.nws_hourly.startsWith("https://api.weather.gov/")?d.sources.nws_hourly:"https://www.weather.gov/";
 a.href=d.sources?.nws_alerts&&d.sources.nws_alerts.startsWith("https://api.weather.gov/")?d.sources.nws_alerts:"https://www.weather.gov/";
 hours(d.hours||[]);
 if(window.LakeEffectExplainer?.render)window.LakeEffectExplainer.render(d);
 if(window.LakeEffectRadar?.render)window.LakeEffectRadar.render(d);
  if(window.LakeEffectTimeLens?.render)window.LakeEffectTimeLens.render(d);
 if(window.LakeEffectGrid?.render)window.LakeEffectGrid.render(d);
 if(window.LakeEffectGeography?.render)window.LakeEffectGeography.render(d);
 $("dashboard").hidden=false;
}
async function selectRegion(id){
 const r=regions.find(r=>r.id===id);if(!r)return;
 $("state").value=r.state;options();$("region").value=id;
 const seq=++requestId;$("dashboard").hidden=true;
 window.LakeEffectRadar?.suspend?.();
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
