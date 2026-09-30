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

test("raster identify parser reads true pixel values for depth and SWE",()=>{
  const parsed=snodas.parseIdentify({results:[
    {layerId:3,attributes:{"Pixel Value":"14.6","Stretched value":"120"}},
    {layerId:7,attributes:{"Pixel Value":"2.35"}}
  ]});
  assert.equal(parsed.depth_inches,14.6);
  assert.equal(parsed.swe_inches,2.4);
});

test("raster identify parser rejects NoData and absurd sentinel values",()=>{
  assert.deepEqual(snodas.parseIdentify({results:[
    {layerId:3,attributes:{"Pixel Value":"NoData"}},
    {layerId:7,attributes:{"Pixel Value":"9999"}}
  ]}),{depth_inches:null,swe_inches:null});
});

test("metadata parser separates analysis valid time from publication time",()=>{
  const t1=Date.parse("2026-01-15T06:00:00Z"), t2=Date.parse("2026-01-15T11:20:00Z");
  const meta=snodas.parseMetadata({features:[{attributes:{idp_validtime:t1,idp_ingestdate:t2}}]});
  assert.equal(meta.valid_at,"2026-01-15T06:00:00.000Z");
  assert.equal(meta.updated_at,"2026-01-15T11:20:00.000Z");
});

test("freshness gate rejects an old or undated raster analysis",()=>{
  const now=Date.parse("2026-01-16T12:00:00Z");
  assert.equal(snodas.isStale({valid_at:"2026-01-15T06:00:00.000Z"},now),false);
  assert.equal(snodas.isStale({valid_at:"2026-01-14T00:00:00.000Z"},now),true);
  assert.equal(snodas.isStale({valid_at:null},now),true);
});
