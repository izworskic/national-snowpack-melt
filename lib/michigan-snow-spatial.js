const MAX_COARSE_POINTS = 180;
const MAX_SPATIAL_ZONES = 10;
const MAX_REFINED_ZONES = 8;
const REFINEMENT_STEP_LAT = 0.018;
const REFINEMENT_STEP_LON = 0.026;

// Broad Michigan land envelopes. The NOAA/NOHRSC raster supplies the final
// snow/land truth; these polygons only avoid wasting requests over most lakes.
const LOWER = [
  [45.82,-84.70],[45.55,-84.95],[45.15,-85.55],[44.75,-86.15],[44.10,-86.55],
  [43.35,-86.50],[42.70,-86.35],[41.70,-86.10],[41.68,-84.80],[41.70,-83.45],
  [42.10,-83.05],[42.65,-82.60],[43.35,-82.35],[44.10,-82.55],[44.75,-83.05],
  [45.30,-83.65],[45.82,-84.70]
];
const UPPER = [
  [45.72,-84.78],[45.95,-84.20],[46.45,-84.25],[46.75,-84.70],[47.05,-85.30],
  [47.45,-86.25],[47.70,-87.30],[47.55,-88.25],[47.55,-88.85],[47.15,-89.25],
  [47.35,-89.85],[47.15,-90.30],[46.70,-90.45],[46.25,-90.05],[46.05,-89.00],
  [45.75,-87.60],[45.70,-86.35],[45.72,-84.78]
];

