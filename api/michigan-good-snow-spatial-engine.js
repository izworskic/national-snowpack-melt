const BASE = require("./michigan-good-snow-engine");
const B = BASE._test;
const SNODAS = require("../lib/nohrsc-snodas");
const SPATIAL = require("../lib/michigan-snow-spatial");

const NOHRSC_BASE = "https://www.nohrsc.noaa.gov/nsa/discussions_text/National";
const NWS_POINTS = "https://api.weather.gov/points";
const IEM_LSR = "https://mesonet.agron.iastate.edu/geojson/lsr.php";
const ROUTING_BASE_URL = process.env.ROUTING_BASE_URL?.trim() || "https://router.project-osrm.org";
const UA = "ChrisIzworskiGoodSnow/1.2 (+https://chrisizworski.com/national-tools/snow/)";
const MAX_ROUTE_POINTS = 23;
const FORECAST_LIMIT = 10;
const HOUR = 3600e3;

function finite(v,min=-Infinity,max=Infinity){
  if(v==null||v==="") return null;
  const n=Number(v);
  return Number.isFinite(n)&&n>=min&&n<=max?n:null;
}
function round1(v){return v==null?null:Math.round(Number(v)*10)/10;}
function ymd(date){return date.toISOString().slice(0,10).replace(/-/g,"");}
function reportAnchor(now=new Date()){
  const anchor=new Date(now);
  if(anchor.getUTCHours()<6) anchor.setUTCDate(anchor.getUTCDate()-1);
  anchor.setUTCHours(6,0,0,0);
  return anchor;
}
function nohrscUrl(variable,date){
  const stamp=ymd(date);
  return `${NOHRSC_BASE}/${variable}/${stamp.slice(0,6)}/${variable}_${stamp}06_e.txt`;
}
async function fetchText(url,timeout=4500){
  const r=await fetch(url,{headers:{accept:"text/plain,*/*;q=0.8","user-agent":UA},signal:AbortSignal.timeout(timeout)});
  if(!r.ok) throw new Error(`${new URL(url).hostname} returned ${r.status}`);
  return r.text();
}
async function fetchJson(url,timeout=4500){
  const r=await fetch(url,{headers:{accept:"application/geo+json,application/json","user-agent":UA},signal:AbortSignal.timeout(timeout)});
  const body=await r.text();
  if(!r.ok) throw new Error(`${new URL(url).hostname} returned ${r.status}`);
  try{return JSON.parse(body);}catch{throw new Error(`${new URL(url).hostname} returned non-JSON`);}
}
async function fetchNohrsc(variable,date){
  let last;
  for(let offset=0;offset<3;offset++){
    const d=new Date(date);d.setUTCDate(d.getUTCDate()-offset);
    const url=nohrscUrl(variable,d);
    try{
      const rows=B.nohrscRows(await fetchText(url,3500));
      if(rows.length) return {rows,url,date:d.toISOString()};
    }catch(e){last=e;}
  }
  throw last||new Error(`NOHRSC ${variable} unavailable`);
}
async function fetchRecentSnow(nowMs=Date.now()){
  const from=new Date(nowMs-72*HOUR).toISOString().replace(/\.\d{3}Z$/,"Z");
  const to=new Date(nowMs).toISOString().replace(/\.\d{3}Z$/,"Z");
  const url=`${IEM_LSR}?states=MI&sts=${encodeURIComponent(from)}&ets=${encodeURIComponent(to)}`;
  return {rows:B.recentSnowRows(await fetchJson(url,5000),nowMs),url};
}
async function nwsForecast(lat,lon,hours){
  const pointUrl=`${NWS_POINTS}/${Number(lat).toFixed(3)},${Number(lon).toFixed(3)}`;
  const points=await fetchJson(pointUrl,3500);
  const hourlyUrl=points&&points.properties&&points.properties.forecastHourly;
  if(!hourlyUrl) throw new Error("NWS hourly forecast link unavailable");
  const hourly=await fetchJson(hourlyUrl,4000);
  return {summary:B.forecastSummary(hourly&&hourly.properties&&hourly.properties.periods,hours,hourly&&hourly.properties&&hourly.properties.updated),point_url:pointUrl,hourly_url:hourlyUrl};
}
async function mapLimit(items,limit,fn){
  const input=Array.from(items||[]),out=new Array(input.length);let index=0;
  async function worker(){while(index<input.length){const i=index++;try{out[i]=await fn(input[i],i);}catch{out[i]=null;}}}
  await Promise.all(Array.from({length:Math.min(Math.max(1,limit),input.length||1)},worker));
  return out;
}
async function snapSpatialCandidates(candidates){
  let failures=0,dropped=0;
  const rows=await mapLimit(candidates,6,async d=>{
    if(d.discovery_source!=="snodas-spatial") return d;
    const url=`${ROUTING_BASE_URL}/nearest/v1/driving/${Number(d.lon).toFixed(6)},${Number(d.lat).toFixed(6)}?number=1`;
    try{
      const r=await fetchJson(url,1800),w=r&&r.waypoints&&r.waypoints[0];
      const loc=w&&w.location,meters=finite(w&&w.distance,0,50000);
      if(!Array.isArray(loc)||loc.length<2||meters==null) throw new Error("no road snap");
      const snapMiles=meters/1609.344;
      if(snapMiles>8){dropped++;return null;}
      return {...d,snow_zone_lat:d.lat,snow_zone_lon:d.lon,lat:Number(loc[1]),lon:Number(loc[0]),road_name:String(w.name||"").trim()||null,snap_distance_miles:round1(snapMiles)};
    }catch{
      failures++;
      return {...d,road_snap_degraded:true};
    }
  });
  return {rows:rows.filter(Boolean),failures,dropped};
}
async function routeCandidates(origin,candidates){
  const selected=(candidates||[]).slice(0,MAX_ROUTE_POINTS);
  if(!selected.length) return [];
  const coords=[`${origin.lon.toFixed(6)},${origin.lat.toFixed(6)}`,...selected.map(d=>`${Number(d.lon).toFixed(6)},${Number(d.lat).toFixed(6)}`)];
  const dest=selected.map((_,i)=>String(i+1)).join(";");
  const url=`${ROUTING_BASE_URL}/table/v1/driving/${coords.join(";")}?sources=0&destinations=${dest}&annotations=duration,distance`;
  try{
    const r=await fetchJson(url,2600);
    if(r.code!=="Ok") throw new Error("routing response not Ok");
    return selected.map((d,i)=>{
      const sec=r.durations&&r.durations[0]&&r.durations[0][i],meters=r.distances&&r.distances[0]&&r.distances[0][i];
      return {...d,drive_minutes:Number.isFinite(sec)?Math.max(1,Math.round(sec/60)):B.estimatedDriveMinutes(origin,d),distance_miles:Number.isFinite(meters)?Math.round(meters/1609.344):Math.round(B.miles(origin.lat,origin.lon,d.lat,d.lon)),travel_source:Number.isFinite(sec)?"routed":"estimated"};
    });
  }catch{
    return selected.map(d=>({...d,drive_minutes:B.estimatedDriveMinutes(origin,d),distance_miles:Math.round(B.miles(origin.lat,origin.lon,d.lat,d.lon)),travel_source:"estimated"}));
  }
}
function why(d){
  const bits=[];
  if(d.discovery_source==="snodas-spatial") bits.push("NOAA snow analysis discovered this zone instead of a preset town");
  if(d.pack&&d.pack.depth!=null) bits.push(d.pack.source==="nohrsc-snodas-1km"?`${d.pack.depth}\" NOAA/NOHRSC 1-km modeled depth`:`${d.pack.depth}\" nearby measured-depth fallback`);
  if(d.recent_snow&&d.recent_snow.inches>0) bits.push(`${d.recent_snow.inches}\" recent NWS snowfall report nearby`);
  if(d.pack&&d.pack.validation==="model and stations disagree") bits.push("model/station disagreement lowers confidence");
  bits.push(d.model.survival.label);
  return bits.join(" · ");
}
function anchorFallback(origin,maxMinutes){
  return B.DESTINATIONS.map(d=>({...d,estimated:B.estimatedDriveMinutes(origin,d),discovery_source:"anchor"})).filter(d=>d.estimated<=maxMinutes*1.35).sort((a,b)=>a.estimated-b.estimated).slice(0,MAX_ROUTE_POINTS);
}
async function buildDiscovery({lat,lon,driveHours=3,activity="any",tripHours=72,nowMs=Date.now()}){
  const origin={lat,lon};
  const maxMinutes=Math.max(60,Math.min(300,Math.round(driveHours*60)));
  const anchor=reportAnchor(new Date(nowMs)),prior=new Date(anchor);prior.setUTCDate(prior.getUTCDate()-1);
  const snowFetch=(url,timeout)=>fetchJson(url,Math.min(timeout||1800,1800));
  const settled=await Promise.allSettled([
    fetchNohrsc("snowdepth",anchor),
    fetchNohrsc("snowdepth",prior),
    fetchRecentSnow(nowMs),
    SPATIAL.discover({origin,maxMinutes,anchors:B.DESTINATIONS,fetchGrid:pts=>SNODAS.fetchGrid(pts,snowFetch,16,nowMs)})
  ]);
  const depthNow=settled[0].status==="fulfilled"?settled[0].value:null;
  const depthPrior=settled[1].status==="fulfilled"?settled[1].value:null;
  const lsr=settled[2].status==="fulfilled"?settled[2].value:null;
  const discovery=settled[3].status==="fulfilled"?settled[3].value:{candidates:anchorFallback(origin,maxMinutes),mode:"anchor-fallback",diagnostics:{coarse_points:0,refined_points:0,zones_found:0}};
  const snapped=await snapSpatialCandidates(discovery.candidates||[]);
  const pool=snapped.rows.length?snapped.rows:anchorFallback(origin,maxMinutes);
  const post=await Promise.allSettled([
    routeCandidates(origin,pool),
    SNODAS.fetchGrid(pool,fetchJson,12,nowMs)
  ]);
  const routed=post[0].status==="fulfilled"?post[0].value:pool.map(d=>({...d,drive_minutes:B.estimatedDriveMinutes(origin,d),distance_miles:Math.round(B.miles(lat,lon,d.lat,d.lon)),travel_source:"estimated"}));
  const grid=post[1].status==="fulfilled"?post[1].value:null;
  let candidates=routed.filter(d=>d.drive_minutes<=maxMinutes).map(d=>{
    const observed=B.packConsensus(depthNow&&depthNow.rows,d.lat,d.lon);
    const priorObserved=B.packConsensus(depthPrior&&depthPrior.rows,d.lat,d.lon);
    const pack=B.fusePack(grid&&grid.byId&&grid.byId.get(d.id),observed,priorObserved);
    const recent_snow=B.recentSnowNear(lsr&&lsr.rows,d.lat,d.lon);
    return {...d,pack,recent_snow};
  });
  candidates.sort((a,b)=>{
    const aSignal=(a.pack.depth||0)*2+(a.recent_snow&&a.recent_snow.inches||0)*1.5;
    const bSignal=(b.pack.depth||0)*2+(b.recent_snow&&b.recent_snow.inches||0)*1.5;
    return bSignal-aSignal||a.drive_minutes-b.drive_minutes;
  });
  const finalists=candidates.slice(0,FORECAST_LIMIT);
  const forecasts=await Promise.allSettled(finalists.map(d=>nwsForecast(d.lat,d.lon,tripHours)));
  candidates=finalists.map((d,i)=>{
    const f=forecasts[i].status==="fulfilled"?forecasts[i].value.summary:null;
    const model=B.scoreDestination(d,activity,f);
    return {...d,forecast:f,model,why:null};
  }).map(d=>({...d,why:why(d)})).sort((a,b)=>b.model.score-a.model.score||(b.pack.depth||0)-(a.pack.depth||0)||a.drive_minutes-b.drive_minutes);
  const best=candidates[0]||null,p=B.PROFILES[activity]||B.PROFILES.any;
  const noStrong=!best||best.model.score<50||((best.pack.depth||0)<p.usable&&!(best.recent_snow&&best.recent_snow.inches>=3));
  const sourceNames=["nohrsc-current","nohrsc-prior","nws-lsr","spatial-discovery"];
  return {
    retrieved_at:new Date().toISOString(),origin:{latitude:lat,longitude:lon},drive_limit_minutes:maxMinutes,activity,activity_label:p.label,trip_hours:tripHours,
    verdict:noStrong?"no-strong-snow":"ranked",destinations:candidates.slice(0,5),
    diagnostics:{
      discovery_mode:discovery.mode,
      spatial_degraded:settled[3].status!=="fulfilled",
      ...(discovery.diagnostics||{}),
      road_snap_failures:snapped.failures,road_snap_dropped:snapped.dropped,
      candidate_count:routed.filter(d=>d.drive_minutes<=maxMinutes).length,forecasted_count:finalists.length,
      routing_degraded:routed.some(d=>d.travel_source!=="routed"),snodas_sampled:grid&&grid.sampled||0,snodas_failures:grid&&grid.failures||0,snodas_degraded:!grid||(grid.failures||0)>0,
      source_errors:[...settled.map((x,i)=>x.status==="rejected"?sourceNames[i]:null).filter(Boolean),post[0].status==="rejected"?"routing":null,post[1].status==="rejected"?"nohrsc-snodas-final":null].filter(Boolean)
    },
    sources:[
      {name:"NOAA/NOHRSC SNODAS 1-km snow depth and snow-water equivalent",url:SNODAS.MAPSERVER,updated_at:grid&&grid.metadata&&grid.metadata.valid_at||null,note:"An adaptive coarse-to-fine search discovers snowy zones first, then final road-accessible candidates are sampled again at the NOHRSC 1-km analysis."},
      {name:"NOAA/NOHRSC snow-depth station observations",url:depthNow&&depthNow.url||"https://www.nohrsc.noaa.gov/nsa/",updated_at:depthNow&&depthNow.date||null,provisional:true,note:"Used to validate the modeled depth and as a fallback if raster sampling fails."},
      {name:"NWS Local Storm Reports via Iowa Environmental Mesonet",url:lsr&&lsr.url||"https://mesonet.agron.iastate.edu/lsr/",updated_at:new Date(nowMs).toISOString(),note:"Recent snowfall is the largest nearby report in the window, not a summed 72-hour total."},
      {name:"NOAA/NWS hourly forecasts",url:"https://api.weather.gov/",updated_at:null},
      {name:"OSRM routing and road snapping",url:ROUTING_BASE_URL,updated_at:null,note:"Spatial snow zones are snapped toward the nearest routable road when available; route times fall back to distance estimates if routing is unavailable."}
    ],
    limitations:[
      "This ranks natural-snow opportunity, not groomed-trail quality, road safety, avalanche danger, parking access, land ownership or ice safety.",
      "The spatial search is adaptive rather than an exhaustive request for every 1-km pixel: it samples the reachable Michigan snow field coarsely, refines the strongest zones, then rechecks final candidates at the 1-km NOHRSC analysis.",
      "A 1-km grid cannot resolve every local drift, forest opening, plowed area, wind-scoured ridge or lake-effect microgradient.",
      "Nearby station observations validate the model; large model/station disagreement lowers confidence instead of being averaged away.",
      "Recent snowfall reports and forecast survival are supporting evidence, not guarantees of trail or surface quality.",
      "A low-confidence destination cannot receive the highest score even if its raw snow signal is large."
    ]
  };
}

