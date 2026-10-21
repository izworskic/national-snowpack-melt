(function(){
"use strict";
const GOOD_SNOW_API="https://national-snowpack-melt.vercel.app/api/michigan-good-snow";
function ready(fn){if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",fn);else fn();}
function esc(v){return String(v==null?"":v).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];});}
function tripHours(value){
  if(value==="today")return 12;
  const now=new Date(), target=new Date(now);
  const desired=value==="sunday"?0:6;
  let delta=(desired-now.getDay()+7)%7;
  if(delta===0 && now.getHours()>=14)delta=7;
  target.setDate(now.getDate()+delta);
  target.setHours(12,0,0,0);
  return Math.max(12,Math.min(120,Math.round((target-now)/36e5)));
}
function driveLabel(minutes){const h=Math.floor(minutes/60),m=minutes%60;return h?(m?h+"h "+m+"m":h+"h"):m+"m";}
function metric(value,label){return '<div class="gs-metric"><strong>'+esc(value)+'</strong><span>'+esc(label)+'</span></div>';}
function resultCard(d,index){
  const fresh=d.recent_snow&&d.recent_snow.inches>0?d.recent_snow.inches+'"':'None reported';
  const depth=d.pack&&d.pack.depth!=null?d.pack.depth+'"':'Unverified';
  const change=d.pack&&d.pack.change_24h!=null?((d.pack.change_24h>0?"+":"")+d.pack.change_24h+'" / ~24h'):'change unavailable';
  const travelNote=d.travel_source==="routed"?"routed drive time":"estimated drive time";
  const depthLabel=d.pack&&d.pack.source==="nohrsc-snodas-1km"?"NOHRSC 1-km depth":"station depth fallback";
  const swe=d.pack&&d.pack.swe_inches!=null?d.pack.swe_inches+'" SWE':'SWE unavailable';
  const validation=d.pack&&d.pack.validation?d.pack.validation:'station check unavailable';
  const spatial=d.discovery_source==="snodas-spatial";
  const access=spatial?(d.road_name?'spatial snow zone · near '+d.road_name:'spatial snow zone'):d.region;
  const mapQuery=spatial?(Number(d.lat).toFixed(5)+','+Number(d.lon).toFixed(5)):(d.name+', Michigan');
  const map='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(mapQuery);
  const badges='<span>'+esc(d.model.quality)+' snow</span><span>'+esc(d.model.confidence)+' confidence</span>'+(spatial?'<span>spatially discovered</span>':'');
  const discoveryNote=spatial?' This location was discovered from the reachable NOAA snow field rather than selected from the preset town list.':'';
  const mapLabel=spatial?'Open snow zone':'Open destination';
  const pointOk=Number.isFinite(Number(d.lat))&&Number.isFinite(Number(d.lon));
  const pointLink=pointOk?'/national-tools/snow/?lat='+encodeURIComponent(Number(d.lat).toFixed(4))+
    '&lon='+encodeURIComponent(Number(d.lon).toFixed(4))+
    '&place='+encodeURIComponent(String(d.name||'Michigan snow zone').slice(0,70))+'&state=MI':null;
  const evidence=pointOk?'<details class="gs-evidence" data-snow-evidence data-lat="'+esc(Number(d.lat).toFixed(4))+
    '" data-lon="'+esc(Number(d.lon).toFixed(4))+'"><summary>Check nearby ground-measured snow depth</summary>'+
    '<div class="gs-evidence-result" aria-live="polite">Open to request dated station observations. Not included in the snow-trip score.</div></details>':'';

  return '<article class="gs-card'+(index===0?' gs-top':'')+'">'+
    '<div class="gs-rank"><span>'+(index+1)+'</span><div><h3>'+esc(d.name)+'</h3><p>'+esc(access)+' · '+esc(driveLabel(d.drive_minutes))+' · '+esc(travelNote)+'</p></div><div class="gs-score"><strong>'+esc(d.model.score)+'</strong><span>/100</span></div></div>'+
    '<div class="gs-badges">'+badges+'</div>'+
    '<div class="gs-metrics">'+metric(depth,depthLabel)+metric(fresh,"recent report")+metric(d.model.survival.risk,"thaw / rain risk")+metric(change,"station trend")+'</div>'+
    '<p class="gs-why"><strong>Why:</strong> '+esc(d.why)+'</p>'+
    '<details><summary>How this score was built</summary><p>Base '+esc(d.model.components.base)+' · fresh-snow evidence '+esc(d.model.components.fresh)+' · forecast survival '+esc(d.model.components.survival)+'. '+esc(swe)+' · station validation: '+esc(validation)+'. Confidence caps disagreement or sparse evidence.'+esc(discoveryNote)+'</p></details>'+
    '<p class="gs-actions"><a href="'+map+'" rel="noopener">'+mapLabel+'</a>'+
    (pointLink?' <a href="'+esc(pointLink)+'">Check point snowpack &amp; 48-hour melt</a>':'')+'</p>'+
    evidence+
  '</article>';
}
ready(function(){
  const N=window.NationalTools, form=document.getElementById("goodSnowForm");
  if(!N||!form)return;
  const status=document.getElementById("goodSnowStatus"), out=document.getElementById("goodSnowResults"), list=document.getElementById("goodSnowList"), headline=document.getElementById("goodSnowHeadline"), note=document.getElementById("goodSnowNote");
  async function run(loc){
    const drive=form.querySelector("[name=driveHours]").value;
    const activity=form.querySelector("[name=activity]").value;
    const trip=form.querySelector("[name=trip]").value;
    status.textContent="Searching the reachable Michigan snow field, then checking the best zones against stations, forecast survival and drive time…";
    out.hidden=true;
    try{
      const p=new URLSearchParams({lat:loc.latitude,lon:loc.longitude,driveHours:drive,activity:activity,tripHours:String(tripHours(trip))});
      const r=await fetch(GOOD_SNOW_API+"?"+p.toString());
      const d=await N.readJsonResponse(r,"Snow ranking unavailable");
      const rows=d.destinations||[];
      const diag=d.diagnostics||{};
      out.hidden=false;
      if(!rows.length){
        headline.textContent="No Michigan snow destination could be ranked inside that drive limit.";
        note.textContent="Try a longer drive limit. The tool will not invent a recommendation when the evidence is missing.";
        list.innerHTML="";
      }else if(d.verdict==="no-strong-snow"){
        headline.textContent="No strong natural-snow destination stands out inside "+drive+" hours.";
        note.textContent="These are the best available comparisons, but the current evidence does not clear the minimum snow threshold for a confident winter-day recommendation.";
        list.innerHTML=rows.map(resultCard).join("");
      }else if(d.verdict==="route-unverified"){
        headline.textContent="Possible snow destination: "+rows[0].name;
        note.textContent="Snow evidence is promising, but road routing or access to the sampled snow zone was not verified. Drive times are estimates; check the actual route and public access before going.";
        list.innerHTML=rows.map(resultCard).join("");
      }else{
        headline.textContent="Best snow within "+drive+" hours: "+rows[0].name;
        note.textContent=diag.discovery_mode==="spatial"?"The engine searched the reachable NOAA/NOHRSC snow field first, refined the strongest zones, then applied station checks, forecast survival and routed drive time.":"No stronger spatial snow zone cleared the discovery gates, so the engine ranked the established destination set with the same snow and forecast checks.";
        list.innerHTML=rows.map(resultCard).join("");
      }
      const sourceBits=[];
      if(diag.spatial_degraded)sourceBits.push("spatial discovery degraded; named-destination fallback used");
      if(diag.snodas_degraded)sourceBits.push("1-km snow analysis partially degraded; station fallback used where needed");
      if(diag.routing_degraded)sourceBits.push("some drive times are estimates");
      if((diag.source_errors||[]).length)sourceBits.push("degraded source: "+diag.source_errors.join(", "));
      const analysed=(d.sources||[]).find(s=>s&&s.name&&s.name.includes("SNODAS"));
      const analysisAt=analysed&&analysed.updated_at?Date.parse(analysed.updated_at):NaN;
      document.getElementById("goodSnowFreshness").textContent=
        "Checked "+new Date(d.retrieved_at).toLocaleString()+
        (Number.isFinite(analysisAt)?" · NOAA snow analysis valid "+new Date(analysisAt).toLocaleString():" · NOAA snow-analysis time unavailable")+
        (sourceBits.length?" · "+sourceBits.join(" · "):"");
      if(typeof N.track==="function")N.track("Good Snow Result",{verdict:d.verdict||"unknown",activity:d.activity||"any",drive_hours:Number(drive),result_count:rows.length,top_score:rows[0]&&rows[0].model&&rows[0].model.score||0,snodas_degraded:!!diag.snodas_degraded,discovery_mode:diag.discovery_mode||"unknown"});
    }catch(e){
      out.hidden=false; headline.textContent="Snow ranking is temporarily unavailable.";
      note.textContent="The point snowpack checker below still works. We do not substitute stale or invented destination rankings when the comparison feed fails.";
      list.innerHTML=""; document.getElementById("goodSnowFreshness").textContent="";
    }finally{status.textContent="";}
  }
  // Optional independent ground-station audit. No new requests during ranking:
  // only fetch when the visitor actually opens a result's disclosure panel.
  list.addEventListener("click",async function(event){
    const summary=event.target&&event.target.closest&&event.target.closest('details[data-snow-evidence] > summary');
    if(!summary)return;
    const panel=summary.parentElement;
    if(panel.open||panel.dataset.loaded)return; // A click while open is closing it.
    const target=panel.querySelector(".gs-evidence-result");
    const lat=Number(panel.dataset.lat),lon=Number(panel.dataset.lon);
    if(!Number.isFinite(lat)||!Number.isFinite(lon))return;
    panel.dataset.loaded="loading";
    target.textContent="Checking recent nearby measured snow-depth reports…";
    try{
      const url="https://national-snowpack-melt.vercel.app/api/michigan-snow-ground-evidence?lat="+
        encodeURIComponent(lat)+"&lon="+encodeURIComponent(lon);
      const response=await fetch(url);
      const result=await N.readJsonResponse(response,"Ground observations unavailable");
      const measured=result.observations&&Array.isArray(result.observations.stations)?result.observations.stations:[];
      if(!measured.length){
        target.textContent="No recent ground-measured snow depth was available nearby. That does not mean there is no snow.";
      }else{
        const rows=measured.slice(0,4).map(s=>{
          const depth=s.depthInches!=null?String(s.depthInches)+'" observed depth':
            (s.depthTrace?'Trace reported':'Depth unavailable');
          return '<li><strong>'+esc(s.name)+'</strong> · '+esc(depth)+
            ' · '+esc(s.distanceMiles)+' mi from the point · '+esc(s.measuredOn)+'</li>';
        }).join('');
        target.innerHTML='<p><strong>Independent ground observations</strong> — measurements at stations, not at the snow-zone pixel.</p>'+
          '<ul>'+rows+'</ul>'+
          '<p class="small">Station reports are dated and may differ from the NOAA 1-km analysis. '+
          'They are advisory and do not change the trip ranking. Satellite coverage remains research-only.</p>';
      }
      panel.dataset.loaded="done";
    }catch(e){
      panel.dataset.loaded="failed";
      target.textContent="The independent station check is unavailable. The trip ranking has not been changed.";
    }
  });
  N.bind(form,run);
  const q=new URLSearchParams(location.search).get("q");
  if(q){form.querySelector("input").value=q;}
});
})();
