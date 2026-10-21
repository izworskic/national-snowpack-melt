'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const A=require('../lib/michigan-winter-access');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('rankable destinations have official pages, named public venues and qualified parking',()=>{
  assert.ok(A.PLACES.length>=5);
  for(const p of A.PLACES){
    assert.match(p.url,/^https:\/\/www\.michigan\.gov\//);
    assert.ok(p.address.length>12);
    assert.equal(p.winter_road_verified,false);
    assert.ok(p.activities.includes('snowshoe')||p.activities.includes('xc'));
    assert.ok(p.lat>41&&p.lat<48.5&&p.lon>-91&&p.lon< -82);
  }
});
test('seasonal Porkies road restrictions are explicit, no winter-plowed-road guarantee',()=>{
  const park=A.PLACES.find(p=>p.id==='porkies-winter-sports');
  assert.match(park.access_note,/South Boundary Road/);
  assert.match(park.access_note,/M-64/);
  assert.equal(park.winter_road_verified,false);
});
test('coarse snowy pixels may not become navigable winter destination recommendations',()=>{
  const s=read('api/michigan-good-snow-spatial-engine.js');
  const start=s.indexOf('async function buildDiscovery('),end=s.indexOf('async function handler(',start);
  const run=s.slice(start,end);
  assert.match(run,/const pool=ACCESS\.candidates/);
  assert.doesNotMatch(run,/snapSpatialCandidates\(/);
  assert.doesNotMatch(run,/routeCandidates\(/);
  assert.match(run,/spatialZones/);
  assert.match(run,/verdict:noStrong\?"no-strong-snow":"route-unverified"/);
});
test('CARTO key comes from original site config; map is user-triggered and never routes to raw grid observations',()=>{
 const js=read('public/assets/michigan-good-snow.js');
 assert.match(js,/api\/carto-basemap-config/);
 assert.match(js,/document\.getElementById\('goodSnowMapLoad'\)\.addEventListener\('click',startMap\)/);
 assert.match(js,/NoAA snow observation area|NOAA snow observation area/);
 assert.match(js,/Not a verified road, parking area or trailhead/);
 assert.doesNotMatch(js,/basemaps\.cartocdn\.com\/rastertiles\/voyager\/\{z\}\/\{x\}\/\{y\}\{r\}\.png["']/);
});
test('candidates use an estimated geometric bound, with no route or winter-parking claim',()=>{
 const c=A.candidates({lat:44.7,lon:-84.7},180,'snowshoe');
 assert.ok(c.length);
 assert.ok(c.every(x=>x.travel_source==='estimated'&&x.access_status.includes('unverified')));
});

test('visitor drive limit is a strict estimated upper bound (not a 155% discovery radius)',()=>{
 const origin={lat:43.5945,lon:-83.8889};
 const maxMinutes=180;
 const rows=A.candidates(origin,maxMinutes,'snowshoe');
 assert.ok(rows.length>0);
 assert.ok(rows.every(p=>p.estimated<=maxMinutes),
   'Do not display places beyond the selected number of hours');
 const distant=A.PLACES.find(p=>p.id==='hoffmaster');
 assert.ok(A.estimatedMinutes(origin,distant)>maxMinutes);
 assert.ok(!rows.some(p=>p.id==='hoffmaster'));
});
test('ranking engine does not widen candidate drive filter downstream',()=>{
 const js=read('api/michigan-good-snow-spatial-engine.js');
 assert.match(js,/routed\.filter\(d=>d\.estimated<=maxMinutes\)/);
 assert.doesNotMatch(js,/estimated<=maxMinutes\*1\.55/);
});
