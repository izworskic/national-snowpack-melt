/* Explainable lake-effect outlook: NWS hours + separately timed GFS model snapshots.
 * SVG, vanilla JavaScript and semantic HTML; no chart CDN or model interpolation. */
(function(global){
"use strict";
const $=id=>document.getElementById(id);
const SVG="http://www.w3.org/2000/svg",HOUR=3600000;
const RANGES=[{from:0,to:12,name:"Next 12h"},{from:12,to:24,name:"12–24h"},{from:24,to:48,name:"24–48h"},{from:48,to:72,name:"48–72h"}];
let data=null,selectedWindow=0,selectedHour=null,selectedModel=null;
const fmt=iso=>new Intl.DateTimeFormat(undefined,{weekday:"short",hour:"numeric",month:"short",day:"numeric"}).format(new Date(iso));
const escapeNum=n=>Number.isFinite(n)?String(Math.round(n*10)/10):"Unavailable";
const el=(tag,txt,cls)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;return e};
const sv=(name,attrs={},text)=>{const x=document.createElementNS(SVG,name);for(const [key,value] of Object.entries(attrs))x.setAttribute(key,String(value));if(text!==undefined)x.textContent=text;return x};
const ms=iso=>Date.parse(iso||"");
const valid=iso=>Number.isFinite(ms(iso));
function rows(){
 const h=(data?.hours||[]).filter(x=>valid(x.at)).slice().sort((a,b)=>ms(a.at)-ms(b.at));
 const first=h[0]?Math.floor(ms(h[0].at)/HOUR)*HOUR:null;
 return {h,first};
}
function rangeHours(index){
 const {h,first}=rows(),w=RANGES[index];
 return h.filter(v=>{const hours=(ms(v.at)-first)/HOUR;return hours>=w.from&&hours<w.to});
}
function modelSamples(){
 return data?.upper_air?.status==="available"?((data.upper_air.forecast||[]).filter(s=>valid(s.valid_at)).sort((a,b)=>ms(a.valid_at)-ms(b.valid_at))):[];
}
function nearestModel(when){
 const candidates=modelSamples();let best=null,diff=Infinity;
 for(const s of candidates){const n=Math.abs(ms(s.valid_at)-when);if(n<diff){diff=n;best=s}}
 return diff<=6*HOUR?{row:best,diffHours:Math.round(diff/HOUR*10)/10}:null;
}
function shortNarrative(h,windowIndex){
 const validCount=h.length,snow=h.filter(v=>v.forecast_snow).length,
 aligned=h.filter(v=>v.wind_aligned===true).length,
 together=h.filter(v=>v.forecast_snow&&v.wind_aligned===true).length,
 missing=h.filter(v=>v.wind_degrees==null).length,
 poor=h.filter(v=>v.rain).length;
 let title,body;
 if(!validCount){title="Forecast hours unavailable";body="This window has no validated NWS hourly rows. No regional lake-effect inference is possible."}
 else if(together>=2){title="Forecast snow and favored wind overlap";body="The NWS forecasts snow while local surface winds favor this regional snowbelt in "+together+" of "+validCount+" available hours. This raises the reason to monitor the forecast—not certainty about where a snowband will settle."}
 else if(snow){title="Snow forecast, band placement uncertain";body="The NWS mentions snow in "+snow+" of "+validCount+" available hours, but the regional wind-alignment screen overlaps for only "+together+". Snow is possible without a confident lake-effect placement claim."}
 else if(aligned){title="Wind points toward the snowbelt; snow not forecast";body="Surface wind favors this snowbelt in "+aligned+" of "+validCount+" available hours. NWS forecasts no snow during these hours. Favorable wind alone is not a lake-effect event."}
 else{title="Limited converging snow evidence";body="Neither NWS forecast snow nor favorable regional wind overlap is evident in these "+validCount+" hourly rows. Conditions may change with later forecast updates."}
 let change="";
 if(windowIndex>0){
  const prev=rangeHours(windowIndex-1),prevSnow=prev.filter(v=>v.forecast_snow&&v.wind_aligned===true).length;
  if(prev.length&&validCount){
   const here=together/validCount,there=prevSnow/prev.length;
   if(here>there+0.12)change="The share of forecast hours with both signals rises compared with the preceding window.";
   else if(here<there-0.12)change="The share of forecast hours with both signals falls compared with the preceding window.";
   else change="The share of forecast hours with both signals changes little from the preceding window.";
  }
 }
 if(missing)change+=(change?" ":"")+missing+" hour"+(missing===1?" lacks":"s lack")+" NWS wind direction; no alignment is inferred for those hours.";
 if(poor)change+=(change?" ":"")+"Some NWS rows also mention rain; check precipitation type at the actual location.";
 const les=(data?.alerts||[]).some(x=>x.lakeEffect),warning=(data?.verdict?.official_warning===true);
 let official=warning?"An active NWS warning takes priority over the model charts. Check its geographic coverage and timing.":les?"An active official alert explicitly mentions lake effect. Review it before using this regional interpretation.":"There is no active lake-effect-specific alert returned for this representative point; adjacent counties may differ.";
 return {title,body,change,official,validCount,snow,aligned,together,missing};
}
function modelExplanation(when){
 const a=data?.upper_air,found=a?.status==="available"?nearestModel(when):null;
 if(!found)return a?.status==="stale"?"The GFS model feed is stale or has no nearby valid time. The chart does not guess upper-air conditions.":"No fresh, nearby GFS 850/925-mb sample is available. Only the NWS point forecast is interpreted.";
 const s=found.row;
 let contrast=s.delta_t_c==null?"The NOAA lake-temperature reading is not fresh enough to calculate a lake-to-air contrast.":s.delta_t_c>=13?"Water minus 850-mb air is "+escapeNum(s.delta_t_c)+"°C, meeting the conventional ~13°C instability screening guideline. Moisture, inversion height, fetch and NWS snow forecasts still determine whether this matters.":s.delta_t_c>=8?"Water minus 850-mb air is "+escapeNum(s.delta_t_c)+"°C, a moderate temperature contrast below the conventional ~13°C guideline. This alone neither proves nor excludes lake-effect snow.":"Water minus 850-mb air is "+escapeNum(s.delta_t_c)+"°C, a relatively limited temperature contrast at this offshore GFS point. It does not override an official NWS snow forecast.";
 const shear=s.shear_925_850_deg;
 const wind=Number.isFinite(shear)?(shear>60?"The model winds turn sharply ("+escapeNum(shear)+"°) from 925 to 850 mb, a possible impediment to coherent bands.":shear>30?"The model winds change direction by "+escapeNum(shear)+"° between 925 and 850 mb; organization remains uncertain.":"The model winds turn "+escapeNum(shear)+"° from 925 to 850 mb, suggesting comparatively consistent direction between these two sampled levels."):"Two-level wind turning is unavailable.";
 const offset=found.diffHours>0?" Nearest model valid time differs by "+found.diffHours+" hour"+(found.diffHours===1?"":"s")+"; no hourly GFS values have been interpolated.":"";
 return "GFS offshore snapshot valid "+fmt(s.valid_at)+". "+contrast+" "+wind+offset;
}
function select(index,at=null){
 if(!data)return;
 selectedWindow=Math.max(0,Math.min(3,index));selectedHour=at;selectedModel=null;
 paint();
}
function selectModel(iso){
 selectedModel=iso;
 const {first}=rows();
 const offset=(ms(iso)-first)/HOUR;
 if(Number.isFinite(offset))selectedWindow=Math.max(0,Math.min(3,RANGES.findIndex(w=>offset>=w.from&&offset<w.to)>=0?RANGES.findIndex(w=>offset>=w.from&&offset<w.to):3));
 selectedHour=null;paint();
}
function plot(id,metric,threshold=null){
 const svg=$(id);svg.replaceChildren();
 const samples=modelSamples().filter(s=>typeof s[metric]==="number"&&Number.isFinite(s[metric]));
 svg.setAttribute("role","img");
 svg.setAttribute("aria-label",metric==="delta_t_c"?"NOAA GFS model lake to 850 millibar air-temperature contrast at discrete forecast hours":"NOAA GFS model directional turning from 925 to 850 millibars at discrete forecast hours");
 if(!samples.length){svg.appendChild(sv("text",{x:20,y:98,fill:"#536879","font-size":16},"No fresh model observations to plot"));return}
 const {first}=rows(),start=first??ms(samples[0].valid_at),left=47,right=456,top=18,bottom=182;
 const values=samples.map(s=>s[metric]),lo=metric==="delta_t_c"?Math.min(-5,Math.floor(Math.min(...values)/5)*5):0;
 const hi=metric==="delta_t_c"?Math.max(20,Math.ceil(Math.max(...values)/5)*5):180;
 const X=t=>left+((t-start)/HOUR)/72*(right-left),Y=v=>bottom-(v-lo)/(hi-lo)*(bottom-top);
 const bg=sv("rect",{x:left+RANGES[selectedWindow].from/72*(right-left),y:top,width:(RANGES[selectedWindow].to-RANGES[selectedWindow].from)/72*(right-left),height:bottom-top,fill:"#e1f1f1"});
 svg.appendChild(bg);
 for(const tick of [0,12,24,48,72]){
  const x=left+tick/72*(right-left);svg.appendChild(sv("line",{x1:x,y1:top,x2:x,y2:bottom,stroke:"#dde7ea","stroke-width":1}));
  svg.appendChild(sv("text",{x,y:206,"text-anchor":"middle","font-size":11,fill:"#596f7c"},"+"+tick+"h"));
 }
 const ticks=metric==="delta_t_c"?[lo,0,8,13,hi].filter((v,i,a)=>v>=lo&&v<=hi&&a.indexOf(v)===i).sort((a,b)=>a-b):[0,30,60,90,180];
 ticks.forEach(v=>{const y=Y(v);svg.appendChild(sv("line",{x1:left,y1:y,x2:right,y2:y,stroke:"#dbe4e8","stroke-dasharray":"3 4"}));svg.appendChild(sv("text",{x:41,y:y+4,"text-anchor":"end","font-size":11,fill:"#536776"},String(v)+"°"))});
 if(threshold!==null&&threshold>=lo&&threshold<=hi){
  svg.appendChild(sv("line",{x1:left,y1:Y(threshold),x2:right,y2:Y(threshold),stroke:"#a8651b","stroke-width":2,"stroke-dasharray":"6 5"}));
  svg.appendChild(sv("text",{x:right-2,y:Y(threshold)-7,"text-anchor":"end","font-size":11,fill:"#8b5517"},"13°C screen"));
 }
 const color=metric==="delta_t_c"?"#067d84":"#304f83";
 // No interpolated line: bars/markers represent only the published forecast snapshots.
 for(const s of samples){
  const x=X(ms(s.valid_at)),y=Y(s[metric]);if(x<left-2||x>right+2)continue;
  const active=selectedModel===s.valid_at;
  svg.appendChild(sv("line",{x1:x,y1:bottom,x2:x,y2:y,stroke:color,"stroke-width":active?5:3,"stroke-opacity":.55}));
  const dot=sv("circle",{cx:x,cy:y,r:active?7:5,fill:color,stroke:"#fff","stroke-width":2,tabindex:"0",role:"button","aria-label":fmt(s.valid_at)+": "+escapeNum(s[metric])+" degrees. Select model snapshot."});
  dot.addEventListener("click",()=>selectModel(s.valid_at));
  dot.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();selectModel(s.valid_at)}});
  svg.appendChild(dot);
 }
}
function paint(){
 const periods=$("story-periods");periods.replaceChildren();
 RANGES.forEach((w,i)=>{
  const hs=rangeHours(i),overlap=hs.filter(h=>h.forecast_snow&&h.wind_aligned===true).length;
  const btn=el("button",w.name+(overlap?" · "+overlap+" overlap":" · no overlap"),"story-period"+(i===selectedWindow?" active":""));
  btn.type="button";btn.setAttribute("aria-pressed",String(i===selectedWindow));btn.addEventListener("click",()=>select(i));periods.appendChild(btn);
 });
 const h=rangeHours(selectedWindow),info=shortNarrative(h,selectedWindow);
 $("story-title").textContent=info.title;
 const what=$("story-what");what.replaceChildren();what.appendChild(el("p",info.body));if(info.change)what.appendChild(el("p",info.change));what.appendChild(el("p",info.official,"small"));
 const time=selectedHour?ms(selectedHour):selectedModel?ms(selectedModel):h.length?ms(h[0].at):null;
 let selectedIntro="";
 if(selectedHour){const row=(data.hours||[]).find(s=>s.at===selectedHour);
  if(row)selectedIntro="Selected NWS hour "+fmt(row.at)+": "+(row.short_forecast||"forecast text unavailable")+". Surface wind "+(row.wind_from||"not supplied")+". ";
 }else if(selectedModel){selectedIntro="Selected offshore model snapshot "+fmt(selectedModel)+". "}
 $("story-model").textContent=selectedIntro+modelExplanation(time??Date.now());
 $("story-range").textContent="This window contains "+info.validCount+" NWS hourly rows, "+info.snow+" with forecast snow and "+info.aligned+" with regionally favorable surface wind. Charts display separate GFS forecast valid times, not hourly or neighborhood precision.";
 const list=$("story-evidence");list.replaceChildren();
 (data.hours||[]).filter(x=>valid(x.at)).slice(0,72).forEach(v=>{
  const w=RANGES.findIndex(z=>{const delta=(ms(v.at)-rows().first)/HOUR;return delta>=z.from&&delta<z.to});
  const button=el("button",null,"story-hour"+(w===selectedWindow?" in-window":"")+(selectedHour===v.at?" active":""));
  button.type="button";button.setAttribute("aria-label",fmt(v.at)+": "+(v.forecast_snow?"NWS forecasts snow":(v.short_forecast||"No forecast snow"))+"; wind "+(v.wind_aligned===true?"regionally favorable":v.wind_aligned===null?"not reported":"not aligned"));
  button.title=button.getAttribute("aria-label");
  button.dataset.kind=v.forecast_snow&&v.wind_aligned===true?"both":v.forecast_snow?"snow":v.wind_aligned===true?"wind":"other";
  button.setAttribute("aria-pressed",String(selectedHour===v.at));
  button.addEventListener("click",()=>select(w>=0?w:0,v.at));
  list.appendChild(button);
 });
 plot("story-contrast","delta_t_c",13);plot("story-shear","shear_925_850_deg");
 const hasModel=modelSamples().length>0;
 $("story-model-note").textContent=hasModel?"Vertical stems are individual offshore GFS forecast snapshots, not interpolated hourly values. Light shading marks the selected NWS time window. The 13°C contrast is a screening guideline, not a snow probability.":"Model charts are unavailable or stale. The NWS hourly evidence above remains available independently.";
}
function render(incoming){
 data=incoming;selectedWindow=0;selectedHour=null;selectedModel=null;
 const w=incoming?.verdict?.windows||[];
 const firstOverlap=w.findIndex(v=>v.overlap_hours>=2),firstSnow=w.findIndex(v=>v.snow_hours>=2);
 // Start with the first meaningful NWS window instead of inventing a future 'best' day.
 if(firstOverlap>=0)selectedWindow=firstOverlap;else if(firstSnow>=0)selectedWindow=firstSnow;
 if($("story-periods"))paint();
}
global.LakeEffectExplainer={render};
})(window);
