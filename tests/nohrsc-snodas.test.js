const test=require("node:test");
const assert=require("node:assert/strict");
const snodas=require("../lib/nohrsc-snodas");

test("identify URL samples snow depth and SWE raster layers at a point",()=>{
  const url=new URL(snodas.identifyUrl(45.0275,-84.6748));
  assert.equal(url.pathname.endsWith("/MapServer/identify"),true);
  assert.equal(url.searchParams.get("geometry"),"-84.6748,45.0275");
  assert.equal(url.searchParams.get("sr"),"4269");
  assert.equal(url.searchParams.get("layers"),"all:3,7");
});

test("live NOAA identify fields are native meters and kg/m², never preconverted inches",()=>{
  // Observed NOAA identify snapshots, Oct 21, 2026: Mt Elbert, Colorado.
  const parsed=snodas.parseIdentify({results:[
    {layerId:3,attributes:{"Service Pixel Value":"0.05","Classify.Pixel Value":"0.050000","Classify.Class value":"2"}},
    {layerId:7,attributes:{"Service Pixel Value":"9","Classify.Pixel Value":"9.000000","Classify.Class value":"2"}}
  ]});
  assert.equal(parsed.depth_inches,2.0);
  assert.equal(parsed.swe_inches,0.4);
});

test("NOAA live Michigan snow-free zero stays zero rather than missing",()=>{
  assert.deepEqual(snodas.parseIdentify({results:[
    {layerId:3,attributes:{"Service Pixel Value":"0","Classify.Pixel Value":"0.000000"}},
    {layerId:7,attributes:{"Service Pixel Value":"0","Classify.Pixel Value":"0.000000"}}
  ]}),{depth_inches:0,swe_inches:0});
});

test("class-renderer and legacy unverified Pixel Value cannot masquerade as native units",()=>{
  assert.deepEqual(snodas.parseIdentify({results:[
    {layerId:3,attributes:{"Pixel Value":"14.6","Classify.Pixel Value":"0.05","Classify.Class value":"2"}},
    {layerId:7,attributes:{"Classify.Pixel Value":"9","Classify.Class value":"2"}}
  ]}),{depth_inches:null,swe_inches:null});
});

test("NoData, negative, malformed and absurd values fail closed",()=>{
  for(const bad of ["NoData","",null,"9999","-1","1in","Infinity"]){
    assert.deepEqual(snodas.parseIdentify({results:[
      {layerId:3,attributes:{"Service Pixel Value":bad}},
      {layerId:7,attributes:{"Service Pixel Value":bad}}
    ]}),{depth_inches:null,swe_inches:null});
  }
  assert.deepEqual(snodas.parseIdentify({results:[]}),{depth_inches:null,swe_inches:null});
});

test("metadata parser separates NOAA valid time from ingest time",()=>{
  const t1=Date.parse("2026-10-21T03:00:00Z"),t2=Date.parse("2026-10-21T11:05:16Z");
  const meta=snodas.parseMetadata({features:[{attributes:{idp_validtime:t1,idp_ingestdate:t2}}]});
  assert.equal(meta.valid_at,"2026-10-21T03:00:00.000Z");
  assert.equal(meta.updated_at,"2026-10-21T11:05:16.000Z");
});

test("freshness gate rejects an old or undated raster analysis",()=>{
  const now=Date.parse("2026-01-16T12:00:00Z");
  assert.equal(snodas.isStale({valid_at:"2026-01-15T06:00:00.000Z"},now),false);
  assert.equal(snodas.isStale({valid_at:"2026-01-14T00:00:00.000Z"},now),true);
  assert.equal(snodas.isStale({valid_at:null},now),true);
});
