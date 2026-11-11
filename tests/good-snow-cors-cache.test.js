'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
// Replace only the downstream computation; verify actual HTTP-wrapper headers.
const key=require.resolve('../api/michigan-good-snow-spatial-engine');
require(key);
const original=require.cache[key].exports;
require.cache[key].exports=(req,res)=>res.end('ok');
const handler=require('../api/michigan-good-snow.js');
require.cache[key].exports=original;
function call(origin){
 const headers={};
 const req={headers:origin===null?{}:{origin}};
 const res={setHeader:(key,value)=>{headers[key.toLowerCase()]=value;},end:()=>{}};
 handler(req,res);
 return headers;
}
test('allowed main-site browser origin receives matching ACAO and Vary',()=>{
 const h=call('https://chrisizworski.com');
 assert.equal(h['access-control-allow-origin'],'https://chrisizworski.com');
 assert.equal(h.vary,'Origin');
});
test('anonymous non-browser request also sends Vary to prevent wrong cached CORS variant',()=>{
 const h=call(null);
 assert.equal(h.vary,'Origin');
 assert.equal(h['access-control-allow-origin'],undefined);
});
test('allowed subdomain gets an origin-specific header, but arbitrary foreign origin never does',()=>{
 const sub=call('https://snow.chrisizworski.com'),bad=call('https://not-example.test');
 assert.equal(sub['access-control-allow-origin'],'https://snow.chrisizworski.com');
 assert.equal(sub.vary,'Origin');
 assert.equal(bad.vary,'Origin');
 assert.equal(bad['access-control-allow-origin'],undefined);
});