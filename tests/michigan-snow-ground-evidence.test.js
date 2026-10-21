'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const E=require('../lib/michigan-snow-ground-evidence');
const NOW=Date.parse('2026-01-15T18:00:00Z');
test('IMS maps each distinct cover class, never depth',()=>{
  const want=['outside-coverage','open-water','snow-free-land','lake-or-sea-ice','snow-covered-land'];
  want.forEach((classification,code)=>{
    const v=E.parseIms({value:String(code)});
    assert.equal(v.classification,classification);
    assert.equal(v.depthInches,null);
    assert.equal(v.analysisValidAt,null);
  });
  assert.equal(E.parseIms({value:'2'}).snowCovered,false);
  assert.equal(E.parseIms({value:'4'}).snowCovered,true);
  assert.equal(E.parseIms({value:'3'}).snowCovered,null);
  assert.equal(E.parseIms({value:'NoData'}).status,'unavailable');
  assert.equal(E.parseIms({}).status,'unavailable');
});
test('IMS request is an identify query with explicit point spatial reference',()=>{
  const u=new URL(E.imsIdentifyUrl(45.0,-84.7));
  assert.ok(u.pathname.endsWith('/ImageServer/identify'));
  assert.deepEqual(JSON.parse(u.searchParams.get('geometry')),{x:-84.7,y:45,spatialReference:{wkid:4326}});
});
test('ACIS requests snow depth distinct from snowfall in a bounded local bbox',()=>{
  const u=new URL(E.acisUrl(45.0,-84.7,NOW));
  const p=JSON.parse(u.searchParams.get('params'));
  assert.deepEqual(p.elems,['snwd','snow']);
  assert.equal(p.sdate,'2026-01-11');
  assert.equal(p.edate,'2026-01-15');
  assert.deepEqual(p.meta,['name','ll','sids','uid','state']);
});
test('ACIS parser honors missing, trace, zero and stale observations',()=>{
  const payload={data:[
    {meta:{name:'Fresh CoCoRaHS',uid:'a',ll:[-84.7,45],sids:['MI-XX-001 10']},
      data:[['2026-01-14','4.5','1.0'],['2026-01-15','5.0','M']]},
    {meta:{name:'Measured bare',uid:'b',ll:[-84.72,45.02],sids:['USC1 6']},
      data:[['2026-01-15','0','T']]},
    {meta:{name:'Trace',uid:'c',ll:[-84.71,45.01]},
      data:[['2026-01-15','T','0']]},
    {meta:{name:'Missing',uid:'d',ll:[-84.69,45.03]},
      data:[['2026-01-15','M','2']]},
    {meta:{name:'Stale',uid:'e',ll:[-84.70,45.00]},
      data:[['2026-01-08','10','3']]}
  ]};
  const r=E.parseAcis(payload,{lat:45,lon:-84.7,nowMs:NOW});
  assert.equal(r.stationCount,3);
  assert.equal(r.stations.find(s=>s.stationId==='a').depthInches,5);
  assert.equal(r.stations.find(s=>s.stationId==='a').networkHint,'CoCoRaHS indexed by ACIS');
  assert.equal(r.stations.find(s=>s.stationId==='b').depthInches,0);
  assert.equal(r.stations.find(s=>s.stationId==='c').depthInches,null);
  assert.equal(r.stations.find(s=>s.stationId==='c').depthTrace,true);
  assert.ok(!r.stations.some(s=>s.stationId==='e'));
  assert.ok(!r.stations.some(s=>s.stationId==='d'));
});
test('disagreement lowers confidence but never creates a recommendation',()=>{
  const station={stations:[{distanceMiles:3,depthInches:5}]};
  const r=E.compareEvidence(E.parseIms({value:'2'}),station);
  assert.equal(r.disagreement,true);
  assert.equal(r.recommendationEligible,false);
});
test('no response, error response and absent stations do not mean bare ground',()=>{
  assert.equal(E.parseAcis({error:'unavailable'},{lat:45,lon:-84.7,nowMs:NOW}).status,'unavailable');
  const v=E.compareEvidence(E.parseIms(null),E.parseAcis(null,{lat:45,lon:-84.7,nowMs:NOW}));
  assert.equal(v.state,'ground-verification-limited');
  assert.equal(v.recommendationEligible,false);
});
