'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),handler=require('../api/michigan-snow-ground-evidence');
function response(){const headers={};return {headers,setHeader(k,v){headers[k.toLowerCase()]=v;},status(s){this.statusCode=s;return this;},json(p){this.payload=p;return this;}};}
const req=(lat,lon)=>({method:'GET',query:{lat:String(lat),lon:String(lon)},headers:{origin:'https://chrisizworski.com'}});
async function fetchStub(stub,fn){const orig=globalThis.fetch;globalThis.fetch=stub;try{return await fn();}finally{globalThis.fetch=orig;}}
test('bad coordinate rejects before external request',async()=>{const r=response();await handler(req('','-84.7'),r);assert.equal(r.statusCode,400);});
test('mock source returns projected IMS classification and independent station without recommendations',async()=>{
 const r=response();
 await fetchStub(async url=>({ok:true,json:async()=>String(url).includes('ImageServer')?{value:'2'}:{data:[{meta:{uid:1,name:'Gaylord station',ll:[-84.67,45.03],sids:['MIAT0002 10']},data:[['M','M'],['M','M'],['M','M'],['0','0'],['0','0']]}]}}),()=>handler(req(45.0275,-84.6748),r));
 assert.equal(r.statusCode,200);
 assert.equal(r.payload.overallStatus,'sources-responded');
 assert.equal(r.payload.ims.classification,'snow-free-land');
 assert.equal(r.payload.ims.depthInches,null);
 assert.equal(r.payload.observations.stations[0].depthInches,0);
 assert.equal(r.payload.validation.recommendationEligible,false);
 assert.equal(r.headers['access-control-allow-origin'],'https://chrisizworski.com');
});
test('upstream failures return explicit degraded status and no invented measurements',async()=>{
 const r=response();
 await fetchStub(async u=>String(u).includes('ImageServer')?{ok:true,json:async()=>({value:'2'})}:Promise.reject(Error('offline')),()=>handler(req(45,-84.7),r));
 assert.equal(r.payload.overallStatus,'partial');assert.equal(r.payload.observations.stationCount,0);
 const r2=response();await fetchStub(()=>Promise.reject(Error('offline')),()=>handler(req(45,-84.7),r2));
 assert.equal(r2.payload.overallStatus,'unavailable');
 assert.equal(r2.payload.validation.recommendationEligible,false);
});
