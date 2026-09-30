const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");

const root=path.join(__dirname,"..");
const owner="https://national-snowpack-melt.vercel.app";

test("generated snow page loads Good Snow assets from the owning deployment",()=>{
  const html=fs.readFileSync(path.join(root,"public/national-tools/snow/index.html"),"utf8");
  assert.match(html,new RegExp(owner.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"/assets/michigan-good-snow\\.js\\?v=20260930-4"));
  assert.match(html,new RegExp(owner.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"/assets/michigan-good-snow\\.css\\?v=20260930-2"));
  assert.doesNotMatch(html,/src="\/assets\/michigan-good-snow\.js/);
});

test("Good Snow client calls the owning deployment API",()=>{
  const js=fs.readFileSync(path.join(root,"public/assets/michigan-good-snow.js"),"utf8");
  assert.match(js,/const GOOD_SNOW_API="https:\/\/national-snowpack-melt\.vercel\.app\/api\/michigan-good-snow"/);
  assert.match(js,/fetch\(GOOD_SNOW_API\+"\?"\+p\.toString\(\)\)/);
});

test("Good Snow API permits canonical-site cross-origin requests before method handling",async()=>{
  const handler=require("../api/michigan-good-snow");
  const headers={};
  let statusCode=null;
  const res={
    setHeader(name,value){headers[String(name).toLowerCase()]=value;},
    status(code){statusCode=code;return this;},
    json(payload){return payload;}
  };
  await handler({method:"POST",headers:{origin:"https://chrisizworski.com"},query:{}},res);
  assert.equal(headers["access-control-allow-origin"],"https://chrisizworski.com");
  assert.equal(headers.vary,"Origin");
  assert.equal(statusCode,405);
});
