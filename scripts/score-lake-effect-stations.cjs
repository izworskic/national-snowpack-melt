#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path");
const V=require("../lib/lake-effect-station-validation");
const dir=path.join(__dirname,"..","tmp");
const data=JSON.parse(fs.readFileSync(path.join(dir,"lake-effect-station-groundtruth.json"),"utf8"));
const result=V.compare(data);
if(result.observation_coverage.known_days<5)throw Error("Too few independently observed station-days to compare; coverage is not failure");
for(const label of ["development","holdout","all"]){
 const v=result.groups[label];
 if(v.baseline.evaluated<1)throw Error("Missing actual independent gauges in "+label);
 if(v.wind.evaluated!==v.baseline.evaluated)throw Error("Candidate and baseline use different ground truth windows");
}
fs.writeFileSync(path.join(dir,"lake-effect-station-validation-score.json"),JSON.stringify(result,null,2)+"\n");
console.log("STATION_SKILL_RESULT_START");
console.log(JSON.stringify(result,null,2));
console.log("STATION_SKILL_RESULT_END");
