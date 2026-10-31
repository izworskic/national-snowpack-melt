/* EXPERIENCE_OS_V1 · WPC geographic forecast progression.
 * Official 24h snowfall PROBABILITY outlines, not hourly snowbands. */
(function(root){
"use strict";
const API="/api/lake-effect-geography";
const NOAA="https://mapservices.weather.noaa.gov/vector/rest/services/precip/wpc_prob_winter_precip/MapServer";
const FULL=[[-94.8,40.4],[-74.9,49.2]],LAYERS={1:{4:1,8:2,12:3},2:{4:6,8:7,12:8},3:{4:11,8:12,12:13}};
const $=id=>document.getElementById(id);
const stamp=iso=>new Intl.DateTimeFormat(undefined,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit",timeZoneName:"short"}).format(new Date(iso));
let day=1,threshold=4,primary=null,windowData=null,map=null,marker=null,point=null,overlay=null,base=null,carto=null,viewId=0,fetchId=0,pointId=0,mapVisible=false,started=false,timer=null,imageTimeout=null;
const el=(tag,cl,content)=>{const n=document.createElement(tag);if(cl)n.className=cl;if(content!==undefined)n.textContent=content;return n};
function mount(){
 if($("le-geo"))return;
 const anchor=$("radar-explorer")||$("forecast-explainer");if(!anchor)return;
 const section=el("section","le-geo");section.id="le-geo";section.setAttribute("aria-labelledby","le-geo-heading");
 section.innerHTML=
 '<p class="le-geo-kicker">Experience OS · NOAA / WPC Geographic Outlook</p>'+
 '<div class="le-geo-top"><div><h3 id="le-geo-heading">Follow the changing winter footprint</h3>'+
 '<p class="le-geo-intro">Lake-effect snow can change dramatically from one shore to the next. See where the Weather Prediction Center outlines a chance of <strong>accumulating snow</strong> across the Great Lakes, then advance through three separate 24-hour forecast windows. These are official probability contours, <strong>not hourly snowbands</strong>.</p></div>'+
 '<a href="https://www.wpc.ncep.noaa.gov/wwd/winter_wx.shtml" target="_blank" rel="noopener noreferrer" class="le-geo-source">Open the official WPC outlook</a></div>'+
 '<div class="le-geo-toolbar"><fieldset aria-label="WPC forecast day"><legend>Follow the next three forecast windows</legend><div class="le-geo-days">'+
 '<button type="button" data-geo-day="1" aria-pressed="true">Day 1</button><button type="button" data-geo-day="2" aria-pressed="false">Day 2</button><button type="button" data-geo-day="3" aria-pressed="false">Day 3</button>'+
 '<button type="button" id="le-geo-play" aria-label="Play the three forecast days">Play progression</button></div></fieldset>'+
 '<fieldset aria-label="24-hour snow accumulation threshold"><legend>Probability of at least this much snow in 24 hours</legend><div class="le-geo-thresholds">'+
 '<button type="button" data-geo-inches="4" aria-pressed="true">4 inches</button><button type="button" data-geo-inches="8" aria-pressed="false">8 inches</button><button type="button" data-geo-inches="12" aria-pressed="false">12 inches</button></div></fieldset></div>'+
 '<div class="le-geo-focus" aria-live="polite"><div><span class="le-geo-eyebrow">Verified forecast window</span><strong id="le-geo-valid">Checking official forecast publication…</strong>'+
 '<span id="le-geo-issue">Published forecast timing will appear here.</span></div><p id="le-geo-status" role="status">The map loads as you approach this section.</p></div>'+
 '<div class="le-geo-map-shell"><div id="le-geo-map" role="region" aria-label="Interactive NOAA WPC snowfall probability outlines for the Great Lakes"></div>'+
 '<div class="le-geo-map-fallback" id="le-geo-map-fallback">Preparing the official geographic forecast…</div></div>'+
 '<div class="le-geo-map-actions"><button type="button" id="le-geo-home">Show entire Great Lakes</button><span id="le-geo-map-status">Official WPC polygons will appear above the basemap after verification.</span></div>'+
 '<div class="le-geo-legend" aria-label="Official NOAA WPC probability contours"><span><i class="le-geo-swatch le-geo-slight"></i>Blue outline · 10–39%</span>'+
 '<span><i class="le-geo-swatch le-geo-moderate"></i>Green outline · 40–69%</span>'+
 '<span><i class="le-geo-swatch le-geo-high"></i>Red outline · 70–100%</span></div>'+
 '<div class="le-geo-probe" id="le-geo-probe" aria-live="polite">Select a point on the map to check whether it falls inside an official WPC probability contour. We will also check your selected snowbelt.</div>'+
 '<p class="le-geo-caution"><strong>Read the map carefully.</strong> Each frame covers a full 24-hour accumulation period, not an individual hour. An unshaded location is <em>not</em> a no-snow forecast: the WPC contours begin at a 10% chance of 4, 8 or 12 inches. Wind-driven lake-effect bands can still be narrow, highly variable and dangerous. For a particular hour, use the NWS point comparison above; for live echoes, use the observed radar below.</p>';
 anchor.parentNode.insertBefore(section,anchor);
 const u=new URL(root.location.href),a=Number(u.searchParams.get("geoDay")),b=Number(u.searchParams.get("geoSnow"));
 if([1,2,3].includes(a))day=a;if([4,8,12].includes(b))threshold=b;
 section.querySelectorAll("[data-geo-day]").forEach(btn=>btn.addEventListener("click",()=>choose(Number(btn.dataset.geoDay),threshold)));
 section.querySelectorAll("[data-geo-inches]").forEach(btn=>btn.addEventListener("click",()=>choose(day,Number(btn.dataset.geoInches))));
 $("le-geo-play").addEventListener("click",()=>timer?stop():play());
 $("le-geo-home").addEventListener("click",()=>{if(map)map.fitBounds([[FULL[0][1],FULL[0][0]],[FULL[1][1],FULL[1][0]]],{padding:[12,12]})});
 document.addEventListener("visibilitychange",()=>{if(document.hidden)stop()});
 syncButtons();
 const observer=root.IntersectionObserver?new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){observer.disconnect();activate()}},{rootMargin:"420px"}):null;
 if(observer)observer.observe(section);else activate();
}
function stop(){if(timer){clearInterval(timer);timer=null}$("le-geo-play").textContent="Play progression"}
function syncButtons(){
 document.querySelectorAll("[data-geo-day]").forEach(b=>b.setAttribute("aria-pressed",String(Number(b.dataset.geoDay)===day)));
 document.querySelectorAll("[data-geo-inches]").forEach(b=>b.setAttribute("aria-pressed",String(Number(b.dataset.geoInches)===threshold)));
}
function save(){const u=new URL(root.location.href);u.searchParams.set("geoDay",String(day));u.searchParams.set("geoSnow",String(threshold));root.history.replaceState(null,"",u)}
function choose(d,t,auto=false){
 if(!auto)stop();if(d===day&&t===threshold&&windowData)return;
 day=d;threshold=t;syncButtons();save();windowData=null;
 if(started)loadWindow();
 else $("le-geo-status").textContent="Selected WPC Day "+day+". The source is checked when the map comes into view.";
}
function play(){
 if(root.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches){$("le-geo-status").textContent="Reduced motion enabled. Use Day 1, Day 2 or Day 3 buttons.";return}
 if(day===3)choose(1,threshold,true);
 $("le-geo-play").textContent="Pause progression";
 timer=setInterval(()=>{if(day>=3){stop();return}choose(day+1,threshold,true)},2500);
}
async function getJson(url){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
 try{const r=await fetch(url,{signal:controller.signal,headers:{accept:"application/json"}});if(!r.ok)throw Error("Published WPC data unavailable");return await r.json()}
 finally{clearTimeout(timeout)}
}
function validWindow(x){
 const issued=Date.parse(x?.issuedAt||""),start=Date.parse(x?.validStart||""),end=Date.parse(x?.validEnd||""),now=Date.now();
 return x?.status==="verified"&&x.day===day&&x.thresholdInches===threshold&&x.layer===LAYERS[day][threshold]&&
 [issued,start,end].every(Number.isFinite)&&issued>now-20*3600000&&issued<now+3600000&&
 start>=now-24*3600000&&end>now&&Math.abs(end-start-24*3600000)<60000;
}
async function activate(){
 if(started||!$("le-geo"))return;started=true;
 try{await leaflet();map=root.L.map("le-geo-map",{center:[primary?.lat||45.2,primary?.lon||-85.6],zoom:6,minZoom:4,maxZoom:11,scrollWheelZoom:false});
  base=root.L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · WPC probability boundaries &copy; NOAA/NWS'}).addTo(map);
  base.on("tileerror",()=>{$("le-geo-map-status").textContent="Basemap tiles unavailable. Official WPC layer and text remain independently sourced."});
  map.on("click",e=>{point={lat:e.latlng.lat,lon:e.latlng.lng};mark();probe()});
  map.on("moveend",()=>{if(windowData)paintOverlay()});
  updateRegion();
  setTimeout(()=>map?.invalidateSize(),50);
  tryCarto();
 }catch(e){$("le-geo-map-status").textContent="Interactive map is unavailable. Use the official WPC outlook link."}
 await loadWindow();
}
function updateRegion(){
 // Invalidate pending point evidence whenever the selected snowbelt changes.
 ++pointId;
 if(!map||!primary||!Number.isFinite(primary.lat)||!Number.isFinite(primary.lon))return;
 point={lat:primary.lat,lon:primary.lon,selected:true};
 map.setView([primary.lat,primary.lon],6,{animate:false});mark();if(windowData)probe();
}
function mark(){
 if(!map||!point)return;
 if(marker)map.removeLayer(marker);
 marker=root.L.circleMarker([point.lat,point.lon],{radius:9,weight:3,color:"#fff",fillColor:"#153e57",fillOpacity:0.95}).addTo(map);
 marker.bindTooltip(point.selected?"Selected snowbelt checkpoint":"Selected map location",{direction:"top"});
}
async function loadWindow(){
 const seq=++fetchId;const d=day,t=threshold;
 // A selection change invalidates old image callbacks and pending point responses
 // before the new official issuance and 24-hour window have been verified.
 ++viewId;++pointId;windowData=null;
 if(imageTimeout){clearTimeout(imageTimeout);imageTimeout=null}
 if(overlay&&map){map.removeLayer(overlay);overlay=null}
 $("le-geo-valid").textContent="Checking WPC Day "+d+" · ≥"+t+" inches…";
 $("le-geo-issue").textContent="Verifying official issue and 24-hour valid period.";
 $("le-geo-status").textContent="Loading NOAA/WPC published probability contours.";
 $("le-geo-probe").textContent="Checking the selected location against official WPC boundaries…";
 $("le-geo-map-fallback").hidden=false;
 try{
  const x=await getJson(API+"?mode=window&day="+d+"&threshold="+t);
  if(seq!==fetchId||d!==day||t!==threshold)return;
  if(!validWindow(x))throw Error("The WPC issuance, layer or 24-hour period could not be verified.");
  windowData=x;
  $("le-geo-valid").textContent=stamp(x.validStart)+" to "+stamp(x.validEnd);
  $("le-geo-issue").textContent="Issued "+stamp(x.issuedAt)+" · NOAA/NWS Weather Prediction Center · Day "+day+" · ≥"+threshold+" inches";
  $("le-geo-status").textContent="Published forecast verified. Select a location to read the WPC contour.";
  if(map)paintOverlay();else $("le-geo-map-fallback").textContent="Official map unavailable; valid WPC source and timing are shown above.";
  probe();
 }catch(e){
  if(seq!==fetchId)return;
  windowData=null;$("le-geo-valid").textContent="Current WPC geographic forecast unavailable";
  $("le-geo-issue").textContent="The daily outlook could not be independently verified.";
  $("le-geo-status").textContent="No geographic forecast is displayed; hourly NWS evidence above remains separate.";
  $("le-geo-map-status").textContent="Official WPC layer not displayed. Use the source link above.";
  $("le-geo-probe").textContent="No probability is inferred from missing or stale WPC data.";
  $("le-geo-map-fallback").textContent="Official geographic forecast unavailable for this window.";
 }
}
function exportUrl(bounds,width,height,layer){
 const p=new URLSearchParams({bbox:[bounds.getWest(),bounds.getSouth(),bounds.getEast(),bounds.getNorth()].map(v=>v.toFixed(5)).join(","),
  bboxSR:"4326",imageSR:"4326",size:Math.max(320,Math.min(1280,Math.round(width)))+","+Math.max(220,Math.min(960,Math.round(height))),
  dpi:"96",format:"png32",transparent:"true",layers:"show:"+layer,f:"image"});
 return NOAA+"/export?"+p;
}
function paintOverlay(){
 if(!map||!windowData)return;
 const id=++viewId,b=map.getBounds(),size=map.getSize(),issued=windowData.issuedAt,layerId=windowData.layer;
 if(imageTimeout){clearTimeout(imageTimeout);imageTimeout=null}
 if(overlay){map.removeLayer(overlay);overlay=null}
 $("le-geo-map-fallback").hidden=false;
 $("le-geo-map-fallback").textContent="Loading the published WPC probability outlines…";
 $("le-geo-map-status").textContent="Drawing official WPC Day "+day+" contours…";
 const image=root.L.imageOverlay(exportUrl(b,size.x,size.y,layerId),b,{opacity:1,interactive:false});
 let settled=false;
 function matches(){return id===viewId&&windowData?.layer===layerId&&windowData?.issuedAt===issued}
 function failure(reason){
  if(!matches()||settled)return;
  settled=true;
  if(imageTimeout){clearTimeout(imageTimeout);imageTimeout=null}
  if(map)map.removeLayer(image);
  if(overlay===image)overlay=null;
  $("le-geo-map-fallback").hidden=false;
  $("le-geo-map-fallback").textContent=reason;
  $("le-geo-map-status").textContent="WPC map image unavailable. No outdated probability contours are shown; use the source link.";
 }
 image.on("load",()=>{
  if(!matches()||settled)return;
  settled=true;
  if(imageTimeout){clearTimeout(imageTimeout);imageTimeout=null}
  $("le-geo-map-fallback").hidden=true;
  $("le-geo-map-status").textContent="WPC published outlines: blue 10–39%, green 40–69%, red ≥70%. Tap the map to inspect a point.";
 });
 image.on("error",()=>failure("NOAA geographic image unavailable. The official WPC source link remains available."));
 // The NOAA image endpoint can stall without load/error. Avoid an endless spinner.
 imageTimeout=setTimeout(()=>failure("The official WPC map did not load in time. Choose another forecast window or open the WPC outlook."),12000);
 overlay=image;image.addTo(map);
}
async function probe(){
 if(!point||!windowData)return;
 const seq=++pointId,p={...point},d=day,t=threshold,layer=windowData.layer,selectedId=primary?.id;
 $("le-geo-probe").textContent="Checking the official ≥"+t+" inch probability contour at "+p.lat.toFixed(3)+", "+p.lon.toFixed(3)+"…";
 try{
  const x=await getJson(API+"?mode=point&day="+d+"&threshold="+t+"&lat="+p.lat.toFixed(5)+"&lon="+p.lon.toFixed(5));
  if(seq!==pointId||d!==day||t!==threshold||layer!==windowData?.layer||p.selected&&primary?.id!==selectedId)return;
  if(x?.status!=="verified"||x.layer!==layer||x.issuedAt!==windowData.issuedAt||x.validStart!==windowData.validStart||!x.risk)throw Error("The location query could not be matched to this issued forecast");
  const label=p.selected?(primary?.name||"Selected snowbelt"):"Chosen map location";
  const text=(x.risk.insidePublishedContour?x.risk.label:"No ≥10% contour mapped here")+" for ≥"+t+" inches in this 24-hour WPC window. ";
  $("le-geo-probe").textContent=label+": "+text+(x.risk.insidePublishedContour?"This is a published accumulation probability, not a prediction of an hourly lake-effect band.":"No contour does not mean no snow or safe conditions.");
 }catch{if(seq===pointId&&d===day&&t===threshold&&layer===windowData?.layer)$("le-geo-probe").textContent="The selected point cannot be verified against this WPC issuance. Do not infer zero snow or zero probability."}
}
async function leaflet(){
 if(root.L?.map)return;
 if(!root.__lakeLensLeaflet)root.__lakeLensLeaflet=new Promise((resolve,reject)=>{
  if(!document.querySelector('link[href*="leaflet@1.9.4/dist/leaflet.css"]')){const l=el("link");l.rel="stylesheet";l.href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";document.head.appendChild(l)}
  const prior=document.querySelector('script[src*="leaflet@1.9.4/dist/leaflet.js"]');
  if(prior){prior.addEventListener("load",resolve,{once:true});prior.addEventListener("error",reject,{once:true});setTimeout(()=>root.L?.map?resolve():reject(Error("Leaflet unavailable")),6500);return}
  const s=el("script");s.src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";s.onload=resolve;s.onerror=reject;document.head.appendChild(s);
 });
 await root.__lakeLensLeaflet;
 if(!root.L?.map)throw Error("Leaflet unavailable");
}
async function tryCarto(){
 if(!map)return;try{const r=await fetch("/api/carto-basemap-config",{signal:AbortSignal.timeout(3500)});if(!r.ok)return;
 const d=await r.json(),key=d.provider==="CARTO"?d.key:null;
 if(typeof key!=="string"||!/^[A-Za-z0-9._~+-]{10,512}$/.test(key))return;
 const L=root.L,l=L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png?key="+encodeURIComponent(key),
 {maxZoom:19,subdomains:"abcd",attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attributions">CARTO</a> · Outlook &copy; NOAA/NWS'});
 let swapped=false;carto=l;
 l.on("tileload",()=>{if(!swapped&&carto===l&&map){swapped=true;if(base){map.removeLayer(base);base=null}}});
 l.on("tileerror",()=>{if(carto===l&&map){map.removeLayer(l);carto=null;if(!base)base=L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"&copy; OpenStreetMap contributors"}).addTo(map)}});
 l.addTo(map);
 }catch{/* OSM remains the fallback */}
}
function render(d){
 if(d?.status!=="ok"||!d?.region)return;mount();
 const r=d.region;if(primary?.id===r.id)return;
 primary={id:r.id,lat:r.lat,lon:r.lon,name:r.name};if(map)updateRegion();
}
root.LakeEffectGeography={render};
if(typeof module!=="undefined"&&module.exports)module.exports={exportUrl,validWindow};
})(typeof window==="undefined"?globalThis:window);
