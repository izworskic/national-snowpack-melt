'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const wait=()=>new Promise(r=>setImmediate(r));
function node(){return {textContent:'',innerHTML:'',hidden:false,dataset:{},style:{},addEventListener(){},querySelector(){return null;}};}
function fakeN(){return {esc:x=>String(x??''),fmtDate:x=>String(x),fmtInZone:x=>String(x),label:x=>x.place||x.displayName||'place',track(){},readJsonResponse:async r=>r.json()};}
test('national page executes coordinate handoff and calls snow API without geocoding',async()=>{
 const html=read('public/national-tools/snow/index.html');
 const m=html.match(/<script>\s*(document\.addEventListener\("DOMContentLoaded"[\s\S]*?)<\/script>/);
 assert.ok(m,'national page inline controller found');
 const nodes={},form=node(),input=node(),status=node(),N=fakeN(),calls=[];
 let onReady=null;
 form.parentElement={querySelector:()=>status};
 form.querySelector=()=>input;
 N.bind=()=>{};
 const fakeDocument={addEventListener:(key,fn)=>{if(key==='DOMContentLoaded')onReady=fn;},getElementById:id=>id==='loc'?form:(nodes[id] ||= node())};
 const data={decision:{level:'context',confidence:'medium',headline:'Measured snow',detail:'Nearby only',what_changed:'No change',what_next:'Thaw possible'},
   nohrsc:{},snotel:null,forecast_48h:{},sources:[],retrieved_at:'2026-10-21T00:00:00Z'};
 const context={window:{NationalTools:N},document:fakeDocument,
   location:{search:'?lat=45.0275&lon=-84.6748&place=Gaylord&state=MI'},
   URLSearchParams,Date,Math,
   fetch:async u=>{calls.push(String(u));return {json:async()=>data};}};
 vm.runInNewContext(m[1],context);
 assert.ok(onReady);onReady();await wait();await wait();
 assert.equal(calls.length,1);
 const url=new URL(calls[0],'https://chrisizworski.com');
 assert.equal(url.pathname,'/api/national-snow');
 assert.equal(url.searchParams.get('lat'),'45.0275');
 assert.equal(url.searchParams.get('lon'),'-84.6748');
 assert.equal(url.searchParams.get('state'),'MI');
 assert.match(nodes.answer.textContent,/Measured snow/);
});
test('Michigan UI fetches rankings first and station data only when disclosure opened',async()=>{
 const js=read('public/assets/michigan-good-snow.js');
 const ids={},form=node(),list=node(),inputs={driveHours:{value:'3'},activity:{value:'any'},trip:{value:'today'}};
 let go=null,openDetails=null;const calls=[];
 form.querySelector=s=>inputs[s.match(/\[name=(\w+)\]/)?.[1]]||node();
 list.addEventListener=(key,cb)=>{if(key==='click')openDetails=cb;};
 const document={readyState:'complete',addEventListener(){},getElementById:id=>id==='goodSnowForm'?form:id==='goodSnowList'?list:(ids[id] ||= node())};
 const N=fakeN();N.bind=(f,cb)=>{go=cb;};
 const d={name:'Gaylord',lat:45.0275,lon:-84.6748,drive_minutes:120,travel_source:'routed',region:'Northern Lower',
   discovery_source:'anchor',pack:{depth:8,source:'nohrsc-snodas-1km',confidence:'high',validation:'model and stations agree'},
   recent_snow:null,model:{score:80,quality:'good',confidence:'high',survival:{risk:'low'},components:{base:55,fresh:5,survival:20}},why:'Snow held through the night'};
 const result={destinations:[d],verdict:'ranked',diagnostics:{discovery_mode:'anchor-fallback'},
   retrieved_at:'2026-10-21T06:00:00Z',sources:[]};
 const context={window:{NationalTools:N},document,location:{search:''},URLSearchParams,Date,Math,
   fetch:async u=>{const url=String(u);calls.push(url);
     if(url.includes('/api/michigan-snow-ground-evidence'))return {json:async()=>({observations:{stations:[{
       name:'Unsafe <script>',depthInches:8,distanceMiles:3,measuredOn:'2026-10-21'}]}})};
     return {json:async()=>result};}};
 vm.runInNewContext(js,context);
 assert.equal(typeof go,'function');assert.equal(typeof openDetails,'function');
 assert.equal(calls.length,0);
 await go({latitude:43.6,longitude:-83.9});
 assert.equal(calls.length,1);
 assert.match(list.innerHTML,/national-tools\/snow\/\?lat=45.0275/);
 assert.match(list.innerHTML,/data-snow-evidence/);
 const stationNode=node(),panel={dataset:{lat:'45.0275',lon:'-84.6748'},open:false,querySelector:()=>stationNode};
 const summary={parentElement:panel};
 await openDetails({target:{closest:()=>summary}});
 assert.equal(calls.length,2);
 assert.match(calls[1],/michigan-snow-ground-evidence/);
 assert.match(stationNode.innerHTML,/Independent ground observations/);
 assert.match(stationNode.innerHTML,/Unsafe &lt;script&gt;/);
 await openDetails({target:{closest:()=>summary}});
 assert.equal(calls.length,2,'no redundant fetch on reopened panel');
});
