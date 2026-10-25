"use strict";
/* Region-level lake-effect context. Curated exposure sectors are heuristics, not band tracks. */
const REGIONS=[
 ["mi-keweenaw","Keweenaw Peninsula","MI","Superior",47.12,-88.57,280,35,"Keweenaw high country"],
 ["mi-marquette","Marquette snowbelt","MI","Superior",46.54,-87.40,300,45,"Marquette and nearby higher terrain"],
 ["mi-paradise","Eastern U.P.","MI","Superior",46.63,-85.04,290,45,"Paradise and Whitefish Point"],
 ["mi-gaylord","Gaylord / Boyne country","MI","Michigan",45.03,-84.67,250,320,"Northern Lower Michigan interior"],
 ["mi-traverse","Traverse City / Kalkaska","MI","Michigan",44.77,-85.62,285,35,"Northwest Lower Michigan"],
 ["mi-grand-rapids","West Michigan snowbelt","MI","Michigan",42.96,-85.67,255,340,"Grand Rapids and inland west Michigan"],
 ["mi-benton-harbor","Southwest Michigan","MI","Michigan",42.12,-86.45,275,355,"Benton Harbor and inland areas"],
 ["wi-ashland","South shore of Superior","WI","Superior",46.59,-90.88,315,55,"Ashland, Bayfield and surrounding snowbelt"],
 ["wi-milwaukee","Wisconsin Lake Michigan shore","WI","Michigan",43.04,-87.91,25,135,"Milwaukee and nearby shoreline"],
 ["oh-cleveland","Cleveland east-side snowbelt","OH","Erie",41.52,-81.55,235,320,"Cleveland east-side higher terrain"],
 ["oh-ashtabula","Northeast Ohio snowbelt","OH","Erie",41.87,-80.79,235,325,"Ashtabula and inland higher ground"],
 ["pa-erie","Erie / northwest Pennsylvania","PA","Erie",42.13,-80.09,230,335,"Erie and inland higher terrain"],
 ["ny-buffalo","Buffalo southtowns","NY","Erie",42.79,-78.84,220,290,"Buffalo southtowns; band position highly variable"],
 ["ny-tug-hill","Tug Hill / Watertown","NY","Ontario",43.97,-75.91,235,315,"Tug Hill plateau and Watertown"],
 ["ny-oswego","Oswego snowbelt","NY","Ontario",43.45,-76.51,245,335,"Southeast Lake Ontario shoreline"]
].map(([id,name,state,lake,lat,lon,from,to,description])=>Object.freeze({id,name,state,lake,lat,lon,windSector:{from,to},description}));
const LAKES={Superior:"Sup",Michigan:"Mich",Huron:"Huron",Erie:"Erie",Ontario:"Ont"};
const HOUR=3600000;
const allowed=Object.fromEntries(REGIONS.map(r=>[r.id,r]));
function num(value,min=-Infinity,max=Infinity){if(value==null||value==="")return null;const n=Number(value);return Number.isFinite(n)&&n>=min&&n<=max?n:null}
function bearing(value){
 if(typeof value==="number")return num(value,0,360);
 const dirs=["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
 const index=dirs.indexOf(String(value||"").trim().toUpperCase());
 return index<0?num(value,0,360):(index*22.5);
}
function sectorContains(angle,sector){
 if(angle==null)return null;
 let a=((angle%360)+360)%360, from=sector.from%360,to=sector.to%360;
 return from<=to?a>=from&&a<=to:a>=from||a<=to;
}
function parseLakeCsv(body,lake,now=Date.now()){
 const lines=String(body||"").replace(/^\uFEFF/,"").trim().split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
 const lakeColumn=LAKES[lake];
 if(!lakeColumn)return {status:"unavailable",reason:"Unknown Great Lake"};
 const isLegacyText=lines.some(line=>/^Year\s+Day\s+Sup\./i.test(line));
 let rows=[];
 if(isLegacyText){
  // Official NOAA rolling 365-day text feed (degrees C, 7 fields per day).
  const ix={Sup:2,Mich:3,Huron:4,Erie:5,Ont:6}[lakeColumn];
  rows=lines.map(line=>{
   const parts=line.split(/\s+/);
   if(parts.length<7||!/^\d{4}$/.test(parts[0])||!/^\d{1,3}$/.test(parts[1]))return null;
   return {year:parts[0],day:parts[1],value:parts[ix]};
  }).filter(Boolean);
 }else{
  // ERDDAP tabledap CSV format retained for fixtures and future fallback.
  const head=lines[0]?.replaceAll('"',"").split(",").map(s=>s.trim().toLowerCase())||[];
  const idx=head.indexOf(lakeColumn.toLowerCase()),yIdx=head.indexOf("year"),dIdx=head.indexOf("day");
  if(idx<0||yIdx<0||dIdx<0)return {status:"unavailable",reason:"NOAA GLSEA date/lake columns absent"};
  rows=lines.slice(1).map(line=>{
   const cells=line.replaceAll('"',"").split(",").map(s=>s.trim());
   return {year:cells[yIdx],day:cells[dIdx],value:cells[idx]};
  });
 }
 const values=[];
 for(const row of rows){
  const year=num(row.year,1995,2100),day=num(row.day,1,366),c=num(row.value,-2,36);
  if(!Number.isInteger(year)||!Number.isInteger(day)||c===null)continue;
  const timestamp=Date.UTC(year,0,day);
  if(new Date(timestamp).getUTCFullYear()!==year)continue;
  if(timestamp<=now+HOUR&&timestamp>=now-14*24*HOUR)values.push({timestamp,c});
 }
 values.sort((a,b)=>b.timestamp-a.timestamp);
 const v=values[0];
 if(!v)return {status:"unavailable",reason:"No recent dated NOAA GLSEA lakewide reading"};
 const age=now-v.timestamp;
 return {status:age<=96*HOUR?"available":"stale",date:new Date(v.timestamp).toISOString(),
  celsius:Math.round(v.c*10)/10,fahrenheit:Math.round((v.c*9/5+32)*10)/10,
  scope:"lakewide surface average",reason:age>96*HOUR?"Lake temperature older than 96 hours":null};
}
function winterAlerts(features=[]){
 return (Array.isArray(features)?features:[]).map(f=>{
  const p=f?.properties||{},event=String(p.event||"");
  const desc=[p.headline,p.description,p.instruction,event].join(" ");
  if(!/snow|winter|blizzard|squall|ice|freez/i.test(event))return null;
  return {event,headline:String(p.headline||event).slice(0,220),severity:String(p.severity||"Unknown"),
   lakeEffect:/lake.effect/i.test(desc),ends:p.ends||p.expires||null,url:String(p["@id"]||p.id||"https://www.weather.gov/")};
 }).filter(Boolean).slice(0,8);
}
function hourRows(periods,sector,now=Date.now()){
 return (Array.isArray(periods)?periods:[]).map(p=>{
  const ts=Date.parse(p.startTime||"");if(!Number.isFinite(ts)||ts<now-2*HOUR||ts>now+72*HOUR)return null;
  const angle=bearing(p.windDirection),aligned=sectorContains(angle,sector),temp=num(p.temperature,-100,140);
  const text=String(p.shortForecast||"");
  // Blowing snow alone is existing snow lifted by wind, not a forecast of fresh precipitation.
  const precipWords=text.replace(/\b(?:patchy\s+|areas of\s+|widespread\s+)?blowing snow\b/gi,"");
  const snow=/\bsnow\b|flurr|snowfall/i.test(precipWords),lakeMention=/lake.effect/i.test(text);
  const rain=/\brain\b|drizzle/i.test(text)&&!snow;
  const pop=num(p.probabilityOfPrecipitation?.value,0,100);
  const evidence=snow&&aligned===true?"snow-and-alignment":snow?"official-snow-forecast":aligned?"wind-only":"no-converging-signal";
  return {at:new Date(ts).toISOString(),temperature_f:temp,wind_from:p.windDirection||null,wind_degrees:angle,
   wind_speed_text:String(p.windSpeed||"").slice(0,35),wind_aligned:aligned,forecast_snow:snow,
   lake_effect_mentioned:lakeMention,rain,precip_chance_pct:pop,short_forecast:text.slice(0,120),evidence};
 }).filter(Boolean).sort((a,b)=>a.at.localeCompare(b.at))
 // Duplicated NWS hourly rows must never inflate coverage, snow, or wind alignment.
 .filter((h,i,all)=>i===0||h.at!==all[i-1].at).slice(0,72);
}
function assess({region,hours=[],alerts=[],lakeTemp,forecastUpdated,now=Date.now()}){
 const hourStart=Math.floor(now/HOUR)*HOUR;
 const future=hours.filter(h=>Date.parse(h.at)>=hourStart&&Date.parse(h.at)<hourStart+72*HOUR);
 const windows=[
  {key:"next-12h",from:0,to:12,label:"Next 12 hours"},
  {key:"hours-12-24",from:12,to:24,label:"12–24 hours"},
  {key:"hours-24-48",from:24,to:48,label:"24–48 hours"},
  {key:"hours-48-72",from:48,to:72,label:"48–72 hours"}
 ].map(w=>{
  const subset=future.filter(h=>{const offset=(Date.parse(h.at)-hourStart)/HOUR;return offset>=w.from&&offset<w.to});
  return {...w,valid_hours:subset.length,snow_hours:subset.filter(h=>h.forecast_snow).length,
   aligned_hours:subset.filter(h=>h.wind_aligned===true).length,
   overlap_hours:subset.filter(h=>h.forecast_snow&&h.wind_aligned===true).length};
 });
 const first=windows[0],aligned=first.aligned_hours,snow=first.snow_hours,matched=first.overlap_hours;
 // A handful of rows in a 24-hour future window cannot establish an event window.
 const covered=w=>w.valid_hours>=Math.max(6,Math.ceil((w.to-w.from)*0.6));
 const forecastMatch=windows.find(w=>covered(w)&&w.overlap_hours>=2);
 const snowfallWindow=windows.find(w=>covered(w)&&w.snow_hours>=2);
 const lesAlert=alerts.some(a=>a.lakeEffect);
 const warning=alerts.some(a=>/Warning|Snow Squall/i.test(a.event));
 const officialSnow=future.some(h=>h.forecast_snow);
 const updatedMs=Date.parse(forecastUpdated||"");
 const fresh=Number.isFinite(updatedMs)&&now-updatedMs>=-HOUR&&now-updatedMs<=12*HOUR;
 // Count only wind values inside the first 12h, even when the NWS series has gaps.
 const current=future.filter(h=>{const t=Date.parse(h.at);return t>=hourStart&&t<hourStart+12*HOUR});
 const windKnown=current.filter(h=>h.wind_degrees!==null).length;
 const complete=first.valid_hours>=6&&windKnown>=6;
 const tempFresh=lakeTemp?.status==="available";
 let level="insufficient",headline="Not enough fresh evidence",confidence="low",windowText="No verified forecast window";
 if(fresh&&complete){
  if(warning){level="winter-hazard";headline="Official winter warning: check local impacts";}
  else if(lesAlert||forecastMatch){level="favored";headline=forecastMatch&&forecastMatch.from>=12?"Later lake-effect setup merits watching":"Snowbelt may see lake-effect impacts";}
  else if(officialSnow){level="forecast-snow";headline="NWS forecasts snow; lake-effect placement uncertain";}
  else if(aligned>=4){level="wind-only";headline="Wind favors this snowbelt; snow not confirmed";}
  else {level="limited";headline="No strong near-term lake-effect signal";}
  const stable=aligned>=8||aligned<=2;
  confidence=tempFresh&&stable&&(lesAlert||matched>=4)?"high":tempFresh&&first.valid_hours>=9?"medium":"low";
  if(windKnown<first.valid_hours*0.8)confidence="low";
  if(!lesAlert&&forecastMatch?.from>=12&&confidence==="high")confidence="medium";
  if(["wind-only","limited","forecast-snow"].includes(level)&&confidence==="high")confidence="medium";
  windowText=forecastMatch?.label||snowfallWindow?.label||(first.aligned_hours>=4?"Next 12 hours: wind setup only":"No verified near-term snow window");
 }
 const impact=warning?"Active NWS warning: follow official travel guidance":
   !fresh||!complete?"NWS hourly forecast is stale or incomplete; future snow impacts cannot be assessed":
   alerts.length?"Active NWS winter alert: check its timing and location":
   forecastMatch?"NWS snow forecast overlaps favorable surface wind; local road impacts not established":
   officialSnow?"NWS forecasts snow; local road impacts not established":"No official snow-impact evidence in the next 72 hours";
 return {level,headline,confidence,confidence_kind:"qualitative evidence agreement; not a probability of snow",
  impact,timing_window:windowText,official_snow_forecast:officialSnow,official_lake_effect_alert:lesAlert,official_warning:warning,
  first_12h:{valid_hours:first.valid_hours,wind_known_hours:windKnown,wind_unknown_hours:first.valid_hours-windKnown,wind_aligned_hours:aligned,snow_forecast_hours:snow,overlap_hours:matched},
  next_24h:{snow_forecast_hours:windows[0].snow_hours+windows[1].snow_hours,wind_aligned_hours:windows[0].aligned_hours+windows[1].aligned_hours},
  next_72h:{snow_forecast_hours:future.filter(h=>h.forecast_snow).length,wind_aligned_hours:future.filter(h=>h.wind_aligned).length},
  windows,caveat:"Wind sectors are broad climatological exposure hints. Local surface winds are not upstream 850-mb winds. No modeled band track, snowfall-total prediction, or probability calibration.",
  data_ok:fresh&&complete,region_id:region.id};
}
module.exports={REGIONS,allowed,LAKES,num,bearing,sectorContains,parseLakeCsv,winterAlerts,hourRows,assess};
