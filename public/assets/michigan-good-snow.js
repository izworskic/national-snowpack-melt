(function(){
"use strict";
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
  const map='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(d.name+', Michigan');
  return '<article class="gs-card'+(index===0?' gs-top':'')+'">'+
    '<div class="gs-rank"><span>'+(index+1)+'</span><div><h3>'+esc(d.name)+'</h3><p>'+esc(d.region)+' · '+esc(driveLabel(d.drive_minutes))+' · '+esc(travelNote)+'</p></div><div class="gs-score"><strong>'+esc(d.model.score)+'</strong><span>/100</span></div></div>'+
    '<div class="gs-badges"><span>'+esc(d.model.quality)+' snow</span><span>'+esc(d.model.confidence)+' confidence</span></div>'+
    '<div class="gs-metrics">'+metric(depth,"ground snow")+metric(fresh,"recent report")+metric(d.model.survival.risk,"thaw / rain risk")+metric(change,"pack trend")+'</div>'+
    '<p class="gs-why"><strong>Why:</strong> '+esc(d.why)+'</p>'+
    '<details><summary>How this score was built</summary><p>Base '+esc(d.model.components.base)+' · fresh-snow evidence '+esc(d.model.components.fresh)+' · forecast survival '+esc(d.model.components.survival)+'. Confidence caps sparse-data locations.</p></details>'+
    '<p class="gs-actions"><a href="'+map+'" rel="noopener">Open destination</a></p>'+
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
    status.textContent="Comparing snowpack, fresh-snow reports, forecast survival and drive time…";
    out.hidden=true;
    try{
      const p=new URLSearchParams({lat:loc.latitude,lon:loc.longitude,driveHours:drive,activity:activity,tripHours:String(tripHours(trip))});
      const r=await fetch("/api/michigan-good-snow?"+p.toString());
      const d=await N.readJsonResponse(r,"Snow ranking unavailable");
      const rows=d.destinations||[];
      out.hidden=false;
      if(!rows.length){
        headline.textContent="No Michigan snow destination could be ranked inside that drive limit.";
        note.textContent="Try a longer drive limit. The tool will not invent a recommendation when the evidence is missing.";
        list.innerHTML="";
      }else if(d.verdict==="no-strong-snow"){
        headline.textContent="No strong natural-snow destination stands out inside "+drive+" hours.";
        note.textContent="These are the best available comparisons, but the current evidence does not clear the minimum snow threshold for a confident winter-day recommendation.";
        list.innerHTML=rows.map(resultCard).join("");
      }else{
        headline.textContent="Best snow within "+drive+" hours: "+rows[0].name;
        note.textContent="Ranked for "+d.activity_label.toLowerCase()+". Distance is a filter, not a snow-quality bonus; ties favor the shorter drive.";
        list.innerHTML=rows.map(resultCard).join("");
      }
      const diag=d.diagnostics||{};
      const sourceBits=[];
      if(diag.routing_degraded)sourceBits.push("some drive times are estimates");
      if((diag.source_errors||[]).length)sourceBits.push("degraded source: "+diag.source_errors.join(", "));
      document.getElementById("goodSnowFreshness").textContent="Updated "+new Date(d.retrieved_at).toLocaleString()+(sourceBits.length?" · "+sourceBits.join(" · "):"");
      if(typeof N.track==="function")N.track("Good Snow Result",{verdict:d.verdict||"unknown",activity:d.activity||"any",drive_hours:Number(drive),result_count:rows.length,top_score:rows[0]&&rows[0].model&&rows[0].model.score||0});
    }catch(e){
      out.hidden=false; headline.textContent="Snow ranking is temporarily unavailable.";
      note.textContent="The point snowpack checker below still works. We do not substitute stale or invented destination rankings when the comparison feed fails.";
      list.innerHTML=""; document.getElementById("goodSnowFreshness").textContent="";
    }finally{status.textContent="";}
  }
  N.bind(form,run);
  const q=new URLSearchParams(location.search).get("q");
  if(q){form.querySelector("input").value=q;}
});
})();