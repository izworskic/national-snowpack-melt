const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");

const root=path.join(__dirname,"..");
const owner="https://national-snowpack-melt.vercel.app";

test("national snow page remains a national point snowpack tool",()=>{
  const html=fs.readFileSync(path.join(root,"public/national-tools/snow/index.html"),"utf8");
  assert.match(html,/canonical" href="https:\/\/chrisizworski\.com\/national-tools\/snow\//);
  assert.match(html,/Snowpack & Snowmelt Conditions/);
  assert.doesNotMatch(html,/id="goodSnowForm"/);
  assert.match(html,/data-michigan-good-snow-handoff="1"/);
  assert.match(html,/href="\/michigan-snow-depth\//);
});

test("Michigan snow-depth page owns the Good Snow decision experience",()=>{
  const html=fs.readFileSync(path.join(root,"public/michigan-snow-depth/index.html"),"utf8");
  assert.match(html,/canonical" href="https:\/\/chrisizworski\.com\/michigan-snow-depth\//);
  assert.match(html,/id="goodSnowForm"/);
  assert.match(html,/Where Is the Good Snow\?/);
  assert.match(html,new RegExp(owner.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"/assets/michigan-good-snow\\.js"));
  assert.match(html,new RegExp(owner.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"/assets/michigan-good-snow\\.css"));
  assert.match(html,/href="\/national-tools\/snow\//);
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
