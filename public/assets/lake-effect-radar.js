/* NWS MRMS live reflectivity: observation-only radar for the selected snowbelt.
 * Keyed CARTO basemap with OSM fallback + Leaflet image overlay; no private key, radar analysis,
 * inferred snow type, forecast band path, paid services or site-side cron. */
(function(global){
"use strict";
const ROOT="https://mapservices.weather.noaa.gov/eventdriven/rest/services/radar/radar_base_reflectivity_time/ImageServer";
const LIB="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
const CSS="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const TWO_PI=2*Math.PI,EARTH=6378137,MIN=60000;
const $=id=>document.getElementById(id);
const safe=(v,min,max)=>typeof v==="number"&&Number.isFinite(v)&&v>=min&&v<=max;
let current=null,frames=[],index=0,map=null,pin=null,overlay=null,observer=null,token=0,playTimer=null,loadPromise=null;
let startPromise=null,lastBoundsKey="",lastQuery=null,loaded=false,renderedRegion=null;
let baseLayer=null,cartoLayer=null,cartoFailed=false;
const el=(tag,text,cls)=>{const x=document.createElement(tag);if(text!=null)x.textContent=text;if(cls)x.className=cls;return x};
const stamp=ms=>new Intl.DateTimeFormat(undefined,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit",timeZoneName:"short"}).format(new Date(ms));
const age=ms=>Math.max(0,Math.round((Date.now()-ms)/MIN));
const geo=region=>region&&safe(region.lat,40,49)&&safe(region.lon,-94,-75);
function setStatus(text,error=false){
 const status=$("radar-status");if(!status)return;
 status.textContent=text;status.setAttribute("role",error?"alert":"status");
}
function stop(){
 if(playTimer!==null){clearInterval(playTimer);playTimer=null}
 const btn=$("radar-play");if(btn)btn.textContent="Play radar";
}
function reset(){
 stop();frames=[];index=0;lastBoundsKey="";
 const range=$("radar-time");if(range){range.min="0";range.max="0";range.value="0";range.disabled=true}
 if(overlay&&map){map.removeLayer(overlay);overlay=null}
 const time=$("radar-frame-time");if(time)time.textContent="No verified frame";
 const last=$("radar-latest");if(last)last.disabled=true;
 const play=$("radar-play");if(play)play.disabled=true;
}
function ensureLeaflet(){
 if(global.L?.map)return Promise.resolve();
 if(loadPromise)return loadPromise;
 loadPromise=new Promise((resolve,reject)=>{
  if(!document.querySelector('link[data-lake-radar-leaflet]')){
   const link=document.createElement("link");link.rel="stylesheet";link.href=CSS;
   link.dataset.lakeRadarLeaflet="1";document.head.appendChild(link);
  }
  const script=document.createElement("script");script.src=LIB;script.async=true;script.dataset.lakeRadarLeaflet="1";
  script.onload=()=>global.L?.map?resolve():reject(Error("Map library unavailable"));
  script.onerror=()=>reject(Error("Map library unavailable"));
  document.head.appendChild(script);
 });
 return loadPromise;
}
function rasterBox(){
 const bounds=map.getBounds(),size=map.getSize(),L=global.L;
 const sw=L.CRS.EPSG3857.project(bounds.getSouthWest()),ne=L.CRS.EPSG3857.project(bounds.getNorthEast());
 if(![sw.x,sw.y,ne.x,ne.y].every(Number.isFinite))throw Error("Radar map bounds invalid");
 // Exact Web Mercator image bounds and map pixels, not a warped static radar image.
 return {bbox:[sw.x,sw.y,ne.x,ne.y].map(x=>Math.round(x)),size:[Math.min(1000,Math.max(250,Math.round(size.x))),Math.min(750,Math.max(250,Math.round(size.y)))],bounds};
}
function radarUrl(ms){
 const b=rasterBox(),q=new URLSearchParams();
 q.set("bbox",b.bbox.join(","));q.set("bboxSR","3857");q.set("imageSR","3857");
 q.set("size",b.size.join(","));q.set("format","png32");q.set("transparent","true");
 q.set("interpolation","RSP_NearestNeighbor");q.set("time",String(ms));q.set("f","image");
 return {url:ROOT+"/exportImage?"+q.toString(),bounds:b.bounds,key:b.bbox.join(",")+"|"+b.size.join(",")};
}
function framesFresh(values,now=Date.now()){
 return Array.isArray(values)&&values.length>0&&Number.isFinite(values.at(-1))&&
  values.at(-1)<=now+5*MIN&&now-values.at(-1)<=45*MIN;
}
function draw(){
 if(!map||!frames.length)return;
 if(!framesFresh(frames)){
  reset();setStatus("Radar observations expired while this page was open. Check latest frames for a fresh NOAA view.",true);return;
 }
 const ts=frames[index],t=$("radar-frame-time"),slider=$("radar-time");
 if(t)t.textContent="Radar observation: "+stamp(ts)+" · "+(index+1)+" of "+frames.length+" confirmed frames";
 if(slider)slider.value=String(index);
 const frame=radarUrl(ts);
 if(overlay){
  overlay.setBounds(frame.bounds);overlay.setUrl(frame.url);
 }else{
  overlay=global.L.imageOverlay(frame.url,frame.bounds,{opacity:0.85,interactive:false,className:"lake-radar-raster",alt:"NOAA MRMS quality-controlled base reflectivity image at "+stamp(ts)});
  overlay.on("error",()=>{reset();setStatus("NOAA radar image could not load. Use the official radar viewer.",true)});
  overlay.addTo(map);
 }
 lastBoundsKey=frame.key;
}
const OSM="https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTR='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | Radar &copy; NOAA/NWS';
const CARTO_ATTR='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="https://carto.com/attributions">CARTO</a> | Radar &copy; NOAA/NWS';
function publicTileUrl(key){
 // CARTO basemap keys are explicitly public browser tokens, never server credentials.
 if(typeof key!=="string"||!/^[A-Za-z0-9._~+-]{10,512}$/.test(key))return null;
 return "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png?key="+encodeURIComponent(key);
}
function baseMessage(message){
 const e=$("radar-basemap-status");if(e)e.textContent=message;
}
function fallBackBasemap(){
 if(!map)return;
 cartoFailed=true;
 if(cartoLayer){map.removeLayer(cartoLayer);cartoLayer=null}
 if(!baseLayer){baseLayer=global.L.tileLayer(OSM,{maxZoom:19,attribution:OSM_ATTR}).addTo(map)}
 baseMessage("OpenStreetMap street map · CARTO tiles unavailable");
}
async function loadCartoBasemap(){
 // The site's existing serverless endpoint reads CARTO_BASEMAP_PUBLIC_KEY in
 // the chrisizworski-com Vercel environment. It returns ONLY a browser key.
 // The radar JS is hosted by another project, so never read source env vars.
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),3500);
 try{
  const response=await fetch("/api/carto-basemap-config",{signal:controller.signal,headers:{accept:"application/json"}});
  if(!response.ok)throw Error("No CARTO browser config");
  const data=await response.json();
  const url=data?.provider==="CARTO"?publicTileUrl(data.key):null;
  if(!url)throw Error("CARTO browser key missing or invalid");
  if(!map||cartoFailed)return;
  const L=global.L;
  let switched=false;
  const layer=L.tileLayer(url,{maxZoom:19,subdomains:"abcd",attribution:CARTO_ATTR});
  cartoLayer=layer;
  layer.on("tileload",()=>{
   if(!switched&&!cartoFailed&&map&&cartoLayer===layer){
    switched=true;
    if(baseLayer){map.removeLayer(baseLayer);baseLayer=null}
    baseMessage("CARTO Positron basemap · verified keyed tiles");
   }
  });
  layer.on("tileerror",()=>fallBackBasemap());
  layer.addTo(map);
 }catch{
  baseMessage("OpenStreetMap street map · CARTO key unavailable");
 }finally{clearTimeout(timer)}
}

function makeMap(){
 if(map)return map;
 if(!global.L?.map)throw Error("Map library unavailable");
 const L=global.L;
 map=L.map("radar-map",{center:[current.lat,current.lon],zoom:7,minZoom:4,maxZoom:11,scrollWheelZoom:false,zoomControl:true});
 // Never request CARTO without ?key=: new CARTO tiles render a visible watermark.
 // OpenStreetMap renders immediately, then swaps to keyed CARTO after tileload.
 baseLayer=L.tileLayer(OSM,{maxZoom:19,attribution:OSM_ATTR}).addTo(map);
 baseMessage("Loading your configured CARTO basemap…");
 loadCartoBasemap();
 pin=L.marker([current.lat,current.lon]).addTo(map);
 pin.bindPopup(el("strong",current.name||"Selected snowbelt checkpoint"));
 map.on("movestart",()=>stop());
 map.on("moveend",()=>{if(frames.length){try{draw()}catch{setStatus("Radar bounds cannot be verified.",true)}}});
 return map;
}
function setRegion(region){
 if(!geo(region))return;
 current={id:region.id,name:region.name,lat:region.lat,lon:region.lon};
 const link=$("radar-directions");
 if(link)link.href="https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(region.lat+","+region.lon);
 if(map){
  map.setView([region.lat,region.lon],7,{animate:false});
  pin?.setLatLng([region.lat,region.lon]);
  pin?.bindPopup(el("strong",region.name||"Selected snowbelt"));
  requestAnimationFrame(()=>map.invalidateSize());
 }
}
function queryUrl(region){
 const p=new URLSearchParams({
  geometry:region.lon+","+region.lat,geometryType:"esriGeometryPoint",inSR:"4326",
  spatialRel:"esriSpatialRelIntersects",where:"1=1",
  outFields:"idp_validtime,idp_filedate",returnGeometry:"false",
  orderByFields:"idp_validtime DESC",resultRecordCount:"70",f:"json"
 });
 return ROOT+"/query?"+p;
}
function parseFrames(json,now=Date.now()){
 if(!json||json.error||!Array.isArray(json.features))return [];
 const raw=json.features.map(f=>f?.attributes?.idp_validtime).filter(ms=>safe(ms,now-4*60*MIN,now+5*MIN)).sort((a,b)=>a-b);
 if(!raw.length)return [];
 const unique=[];for(const ms of raw){if(!unique.length||ms-unique[unique.length-1]>=3*MIN)unique.push(ms)}
 if(!framesFresh(unique,now))return [];
 // Preserve actual observed timestamps: ≤13 representative frames across a maximum 4-hour window.
 if(unique.length<=13)return unique;
 const out=[];
 for(let i=0;i<13;i++){const ix=Math.round(i*(unique.length-1)/12),v=unique[ix];if(!out.includes(v))out.push(v)}
 return out;
}
async function jsonFetch(url){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),11000);
 try{
  const res=await fetch(url,{headers:{accept:"application/json"},signal:controller.signal,cache:"no-store"});
  if(!res.ok)throw Error("NOAA radar query returned "+res.status);
  const text=await res.text();if(text.length>450000)throw Error("Radar metadata response too large");
  return JSON.parse(text);
 }finally{clearTimeout(timer)}
}
async function fetchFrames(){
 if(!current)return;
 const region={...current},generation=++token;reset();
 setStatus("Checking timestamped NOAA MRMS radar observations for "+region.name+"…");
 let raw;
 try{raw=await jsonFetch(queryUrl(region))}catch{
  if(generation===token)setStatus("Radar time catalog unavailable. The NWS forecast and charts remain available.",true);
  return;
 }
 if(generation!==token||current.id!==region.id)return;
 const entries=parseFrames(raw);
 if(!entries.length){setStatus("No sufficiently recent, timestamped radar frames verified for this snowbelt. Open the official NWS radar.",true);return}
 frames=entries;index=frames.length-1;
 const slider=$("radar-time");slider.max=String(frames.length-1);slider.value=String(index);slider.disabled=false;
 $("radar-play").disabled=frames.length<2;$("radar-latest").disabled=false;
 setStatus(frames.length+" verified MRMS observation"+(frames.length===1?"":"s")+" spanning "+Math.round((frames.at(-1)-frames[0])/MIN)+" minutes. Latest frame is "+age(frames.at(-1))+" minutes old.");
 try{makeMap();map.invalidateSize();draw()}catch{
  setStatus("Unable to display the radar map here. Use the official NWS radar instead.",true);
 }
}
function play(){
 if(playTimer!==null){stop();return}
 if(!framesFresh(frames)){reset();setStatus("Radar observations have expired. Check latest frames.",true);return}
 if(frames.length<2)return;
 $("radar-play").textContent="Pause radar";
 playTimer=setInterval(()=>{
  if(document.hidden){stop();return}
  index=(index+1)%frames.length;
  try{draw()}catch{stop();setStatus("Radar frame unavailable.",true)}
 },1550);
}
async function initialize(){
 if(loaded||!current)return;
 loaded=true;
 setStatus("Loading the CARTO map and NOAA radar…");
 try{await ensureLeaflet();makeMap();map.invalidateSize();await fetchFrames()}
 catch{loaded=false;loadPromise=null;setStatus("Radar map unavailable. Open the official NWS radar; the other forecast tools still work.",true)}
}
function suspend(){
 ++token;reset();
 setStatus("Radar paused while the selected NWS region is being checked.");
}
function render(d){
 const region=d?.region;if(!geo(region))return;
 const changed=renderedRegion!==region.id;renderedRegion=region.id;
 if(changed){++token;reset()}
 setRegion(region);
 if(changed||loaded&&!frames.length){if(loaded)fetchFrames();else setStatus("Radar loads when this section comes into view.")}
 if(!observer&&"IntersectionObserver" in global){
  observer=new IntersectionObserver(entries=>{
   if(entries.some(e=>e.isIntersecting)){
    observer.disconnect();observer=null;
    initialize();
   }
  },{rootMargin:"450px"});
  const section=$("radar-explorer");if(section)observer.observe(section);
 }else if(!observer&&!loaded){setStatus("Choose Load radar to open the observation map.")}
}
function wire(){
 $("radar-load")?.addEventListener("click",()=>initialize());
 $("radar-play")?.addEventListener("click",play);
 $("radar-latest")?.addEventListener("click",()=>{stop();if(!frames.length)return;index=frames.length-1;draw()});
 $("radar-refresh")?.addEventListener("click",()=>{if(!loaded)initialize();else{stop();fetchFrames()}});
 $("radar-time")?.addEventListener("input",e=>{stop();index=Math.max(0,Math.min(frames.length-1,Number(e.target.value)||0));draw()});
 document.addEventListener("visibilitychange",()=>{if(document.hidden)stop()});
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",wire);else wire();
global.LakeEffectRadar={render,suspend,parseFrames,framesFresh,queryUrl,publicTileUrl};
})(window);