async function handler(req,res){
  res.setHeader("Content-Type","application/json; charset=utf-8");
  res.setHeader("X-Robots-Tag","noindex,nofollow");
  res.setHeader("Cache-Control","public, s-maxage=900, stale-while-revalidate=1800");
  if(req.method!=="GET"&&req.method!=="HEAD"){res.setHeader("Allow","GET, HEAD");return res.status(405).json({error:"Method not allowed"});}
  const lat=finite(req.query&&req.query.lat,-90,90),lon=finite(req.query&&req.query.lon,-180,180);
  if(lat==null||lon==null) return res.status(400).json({error:"Valid latitude and longitude are required"});
  const driveHours=finite(req.query&&req.query.driveHours,1,5)??3;
  const activity=B.PROFILES[String(req.query&&req.query.activity||"")]?String(req.query.activity):"any";
  const tripHours=finite(req.query&&req.query.tripHours,12,120)??72;
  try{return res.status(200).json(await buildDiscovery({lat,lon,driveHours,activity,tripHours}));}
  catch(error){return res.status(503).json({error:"Good-snow ranking is temporarily unavailable",detail:String(error&&error.message||error)});}
}
handler._test={...B,SPATIAL,finite,reportAnchor,nohrscUrl,snapSpatialCandidates,routeCandidates,why,anchorFallback,buildDiscovery};
module.exports=handler;
