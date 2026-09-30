const test=require("node:test");
const assert=require("node:assert/strict");
const S=require("../lib/michigan-snow-spatial");

const anchors=[
  {id:"gaylord",name:"Gaylord",region:"Northern Lower",lat:45.0275,lon:-84.6748},
  {id:"grayling",name:"Grayling",region:"Northern Lower",lat:44.6614,lon:-84.7148},
  {id:"munising",name:"Munising",region:"Central U.P.",lat:46.4111,lon:-86.6479}
];

test("coarse grid stays inside Michigan envelopes and reachable estimate",()=>{
  const origin={lat:43.5945,lon:-83.8889};
  const maxMinutes=180;
  const g=S.buildGrid(origin,maxMinutes,12);
  assert.ok(g.points.length>10);
  assert.ok(g.points.length<=S.MAX_COARSE_POINTS);
  for(const p of g.points){
    assert.ok(S.inMichiganEnvelope(p.lat,p.lon));
    assert.ok(S.estimatedDriveMinutes(origin,p)<=maxMinutes*1.30);
  }
});

test("zone selection keeps strong snow areas spatially separated",()=>{
  const rows=[
    {id:"a",lat:45,lon:-84.7,depth_inches:20,swe_inches:3},
    {id:"b",lat:45.02,lon:-84.71,depth_inches:19,swe_inches:3},
    {id:"c",lat:46.4,lon:-86.65,depth_inches:16,swe_inches:2}
  ];
  const picked=S.selectSeparated(rows,10,20);
  assert.equal(picked.length,2);
  assert.equal(picked[0].id,"a");
  assert.equal(picked[1].id,"c");
});

test("refinement chooses deeper nearby NOHRSC sample",()=>{
  const zones=[{id:"z",lat:45,lon:-84.7,depth_inches:10,swe_inches:2}];
  const points=S.refinementPoints(zones);
  const byId=new Map(points.map((p,i)=>[p.id,{id:p.id,depth_inches:i===points.length-1?18:11,swe_inches:2}]));
  const winner=S.refineWinners(zones,points,{byId})[0];
  assert.equal(winner.depth_inches,18);
});

test("spatial zone becomes a human directional destination label",()=>{
  const z=S.humanizeZone({lat:45.18,lon:-84.90,depth_inches:15,swe_inches:2.4},anchors,0);
  assert.equal(z.discovery_source,"snodas-spatial");
  assert.ok(/Gaylord|Grayling/.test(z.name));
  assert.equal(z.discovery_depth_hint,15);
});

test("anchor merge preserves spatial winners and adds fallback towns without duplicates",()=>{
  const origin={lat:43.6,lon:-83.9};
  const spatial=[{id:"z",name:"Snow zone",lat:45.03,lon:-84.68,region:"Northern Lower",discovery_source:"snodas-spatial"}];
  const merged=S.mergeWithAnchors(spatial,anchors,origin,300,23);
  assert.equal(merged[0].id,"z");
  assert.ok(!merged.some(x=>x.id==="gaylord"));
  assert.ok(merged.some(x=>x.id==="grayling"));
});

test("full discovery promotes a raster-found snow zone ahead of preset anchors",async()=>{
  const origin={lat:43.5945,lon:-83.8889};
  let call=0;
  const fetchGrid=async points=>{
    call++;
    const byId=new Map(points.map((p,i)=>[p.id,{id:p.id,depth_inches:call===1?(i===Math.floor(points.length/2)?14:0):(i===points.length-1?19:12),swe_inches:2.5}]));
    return {byId,failures:0,sampled:points.length};
  };
  const result=await S.discover({origin,maxMinutes:180,anchors,fetchGrid});
  assert.equal(result.mode,"spatial");
  assert.ok(result.diagnostics.coarse_points>0);
  assert.ok(result.diagnostics.refined_points>0);
  assert.ok(result.diagnostics.zones_found>=1);
  assert.equal(result.candidates[0].discovery_source,"snodas-spatial");
  assert.ok(result.candidates[0].discovery_depth_hint>=14);
  assert.equal(call,2);
});

test("full discovery falls back cleanly when the reachable raster has no snow",async()=>{
  const origin={lat:43.5945,lon:-83.8889};
  let call=0;
  const fetchGrid=async points=>{
    call++;
    return {byId:new Map(points.map(p=>[p.id,{id:p.id,depth_inches:0,swe_inches:0}])),failures:0,sampled:points.length};
  };
  const result=await S.discover({origin,maxMinutes:180,anchors,fetchGrid});
  assert.equal(result.mode,"anchor-fallback");
  assert.equal(result.diagnostics.zones_found,0);
  assert.ok(result.candidates.length>0);
  assert.ok(result.candidates.every(x=>x.discovery_source==="anchor"));
  assert.equal(call,1);
});
