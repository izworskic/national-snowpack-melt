const test=require("node:test");
const assert=require("node:assert/strict");
const snow=require("../api/michigan-good-snow")._test;

test("pack consensus resists a single implausible nearby outlier",()=>{
  const rows=[
    {station_id:"bad",name:"Bad",lat:46.41,lon:-86.65,amount:76.5,observed_at:"2026-09-01T00:00:00Z"},
    {station_id:"a",name:"A",lat:46.45,lon:-86.70,amount:0,observed_at:"2026-09-01T00:00:00Z"},
    {station_id:"b",name:"B",lat:46.35,lon:-86.60,amount:0,observed_at:"2026-09-01T00:00:00Z"}
  ];
  const p=snow.packConsensus(rows,46.4111,-86.6479);
  assert.equal(p.depth,0);
  assert.equal(p.station_count,3);
});

test("SNODAS grid becomes the primary depth when model and stations agree",()=>{
  const observed={depth:16,confidence:"high",station_count:3,distance_miles:8,spread:2,stations:[]};
  const prior={depth:13,confidence:"high"};
  const pack=snow.fusePack({depth_inches:15.2,swe_inches:2.7},observed,prior);
  assert.equal(pack.depth,15.2);
  assert.equal(pack.swe_inches,2.7);
  assert.equal(pack.source,"nohrsc-snodas-1km");
  assert.equal(pack.confidence,"high");
  assert.equal(pack.change_24h,3);
});

test("large SNODAS versus station disagreement lowers confidence instead of averaging it away",()=>{
  const observed={depth:2,confidence:"high",station_count:3,distance_miles:6,spread:1,stations:[]};
  const pack=snow.fusePack({depth_inches:22,swe_inches:3.1},observed,{depth:2,confidence:"high"});
  assert.equal(pack.depth,22);
  assert.equal(pack.confidence,"low");
  assert.equal(pack.validation,"model and stations disagree");
  assert.equal(pack.validation_delta,20);
});

test("station consensus remains a graceful fallback when the raster is unavailable",()=>{
  const observed={depth:9,confidence:"medium",station_count:2,distance_miles:12,spread:3,stations:[]};
  const pack=snow.fusePack(null,observed,{depth:8,confidence:"medium"});
  assert.equal(pack.depth,9);
  assert.equal(pack.source,"station-fallback");
  assert.equal(pack.confidence,"medium");
});

test("IEM snowfall parser accepts GeoJSON geometry coordinates when properties omit lat lon",()=>{
  const now=Date.parse("2026-01-15T12:00:00Z");
  const rows=snow.recentSnowRows({features:[{
    type:"Feature",
    geometry:{type:"Point",coordinates:[-84.6748,45.0275]},
    properties:{typetext:"SNOW",magnitude:5.5,valid:"2026-01-15T06:00:00Z",city:"Gaylord",remark:"Measured snowfall"}
  }]},now);
  assert.equal(rows.length,1);
  assert.equal(rows[0].lat,45.0275);
  assert.equal(rows[0].lon,-84.6748);
  assert.equal(rows[0].amount,5.5);
});

test("low confidence caps a large raw snow signal",()=>{
  const d={pack:{depth:20,confidence:"low"},recent_snow:{inches:8}};
  const s=snow.scoreDestination(d,"any",{hours:72,max_temperature_f:25,above_freezing_hours:0,warm_40f_hours:0,rain_signal_hours:0,snow_signal_hours:5});
  assert.equal(s.score,75);
  assert.equal(s.confidence,"low");
});

test("warm rain sharply reduces survival component",()=>{
  const d={pack:{depth:16,confidence:"high"},recent_snow:{inches:6}};
  const cold=snow.scoreDestination(d,"any",{hours:72,max_temperature_f:28,above_freezing_hours:0,warm_40f_hours:0,rain_signal_hours:0,snow_signal_hours:5});
  const thaw=snow.scoreDestination(d,"any",{hours:72,max_temperature_f:45,above_freezing_hours:30,warm_40f_hours:15,rain_signal_hours:5,snow_signal_hours:0});
  assert.ok(cold.score>thaw.score);
  assert.equal(thaw.survival.risk,"high");
});

test("activity changes the value of the same snow evidence",()=>{
  const d={pack:{depth:5,confidence:"high"},recent_snow:{inches:5}};
  const photo=snow.scoreDestination(d,"photo",{hours:48,max_temperature_f:30,above_freezing_hours:0,warm_40f_hours:0,rain_signal_hours:0,snow_signal_hours:2});
  const shoe=snow.scoreDestination(d,"snowshoe",{hours:48,max_temperature_f:30,above_freezing_hours:0,warm_40f_hours:0,rain_signal_hours:0,snow_signal_hours:2});
  assert.notEqual(photo.score,shoe.score);
});

test("forecast summary uses the selected trip horizon",()=>{
  const periods=Array.from({length:100},(_,i)=>({startTime:new Date(Date.UTC(2026,0,1,i)).toISOString(),temperature:i<60?28:42,temperatureUnit:"F",shortForecast:i<60?"Snow Showers":"Rain Showers",probabilityOfPrecipitation:{value:60}}));
  const f=snow.forecastSummary(periods,72,"2026-01-01T00:00:00Z");
  assert.equal(f.hours,72);
  assert.equal(f.warm_40f_hours,12);
  assert.equal(f.snow_signal_hours,60);
  assert.equal(f.rain_signal_hours,12);
});

test("Michigan candidate set covers the major lake-effect trip regions",()=>{
  const ids=new Set(snow.DESTINATIONS.map(x=>x.id));
  for(const id of ["gaylord","grayling","munising","negaunee","houghton","calumet","ironwood"]) assert.ok(ids.has(id));
});
