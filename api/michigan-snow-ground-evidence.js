'use strict';
// Research-only API. Deliberately separate from /api/michigan-good-snow.
const E = require('../lib/michigan-snow-ground-evidence');
async function json(url, timeout=6000) {
  const r=await fetch(url,{headers:{Accept:'application/json',
    'User-Agent':'ChrisIzworskiSnowResearch/1.0 (+https://chrisizworski.com/michigan-snow-depth/)'},
    signal:AbortSignal.timeout(timeout)});
  if (!r.ok) throw Error('source HTTP '+r.status);
  const data=await r.json();
  if (data && data.error) throw Error('source returned an error');
  return data;
}
module.exports=async function handler(req,res) {
  const origin=String(req.headers&&req.headers.origin||"");
  // Public read-only evidence endpoint consumed on demand by the canonical
  // chrisizworski.com Michigan finder, not by other arbitrary browser origins.
  const allowed=new Set(["https://chrisizworski.com","https://www.chrisizworski.com",
    "https://chrisizworski-com-preview.vercel.app"]);
  if(allowed.has(origin)){
    res.setHeader("Access-Control-Allow-Origin",origin);
    res.setHeader("Vary","Origin");
  }
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('X-Robots-Tag','noindex,nofollow');
  res.setHeader('Cache-Control','public, s-maxage=3600, stale-while-revalidate=3600');
  if (req.method!=='GET') {
    res.setHeader('Allow','GET');
    return res.status(405).json({error:'GET only'});
  }
  const lat=E.finite(req.query && req.query.lat,41.5,48.5);
  const lon=E.finite(req.query && req.query.lon,-91,-82);
  if(lat===null||lon===null) return res.status(400).json({error:'Michigan-area latitude and longitude required'});
  // Round requests to ~few-km cells to reduce upstream calls; never imply parcel accuracy.
  const y=Math.round(lat*20)/20,x=Math.round(lon*20)/20;
  const now=Date.now();
  const urls={ims:E.imsIdentifyUrl(y,x),acis:E.acisUrl(y,x,now)};
  const settled=await Promise.allSettled([json(urls.ims),json(urls.acis,8500)]);
  const ims=settled[0].status==='fulfilled'?E.parseIms(settled[0].value):E.parseIms(null);
  const observations=settled[1].status==='fulfilled'?
    E.parseAcis(settled[1].value,{lat:y,lon:x,nowMs:now}):
    E.parseAcis(null,{lat:y,lon:x,nowMs:now});
  const sources=[
    {dataset:'NOAA/USNIC IMS 1-km',url:E.IMS,kind:'satellite-supported snow-cover analysis',
      validAt:null,validAtVerified:false,status:ims.status,
      note:'Published as a daily analysis; this service does not supply a verified per-response valid time.'},
    {dataset:'RCC ACIS MultiStnData',url:E.ACIS,kind:'dated measured station snow depth',
      status:observations.status,note:'Includes CoCoRaHS station identifiers where reported.'}
  ];
  return res.status(200).json({
    researchOnly:true,retrievedAt:new Date(now).toISOString(),
    referenceCell:{lat:y,lon:x,approximate:true},
    overallStatus:ims.status==='unavailable'&&observations.status==='unavailable'?'unavailable':
      ims.status==='unavailable'||observations.status==='unavailable'?'partial':'sources-responded',
    ims,observations,validation:E.compareEvidence(ims,observations),sources,
    warnings:['Do not use this endpoint to score or guarantee a winter outing.',
      'Cover class, modeled snow depth and measured snow depth are different products.',
      'IMS image service response time is not the analysis valid time.',
      'Missing data or trace must never be interpreted as zero.']
  });
};
