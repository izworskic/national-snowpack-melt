/* EXPERIENCE_OS_V1 · NOAA/NDFD exact-valid-time geographic forecast.
 * WMS invalid VTIT can silently return a default image. Only render server-
 * validated (valid time, issuance) pairs. Never interpolate snowband tracks. */
(function(root){
"use strict";
const API="/api/lake-effect-grid",WMS="https://digital.weather.gov/ndfd.conus/wms",H=3600000;
const FIELDS={
 snowamt:{label:"New snow · 6 hours",description:"New snow forecast for the six-hour period ending at this time",opacity:.66,kind:"accumulation"},
 winddir:{label:"Wind direction",description:"Surface wind direction forecast valid at this instant",opacity:.84,kind:"instantaneous"},
 windspd:{label:"Wind speed",description:"Surface wind speed forecast in knots, valid at this instant",opacity:.72,kind:"instantaneous"},
 t:{label:"Air temperature",description:"Air temperature forecast in °F, valid at this instant",opacity:.7,kind:"instantaneous"}
};
const $=id=>document.getElementById(id);
const fmt=iso=>new Intl.DateTimeFormat(undefined,{weekday:"short",month:"short",day:"numeric",hour:"numeric",minute:"2-digit",timeZoneName:"short"}).format(new Date(iso));
const short=iso=>new Intl.DateTimeFormat(undefined,{month:"short",day:"numeric",hour:"numeric",timeZoneName:"short"}).format(new Date(iso));
const create=(tag,cl,t)=>{const e=document.createElement(tag);if(cl)e.className=cl;if(t!==undefined)e.textContent=t;return e};
let field="snowamt",current=null,idx=0,primary=null,map=null,marker=null,picked=null,base=null,carto=null,overlay=null,started=false,playFlag=false,playTimeout=null,fetchSeq=0,imageSeq=0,fetchAbort=null;
function mount(){
 if($("le-grid"))return;
 const before=$("le-geo")||$("radar-explorer")||$("forecast-explainer");if(!before)return;
 const section=create("section","le-grid");section.id="le-grid";section.setAttribute("aria-labelledby","le-grid-title");
 section.innerHTML=
 '<div class="le-grid-header"><div><p class="le-grid-kicker">Experience OS · NWS forecast geography</p>'+
 '<h3 id="le-grid-title">See how the snow forecast shifts, six hours at a time</h3>'+
 '<p class="le-grid-deck">The Great Lakes make their own weather. A few miles can separate a snow-covered hillside from bare ground. Explore the National Weather Service’s <strong>published gridded forecast</strong> and follow each available six-hour snowfall window across the region. These frames are forecasts of new snowfall, <strong>not a moving snowband track.</strong></p></div>'+
 '<a class="le-grid-source" href="https://digital.weather.gov/" target="_blank" rel="noopener noreferrer">Explore official NWS grids</a></div>'+
 '<div class="le-grid-toolbar"><label class="le-grid-layer" for="le-grid-layer">Explore the forecast layer'+
 '<select id="le-grid-layer"><option value="snowamt">New snowfall · six-hour accumulation</option><option value="winddir">Wind direction · valid instant</option><option value="windspd">Wind speed · valid instant</option><option value="t">Air temperature · valid instant</option></select></label>'+
 '<div class="le-grid-live"><span class="le-grid-eyebrow">Official forecast valid time</span><strong id="le-grid-time">Checking available NWS grids…</strong><span id="le-grid-issue">Exact published forecast times will appear here.</span></div></div>'+
 '<div class="le-grid-controls"><div class="le-grid-range"><label for="le-grid-slider">Advance through verified forecast frames</label>'+
 '<input type="range" id="le-grid-slider" min="0" max="1" value="0" step="1" aria-label="Select exact NOAA forecast valid time" disabled/>'+
 '<div class="le-grid-range-labels"><span id="le-grid-first">First available</span><span id="le-grid-last">Last available</span></div></div>'+
 '<div class="le-grid-buttons"><button type="button" id="le-grid-prev" disabled aria-label="Previous verified forecast">← Previous</button><button type="button" id="le-grid-next" disabled aria-label="Next verified forecast">Next →</button>'+
 '<button type="button" id="le-grid-play" disabled>Play 6-hour forecast</button></div></div>'+
 '<div class="le-grid-source-bar" role="status" id="le-grid-status">Checking exact valid times and latest issuance with NOAA.</div>'+
 '<div class="le-grid-map-shell"><div id="le-grid-map" role="region" aria-label="NOAA official gridded weather forecast over the Great Lakes"></div>'+
 '<div class="le-grid-map-fallback" id="le-grid-map-fallback">Preparing verified NWS grid…</div></div>'+
 '<div class="le-grid-map-actions"><button type="button" id="le-grid-overview">Show all five Great Lakes</button><span id="le-grid-map-status" role="status">The map displays NOAA source imagery at the selected forecast time.</span></div>'+
 '<div class="le-grid-insight"><div><p class="le-grid-eyebrow">Your selected snowbelt</p><strong id="le-grid-region">Choose a region above</strong>'+
 '<p id="le-grid-nws-context">The NWS point forecast will be checked alongside the published geographic grid.</p></div>'+
 '<div><p class="le-grid-eyebrow">Inspect an exact location</p><p id="le-grid-point">Tap anywhere on the map to position a checkpoint.</p>'+
 '<a href="https://www.weather.gov/" id="le-grid-nws-link" target="_blank" rel="noopener noreferrer">Open the official local NWS forecast</a></div></div>'+
 '<p class="le-grid-caution"><strong>How to read this:</strong> Snowfall frames show the NWS estimate for <em>new snow during the preceding six hours</em>; wind and temperature are instantaneous forecasts valid at the selected hour. Only NOAA-confirmed frame times appear. A blank or uniform map does not prove zero snow. This is neither radar nor a road-safety forecast. The official three-day WPC probability map and observed radar remain below.</p>';
 before.parentNode.insertBefore(section,before);
 const u=new URL(root.location.href),saved=u.searchParams.get("gridField");
 if(Object.hasOwn(FIELDS,saved))field=saved;
 $("le-grid-layer").value=field;
 $("le-grid-layer").addEventListener("change",e=>{stop();const v=e.target.value;if(!Object.hasOwn(FIELDS,v))return;field=v;idx=0;save();load()});
 $("le-grid-slider").addEventListener("input",e=>{stop();if(!current)return;idx=Math.min(current.frames.length-1,Math.max(0,Number(e.target.value)||0));save();paint()});
 $("le-grid-prev").addEventListener("click",()=>step(-1));
 $("le-grid-next").addEventListener("click",()=>step(1));
 $("le-grid-play").addEventListener("click",()=>playFlag?stop():play());
 $("le-grid-overview").addEventListener("click",()=>{if(map)map.fitBounds([[40.7,-94.8],[49.1,-74.7]],{padding:[12,12],animate:false})});
 document.addEventListener("visibilitychange",()=>{if(document.hidden)stop()});
 const observer=root.IntersectionObserver?new IntersectionObserver(entries=>{if(entries.some(x=>x.isIntersecting)){observer.disconnect();activate()}},{rootMargin:"380px"}):null;
 if(observer)observer.observe(section);else activate();
}
function stop(){playFlag=false;if(playTimeout){clearTimeout(playTimeout);playTimeout=null}const b=$("le-grid-play");if(b)b.textContent="Play 6-hour forecast"}
function play(){
 if(!current||current.frames.length<2)return;
 if(root.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches){$("le-grid-status").textContent="Reduced motion is enabled. Use the timeline and previous/next buttons instead.";return}
 if(idx===current.frames.length-1)idx=0;
 playFlag=true;$("le-grid-play").textContent="Pause progression";paint();
}
function scheduleNext(){
 if(!playFlag||!current)return;
 if(playTimeout)clearTimeout(playTimeout);
 playTimeout=setTimeout(()=>{if(idx>=current.frames.length-1){stop();return}idx++;save();paint()},1700);
}
function step(delta){if(!current)return;stop();idx=Math.min(current.frames.length-1,Math.max(0,idx+delta));save();paint()}
function save(){let u=new URL(root.location.href);u.searchParams.set("gridField",field);if(current?.frames?.[idx])u.searchParams.set("gridAt",current.frames[idx].validAt.slice(0,16));root.history.replaceState(null,"",u)}
function goodFrame(f,element,now=Date.now()){
 const v=Date.parse(f?.validAt||""),i=Date.parse(f?.issuedAt||"");
 return Number.isFinite(v)&&Number.isFinite(i)&&v>now-15*60000&&v<now+73*H&&i<=now+15*60000&&i>now-12*H&&i<=v&&
 /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}_\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(f?.vTIT||"")&&
 f.vTIT===f.validAt.slice(0,16)+"_"+f.issuedAt.slice(0,16)&&v%(6*H)===0&&
 (element==="snowamt"?f.periodStart&&Math.abs(v-Date.parse(f.periodStart)-6*H)<60000:f.periodStart===null);
}
function validInventory(d,element){
 const now=Date.now();return d?.status==="verified"&&d.element===element&&d.periodType===FIELDS[element].kind&&
 Array.isArray(d.frames)&&d.frames.length>0&&d.frames.length<=13&&
 d.frames.every(f=>goodFrame(f,element,now))&&
 d.frames.every((f,i)=>i===0||Date.parse(f.validAt)>Date.parse(d.frames[i-1].validAt));
}
async function load(){
 const seq=++fetchSeq;
 if(fetchAbort)fetchAbort.abort();fetchAbort=new AbortController();
 const e=field,previous=current?.frames?.[idx]?.validAt||null;
 current=null;stop();clearOverlay();
 $("le-grid-time").textContent="Checking NOAA/NWS valid times…";$("le-grid-issue").textContent="Only exact official issue/valid time pairs are accepted.";
 $("le-grid-status").textContent="Retrieving published "+FIELDS[e].label.toLowerCase()+" frames from NOAA.";
 $("le-grid-map-fallback").hidden=false;$("le-grid-map-fallback").textContent="Validating NWS forecast grids…";
 $("le-grid-slider").disabled=true;["le-grid-prev","le-grid-next","le-grid-play"].forEach(id=>$(id).disabled=true);
 const controller=fetchAbort,timeout=setTimeout(()=>controller.abort(),17000);
 try{
  const r=await fetch(API+"?element="+encodeURIComponent(e),{signal:controller.signal,headers:{accept:"application/json"}});
  if(!r.ok)throw Error("NOAA frame inventory unavailable");
  const d=await r.json();if(seq!==fetchSeq)return;
  if(!validInventory(d,e))throw Error("Published valid times or issuance information could not be confirmed");
  current=d;
  const requested=new URL(root.location.href).searchParams.get("gridAt");
  const savedIndex=requested?d.frames.findIndex(f=>f.validAt.slice(0,16)===requested):-1;
  const previousIndex=previous?d.frames.findIndex(f=>f.validAt===previous):-1;
  idx=savedIndex>=0?savedIndex:previousIndex>=0?previousIndex:0;
  $("le-grid-slider").max=String(Math.max(0,d.frames.length-1));$("le-grid-slider").disabled=d.frames.length<2;
  $("le-grid-first").textContent=short(d.frames[0].validAt);$("le-grid-last").textContent=short(d.frames[d.frames.length-1].validAt);
  $("le-grid-status").textContent=d.frames.length+" exact forecast times verified by NOAA. "+(d.unavailableSlots?"Some requested time steps are not published; gaps are never filled.":"Every checked time step is published.");
  save();paint();
 }catch{if(seq!==fetchSeq)return;current=null;clearOverlay();
  $("le-grid-time").textContent="Verified geographic forecast unavailable";
  $("le-grid-issue").textContent="NOAA valid-time evidence could not be confirmed.";
  $("le-grid-status").textContent="No gridded map is displayed. The NWS point forecast above and WPC outlook below remain separate.";
  $("le-grid-map-fallback").hidden=false;$("le-grid-map-fallback").textContent="Current NOAA grid unavailable · No fallback map or invented forecast";
  $("le-grid-map-status").textContent="No verified geographic forecast image is shown.";
  $("le-grid-nws-context").textContent="NWS hourly forecast remains available in the comparison above.";
 }
 finally{clearTimeout(timeout)}
}
function clearOverlay(){++imageSeq;if(map&&overlay){map.removeLayer(overlay)}overlay=null}
function paint(){
 if(!current)return;
 const f=current.frames[idx];if(!f||!goodFrame(f,field)){current=null;clearOverlay();$("le-grid-status").textContent="Forecast inventory expired. Reload the page for a fresh NOAA check.";return}
 $("le-grid-slider").value=String(idx);$("le-grid-slider").setAttribute("aria-valuetext",fmt(f.validAt));
 $("le-grid-prev").disabled=idx===0;$("le-grid-next").disabled=idx===current.frames.length-1;$("le-grid-play").disabled=current.frames.length<2;
 $("le-grid-time").textContent=field==="snowamt"?short(f.periodStart)+" to "+fmt(f.validAt):fmt(f.validAt);
 $("le-grid-issue").textContent="NWS/NDFD "+FIELDS[field].label+" · Issued "+fmt(f.issuedAt)+" · frame "+(idx+1)+" of "+current.frames.length;
 context();
 draw();
}
function context(){
 const label=primary?.name||"Selected snowbelt";$("le-grid-region").textContent=label;
 const f=current?.frames?.[idx];
 if(!primary||!f){$("le-grid-nws-context").textContent="Select a snowbelt above to compare hourly NWS evidence.";return}
 if(!primary.source?.verdict?.data_ok||!Array.isArray(primary.source.hours)){ $("le-grid-nws-context").textContent="The NWS hourly point evidence is not verified for this location. Use the official local forecast.";return}
 const end=Date.parse(f.validAt),start=end-6*H;
 const rows=primary.source.hours.filter(x=>{const a=Date.parse(x.at);return Number.isFinite(a)&&a>=start&&a<end});
 if(rows.length<5){$("le-grid-nws-context").textContent="The NWS hourly point series does not cover this complete six-hour window. No local snow estimate is inferred.";return}
 const snowy=rows.filter(x=>x.forecast_snow===true).length,wind=rows.filter(x=>x.wind_aligned===true).length;
 $("le-grid-nws-context").textContent="Separate NWS hourly point forecast: snow is mentioned in "+snowy+" of "+rows.length+" published hours; snowbelt-aligned wind in "+wind+" hours. This is not a gridded snowfall total or an exact snowband track.";
}
function setMarker(lat,lon,selected){
 if(!map||!Number.isFinite(lat)||!Number.isFinite(lon))return;
 picked={lat,lon,selected};
 if(marker)map.removeLayer(marker);
 marker=root.L.circleMarker([lat,lon],{radius:8,weight:3,color:"#fff",fillColor:"#173f58",fillOpacity:.96}).addTo(map);
 marker.bindTooltip(selected?(primary?.name||"Selected snowbelt"):"Map checkpoint",{direction:"top"});
 $("le-grid-point").textContent=selected?"Representative NWS snowbelt checkpoint · "+lat.toFixed(3)+", "+lon.toFixed(3):"Selected map point · "+lat.toFixed(3)+", "+lon.toFixed(3)+". This map image does not give an exact snowfall number here.";
 $("le-grid-nws-link").href="https://forecast.weather.gov/MapClick.php?lat="+lat.toFixed(5)+"&lon="+lon.toFixed(5);
}
function wmsUrl(bounds,size,f){
 const L=root.L,sw=L.Projection.SphericalMercator.project(bounds.getSouthWest()),ne=L.Projection.SphericalMercator.project(bounds.getNorthEast());
 const box=[sw.x,sw.y,ne.x,ne.y].map(x=>x.toFixed(2)).join(",");
 const p=new URLSearchParams({SERVICE:"WMS",REQUEST:"GetMap",VERSION:"1.3.0",LAYERS:"ndfd.conus."+field,STYLES:"",
 FORMAT:"image/png",TRANSPARENT:"TRUE",EXCEPTIONS:"application/vnd.ogc.se_xml",CRS:"EPSG:3857",BBOX:box,
 WIDTH:String(Math.min(1250,Math.max(320,Math.ceil(size.x)))),HEIGHT:String(Math.min(850,Math.max(230,Math.ceil(size.y)))),
 VTIT:f.vTIT});
 return WMS+"?"+p;
}
function draw(){
 if(!map||!current){return}
 const f=current.frames[idx],id=++imageSeq,b=map.getBounds(),size=map.getSize();
 if(overlay){map.removeLayer(overlay);overlay=null}
 $("le-grid-map-fallback").hidden=false;$("le-grid-map-fallback").textContent="Loading verified NOAA frame…";
 $("le-grid-map-status").textContent="Requesting official NDFD "+FIELDS[field].label+" image for "+short(f.validAt)+".";
 const layer=root.L.imageOverlay(wmsUrl(b,size,f),b,{opacity:FIELDS[field].opacity,interactive:false});
 layer.on("load",()=>{if(id!==imageSeq||!current)return;
  $("le-grid-map-fallback").hidden=true;
  $("le-grid-map-status").textContent="NOAA/NWS gridded "+FIELDS[field].label.toLowerCase()+" · Forecast image valid "+short(f.validAt)+". Map colors belong to the published NWS layer.";
  if(playFlag)scheduleNext();
 });
 layer.on("error",()=>{if(id!==imageSeq)return;
  stop();if(map)map.removeLayer(layer);if(overlay===layer)overlay=null;
  $("le-grid-map-fallback").hidden=false;$("le-grid-map-fallback").textContent="NOAA image unavailable for this exact forecast time.";
  $("le-grid-map-status").textContent="No image substituted. Choose another verified time or open the official NWS maps.";
 });
 overlay=layer;layer.addTo(map);
}
async function leaflet(){
 if(root.L?.map)return;
 if(!root.__lakeLensLeaflet)root.__lakeLensLeaflet=new Promise((resolve,reject)=>{
  if(!document.querySelector('link[href*="leaflet@1.9.4/dist/leaflet.css"]')){const l=create("link");l.rel="stylesheet";l.href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";document.head.appendChild(l)}
  const prior=document.querySelector('script[src*="leaflet@1.9.4/dist/leaflet.js"]');
  if(prior){prior.addEventListener("load",resolve,{once:true});prior.addEventListener("error",reject,{once:true});setTimeout(()=>root.L?.map?resolve():reject(Error("Leaflet unavailable")),6500);return}
  const s=create("script");s.src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";s.onload=resolve;s.onerror=reject;document.head.appendChild(s);
 });
 await root.__lakeLensLeaflet;if(!root.L?.map)throw Error("Leaflet unavailable");
}
async function tryCarto(){
 if(!map)return;try{
 const r=await fetch("/api/carto-basemap-config",{signal:AbortSignal.timeout(3200)});
 if(!r.ok)return;const d=await r.json(),key=d.provider==="CARTO"?d.key:null;
 if(typeof key!=="string"||!/^[A-Za-z0-9._~+-]{10,512}$/.test(key))return;
 const L=root.L,layer=L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png?key="+encodeURIComponent(key),
 {maxZoom:19,subdomains:"abcd",attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · &copy; <a href="https://carto.com/attributions">CARTO</a> · Forecast &copy; NOAA/NWS'});
 let switched=false;carto=layer;
 layer.on("tileload",()=>{if(!switched&&carto===layer&&map){switched=true;if(base){map.removeLayer(base);base=null}}});
 layer.on("tileerror",()=>{if(carto===layer&&map){map.removeLayer(layer);carto=null;if(!base)base=L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"&copy; OpenStreetMap contributors · NOAA/NWS forecast"}).addTo(map)}});
 layer.addTo(map);
 }catch{/* OSM remains available */}
}
async function activate(){
 if(started||!$("le-grid"))return;started=true;
 try{await leaflet();map=root.L.map("le-grid-map",{center:[primary?.lat||45.2,primary?.lon||-85.7],zoom:6,minZoom:4,maxZoom:11,scrollWheelZoom:false});
  base=root.L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Forecast &copy; NOAA/NWS'}).addTo(map);
  base.on("tileerror",()=>{$("le-grid-map-status").textContent="Basemap tiles failed; NOAA forecasts are sourced separately."});
  map.on("click",e=>setMarker(e.latlng.lat,e.latlng.lng,false));
  map.on("moveend",()=>{if(current)draw()});
  if(primary?.lat&&primary?.lon)setMarker(primary.lat,primary.lon,true);
  setTimeout(()=>map?.invalidateSize(),30);tryCarto();
 }catch{$("le-grid-map-status").textContent="Interactive map unavailable; official forecast links remain accessible."}
 await load();
}
function render(d){
 if(d?.status!=="ok"||!d?.region?.id)return;
 mount();const r=d.region;
 if(primary?.id===r.id){primary.source=d;context();return}
 primary={id:r.id,name:r.name,lat:r.lat,lon:r.lon,source:d};
 if(map&&Number.isFinite(r.lat)&&Number.isFinite(r.lon)){
  map.setView([r.lat,r.lon],6,{animate:false});setMarker(r.lat,r.lon,true);
 }else if(Number.isFinite(r.lat)&&Number.isFinite(r.lon)){
  $("le-grid-region").textContent=r.name;
  $("le-grid-point").textContent="Representative point · "+r.lat.toFixed(3)+", "+r.lon.toFixed(3);
  $("le-grid-nws-link").href="https://forecast.weather.gov/MapClick.php?lat="+r.lat.toFixed(5)+"&lon="+r.lon.toFixed(5);
 }
 context();
}
root.LakeEffectGrid={render};
if(typeof module!=="undefined"&&module.exports)module.exports={goodFrame,validInventory};
})(typeof window==="undefined"?globalThis:window);
