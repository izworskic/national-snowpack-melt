const SNODAS = require("../lib/nohrsc-snodas");
const NOHRSC_BASE = "https://www.nohrsc.noaa.gov/nsa/discussions_text/National";
const NWS_POINTS = "https://api.weather.gov/points";
const IEM_LSR = "https://mesonet.agron.iastate.edu/geojson/lsr.php";
const ROUTING_BASE_URL = process.env.ROUTING_BASE_URL?.trim() || "https://router.project-osrm.org";
const UA = "ChrisIzworskiGoodSnow/1.1 (+https://chrisizworski.com/national-tools/snow/)";

const MAX_ROUTE_POINTS = 23;
const FORECAST_LIMIT = 10;
const HOUR = 3600e3;

const DESTINATIONS = [
  { id:"gaylord", name:"Gaylord", region:"Northern Lower", lat:45.0275, lon:-84.6748 },
  { id:"grayling", name:"Grayling", region:"Northern Lower", lat:44.6614, lon:-84.7148 },
  { id:"kalkaska", name:"Kalkaska", region:"Northern Lower", lat:44.7342, lon:-85.1759 },
  { id:"mancelona", name:"Mancelona", region:"Northern Lower", lat:44.9022, lon:-85.0609 },
  { id:"cadillac", name:"Cadillac", region:"Northern Lower", lat:44.2519, lon:-85.4012 },
  { id:"petoskey", name:"Petoskey", region:"Northern Lower", lat:45.3733, lon:-84.9553 },
  { id:"harbor-springs", name:"Harbor Springs", region:"Northern Lower", lat:45.4317, lon:-84.9920 },
  { id:"traverse-city", name:"Traverse City", region:"Northwest Lower", lat:44.7631, lon:-85.6206 },
  { id:"wellston", name:"Wellston", region:"Northwest Lower", lat:44.2156, lon:-85.9562 },
  { id:"newberry", name:"Newberry", region:"Eastern U.P.", lat:46.3550, lon:-85.5096 },
  { id:"paradise", name:"Paradise", region:"Eastern U.P.", lat:46.6275, lon:-85.0371 },
  { id:"sault-ste-marie", name:"Sault Ste. Marie", region:"Eastern U.P.", lat:46.4953, lon:-84.3453 },
  { id:"munising", name:"Munising", region:"Central U.P.", lat:46.4111, lon:-86.6479 },
  { id:"grand-marais", name:"Grand Marais", region:"Central U.P.", lat:46.6700, lon:-85.9850 },
  { id:"negaunee", name:"Negaunee", region:"Central U.P.", lat:46.4991, lon:-87.6118 },
  { id:"ishpeming", name:"Ishpeming", region:"Central U.P.", lat:46.4885, lon:-87.6676 },
  { id:"marquette", name:"Marquette", region:"Central U.P.", lat:46.5436, lon:-87.3954 },
  { id:"baraga", name:"Baraga", region:"Western U.P.", lat:46.7785, lon:-88.4890 },
  { id:"houghton", name:"Houghton", region:"Keweenaw", lat:47.1211, lon:-88.5694 },
  { id:"calumet", name:"Calumet", region:"Keweenaw", lat:47.2466, lon:-88.4540 },
  { id:"ontonagon", name:"Ontonagon", region:"Western U.P.", lat:46.8711, lon:-89.3140 },
  { id:"berglund", name:"Bergland", region:"Western U.P.", lat:46.5913, lon:-89.5738 },
  { id:"ironwood", name:"Ironwood", region:"Western U.P.", lat:46.4547, lon:-90.1710 }
];

const PROFILES = {
  any:      { label:"Any winter day", usable:4, good:8, excellent:14, baseWeight:60, freshWeight:20, survivalWeight:20 },
  snowshoe: { label:"Snowshoe", usable:5, good:9, excellent:15, baseWeight:65, freshWeight:15, survivalWeight:20 },
  xc:       { label:"XC ski", usable:4, good:7, excellent:12, baseWeight:65, freshWeight:15, survivalWeight:20 },
  kids:     { label:"Kids / sledding", usable:2, good:5, excellent:8, baseWeight:55, freshWeight:25, survivalWeight:20 },
  photo:    { label:"Winter photos", usable:2, good:5, excellent:10, baseWeight:50, freshWeight:30, survivalWeight:20 }
};

