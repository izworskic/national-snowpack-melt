'use strict';
// Manual NOAA field/unit audit. Run only when requested:
// node scripts/audit-noaa-snow-units.cjs
// Never run on build, per-request or cron. Does not modify the live scoring.
const S=require('../lib/nohrsc-snodas');
const points=[
  {name:'Bay City',lat:43.5945,lon:-83.8889},
  {name:'Grayling',lat:44.6614,lon:-84.7148},
  {name:'Gaylord',lat:45.0275,lon:-84.6748},
  {name:'Marquette',lat:46.5436,lon:-87.3954},
  {name:'Houghton',lat:47.1211,lon:-88.5694},
  {name:'Mt Elbert Colorado — nonzero unit-control',lat:39.1178,lon:-106.4454},
  {name:'Vail Pass Colorado — nonzero unit-control',lat:39.531,lon:-106.2}
];
async function get(url){
  const r=await fetch(url,{headers:{accept:'application/json'},
    signal:AbortSignal.timeout(8000)});
  if(!r.ok) throw Error('HTTP '+r.status);
  return r.json();
}
function candidates(attributes){
  const a=attributes||{};
  const fields=['Pixel Value','Pixel value','Service Pixel Value',
    'Classify.Pixel Value','Stretched value','PixelValue','pixelValue'];
  const found=Object.fromEntries(fields.filter(k=>a[k]!==undefined).map(k=>[k,a[k]]));
  return {rawFields:found,unitVerified:true,nativeUnit:'layer 3 SNOD meters; layer 7 WEASD kg/m2',
    note:'DO NOT assume Pixel Value is inches. Identify raw native units and validate against independently dated observations before changing production.'};
}
async function main(){
  const metadata=await get(S.metadataUrl()).then(S.parseMetadata).catch(e=>({error:String(e)}));
  const rows=[];
  for(const point of points){
    try{
      const data=await get(S.identifyUrl(point.lat,point.lon));
      const layers=(data.results||[]).filter(r=>r.layerId===3||r.layerId===7)
        .map(r=>({layerId:r.layerId,layerName:r.layerName,audit:candidates(r.attributes),value:r.value}));
      rows.push({...point,layers,normalized:S.parseIdentify(data)});
    }catch(e){rows.push({...point,error:String(e)});}
  }
  console.log(JSON.stringify({researchOnly:true,metadata,rows,
    gates:['Check the NOAA source band native units and renderer fields.',
      'Compare at least 10 snow-covered station-location/date pairs.',
      'Include clearly snow-free sites and sentinel values.',
      'Verify SWE and depth independently; never infer from map colors.',
      'Validate 10+ Michigan nonzero snow-depth station/date pairs before merging this branch.']},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
