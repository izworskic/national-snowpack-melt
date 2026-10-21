'use strict';
const {chromium}=require('playwright'),fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
const file=p=>fs.readFileSync(path.join(root,p));
const shim='window.NationalTools={esc:x=>String(x??""),track:()=>{},fmtDate:x=>String(x),fmtInZone:x=>String(x),label:x=>x.place||"Bay City",readJsonResponse:async r=>r.json(),bind:(form,fn)=>form.addEventListener("submit",e=>{e.preventDefault();fn({latitude:43.5945,longitude:-83.8889,place:"Bay City",stateCode:"MI"});})};';
const stripShared=(s)=>s.replace(/<script src="\/assets\/national-tools\.js[^"]*"><\/script>/,'<script>'+shim+'</script>');
const site=stripShared(String(file('tests/fixtures/michigan-snow-depth.html')))
 .replace(/https:\/\/national-snowpack-melt\.vercel\.app\/assets\/michigan-good-snow\.(js|css)\?v=[^"]+/g,(_,ext)=>'/assets/michigan-good-snow.'+ext);
const national=stripShared(String(file('public/national-tools/snow/index.html')));
const station={observations:{stations:[{name:'STATION <script>',depthInches:9,distanceMiles:3.1,measuredOn:'2026-01-15'}]}};
const destinations=[{id:'hartwick-pines',name:'Hartwick Pines State Park',region:'Northern Lower',lat:44.73583,lon:-84.65667,
 discovery_source:'documented-public-venue',travel_source:'estimated',drive_minutes:137,
 address:'3612 State Park Dr, Grayling, MI 49738',url:'https://www.michigan.gov/recsearch/parks/hartwick',
 access_note:'Verify trail and parking.',pack:{depth:11,source:'nohrsc-snodas-1km',confidence:'medium',validation:'model only'},
 model:{score:75,quality:'good',confidence:'medium',survival:{risk:'low'},components:{base:55,fresh:8,survival:12}},why:'Snow opportunity'},
 {id:'young-state-park',name:'Young State Park',region:'Northwest Lower',lat:45.23579,lon:-85.042,
 discovery_source:'documented-public-venue',travel_source:'estimated',drive_minutes:190,
 address:'Young State Park, Boyne City, MI',url:'https://www.michigan.gov/recsearch/parks/young',
 access_note:'Confirm park access.',pack:{depth:5,source:'nohrsc-snodas-1km',confidence:'low',validation:'model only'},
 model:{score:50,quality:'fair',confidence:'low',survival:{risk:'low'},components:{base:31,fresh:0,survival:19}},why:'Some snow'}
];
const snow={verdict:'route-unverified',retrieved_at:'2026-10-21T12:00:00Z',destinations,
 map:{snow_zones:[{lat:45,lon:-84.75,depth_inches:14}]},diagnostics:{discovery_mode:'spatial',routing_degraded:true},
 sources:[{name:'NOAA/NOHRSC SNODAS 1-km',updated_at:'2026-10-21T03:00:00Z'}]};
const nationalResult={decision:{level:'context',confidence:'medium',headline:'Snowpack measured nearby',detail:'Station check',what_changed:'Stable',what_next:'Cold'},nohrsc:{},snotel:null,forecast_48h:{},sources:[],retrieved_at:'2026-10-21T12:00:00Z'};
const server=http.createServer((req,res)=>{
 const p=new URL(req.url,'http://localhost').pathname;
 const send=(type,data,status=200)=>{res.writeHead(status,{'Content-Type':type});res.end(data);};
 if(p==='/michigan-snow-depth/')return send('text/html',site);
 if(p==='/national-tools/snow/')return send('text/html',national);
 if(p==='/assets/michigan-good-snow.js')return send('text/javascript',file('public/assets/michigan-good-snow.js'));
 if(p==='/assets/michigan-good-snow.css')return send('text/css',file('public/assets/michigan-good-snow.css'));
 if(p==='/api/carto-basemap-config')return send('application/json',JSON.stringify({key:'public-qa-key'}));
 if(p==='/api/national-snow')return send('application/json',JSON.stringify(nationalResult));
 send('text/plain','missing',404);
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  for(const width of [390,1280]){
   const ctx=await browser.newContext({viewport:{width,height:800}});
   let carto=0,ground=0;const errors=[];
   await ctx.route('**/api/michigan-good-snow*',r=>r.fulfill({status:200,headers:{'access-control-allow-origin':'*'},contentType:'application/json',body:JSON.stringify(snow)}));
   await ctx.route('**/api/michigan-snow-ground-evidence*',r=>{ground++;return r.fulfill({status:200,headers:{'access-control-allow-origin':'*'},contentType:'application/json',body:JSON.stringify(station)});});
   await ctx.route('**/leaflet.min.js',r=>r.fulfill({status:200,contentType:'text/javascript',body:fs.readFileSync(require.resolve('leaflet/dist/leaflet.js'))}));
   await ctx.route('**/leaflet.min.css',r=>r.fulfill({status:200,contentType:'text/css',body:fs.readFileSync(path.join(path.dirname(require.resolve('leaflet/dist/leaflet.js')),'leaflet.css'))}));
   await ctx.route('**/basemaps.cartocdn.com/**',r=>{assert.equal(new URL(r.request().url()).searchParams.get('key'),'public-qa-key');carto++;return r.fulfill({status:200,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP+zP9JxQAAAABJRU5ErkJggg==','base64')});});
   const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base+'/michigan-snow-depth/',{waitUntil:'domcontentloaded'});
   await page.locator('#goodSnowForm button[type=submit]').click();
   await page.locator('#goodSnowList .gs-card').first().waitFor();
   assert.match(await page.locator('#goodSnowHeadline').innerText(),/Promising public snow destination/);
   assert.equal(ground,0,'No unrequested ground requests');
   await page.locator('#goodSnowList details[data-snow-evidence] summary').first().click();
   await page.locator('.gs-evidence-result li').first().waitFor();
   assert.equal(ground,1,'Ground observation only loaded on click');
   await page.locator('#goodSnowMapLoad').click();
   await page.locator('.leaflet-container').waitFor({timeout:18000});
   await page.waitForFunction(()=>document.querySelectorAll('.leaflet-interactive').length>=3);
   assert.ok(carto>0,'Map rendered keyed CARTO tiles');
   const dim=await page.evaluate(()=>[document.documentElement.clientWidth,document.documentElement.scrollWidth]);
   assert.ok(dim[1]<=dim[0]+2,'mobile/desktop overflow '+JSON.stringify(dim));
   const url=await page.locator('#goodSnowList a[href^="/national-tools/snow/?lat="]').first().getAttribute('href');
   await page.goto(base+url,{waitUntil:'domcontentloaded'});
   await page.locator('#answer').waitFor();
   assert.match(await page.locator('#answer').innerText(),/Snowpack measured nearby/);
   assert.deepEqual(errors,[]);
   console.log('PASS actual Chromium viewport',width,'keyed CARTO tiles',carto,'station requests',ground);
   await ctx.close();
  }
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error('BROWSER_QA_FAILED',e);server.close();process.exitCode=1;});