function finite(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function rad(v) { return Number(v) * Math.PI / 180; }
function miles(lat1, lon1, lat2, lon2) {
  const a=finite(lat1), b=finite(lon1), c=finite(lat2), d=finite(lon2);
  if ([a,b,c,d].some(v=>v==null)) return Infinity;
  const dl=rad(c-a), dn=rad(d-b);
  const x=Math.sin(dl/2)**2+Math.cos(rad(a))*Math.cos(rad(c))*Math.sin(dn/2)**2;
  return 3958.7613*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
}
function pointInPolygon(lat, lon, polygon) {
  let inside=false;
  for (let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
    const yi=polygon[i][0], xi=polygon[i][1], yj=polygon[j][0], xj=polygon[j][1];
    const hit=((yi>lat)!==(yj>lat)) && lon < (xj-xi)*(lat-yi)/(yj-yi)+xi;
    if (hit) inside=!inside;
  }
  return inside;
}
function inMichiganEnvelope(lat,lon) {
  return pointInPolygon(lat,lon,LOWER)||pointInPolygon(lat,lon,UPPER);
}
function estimatedDriveMinutes(origin, point) {
  const mi=miles(origin.lat,origin.lon,point.lat,point.lon);
  return Math.max(10,Math.round(mi/48*60+12));
}
function spacingMiles(maxMinutes) {
  if (maxMinutes<=120) return 10;
  if (maxMinutes<=180) return 12;
  if (maxMinutes<=240) return 15;
  return 18;
}
function buildGrid(origin,maxMinutes,spacing=spacingMiles(maxMinutes)) {
  let gap=Math.max(8,Number(spacing)||12);
  let points=[];
  for (let attempt=0;attempt<5;attempt++) {
    const latStep=gap/69;
    const lonStep=gap/(69*Math.cos(rad(45.5)));
    points=[];
    let n=0;
    for (let lat=41.7;lat<=48.05;lat+=latStep) {
      for (let lon=-90.45;lon<=-82.35;lon+=lonStep) {
        if (!inMichiganEnvelope(lat,lon)) continue;
        const p={id:`coarse-${n++}`,lat:+lat.toFixed(5),lon:+lon.toFixed(5)};
        const estimate=estimatedDriveMinutes(origin,p);
        if (estimate<=maxMinutes*1.30) points.push({...p,estimated:estimate});
      }
    }
    if (points.length<=MAX_COARSE_POINTS) break;
    gap*=1.14;
  }
  return {points,spacing_miles:+gap.toFixed(1)};
}
function sampledPoints(points,grid) {
  return (points||[]).map(p=>{
    const value=grid&&grid.byId&&grid.byId.get(p.id);
    return value?{...p,depth_inches:finite(value.depth_inches),swe_inches:finite(value.swe_inches)}:null;
  }).filter(Boolean).filter(p=>p.depth_inches!=null);
}
function selectSeparated(rows,max=MAX_SPATIAL_ZONES,minSeparation=14) {
  const sorted=(rows||[]).filter(r=>(r.depth_inches||0)>=0.5)
    .sort((a,b)=>(b.depth_inches||0)-(a.depth_inches||0)||(b.swe_inches||0)-(a.swe_inches||0));
  const out=[];
  for (const row of sorted) {
    if (out.every(x=>miles(x.lat,x.lon,row.lat,row.lon)>=minSeparation)) out.push(row);
    if (out.length>=max) break;
  }
  return out;
}
function refinementPoints(zones) {
  const out=[];
  (zones||[]).slice(0,MAX_REFINED_ZONES).forEach((z,zi)=>{
    let n=0;
    for (const dy of [-1,0,1]) for (const dx of [-1,0,1]) {
      const lat=z.lat+dy*REFINEMENT_STEP_LAT, lon=z.lon+dx*REFINEMENT_STEP_LON;
      if (!inMichiganEnvelope(lat,lon)) continue;
      out.push({id:`ref-${zi}-${n++}`,zone_index:zi,lat:+lat.toFixed(5),lon:+lon.toFixed(5)});
    }
  });
  return out;
}
function refineWinners(zones,refPoints,grid) {
  return (zones||[]).slice(0,MAX_REFINED_ZONES).map((zone,zi)=>{
    const values=(refPoints||[]).filter(p=>p.zone_index===zi).map(p=>{
      const g=grid&&grid.byId&&grid.byId.get(p.id);
      return g&&finite(g.depth_inches)!=null?{...p,depth_inches:finite(g.depth_inches),swe_inches:finite(g.swe_inches)}:null;
    }).filter(Boolean);
    values.push(zone);
    values.sort((a,b)=>(b.depth_inches||0)-(a.depth_inches||0)||(b.swe_inches||0)-(a.swe_inches||0));
    return values[0];
  });
}
function bearingLabel(lat1,lon1,lat2,lon2) {
  const y=Math.sin(rad(lon2-lon1))*Math.cos(rad(lat2));
  const x=Math.cos(rad(lat1))*Math.sin(rad(lat2))-Math.sin(rad(lat1))*Math.cos(rad(lat2))*Math.cos(rad(lon2-lon1));
  const deg=(Math.atan2(y,x)*180/Math.PI+360)%360;
  return ["N","NE","E","SE","S","SW","W","NW"][Math.round(deg/45)%8];
}
function nearestAnchor(point,anchors) {
  return (anchors||[]).map(a=>({...a,zone_distance:miles(point.lat,point.lon,a.lat,a.lon)}))
    .sort((a,b)=>a.zone_distance-b.zone_distance)[0]||null;
}
function humanizeZone(point,anchors,index=0) {
  const anchor=nearestAnchor(point,anchors);
  const distance=anchor?Math.round(anchor.zone_distance):null;
  const direction=anchor?bearingLabel(anchor.lat,anchor.lon,point.lat,point.lon):null;
  const close=anchor&&distance<=5;
  return {
    id:`snow-zone-${index}-${Number(point.lat).toFixed(3)}-${Math.abs(Number(point.lon)).toFixed(3)}`,
    name:close?anchor.name:`${distance} mi ${direction} of ${anchor?anchor.name:"Michigan"}`,
    region:anchor&&anchor.region||"Michigan",
    lat:point.lat,lon:point.lon,
    discovery_source:"snodas-spatial",
    anchor_name:anchor&&anchor.name||null,
    zone_distance_miles:distance,
    discovery_depth_hint:point.depth_inches,
    discovery_swe_hint:point.swe_inches
  };
}
function mergeWithAnchors(spatial,anchors,origin,maxMinutes,max=23) {
  const nearby=(anchors||[]).map(a=>({...a,estimated:estimatedDriveMinutes(origin,a),discovery_source:"anchor"}))
    .filter(a=>a.estimated<=maxMinutes*1.35).sort((a,b)=>a.estimated-b.estimated);
  const out=[];
  for (const s of spatial||[]) out.push(s);
  for (const a of nearby) {
    if (out.some(x=>miles(x.lat,x.lon,a.lat,a.lon)<7)) continue;
    out.push(a);
    if (out.length>=max) break;
  }
  return out.slice(0,max);
}
async function discover({origin,maxMinutes,anchors,fetchGrid}) {
  const coarse=buildGrid(origin,maxMinutes);
  const coarseGrid=await fetchGrid(coarse.points);
  const sampled=sampledPoints(coarse.points,coarseGrid);
  const zones=selectSeparated(sampled,MAX_SPATIAL_ZONES,Math.max(12,coarse.spacing_miles*0.75));
  if (!zones.length) {
    return {candidates:mergeWithAnchors([],anchors,origin,maxMinutes),mode:"anchor-fallback",diagnostics:{coarse_points:coarse.points.length,coarse_spacing_miles:coarse.spacing_miles,coarse_failures:coarseGrid.failures||0,refined_points:0,zones_found:0}};
  }
  const refPoints=refinementPoints(zones);
  const refinedGrid=await fetchGrid(refPoints);
  const winners=refineWinners(zones,refPoints,refinedGrid);
  const spatial=winners.map((p,i)=>humanizeZone(p,anchors,i));
  return {candidates:mergeWithAnchors(spatial,anchors,origin,maxMinutes),mode:"spatial",diagnostics:{coarse_points:coarse.points.length,coarse_spacing_miles:coarse.spacing_miles,coarse_failures:coarseGrid.failures||0,refined_points:refPoints.length,refined_failures:refinedGrid.failures||0,zones_found:spatial.length}};
}

module.exports={
  MAX_COARSE_POINTS,MAX_SPATIAL_ZONES,MAX_REFINED_ZONES,LOWER,UPPER,
  miles,pointInPolygon,inMichiganEnvelope,estimatedDriveMinutes,spacingMiles,buildGrid,sampledPoints,selectSeparated,
  refinementPoints,refineWinners,bearingLabel,nearestAnchor,humanizeZone,mergeWithAnchors,discover
};
