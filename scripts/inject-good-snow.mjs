import fs from "node:fs";
import path from "node:path";

const file=path.join(process.cwd(),"public/national-tools/snow/index.html");
let html=fs.readFileSync(file,"utf8");
const marker='id="goodSnowForm"';
if(html.includes(marker)) process.exit(0);

html=html
  .replace("<title>Snowpack & Snowmelt Conditions | Chris Izworski</title>","<title>Where Is the Good Snow? Michigan Snow Depth & Weekend Finder | Chris Izworski</title>")
  .replace('content="Check nearby measured snow depth and SWE, recent pack change, and a 48-hour weather-driven melt or refreeze outlook using NOAA, NRCS and NWS data."','content="Find the best natural snow within 1–5 hours in Michigan using measured snow depth, recent NWS snowfall reports, forecast thaw/rain risk and drive time."')
  .replace('content="Snowpack & Snowmelt Conditions"','content="Where Is the Good Snow? Michigan Snow Finder"')
  .replace('content="Nearby measured snowpack first, then 48-hour melt, freeze-thaw and snowfall context."','content="Compare Michigan snow destinations by current ground snow, fresh-snow evidence, forecast survival, drive time and confidence."')
  .replace('"name":"Snowpack & Snowmelt Conditions"','"name":"Where Is the Good Snow? Michigan Snow Finder"')
  .replace('"description":"A U.S. snow decision tool combining nearby NOHRSC and NRCS measured snowpack with the local NWS hourly forecast and transparent melt/refreeze interpretation."','"description":"A Michigan winter-trip decision tool that ranks natural-snow destinations by measured snow depth, recent snowfall evidence, forecast survival, drive time and observation confidence, while retaining a nationwide point snowpack checker."')
  .replace('"dateModified":"2026-09-02"','"dateModified":"2026-09-30"')
  .replace('<meta name="twitter:title" content="Snowpack & Snowmelt Conditions">','<meta name="twitter:title" content="Where Is the Good Snow? Michigan Snow Finder">')
  .replace('<meta name="twitter:description" content="Nearby measured snowpack first, then 48-hour melt, freeze-thaw and snowfall context.">','<meta name="twitter:description" content="Compare Michigan snow destinations by current ground snow, fresh-snow evidence, forecast survival, drive time and confidence.">')
  .replace('&rsaquo; Snowpack & Snowmelt Conditions</div><div class="eyebrow">Snowpack + melt · United States</div>','&rsaquo; Good Snow Finder & Snowpack</div><div class="eyebrow">Michigan trip finder + U.S. point snowpack</div>')
  .replace("<h1>Snowpack & Snowmelt Conditions</h1>","<h1>Where Is the Good Snow?</h1>")
  .replace("<p class=\"lede\">See nearby measured snow depth and snow-water equivalent first, then what changed and whether the next 48 hours favor melt, refreeze, retention or new snow.</p>","<p class=\"lede\">Tell us where you are, how far you will drive and what kind of winter day you want. We compare Michigan destinations so you do not have to interpret a snow map yourself.</p>")
  .replace("</head>",'<link rel="stylesheet" href="/assets/michigan-good-snow.css?v=20260930-1">\n</head>');

const section=`<section class="section" id="best-snow"><div class="wrap">
<div class="section-head"><div><span class="tool-kicker">Michigan trip finder</span><h2>Best snow near you</h2></div></div>
<p class="gs-intro">Find the best natural snow within your drive limit. The ranking starts with snow that is actually on the ground, checks recent National Weather Service snowfall reports, then asks whether rain or thaw will damage it before your trip.</p>
<form id="goodSnowForm" class="gs-form">
  <div class="gs-field"><label for="goodSnowOrigin">Starting city or ZIP</label><input id="goodSnowOrigin" aria-label="Starting city or ZIP" placeholder="Bay City, MI" required></div>
  <div class="gs-field"><label for="goodSnowDrive">Drive limit</label><select id="goodSnowDrive" name="driveHours"><option value="2">2 hours</option><option value="3" selected>3 hours</option><option value="4">4 hours</option><option value="5">5 hours</option></select></div>
  <div class="gs-field"><label for="goodSnowTrip">When</label><select id="goodSnowTrip" name="trip"><option value="today">Today</option><option value="saturday" selected>Saturday</option><option value="sunday">Sunday</option></select></div>
  <div class="gs-field"><label for="goodSnowActivity">Activity</label><select id="goodSnowActivity" name="activity"><option value="any">Any winter day</option><option value="snowshoe">Snowshoe</option><option value="xc">XC ski</option><option value="kids">Kids / sledding</option><option value="photo">Winter photos</option></select></div>
  <button class="btn" type="submit">Find good snow</button>
  <div class="gs-geo"><button type="button" class="secondary-btn geo-btn" data-use-location>Use my location</button><span class="location-privacy">Device location is optional and is not included in analytics.</span></div>
</form>
<div id="goodSnowStatus" class="status" aria-live="polite"></div>
<div id="goodSnowResults" class="gs-results" hidden>
  <div class="gs-verdict"><span class="tool-kicker">Drive decision</span><h2 id="goodSnowHeadline"></h2><p id="goodSnowNote"></p></div>
  <div id="goodSnowList" class="gs-list"></div><p id="goodSnowFreshness" class="small"></p>
</div>
<div class="gs-method"><strong>What the score means:</strong> current ground snow carries the most weight because fresh flakes cannot rescue a bare base. Recent snowfall can improve a destination; forecast warm rain can sharply reduce it. Drive time filters the candidate set instead of making farther snow look artificially better. Sparse observations cap confidence and the score. XC results describe natural-snow potential only—verify grooming before leaving.</div>
<p class="small"><strong>Use the right winter tool:</strong> <a href="/michigan-snow-totals/">Michigan Snow Totals</a> answers what just fell; <a href="/michigan-cross-country-skiing/">Michigan Cross-Country Skiing</a> owns groomed XC conditions; <a href="/snowmobile/">Michigan Snowmobile</a> owns trail-status decisions.</p>
</div></section>`;

const firstSection='<section class="section"><div class="wrap">\n<form id="loc"';
html=html.replace(firstSection,section+'\n<section class="section"><div class="wrap">\n<div class="section-head"><div><span class="tool-kicker">One-place check</span><h2>Check snowpack at a specific place</h2></div></div>\n<form id="loc"');
html=html.replace("</body>",'<script src="/assets/michigan-good-snow.js?v=20260930-1"></script>\n</body>');
fs.writeFileSync(file,html);
