'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('Michigan snow results deep-link exact snow-zone coordinates to national snowpack checker',()=>{
  const js=read('public/assets/michigan-good-snow.js');
  assert.match(js,/\/national-tools\/snow\/\?lat=/);
  assert.match(js,/encodeURIComponent\(Number\(d\.lat\)\.toFixed\(4\)\)/);
  assert.match(js,/Check point snowpack &amp; 48-hour melt/);
  assert.match(js,/\&state=MI/);
});
test('National tracker respects deep-linked lat and lon directly rather than geocoding the anchor town',()=>{
  const html=read('public/national-tools/snow/index.html');
  assert.match(html,/const latText=qp\.get\("lat"\),lonText=qp\.get\("lon"\)/);
  assert.match(html,/run\(loc\)\.catch/);
  assert.match(html,/lat>=-90&&lat<=90&&lon>=-180&&lon<=180/);
  assert.match(html,/else if\(q\)/);
});
test('Optional Michigan ground observation check is on click only, never changes score or claims current truth from IMS',()=>{
  const js=read('public/assets/michigan-good-snow.js');
  assert.match(js,/list\.addEventListener\("click",async function/);
  assert.match(js,/\/api\/michigan-snow-ground-evidence\?lat=/);
  assert.match(js,/Not included in the snow-trip score/);
  assert.match(js,/Satellite coverage remains research-only/);
  assert.match(js,/The trip ranking has not been changed/);
});
test('Research API grants browser access only to explicitly permitted canonical/preview origins',()=>{
  const handler=require('../api/michigan-snow-ground-evidence');
  function response(){const h={};return {h,setHeader:(k,v)=>{h[k]=v;},status(n){this.statusCode=n;return this;},json(x){this.payload=x;return this;}};}
  const good=response();
  handler({method:'POST',headers:{origin:'https://chrisizworski.com'}},good);
  assert.equal(good.h['Access-Control-Allow-Origin'],'https://chrisizworski.com');
  assert.equal(good.statusCode,405);
  const bad=response();
  handler({method:'POST',headers:{origin:'https://untrusted.invalid'}},bad);
  assert.equal(bad.h['Access-Control-Allow-Origin'],undefined);
  assert.equal(bad.statusCode,405);
});
