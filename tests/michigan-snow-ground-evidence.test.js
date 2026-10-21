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
test('IMS request uses explicit WGS84 geometry',()=>{
  const u=new URL(E.imsIdentifyUrl(45.0,-84.7));
  assert.ok(u.pathname.endsWith('/ImageServer/identify'));
  assert.deepEqual(JSON.parse(u.searchParams.get('geometry')),{x:-84.7,y:45,spatialReference:{wkid:4326}});
});
test('ACIS requests snwd distinct from snowfall with a bounded date range',()=>{
  const u=new URL(E.acisUrl(45.0,-84.7,NOW));
  const p=JSON.parse(u.searchParams.get('params'));
  assert.deepEqual(p.elems,['snwd','snow']);
  assert.equal(p.sdate,'2026-01-11');
  assert.equal(p.edate,'2026-01-15');
  assert.deepEqual(p.meta,['name','ll','sids','uid','state']);
});
test('ACIS real MultiStnData row shape has no date column; index derives date',()=>{
  // Sanitized real Gaylord 2026-01-14..17 four-day station rows.
  const payload={data:[
    {meta:{name:'GAYLORD 9SSW',uid:29225,ll:[-84.71891,44.90715],sids:['KAPX 5']},
      data:[['7','1.0'],['7','0.3'],['7','3.7'],['9','3.9'],['M','M']]},
    {meta:{name:'GAYLORD 4.1 S',uid:96811,ll:[-84.68468,44.96389],sids:['MIOT0017 10']},
      data:[['13','0.7'],['13','0.6'],['13','0.9'],['15','2.8'],['M','M']]}
  ]};
  const r=E.parseAcis(payload,{lat:45,lon:-84.7,nowMs:NOW});
  assert.equal(r.stationCount,2);
  const a=r.stations.find(s=>s.stationId==='29225');
  assert.equal(a.measuredOn,'2026-01-14');
  assert.equal(a.depthInches,7);
  const c=r.stations.find(s=>s.stationId==='96811');
  assert.equal(c.depthInches,13);
  assert.equal(c.networkHint,'CoCoRaHS indexed by ACIS');
});
test('ACIS parser preserves zero, trace and missing and rejects old dates',()=>{
  const rows=[
    {meta:{name:'Zero',uid:1,ll:[-84.7,45]},data:[['M','M'],['M','M'],['M','M'],['0','0'],['0','T']]},
    {meta:{name:'Trace',uid:2,ll:[-84.71,45]},data:[['M','M'],['M','M'],['M','M'],['T','0'],['T','0']]},
    {meta:{name:'Missing',uid:3,ll:[-84.72,45]},data:Array.from({length:5},()=>['M','M'])},
    {meta:{name:'Stale',uid:4,ll:[-84.73,45]},data:[['10','3'],['M','M'],['M','M'],['M','M'],['M','M']]}
  ];
  const r=E.parseAcis({data:rows},{lat:45,lon:-84.7,nowMs:NOW});
  assert.equal(r.stationCount,2);
  assert.equal(r.stations.find(s=>s.stationId==='1').depthInches,0);
  assert.equal(r.stations.find(s=>s.stationId==='2').depthInches,null);
  assert.equal(r.stations.find(s=>s.stationId==='2').depthTrace,true);
  assert.ok(!r.stations.some(s=>s.stationId==='3'||s.stationId==='4'));
});
test('real October Gaylord ACIS zero report can be parsed',()=>{
  const oct=Date.parse('2026-10-21T12:00:00Z');
  const r=E.parseAcis({data:[{meta:{name:'GAYLORD 9SSW',uid:29225,ll:[-84.71891,44.90715]},
    data:[['0','0.0'],['0','0.0'],['0','0.0'],['0','0.0'],['0','0.0'],['0','M']]}]},
    {lat:44.91,lon:-84.72,nowMs:oct});
  assert.equal(r.status,'observations');
  assert.equal(r.stations[0].depthInches,0);
  assert.equal(r.stations[0].measuredOn,'2026-10-21');
});
test('disagreement lowers confidence but never creates a recommendation',()=>{
  const station={stations:[{distanceMiles:3,depthInches:5}]};
  const r=E.compareEvidence(E.parseIms({value:'2'}),station);
  assert.equal(r.disagreement,true);
  assert.equal(r.recommendationEligible,false);
});
test('no response, error and absent stations do not mean bare',()=>{
  assert.equal(E.parseAcis({error:'unavailable'},{lat:45,lon:-84.7,nowMs:NOW}).status,'unavailable');
  const v=E.compareEvidence(E.parseIms(null),E.parseAcis(null,{lat:45,lon:-84.7,nowMs:NOW}));
  assert.equal(v.state,'ground-verification-limited');
  assert.equal(v.recommendationEligible,false);
});