function finite(v, min = -Infinity, max = Infinity) {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}
function round1(v) { return v == null ? null : Math.round(Number(v) * 10) / 10; }
function rad(v) { return Number(v) * Math.PI / 180; }
function miles(lat1, lon1, lat2, lon2) {
  const a = finite(lat1,-90,90), b = finite(lon1,-180,180), c = finite(lat2,-90,90), d = finite(lon2,-180,180);
  if ([a,b,c,d].some(v => v == null)) return Infinity;
  const dl = rad(c-a), dn = rad(d-b);
  const x = Math.sin(dl/2)**2 + Math.cos(rad(a))*Math.cos(rad(c))*Math.sin(dn/2)**2;
  return 3958.7613 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
}
function median(values) {
  const a = values.filter(Number.isFinite).slice().sort((x,y)=>x-y);
  if (!a.length) return null;
  const m = Math.floor(a.length/2);
  return a.length % 2 ? a[m] : (a[m-1]+a[m])/2;
}
function isoNohrsc(value) {
  const m = String(value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2})/);
  return m ? new Date(Date.UTC(+m[1],+m[2]-1,+m[3],+m[4])).toISOString() : null;
}
function ymd(date) { return date.toISOString().slice(0,10).replace(/-/g,""); }
function reportAnchor(now = new Date()) {
  const anchor = new Date(now);
  if (anchor.getUTCHours() < 6) anchor.setUTCDate(anchor.getUTCDate()-1);
  anchor.setUTCHours(6,0,0,0);
  return anchor;
}
function nohrscUrl(variable, date) {
  const stamp = ymd(date);
  return `${NOHRSC_BASE}/${variable}/${stamp.slice(0,6)}/${variable}_${stamp}06_e.txt`;
}
async function fetchText(url, timeout=4500) {
  const r = await fetch(url,{headers:{accept:"text/plain,*/*;q=0.8","user-agent":UA},signal:AbortSignal.timeout(timeout)});
  if (!r.ok) throw new Error(`${new URL(url).hostname} returned ${r.status}`);
  return r.text();
}
async function fetchJson(url, timeout=4500) {
  const r = await fetch(url,{headers:{accept:"application/geo+json,application/json","user-agent":UA},signal:AbortSignal.timeout(timeout)});
  const body = await r.text();
  if (!r.ok) throw new Error(`${new URL(url).hostname} returned ${r.status}`);
  try { return JSON.parse(body); } catch { throw new Error(`${new URL(url).hostname} returned non-JSON`); }
}
function nohrscRows(body) {
  const out=[];
  for (const line of String(body||"").split(/\r?\n/).map(s=>s.trim()).filter(Boolean)) {
    if (line.startsWith("!") || /^Station_Id\|/i.test(line)) continue;
    const p=line.split("|");
    if (p.length<9) continue;
    const lat=finite(p[2],-90,90), lon=finite(p[3],-180,180), amount=finite(p[7],0,150);
    if (!p[0] || lat==null || lon==null || amount==null) continue;
    out.push({station_id:p[0],name:p[1]||p[0],lat,lon,observed_at:isoNohrsc(p[6]),amount,unit:p[8]||"in"});
  }
  return out;
}
async function fetchNohrsc(variable, date) {
  let last;
  for (let offset=0; offset<3; offset++) {
    const d=new Date(date); d.setUTCDate(d.getUTCDate()-offset);
    const url=nohrscUrl(variable,d);
    try {
      const rows=nohrscRows(await fetchText(url,3500));
      if (rows.length) return {rows,url,date:d.toISOString()};
    } catch (e) { last=e; }
  }
  throw last || new Error(`NOHRSC ${variable} unavailable`);
}
function nearby(rows, lat, lon, radius=60, limit=5) {
  return (rows||[]).map(r=>({...r,distance_miles:miles(lat,lon,r.lat,r.lon)}))
    .filter(r=>Number.isFinite(r.distance_miles)&&r.distance_miles<=radius)
    .sort((a,b)=>a.distance_miles-b.distance_miles).slice(0,limit);
}
function packConsensus(rows, lat, lon) {
  const near=nearby(rows,lat,lon,60,5);
  const core=near.filter(r=>r.distance_miles<=35).slice(0,3);
  const sample=core.length?core:near.slice(0,2);
  if (!sample.length) return {depth:null,confidence:"low",station_count:0,distance_miles:null,spread:null,observed_at:null,stations:[]};
  const depth=round1(median(sample.map(r=>r.amount)));
  const spread=round1(Math.max(...sample.map(r=>r.amount))-Math.min(...sample.map(r=>r.amount)));
  let confidence="low";
  if (sample.length>=3 && sample[2].distance_miles<=35 && spread<=10) confidence="high";
  else if (sample.length>=2 && sample[1].distance_miles<=45) confidence="medium";
  else if (sample[0].distance_miles<=25) confidence="medium";
  return {
    depth, confidence, station_count:sample.length, distance_miles:round1(sample[0].distance_miles),
    spread, observed_at:sample.map(r=>r.observed_at).filter(Boolean).sort().at(-1)||null,
    stations:sample.map(r=>({id:r.station_id,name:r.name,distance_miles:round1(r.distance_miles),depth:round1(r.amount)}))
  };
}
function fusePack(grid, observed, priorObserved) {
  const modelDepth=finite(grid&&grid.depth_inches,0,300);
  const swe=finite(grid&&grid.swe_inches,0,100);
  const stationDepth=finite(observed&&observed.depth,0,150);
  const priorDepth=finite(priorObserved&&priorObserved.depth,0,150);
  const change=stationDepth!=null&&priorDepth!=null?round1(stationDepth-priorDepth):null;
  if (modelDepth==null) {
    return {
      ...(observed||{depth:null,confidence:"low",station_count:0,distance_miles:null,spread:null,observed_at:null,stations:[]}),
      change_24h:change, change_basis:change==null?null:"station-consensus",
      source:"station-fallback", model_depth:null, swe_inches:swe, station_depth:stationDepth,
      validation_delta:null, validation:"model unavailable"
    };
  }
  let confidence="medium", validation="model only", delta=null;
  if (stationDepth!=null) {
    delta=round1(Math.abs(modelDepth-stationDepth));
    const stationConfidence=observed&&observed.confidence||"low";
    if (delta<=4 && stationConfidence==="high") { confidence="high"; validation="model and stations closely agree"; }
    else if (delta<=7 && stationConfidence!=="low") { confidence="high"; validation="model and stations agree"; }
    else if (delta<=12) { confidence="medium"; validation="model and stations are reasonably consistent"; }
    else { confidence="low"; validation="model and stations disagree"; }
  }
  return {
    depth:round1(modelDepth), confidence, source:"nohrsc-snodas-1km", model_depth:round1(modelDepth), swe_inches:round1(swe),
    station_depth:round1(stationDepth), station_confidence:observed&&observed.confidence||"low",
    station_count:observed&&observed.station_count||0, distance_miles:observed&&observed.distance_miles??null,
    spread:observed&&observed.spread??null, observed_at:observed&&observed.observed_at||null,
    stations:observed&&observed.stations||[], validation_delta:delta, validation,
    change_24h:change, change_basis:change==null?null:"station-consensus"
  };
}
function recentSnowRows(geojson, nowMs=Date.now()) {
  return (geojson && geojson.features || []).map(f=>{
    const p=f&&f.properties||{};
    const coords=Array.isArray(f&&f.geometry&&f.geometry.coordinates)?f.geometry.coordinates:[];
    const amount=finite(p.magnitude,0,80), valid=Date.parse(p.valid);
    const lat=finite(p.lat ?? coords[1],-90,90), lon=finite(p.lon ?? coords[0],-180,180);
    if (String(p.typetext||"").toUpperCase()!=="SNOW" || amount==null || !Number.isFinite(valid) || lat==null || lon==null) return null;
    return {amount,reported_at:new Date(valid).toISOString(),lat,lon,place:String(p.city||"").trim(),remark:String(p.remark||"").replace(/\s+/g," ").trim().slice(0,160)};
  }).filter(Boolean).filter(r=>nowMs-Date.parse(r.reported_at)<=72*HOUR);
}
function recentSnowNear(rows, lat, lon) {
  const hits=(rows||[]).map(r=>({...r,distance_miles:miles(lat,lon,r.lat,r.lon)}))
    .filter(r=>r.distance_miles<=35).sort((a,b)=>b.amount-a.amount || a.distance_miles-b.distance_miles);
  const r=hits[0];
  return r ? {inches:round1(r.amount),distance_miles:round1(r.distance_miles),place:r.place,reported_at:r.reported_at,remark:r.remark} : null;
}
async function fetchRecentSnow(nowMs=Date.now()) {
  const from=new Date(nowMs-72*HOUR).toISOString().replace(/\.\d{3}Z$/,"Z");
  const to=new Date(nowMs).toISOString().replace(/\.\d{3}Z$/,"Z");
  const url=`${IEM_LSR}?states=MI&sts=${encodeURIComponent(from)}&ets=${encodeURIComponent(to)}`;
  return {rows:recentSnowRows(await fetchJson(url,5000),nowMs),url};
}
function forecastSummary(periods, limitHours=96, updatedAt=null) {
  const hours=(Array.isArray(periods)?periods:[]).slice(0,Math.max(12,Math.min(120,Math.round(limitHours)))).map(p=>{
    const text=String(p.shortForecast||"").toLowerCase();
    const temp=finite(p.temperature,-100,140);
    const pop=finite(p.probabilityOfPrecipitation&&p.probabilityOfPrecipitation.value,0,100);
    return {time:p.startTime||null,temp_f:temp,pop,snow:/\bsnow|flurr/.test(text),rain:/\brain|drizzle|shower/.test(text)&&!/\bsnow/.test(text)};
  }).filter(h=>h.time&&h.temp_f!=null);
  const temps=hours.map(h=>h.temp_f);
  return {
    updated_at:updatedAt,hours:hours.length,
    max_temperature_f:temps.length?Math.max(...temps):null,
    min_temperature_f:temps.length?Math.min(...temps):null,
    above_freezing_hours:hours.filter(h=>h.temp_f>32).length,
    warm_40f_hours:hours.filter(h=>h.temp_f>=40).length,
    rain_signal_hours:hours.filter(h=>h.rain && (h.pop==null || h.pop>=30)).length,
    snow_signal_hours:hours.filter(h=>h.snow && (h.pop==null || h.pop>=30)).length
  };
}
async function nwsForecast(lat, lon, hours) {
  const pointUrl=`${NWS_POINTS}/${Number(lat).toFixed(3)},${Number(lon).toFixed(3)}`;
  const points=await fetchJson(pointUrl,3500);
  const hourlyUrl=points&&points.properties&&points.properties.forecastHourly;
  if (!hourlyUrl) throw new Error("NWS hourly forecast link unavailable");
  const hourly=await fetchJson(hourlyUrl,4000);
  return {summary:forecastSummary(hourly&&hourly.properties&&hourly.properties.periods,hours,hourly&&hourly.properties&&hourly.properties.updated),point_url:pointUrl,hourly_url:hourlyUrl};
}
function estimatedDriveMinutes(origin, d) {
  const mi=miles(origin.lat,origin.lon,d.lat,d.lon);
  return Math.max(10,Math.round(mi/48*60+12));
}
async function routeCandidates(origin, candidates) {
  const selected=candidates.slice(0,MAX_ROUTE_POINTS);
  const coords=[`${origin.lon.toFixed(6)},${origin.lat.toFixed(6)}`,...selected.map(d=>`${d.lon.toFixed(6)},${d.lat.toFixed(6)}`)];
  const dest=selected.map((_,i)=>String(i+1)).join(";");
  const url=`${ROUTING_BASE_URL}/table/v1/driving/${coords.join(";")}?sources=0&destinations=${dest}&annotations=duration,distance`;
  try {
    const r=await fetchJson(url,2200);
    if (r.code!=="Ok") throw new Error("routing response not Ok");
    return selected.map((d,i)=>{
      const sec=r.durations&&r.durations[0]&&r.durations[0][i], meters=r.distances&&r.distances[0]&&r.distances[0][i];
      return {...d,drive_minutes:Number.isFinite(sec)?Math.max(1,Math.round(sec/60)):estimatedDriveMinutes(origin,d),
        distance_miles:Number.isFinite(meters)?Math.round(meters/1609.344):Math.round(miles(origin.lat,origin.lon,d.lat,d.lon)),
        travel_source:Number.isFinite(sec)?"routed":"estimated"};
    });
  } catch {
    return selected.map(d=>({...d,drive_minutes:estimatedDriveMinutes(origin,d),distance_miles:Math.round(miles(origin.lat,origin.lon,d.lat,d.lon)),travel_source:"estimated"}));
  }
}
function component(value, usable, good, excellent, weight) {
  if (value==null || value<=0) return 0;
  if (value<usable) return weight*0.25*(value/usable);
  if (value<good) return weight*(0.25+0.45*((value-usable)/(good-usable)));
  if (value<excellent) return weight*(0.70+0.30*((value-good)/(excellent-good)));
  return weight;
}
function survival(f) {
  if (!f || !f.hours) return {factor:0.45,label:"forecast uncertain",risk:"unknown"};
  if (f.rain_signal_hours>=3 && f.above_freezing_hours>=12 && f.max_temperature_f>=38) return {factor:0.05,label:"warm rain threatens the pack",risk:"high"};
  if (f.warm_40f_hours>=10 || (f.above_freezing_hours>=24 && f.max_temperature_f>=38)) return {factor:0.30,label:"thaw pressure before the trip",risk:"elevated"};
  if (f.snow_signal_hours>=4 && f.max_temperature_f<=36) return {factor:1,label:"cold with more snow possible",risk:"low"};
  if (f.above_freezing_hours<=6 && f.max_temperature_f<=35) return {factor:0.95,label:"cold enough to hold the pack",risk:"low"};
  if (f.above_freezing_hours>=8) return {factor:0.65,label:"some freeze-thaw pressure",risk:"moderate"};
  return {factor:0.80,label:"pack should mostly hold",risk:"low-to-moderate"};
}
function lowerConfidence(c) { return c==="high"?"medium":"low"; }
function scoreDestination(d, activity="any", forecast=null) {
  const p=PROFILES[activity]||PROFILES.any;
  const base=component(d.pack.depth,p.usable,p.good,p.excellent,p.baseWeight);
  const freshIn=d.recent_snow&&d.recent_snow.inches||0;
  const fresh=Math.min(p.freshWeight,p.freshWeight*(freshIn/6));
  const s=survival(forecast);
  const survive=p.survivalWeight*s.factor;
  let confidence=d.pack.confidence;
  if (!forecast || !forecast.hours) confidence=lowerConfidence(confidence);
  const raw=base+fresh+survive;
  const cap=confidence==="high"?100:confidence==="medium"?90:75;
  const score=Math.max(0,Math.min(cap,Math.round(raw/5)*5));
  const quality=score>=85?"excellent":score>=70?"good":score>=50?"fair":score>=30?"marginal":"poor";
  return {score,quality,confidence,components:{base:Math.round(base),fresh:Math.round(fresh),survival:Math.round(survive)},survival:s};
}
function why(d) {
  const bits=[];
  if (d.pack.depth!=null) {
    bits.push(d.pack.source==="nohrsc-snodas-1km"?`${d.pack.depth}\" NOAA/NOHRSC 1-km modeled depth`:`${d.pack.depth}\" nearby measured-depth fallback`);
  }
  if (d.recent_snow&&d.recent_snow.inches>0) bits.push(`${d.recent_snow.inches}\" recent NWS snowfall report nearby`);
  if (d.pack.validation==="model and stations disagree") bits.push("model/station disagreement lowers confidence");
  bits.push(d.model.survival.label);
  return bits.join(" · ");
}
async function buildDiscovery({lat,lon,driveHours=3,activity="any",tripHours=72,nowMs=Date.now()}) {
  const origin={lat,lon};
  const maxMinutes=Math.max(60,Math.min(300,Math.round(driveHours*60)));
  const pre=DESTINATIONS.map(d=>({...d,estimated:estimatedDriveMinutes(origin,d)}))
    .filter(d=>d.estimated<=maxMinutes*1.35).sort((a,b)=>a.estimated-b.estimated).slice(0,MAX_ROUTE_POINTS);
  const anchor=reportAnchor(new Date(nowMs));
  const prior=new Date(anchor); prior.setUTCDate(prior.getUTCDate()-1);
  const settled=await Promise.allSettled([
    fetchNohrsc("snowdepth",anchor),
    fetchNohrsc("snowdepth",prior),
    fetchRecentSnow(nowMs),
    routeCandidates(origin,pre),
    SNODAS.fetchGrid(pre,fetchJson),
    SNODAS.fetchMetadata(fetchJson)
  ]);
  const depthNow=settled[0].status==="fulfilled"?settled[0].value:null;
  const depthPrior=settled[1].status==="fulfilled"?settled[1].value:null;
  const lsr=settled[2].status==="fulfilled"?settled[2].value:null;
  const routed=settled[3].status==="fulfilled"?settled[3].value:pre.map(d=>({...d,drive_minutes:d.estimated,distance_miles:Math.round(miles(lat,lon,d.lat,d.lon)),travel_source:"estimated"}));
  const grid=settled[4].status==="fulfilled"?settled[4].value:null;
  const gridMeta=settled[5].status==="fulfilled"?settled[5].value:null;
  let candidates=routed.filter(d=>d.drive_minutes<=maxMinutes).map(d=>{
    const observed=packConsensus(depthNow&&depthNow.rows,d.lat,d.lon);
    const priorObserved=packConsensus(depthPrior&&depthPrior.rows,d.lat,d.lon);
    const pack=fusePack(grid&&grid.byId&&grid.byId.get(d.id),observed,priorObserved);
    const recent_snow=recentSnowNear(lsr&&lsr.rows,d.lat,d.lon);
    return {...d,pack,recent_snow};
  });
  candidates.sort((a,b)=>{
    const aSignal=(a.pack.depth||0)*2+(a.recent_snow&&a.recent_snow.inches||0)*1.5;
    const bSignal=(b.pack.depth||0)*2+(b.recent_snow&&b.recent_snow.inches||0)*1.5;
    return bSignal-aSignal || a.drive_minutes-b.drive_minutes;
  });
  const finalists=candidates.slice(0,FORECAST_LIMIT);
  const forecasts=await Promise.allSettled(finalists.map(d=>nwsForecast(d.lat,d.lon,tripHours)));
  candidates=finalists.map((d,i)=>{
    const f=forecasts[i].status==="fulfilled"?forecasts[i].value.summary:null;
    const model=scoreDestination(d,activity,f);
    return {...d,forecast:f,model,why:null};
  }).map(d=>({...d,why:why(d)}))
    .sort((a,b)=>b.model.score-a.model.score || (b.pack.depth||0)-(a.pack.depth||0) || a.drive_minutes-b.drive_minutes);
  const best=candidates[0]||null;
  const noStrong= !best || best.model.score<50 || ((best.pack.depth||0)<(PROFILES[activity]||PROFILES.any).usable && !(best.recent_snow&&best.recent_snow.inches>=3));
  const sourceNames=["nohrsc-current","nohrsc-prior","nws-lsr","routing","nohrsc-snodas-grid","nohrsc-snodas-meta"];
  return {
    retrieved_at:new Date().toISOString(), origin:{latitude:lat,longitude:lon}, drive_limit_minutes:maxMinutes,
    activity, activity_label:(PROFILES[activity]||PROFILES.any).label, trip_hours:tripHours,
    verdict:noStrong?"no-strong-snow":"ranked", destinations:candidates.slice(0,5),
    diagnostics:{
      candidate_count:routed.filter(d=>d.drive_minutes<=maxMinutes).length,
      forecasted_count:finalists.length,
      routing_degraded:routed.some(d=>d.travel_source!=="routed"),
      snodas_sampled:grid&&grid.sampled||0,
      snodas_failures:grid&&grid.failures||0,
      snodas_degraded:!grid || (grid.failures||0)>0,
      source_errors:settled.map((x,i)=>x.status==="rejected"?sourceNames[i]:null).filter(Boolean)
    },
    sources:[
      {name:"NOAA/NOHRSC SNODAS 1-km snow depth and snow-water equivalent",url:SNODAS.MAPSERVER,updated_at:gridMeta&&gridMeta.updated_at||null,note:"Operational raster analysis; point values are sampled at each destination."},
      {name:"NOAA/NOHRSC snow-depth station observations",url:depthNow&&depthNow.url||"https://www.nohrsc.noaa.gov/nsa/",updated_at:depthNow&&depthNow.date||null,provisional:true,note:"Used to validate the 1-km model and as a fallback if raster sampling fails."},
      {name:"NWS Local Storm Reports via Iowa Environmental Mesonet",url:lsr&&lsr.url||"https://mesonet.agron.iastate.edu/lsr/",updated_at:new Date(nowMs).toISOString(),note:"Recent snowfall is the largest nearby report in the window, not a summed 72-hour total."},
      {name:"NOAA/NWS hourly forecasts",url:"https://api.weather.gov/",updated_at:null},
      {name:"OSRM route table",url:ROUTING_BASE_URL,updated_at:null,note:"Falls back to a distance-based drive estimate when routing is unavailable."}
    ],
    limitations:[
      "This ranks natural-snow opportunity, not groomed-trail quality, road safety, avalanche danger or ice safety.",
      "NOAA/NOHRSC 1-km modeled snow depth is the primary base signal when available; nearby station observations validate it and large disagreement lowers confidence.",
      "A 1-km grid cannot resolve every local drift, forest opening, plowed area, wind-scoured ridge or lake-effect microgradient.",
      "Recent snowfall uses NWS Local Storm Reports as evidence of fresh snow and does not relabel variable-duration reports as an exact 72-hour accumulation.",
      "Forecast survival is a transparent temperature/rain/snow-signal interpretation, not an agency snow-quality forecast.",
      "A low-confidence destination cannot receive the highest score even if its raw snow signal is large."
    ]
  };
}
module.exports=async function handler(req,res){
  res.setHeader("Content-Type","application/json; charset=utf-8");
  res.setHeader("X-Robots-Tag","noindex,nofollow");
  res.setHeader("Cache-Control","public, s-maxage=300, stale-while-revalidate=900");
  if (req.method!=="GET"&&req.method!=="HEAD"){res.setHeader("Allow","GET, HEAD");return res.status(405).json({error:"Method not allowed"});}
  const lat=finite(req.query&&req.query.lat,-90,90),lon=finite(req.query&&req.query.lon,-180,180);
  if (lat==null||lon==null) return res.status(400).json({error:"Valid latitude and longitude are required"});
  const driveHours=finite(req.query&&req.query.driveHours,1,5)??3;
  const activity=PROFILES[String(req.query&&req.query.activity||"")]?String(req.query.activity):"any";
  const tripHours=finite(req.query&&req.query.tripHours,12,120)??72;
  try { return res.status(200).json(await buildDiscovery({lat,lon,driveHours,activity,tripHours})); }
  catch (error) { return res.status(503).json({error:"Good-snow ranking is temporarily unavailable",detail:String(error&&error.message||error)}); }
};
module.exports._test={DESTINATIONS,PROFILES,finite,miles,median,nohrscRows,packConsensus,fusePack,recentSnowRows,recentSnowNear,forecastSummary,component,survival,scoreDestination,estimatedDriveMinutes,buildDiscovery};
