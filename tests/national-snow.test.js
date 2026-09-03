const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const snow=require("../api/national-snow")._test;

test("NOHRSC pipe reports preserve station coordinates, value and provisional timing",()=>{
  const body=[
    "! THESE DATA ARE UNOFFICIAL AND PROVISIONAL",
    "Station_Id|Name|Latitude|Longitude|Elevation|Physical_Element|DateTime_Report(UTC)|Amount|Units|Zip_Code|",
    "ABCD1|TEST RIDGE|44.1000|-110.2000|8000 feet|snowdepth|2026-02-10 06|18.500|in|82190|"
  ].join("\n");
  const rows=snow.nohrscRows(body);
  assert.equal(rows.length,1);
  assert.equal(rows[0].station_id,"ABCD1");
  assert.equal(rows[0].amount,18.5);
  assert.equal(rows[0].elevation_ft,8000);
  assert.equal(rows[0].observed_at,"2026-02-10T06:00:00.000Z");
});

test("NOHRSC report URL is deterministic and uses 06Z daily product",()=>{
  const url=snow.nohrscUrl("snowdepth",new Date("2026-02-10T06:00:00Z"));
  assert.equal(url,"https://www.nohrsc.noaa.gov/nsa/discussions_text/National/snowdepth/202602/snowdepth_2026021006_e.txt");
});

test("report anchor uses the most recent completed 06Z report day",()=>{
  assert.equal(snow.reportAnchor(new Date("2026-02-10T17:00:00Z")).toISOString(),"2026-02-10T06:00:00.000Z");
  assert.equal(snow.reportAnchor(new Date("2026-02-10T03:00:00Z")).toISOString(),"2026-02-09T06:00:00.000Z");
});

test("AWDB URLs stay on the official REST service and request snow elements",()=>{
  const station=new URL(snow.awdbStationUrl("OR"));
  assert.equal(station.hostname,"wcc.sc.egov.usda.gov");
  assert.equal(station.searchParams.get("stationTriplets"),"*:OR:SNTL");
  assert.equal(station.searchParams.get("elements"),"WTEQ,SNWD");
  const data=new URL(snow.awdbDataUrl("341:OR:SNTL"));
  assert.equal(data.searchParams.get("duration"),"DAILY");
  assert.match(data.searchParams.get("elements"),/WTEQ/);
  assert.match(data.searchParams.get("elements"),/SNWD/);
});

test("AWDB parser keeps missing data missing and calculates recent change",()=>{
  const payload=[{stationTriplet:"341:OR:SNTL",data:[{
    stationElement:{elementCode:"SNWD",storedUnitCode:"in"},
    values:[
      {date:"2026-02-07",value:12,qcFlag:"V",qaFlag:"R"},
      {date:"2026-02-08",value:13,qcFlag:"V",qaFlag:"R"},
      {date:"2026-02-09",value:14,qcFlag:"V",qaFlag:"R"},
      {date:"2026-02-10",value:16,qcFlag:"V",qaFlag:"R"}
    ]
  }]}];
  const depth=snow.awdbElement(payload,"SNWD");
  assert.equal(depth.value,16);
  assert.equal(depth.change_3d,4);
  assert.equal(snow.awdbElement(payload,"WTEQ"),null);
});

test("48-hour NWS summary counts thaw, freeze, rain and snow without inventing totals",()=>{
  const periods=[
    {startTime:"2026-02-10T09:00:00-07:00",temperature:28,temperatureUnit:"F",shortForecast:"Snow Showers",probabilityOfPrecipitation:{value:60}},
    {startTime:"2026-02-10T10:00:00-07:00",temperature:34,temperatureUnit:"F",shortForecast:"Cloudy",probabilityOfPrecipitation:{value:20}},
    {startTime:"2026-02-10T11:00:00-07:00",temperature:42,temperatureUnit:"F",shortForecast:"Rain Showers",probabilityOfPrecipitation:{value:70}},
    {startTime:"2026-02-10T12:00:00-07:00",temperature:31,temperatureUnit:"F",shortForecast:"Cloudy",probabilityOfPrecipitation:{value:10}}
  ];
  const f=snow.forecastSummary(periods,"2026-02-10T15:00:00Z");
  assert.equal(f.above_freezing_hours,2);
  assert.equal(f.freezing_hours,2);
  assert.equal(f.snow_signal_hours,1);
  assert.equal(f.rain_signal_hours,1);
  assert.equal(f.first_thaw_time,periods[1].startTime);
  assert.equal(f.first_refreeze_time,periods[3].startTime);
});

test("distant pack never drives a local melt conclusion",()=>{
  const d=snow.decision({depth:{distance_miles:85,value:24,name:"Far Ridge",change_24h:-2,unit:"in"},swe:null},null,{
    hours:48,max_temperature_f:50,above_freezing_hours:40,warm_40f_hours:25,rain_signal_hours:10,snow_signal_hours:0,freezing_hours:0
  });
  assert.equal(d.level,"pack-unverified");
  assert.equal(d.melt_pressure,"not-evaluated");
  assert.match(d.detail,/85/);
});

test("nearby measured pack plus warm rain can produce elevated melt pressure",()=>{
  const d=snow.decision({depth:{distance_miles:12,value:30,name:"Near Ridge",change_24h:-3,unit:"in"},swe:{distance_miles:15,value:8,name:"Near Pillow",change_24h:-0.4,unit:"in"}},null,{
    hours:48,max_temperature_f:48,min_temperature_f:33,above_freezing_hours:40,freezing_hours:0,warm_40f_hours:20,rain_signal_hours:6,snow_signal_hours:0
  });
  assert.equal(d.level,"melt-pressure-high");
  assert.equal(d.melt_pressure,"elevated");
  assert.match(d.detail,/not an agency snowmelt forecast/i);
});

test("forecast snow without measured pack stays low confidence and explicit",()=>{
  const d=snow.decision(null,null,{hours:48,snow_signal_hours:6,above_freezing_hours:2,freezing_hours:46,max_temperature_f:30});
  assert.equal(d.level,"snow-possible");
  assert.equal(d.confidence,"low");
  assert.match(d.headline,/current measured pack is not verified/i);
});

test("snow canonical exposes source truth, safety boundaries and privacy-safe analytics",()=>{
  const html=fs.readFileSync(path.join(__dirname,"../public/national-tools/snow/index.html"),"utf8");
  assert.match(html,/<link rel="canonical" href="https:\/\/chrisizworski\.com\/national-tools\/snow\/">/);
  assert.match(html,/"dateModified":"2026-09-02"/);
  assert.match(html,/unofficial and provisional/i);
  assert.match(html,/not a NOAA\/NRCS snowmelt forecast/i);
  assert.match(html,/avalanche/i);
  assert.match(html,/National Snow Result/);
  const event=html.split("\n").find((line)=>line.includes("National Snow Result"))||"";
  assert.doesNotMatch(event,/latitude|longitude|query|place/);
});

test("snow API keeps source families independent and keyless",()=>{
  const src=fs.readFileSync(path.join(__dirname,"../api/national-snow.js"),"utf8");
  assert.match(src,/Promise\.allSettled/);
  assert.match(src,/nohrsc\.noaa\.gov/);
  assert.match(src,/awdbRestApi/);
  assert.match(src,/api\.weather\.gov/);
  assert.doesNotMatch(src,/API_KEY|apiKey|Authorization|Bearer/);
});
