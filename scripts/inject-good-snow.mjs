import fs from "node:fs";
import path from "node:path";

const file=path.join(process.cwd(),"public/national-tools/snow/index.html");
let html=fs.readFileSync(file,"utf8");

const marker='data-michigan-good-snow-handoff="1"';
if(!html.includes(marker)){
  const handoff=`<section class="section" ${marker}><div class="wrap"><div class="handoff"><span class="tool-kicker">Michigan trip planning</span><h2>Looking for the best snow to drive to in Michigan?</h2><p>The national tool checks snowpack at a place you choose. The separate Michigan decision tool searches reachable snow zones for you, then compares snow depth, recent snowfall, thaw risk and drive time.</p><p><a href="/michigan-snow-depth/"><strong>Open Michigan Snow Depth: Where Is the Good Snow?</strong></a></p></div></div></section>`;
  html=html.replace("</main>",handoff+"\n</main>");
}

fs.writeFileSync(file,html);
