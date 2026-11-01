/* EXPERIENCE_OS_V1: two verified NWS hourly forecast checkpoints, not a snowband model. */
(function(root){
"use strict";
const H=3600000,MAX=23,ROOT="/api/lake-effect";
const SIGNAL={
 overlap:{rank:3,label:"NWS forecasts snow + wind aligns with this snowbelt",color:"#087d87"},
 snow:{rank:2,label:"NWS forecasts snow; band placement uncertain",color:"#5665a6"},
 wind:{rank:1,label:"Wind aligned; NWS does not forecast snow",color:"#c18c38"},
 none:{rank:0,label:"No converging snow-and-wind signals this hour",color:"#778994"},
 unknown:{rank:null,label:"This forecast hour cannot be verified",color:"#778994"}
};
function verified(d,now=Date.now()){
 const t=Date.parse(d?.forecast_updated||"");
 return d?.status==="ok"&&d?.verdict?.data_ok===true&&Number.isFinite(t)&&t<=now+H&&now-t<=12*H;
}
function signal(d,at,now=Date.now()){
 if(!verified(d,now))return {...SIGNAL.unknown,why:"Fresh NWS forecast timing or first-window coverage is not confirmed."};
 const row=(d.hours||[]).find(h=>h.at===at);
 if(!row)return {...SIGNAL.unknown,why:"No NWS point forecast for this exact forecast hour."};
 if(!row.forecast_snow&&row.wind_aligned===null)return {...SIGNAL.unknown,why:"NWS does not mention snow at this point, but wind direction is missing; this hour cannot be fully compared."};
 const type=row.forecast_snow?(row.wind_aligned===true?"overlap":"snow"):row.wind_aligned===true?"wind":"none";
 return {...SIGNAL[type],why:row.short_forecast||"NWS description unavailable",wind:row.wind_from||"unavailable",
  temperature:Number.isFinite(row.temperature_f)?row.temperature_f:null};
}
function judge(a,b,at,now=Date.now()){
 const x=signal(a,at,now),y=signal(b,at,now);
 if(x.rank===null||y.rank===null)return {x,y,winner:null,headline:"Comparable evidence unavailable",
  detail:"One or both NWS point forecasts are missing or not sufficiently fresh. Unknown does not mean no snow."};
 if(x.rank===0&&y.rank===0)return{x,y,winner:null,headline:"Neither point has a converging snow signal",
  detail:"Neither checked NWS point forecast mentions snow or aligned surface wind at this hour. This is not a clear-weather or travel guarantee."};
 if(x.rank===y.rank)return{x,y,winner:null,headline:"Similar signals at both forecast points",
  detail:x.rank===3?"Both points forecast snow with regionally aligned surface wind. The location and strength of individual snowbands remain unknown.":x.rank===2?"Both point forecasts mention snow, but wind alignment does not establish a snowband track.":"Wind direction alone does not establish an actual snow event."};
 const winner=x.rank>y.rank?"a":"b",v=winner==="a"?x:y;
 return{x,y,winner,headline:"Stronger hourly evidence at checkpoint "+winner.toUpperCase(),
  detail:v.rank===3?"NWS forecast snow overlaps the broad snowbelt wind screen at this point, unlike the other checkpoint. This does not determine road safety or a precise snowband.":v.rank===2?"An NWS point forecast mentions snow here, but a lake-effect band position has not been established.":"Only the wind screen is aligned. Neither point forecasts snow, so no snow opportunity is established."};
}
// Discrete NWS point samples only: no interpolation of snowband geography or missing hours.
function evidenceSamples(a,b,startMs,now=Date.now()){
 if(!Number.isFinite(startMs))return [];
 return Array.from({length:MAX+1},(_,lead)=>{
  const at=new Date(startMs+lead*3*H).toISOString();
  return {lead,at,a:signal(a,at,now),b:signal(b,at,now)};
 });
}
if(typeof module!=="undefined"&&module.exports)module.exports={verified,signal,judge,evidenceSamples};
if(typeof document==="undefined")return;
const $=id=>document.getElementById(id),mk=(t,cl,txt)=>{const n=document.createElement(t);if(cl)n.className=cl;if(txt!==undefined)n.textContent=txt;return n};
const fmt=ms=>new Intl.DateTimeFormat(undefined,{weekday:"short",month:"short",day:"numeric",hour:"numeric",minute:"2-digit",timeZoneName:"short"}).format(new Date(ms));
let primary=null,secondary=null,catalog=[],loaded=null,choice=null,lead=0,start=null,token=0,request=null,timer=null;
let map=null,markers=[],base=null,carto=null,open=false,mapBoundsKey="";
function mount(){
 if($("le-lens"))return;
 const sibling=$("radar-explorer")||$("forecast-explainer");if(!sibling)return;
 const section=mk("section","le-lens");section.id="le-lens";section.setAttribute("aria-labelledby","le-lens-title");
 section.innerHTML='<p class="le-lens-kicker">Experience OS · interactive forecast</p>'+
 '<h4 id="le-lens-title">When does the snowbelt setup change?</h4>'+
 '<p class="le-lens-intro">Compare two NWS forecast points as the next 72 hours unfold. These are <strong>real forecast hours</strong>, not an animated prediction of where narrow snowbands will travel.</p>'+
 '<div class="le-lens-choose"><div><span class="le-lens-small">Selected snowbelt</span><strong id="le-lens-a-choice">Checking…</strong></div><label for="le-lens-select">Compare with<select id="le-lens-select"></select></label></div>'+
 '<div class="le-lens-controls"><div><span>Forecast valid time (your device time)</span><strong id="le-lens-time">Waiting for forecast…</strong></div>'+
 '<div class="le-lens-steps"><button type="button" id="le-lens-prev">− 3h</button><input id="le-lens-slider" type="range" min="0" max="23" value="0" step="1" aria-label="NWS forecast hour, three hours per step"><button type="button" id="le-lens-next">+ 3h</button><button type="button" id="le-lens-play">Play forecast</button></div>'+
 '<div class="le-lens-ticks"><span>First hour</span><span>+24h</span><span>+48h</span><span>+69h</span></div></div>'+
 '<div class="le-lens-evidence" aria-labelledby="le-lens-evidence-title"><strong id="le-lens-evidence-title">See when the supporting evidence changes</strong>'+
 '<p>Two NWS point forecasts sampled every three hours. Each block represents that instant, <strong>not a moving snowband</strong> or a continuous snowfall forecast.</p>'+
 '<div class="le-lens-evidence-row"><span>Point A</span><div class="le-lens-evidence-track" id="le-lens-evidence-a" aria-hidden="true"></div></div>'+
 '<div class="le-lens-evidence-row"><span>Point B</span><div class="le-lens-evidence-track" id="le-lens-evidence-b" aria-hidden="true"></div></div>'+
 '<div class="le-lens-evidence-key" aria-hidden="true"><span class="evidence-overlap">Snow + wind</span><span class="evidence-snow">Snow</span><span class="evidence-wind">Wind only</span><span class="evidence-none">Neither</span><span class="evidence-unknown">Unknown</span></div>'+
 '<p id="le-lens-evidence-summary" class="le-lens-evidence-summary">Checking 24 forecast samples for each checkpoint.</p></div>'+
 '<div class="le-lens-answer" id="le-lens-answer" aria-live="polite"><strong id="le-lens-heading">Loading official evidence…</strong><p id="le-lens-why"></p></div>'+
 '<div class="le-lens-cards"><article><span>Checkpoint A · selected snowbelt</span><h5 id="le-lens-a-name"></h5><p id="le-lens-a-state"></p><p id="le-lens-a-words"></p><a id="le-lens-a-link" href="https://www.weather.gov/" target="_blank" rel="noopener noreferrer">Official NWS forecast</a></article>'+
 '<article><span>Checkpoint B · comparison</span><h5 id="le-lens-b-name"></h5><p id="le-lens-b-state"></p><p id="le-lens-b-words"></p><a id="le-lens-b-link" href="https://www.weather.gov/" target="_blank" rel="noopener noreferrer">Official NWS forecast</a></article></div>'+
 '<div class="le-lens-map-header"><div><strong>Locate the forecast points</strong><p id="le-lens-map-status" role="status">Optional map; the comparison works without map tiles.</p></div><button type="button" id="le-lens-toggle">Show map</button></div>'+
 '<div id="le-lens-map-holder" hidden><div id="le-lens-map" role="region" aria-label="Basemap with two NWS forecast checkpoints"></div><p class="le-lens-small">Markers show two distinct point forecasts at the selected valid time. No continuous snowband, route, or snowfall field is modeled. <a id="le-lens-osm" href="https://www.openstreetmap.org/" target="_blank" rel="noopener noreferrer">External map</a></p></div>'+
 '<p class="le-lens-caution" id="le-lens-caution">Forecast is different from the past-observed radar playback below. Neither forecast point establishes safe roads or travel conditions.</p>';
 sibling.parentNode.insertBefore(section,sibling);
 $("le-lens-select").addEventListener("change",e=>{stop();choice=e.target.value;secondary=null;save();loadSecond()});
 $("le-lens-slider").addEventListener("input",e=>{stop();lead=Math.min(MAX,Math.max(0,Number(e.target.value)||0));save();paint()});
 $("le-lens-prev").addEventListener("click",()=>shift(-1));
 $("le-lens-next").addEventListener("click",()=>shift(1));
 $("le-lens-play").addEventListener("click",()=>timer?stop():play());
 $("le-lens-toggle").addEventListener("click",toggle);
 document.addEventListener("visibilitychange",()=>{if(document.hidden)stop()});
}
function stop(){if(timer){clearInterval(timer);timer=null}
 const b=$("le-lens-play");if(b)b.textContent="Play forecast";
 if($("le-lens-answer"))$("le-lens-answer").setAttribute("aria-live","polite");
}
function save(){const u=new URL(root.location.href);if(choice)u.searchParams.set("compare",choice);u.searchParams.set("lead",String(lead*3));root.history.replaceState(null,"",u)}
function shift(n){stop();lead=Math.max(0,Math.min(MAX,lead+n));save();paint()}
function play(){
 if(root.matchMedia?.("(prefers-reduced-motion: reduce)").matches){$("le-lens-map-status").textContent="Motion reduced: use the timeline controls.";return}
 if(lead===MAX)lead=0;
 $("le-lens-play").textContent="Pause forecast";$("le-lens-answer").setAttribute("aria-live","off");
 timer=setInterval(()=>{if(lead===MAX){stop();save();return}lead++;paint()},900);
 paint();
}
function words(id,d,s){
 $(id+"-name").textContent=d?.region?.name||"Comparison point unavailable";
 $(id+"-state").textContent=s.label;$(id+"-state").style.borderLeftColor=s.color;
 $(id+"-words").textContent=s.why+(s.rank===null?"":" · Surface wind from "+s.wind+(s.temperature===null?"":" · "+s.temperature+"°F"));
 const source=d?.sources?.nws_hourly||"";
 let link="https://www.weather.gov/";
 try{const u=new URL(source);if(u.protocol==="https:"&&u.hostname==="api.weather.gov")link=u.href}catch{}
 $(id+"-link").href=link;
}
function drawEvidence(){
 const samples=evidenceSamples(primary,secondary,start);
 if(!samples.length)return;
 const nameOf=rank=>rank===null?"unknown":rank===3?"overlap":rank===2?"snow":rank===1?"wind":"none";
 const counts=[];
 for(const [point,key] of [["a","A"],["b","B"]]){
  const track=$("le-lens-evidence-"+point),ranks=samples.map(s=>s[point].rank);
  const signature=ranks.map(n=>n===null?"?":n).join(",");
  if(track.dataset.signature!==signature){
   const cells=ranks.map(n=>{const e=mk("span","le-lens-sample evidence-"+nameOf(n));return e});
   const needle=mk("span","le-lens-needle");
   track.replaceChildren(...cells,needle);
   track.dataset.signature=signature;
  }
  track.style.setProperty("--le-needle",((lead+.5)/samples.length*100).toFixed(4)+"%");
  const overlap=ranks.filter(n=>n===3).length,unknown=ranks.filter(n=>n===null).length;
  counts.push(key+": "+overlap+" snow-and-wind samples"+(unknown?", "+unknown+" unverified":""));
 }
 $("le-lens-evidence-summary").textContent="Among 24 three-hour samples per checkpoint, "+counts.join("; ")+". Unknown blocks are not snow-free.";
}
function paint(){
 if(!primary||start===null)return;
 const at=new Date(start+lead*3*H).toISOString(),j=judge(primary,secondary,at);
 $("le-lens-a-choice").textContent=primary.region.name;
 $("le-lens-time").textContent=fmt(Date.parse(at));
 $("le-lens-slider").value=String(lead);$("le-lens-slider").setAttribute("aria-valuetext",fmt(Date.parse(at)));
 $("le-lens-prev").disabled=lead===0;$("le-lens-next").disabled=lead===MAX;
 $("le-lens-heading").textContent=j.winner?"More supporting signals: "+(j.winner==="a"?primary.region.name:secondary.region.name):j.headline;
 $("le-lens-why").textContent=j.detail;
 words("le-lens-a",primary,j.x);words("le-lens-b",secondary,j.y);
 drawEvidence();
 const warnings=[primary,secondary].filter(r=>r?.verdict?.official_warning).map(r=>r.region.name);
 const missing=[primary,secondary].filter(r=>r?.status==="ok"&&r.alerts_status!=="available").map(r=>r.region.name);
 $("le-lens-caution").textContent=(warnings.length?"NWS warning active at retrieval for "+warnings.join(", ")+". It may not cover this future hour. ":"")+
 (missing.length?"Warning feed unavailable for "+missing.join(", ")+". Verify separately. ":"")+
 "These are forecasts at representative points, not a tracked band, measured snowfall, road condition or trip recommendation. Radar below displays past echoes.";
 redrawMap(j);
}
function catalogPromise(){
 if(!loaded)loaded=fetch(ROOT+"?list=1").then(r=>{if(!r.ok)throw Error("catalog unavailable");return r.json()}).then(x=>{catalog=(x.regions||[]).filter(r=>r.id&&Number.isFinite(r.lat)&&Number.isFinite(r.lon));return catalog}).catch(()=>{loaded=null;return []});
 return loaded;
}
function suggested(){
 const others=catalog.filter(r=>r.id!==primary.region.id),url=new URL(root.location.href),saved=url.searchParams.get("compare");
 if(others.some(r=>r.id===choice))return choice;
 if(others.some(r=>r.id===saved))return saved;
 const a=primary.region,dist=r=>(a.lat-r.lat)**2+((a.lon-r.lon)*Math.cos(a.lat*Math.PI/180))**2;
 return others.sort((a,b)=>dist(a)-dist(b))[0]?.id||null;
}
async function loadSecond(){
 const my=++token;if(request)request.abort();
 request=new AbortController();const id=choice;
 secondary={region:catalog.find(r=>r.id===id)||{name:"Unknown checkpoint"},status:"unavailable",hours:[]};paint();
 if(!id)return;
 const timeout=setTimeout(()=>request.abort(),11000);
 try{
  const response=await fetch(ROOT+"?region="+encodeURIComponent(id),{signal:request.signal});
  if(!response.ok)throw Error("NWS data unavailable");
  const d=await response.json();
  if(my!==token||id!==choice)return;
  if(d.status!=="ok"||d.region?.id!==id)throw Error("Incorrect NWS region");
  secondary=d;paint();
 }catch{if(my===token&&id===choice)paint()}
 finally{clearTimeout(timeout)}
}
async function render(d){
 if(d?.status!=="ok"||!d.region?.id)return;
 mount();if(!$("le-lens"))return;
 const changed=primary?.region?.id!==d.region.id;
 primary=d;stop();
 const hours=(d.hours||[]).filter(h=>Number.isFinite(Date.parse(h.at))&&Date.parse(h.at)>=Math.floor(Date.now()/H)*H).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
 start=hours.length?Date.parse(hours[0].at):null;
 if(changed){++token;if(request)request.abort();
  const u=new URL(root.location.href),direct=!choice&&u.searchParams.get("region")===d.region.id;
  const requested=direct?Number(u.searchParams.get("lead")):0;
  lead=Number.isInteger(requested)&&requested>=0&&requested<=69&&requested%3===0?requested/3:0;
  if(choice===d.region.id)choice=null;secondary=null;
 }
 if(start===null){$("le-lens-heading").textContent="NWS forecast hours unavailable";$("le-lens-why").textContent="No time comparison can be made.";return}
 const arr=await catalogPromise();if(primary!==d)return;
 if(!arr.length){$("le-lens-heading").textContent="Region catalog unavailable";$("le-lens-why").textContent="The existing hourly forecast above remains available.";return}
 const id=suggested(),select=$("le-lens-select");select.replaceChildren();
 for(const r of arr)if(r.id!==d.region.id){const o=mk("option",null,r.name+" · "+r.state);o.value=r.id;select.appendChild(o)}
 if(!id)return;
 if(choice!==id){choice=id;secondary=null}select.value=id;
 paint();if(secondary?.status==="ok"&&secondary.region?.id===choice)return;
 loadSecond();
}
function redrawMap(j){
 if(!map||!primary)return;
 const L=root.L,points=[[primary.region,j.x],[secondary?.region,j.y]];
 points.forEach(([r,s],i)=>{
  if(!r||!Number.isFinite(r.lat)||!Number.isFinite(r.lon)){if(markers[i]){map.removeLayer(markers[i]);markers[i]=null}return}
  const options={radius:9,weight:2,color:"#16313c",fillColor:s.color,fillOpacity:0.92};
  if(!markers[i])markers[i]=L.circleMarker([r.lat,r.lon],options).addTo(map);
  else markers[i].setLatLng([r.lat,r.lon]).setStyle(options);
  markers[i].bindPopup(mk("div",null,r.name+": "+s.label+". "+s.why));
 });
 const a=primary.region,b=secondary?.region;
 const boundsKey=a.id+"|"+(b&&Number.isFinite(b.lat)&&Number.isFinite(b.lon)?b.id:"none");
 if(boundsKey!==mapBoundsKey){mapBoundsKey=boundsKey;
  if(b&&Number.isFinite(b.lat)&&Number.isFinite(b.lon))map.fitBounds([[a.lat,a.lon],[b.lat,b.lon]],{padding:[36,36],maxZoom:8,animate:false});
  else map.setView([a.lat,a.lon],7,{animate:false});}
 $("le-lens-osm").href="https://www.openstreetmap.org/?mlat="+a.lat+"&mlon="+a.lon+"#map=7/"+a.lat+"/"+a.lon;
}
async function leaflet(){
 if(root.L?.map)return;
 if(!root.__lakeLensLeaflet)root.__lakeLensLeaflet=new Promise((resolve,reject)=>{
  if(!document.querySelector('link[href*="leaflet@1.9.4/dist/leaflet.css"]')){const c=mk("link");c.rel="stylesheet";c.href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";document.head.appendChild(c)}
  const previous=document.querySelector('script[src*="leaflet@1.9.4/dist/leaflet.js"]');
  if(previous){if(root.L?.map){resolve();return}previous.addEventListener("load",resolve,{once:true});previous.addEventListener("error",reject,{once:true});setTimeout(()=>root.L?.map?resolve():reject(Error("Leaflet unavailable")),6500);return}
  const s=mk("script");s.src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";s.onload=resolve;s.onerror=reject;document.head.appendChild(s);
 });
 await root.__lakeLensLeaflet;
}
async function tryCarto(){
 const abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),3500);
 try{
  const response=await fetch("/api/carto-basemap-config",{signal:abort.signal});
  if(!response.ok)throw Error("CARTO unavailable");
  const data=await response.json(),key=data?.provider==="CARTO"?data.key:null;
  if(typeof key!=="string"||!/^[A-Za-z0-9._~+-]{10,512}$/.test(key)||!map)return;
  const L=root.L,layer=L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png?key="+encodeURIComponent(key),
   {maxZoom:19,subdomains:"abcd",attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attributions">CARTO</a>'});
  let swapped=false;carto=layer;
  layer.on("tileload",()=>{if(!swapped&&carto===layer&&map){swapped=true;if(base){map.removeLayer(base);base=null}$("le-lens-map-status").textContent="CARTO tiles loaded; markers show the forecast evidence for this hour."}});
  layer.on("tileerror",()=>{if(carto===layer&&map){map.removeLayer(layer);carto=null;if(!base)base=L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"&copy; OpenStreetMap contributors"}).addTo(map);$("le-lens-map-status").textContent="CARTO unavailable; using OpenStreetMap fallback."}});
  layer.addTo(map);
 }catch{$("le-lens-map-status").textContent="Using OpenStreetMap map tiles; CARTO is not available."}
 finally{clearTimeout(timeout)}
}
async function toggle(){
 open=!open;$("le-lens-map-holder").hidden=!open;$("le-lens-toggle").textContent=open?"Hide map":"Show map";
 if(!open)return;
 if(map){requestAnimationFrame(()=>{map.invalidateSize();paint()});return}
 $("le-lens-map-status").textContent="Loading map tiles…";
 try{
  await leaflet();if(!open||!root.L?.map)return;
  const a=primary.region,L=root.L;
  map=L.map("le-lens-map",{center:[a.lat,a.lon],zoom:7,minZoom:4,maxZoom:12,scrollWheelZoom:false});
  base=L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'});
  base.on("tileload",()=>{$("le-lens-map-status").textContent="Basemap tiles loaded. No snowband track is implied."});
  base.on("tileerror",()=>{$("le-lens-map-status").textContent="Map tiles failed. Use the forecast cards and external map link."});
  base.addTo(map);paint();setTimeout(()=>map?.invalidateSize(),20);tryCarto();
 }catch{$("le-lens-map-status").textContent="Map unavailable. Forecast comparison and external map link still work."}
}
root.LakeEffectTimeLens={render};
})(typeof window==="undefined"?globalThis:window);
