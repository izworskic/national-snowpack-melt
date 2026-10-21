'use strict';

// Michigan snow-on-ground research adapter. Never convert a coverage class
// into a depth measurement. This does not change production trip ranking.
const IMS = 'https://mapservices.weather.noaa.gov/raster/rest/services/obs/usnic_ims_snow_ice_1km/ImageServer';
const ACIS = 'https://data.rcc-acis.org/MultiStnData';
const IMS_CLASSES = Object.freeze({
  0: 'outside-coverage',
  1: 'open-water',
  2: 'snow-free-land',
  3: 'lake-or-sea-ice',
  4: 'snow-covered-land'
});

function finite(value, min, max) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}
function miles(a, b, c, d) {
  const rad = Math.PI / 180;
  const x = Math.sin((c-a)*rad/2)**2 +
    Math.cos(a*rad)*Math.cos(c*rad)*Math.sin((d-b)*rad/2)**2;
  return 3958.7613 * 2 * Math.atan2(Math.sqrt(Math.max(0,x)),Math.sqrt(Math.max(0,1-x)));
}
// NOAA USNIC IMS native projection is ellipsoidal polar stereographic (meters).
// WGS84 lon/lat without reprojection incorrectly samples ice near the pole.
// Service WKT: lon0=-80, lat_ts=60, a=6378137, 1/f=291.5053473491773.
function polarStereographic(lat,lon){
  const y=finite(lat,-90,90),x=finite(lon,-180,180);
  if(y===null||x===null)throw Error('Invalid coordinates');
  const R=Math.PI/180,phi=y*R,c=60*R,e2=2/291.5053473491773-1/291.5053473491773**2,e=Math.sqrt(e2);
  const t=p=>Math.tan(Math.PI/4-p/2)/Math.pow((1-e*Math.sin(p))/(1+e*Math.sin(p)),e/2);
  const mc=Math.cos(c)/Math.sqrt(1-e2*Math.sin(c)**2);
  const rho=6378137*mc*t(phi)/t(c),theta=(x+80)*R;
  return {x:rho*Math.sin(theta),y:-rho*Math.cos(theta)};
}
function imsIdentifyUrl(lat,lon){
  const p=polarStereographic(lat,lon);
  const q=new URLSearchParams({geometry:p.x.toFixed(3)+','+p.y.toFixed(3),
    geometryType:'esriGeometryPoint',returnGeometry:'false',
    returnCatalogItems:'false',f:'json'});
  return IMS+'/identify?'+q;
}
function parseIms(response) {
  const missing = {status:'unavailable',classification:null,code:null,
    snowCovered:null,depthInches:null,analysisValidAt:null,
    freshness:'analysis-time-unverified',source:'NOAA USNIC IMS 1-km'};
  if (!response || response.error || response.value === undefined || response.value === null) return missing;
  const raw = String(response.value).trim();
  if (!/^[0-4]$/.test(raw)) return missing;
  const code = Number(raw);
  return { ...missing, status:'classified', code, classification:IMS_CLASSES[code],
    // Null means not applicable/unknown, NOT "no snow".
    snowCovered:code===4 ? true : code===2 ? false : null,
    note:'IMS maps surface cover, not snow depth. Image-service validity timestamp is unverified.' };
}
// Exact daily ACIS codes: M=missing, T=trace, numeric=reported inches.
// An accumulated or flagged value is NOT a clean daily snow-depth reading.
function acisInches(raw) {
  if (raw === 'T') return {inches:null,trace:true};
  if (typeof raw !== 'string' && typeof raw !== 'number') return {inches:null,trace:false};
  const v = String(raw).trim();
  if (!/^(?:\d+|\d*\.\d+)$/.test(v)) return {inches:null,trace:false};
  return {inches:finite(v,0,300),trace:false};
}
function acisUrl(lat,lon,nowMs=Date.now()) {
  const end = new Date(nowMs).toISOString().slice(0,10);
  const start = new Date(nowMs-4*86400000).toISOString().slice(0,10);
  // Limit results and requests to local area; no statewide station sweep per user query.
  const bbox = [lon-0.55,lat-0.42,lon+0.55,lat+0.42].map(n=>Number(n.toFixed(3))).join(',');
  const params = {
    bbox,sdate:start,edate:end,elems:['snwd','snow'],
    meta:['name','ll','sids','uid','state'],output:'json'
  };
  return ACIS + '?params=' + encodeURIComponent(JSON.stringify(params));
}
function parseAcis(response,{lat,lon,nowMs=Date.now(),maxAgeHours=84}={}) {
  const base = {status:'unavailable',stations:[],stationCount:0,
    source:'RCC ACIS daily station observations (including CoCoRaHS where indexed)',
    units:'in',note:'Observed depth at specific station sites; not proof of conditions at the requested point.'};
  if (!response || response.error || !Array.isArray(response.data)) return base;
  const entries=[];
  for (const station of response.data) {
    const m=station && station.meta || {};
    if (!Array.isArray(m.ll) || m.ll.length!==2 || !Array.isArray(station.data)) continue;
    const x=finite(m.ll[0],-180,180),y=finite(m.ll[1],-90,90);
    if (x==null||y==null) continue;
    const distance=Math.round(miles(lat,lon,y,x)*10)/10;
    if (distance>75) continue;
    let picked=null;
    // ACIS MultiStnData with sdate/edate returns [snwd,snow] rows
    // WITHOUT a date column. Derive each date from the exact request window.
    // Accept explicit dated rows as a defensive legacy fallback.
    const startDate = new Date(nowMs-4*86400000).toISOString().slice(0,10);
    const startNoon = Date.parse(startDate+'T12:00:00Z');
    for (let index=0;index<station.data.length;index++) {
      const row=station.data[index];
      if (!Array.isArray(row) || row.length<2) continue;
      const hasDate=/^\d{4}-\d{2}-\d{2}$/.test(String(row[0]||''));
      const date=hasDate ? row[0] : new Date(startNoon+index*86400000).toISOString().slice(0,10);
      const stamp=Date.parse(date+'T12:00:00Z');
      const hours=(nowMs-stamp)/3600000;
      if (!Number.isFinite(hours)||hours < -18 || hours > maxAgeHours) continue;
      const d=acisInches(row[hasDate?1:0]);
      const snow=acisInches(row[hasDate?2:1]);
      if (d.inches===null && !d.trace) continue;
      if (!picked || stamp > picked.stamp) picked={
        stamp,date,depthInches:d.inches,depthTrace:d.trace,
        newSnowInches:snow.inches
      };
    }
    if (!picked) continue;
    const sids=Array.isArray(m.sids)?m.sids:[];
    const cocorahs=sids.some(id=>/\s10$/.test(String(id)));
    entries.push({
      stationId:String(m.uid||sids[0]||'unknown'),
      name:String(m.name||'Unnamed station').slice(0,90),
      lat:y,lon:x,distanceMiles:distance,
      measuredOn:picked.date,depthInches:picked.depthInches,
      depthTrace:picked.depthTrace,newSnowInches:picked.newSnowInches,
      networkHint:cocorahs?'CoCoRaHS indexed by ACIS':'ACIS station',
      type:'ground-observation'
    });
  }
  entries.sort((a,b)=>a.distanceMiles-b.distanceMiles || b.measuredOn.localeCompare(a.measuredOn));
  const stations=entries.slice(0,8);
  return {...base,status:stations.length?'observations':'no-recent-depth-observations',
    stations,stationCount:entries.length};
}
function compareEvidence(ims, observations) {
  const nearby=(observations && observations.stations || []).filter(s=>s.distanceMiles<=15 && s.depthInches!==null);
  const snow=nearby.filter(s=>s.depthInches>=1);
  const bare=nearby.filter(s=>s.depthInches===0);
  let disagreement=false;
  if (ims && ims.snowCovered===false && snow.length) disagreement=true;
  if (ims && ims.snowCovered===true && bare.length) disagreement=true;
  return {
    state:disagreement?'conflicting-nearby-evidence':nearby.length?'nearby-observations-available':'ground-verification-limited',
    disagreement,nearbyObservationCount:nearby.length,
    // Never announce a live trip recommendation from this research endpoint.
    recommendationEligible:false,
    note:'A 1-km mapped class and observations up to 15 miles away may differ naturally; inspect before interpreting.'
  };
}

module.exports={IMS,ACIS,IMS_CLASSES,finite,miles,polarStereographic,imsIdentifyUrl,parseIms,
  acisInches,acisUrl,parseAcis,compareEvidence};
