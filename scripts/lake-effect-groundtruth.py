#!/usr/bin/env python3
"""2024-25/2025-26 independent station and NOAA historical snow verification.

Uses original frozen issued-NWS NDFD point-grid forecast fixture as forecast input.
IEM NWS COOP daily observations are NOT interpolated to precise forecast hours.
NOHRSC 24h analyses are separately identified, never substituted for station truth.
"""
import csv,datetime as dt,hashlib,io,json,math,pathlib,sys,urllib.request
from functools import lru_cache
from eccodes import codes_new_from_message,codes_grib_find_nearest,codes_get,codes_release
ROOT=pathlib.Path(__file__).resolve().parents[1]
INPUT=ROOT/"tmp/lake-effect-nws-ndfd-history.json"
OUT=ROOT/"tmp/lake-effect-station-groundtruth.json"
UA={"User-Agent":"GreatLakesHistoricalSnowValidation/1.0 (https://chrisizworski.com/lake-effect-snow/)"}
PLACES={"ny-buffalo":(42.79,-78.84,"NY"),"ny-oswego":(43.45,-76.51,"NY"),"oh-cleveland":(41.52,-81.55,"OH"),"pa-erie":(42.13,-80.09,"PA"),"mi-marquette":(46.54,-87.40,"MI"),"mi-gaylord":(45.03,-84.67,"MI"),"wi-milwaukee":(43.04,-87.91,"WI")}
KM_LIMIT=65
WIND_SECTORS={"ny-buffalo":(220,290),"ny-oswego":(245,335),"oh-cleveland":(235,320),"pa-erie":(230,335),"mi-marquette":(300,45),"mi-gaylord":(250,320),"wi-milwaukee":(25,135)}
def aligned(region,bearing):
 try:a=float(bearing)%360
 except (TypeError,ValueError):return False
 lower,upper=WIND_SECTORS[region]
 return lower<=a<=upper if lower<=upper else a>=lower or a<=upper
def request(url,timeout=35):
 with urllib.request.urlopen(urllib.request.Request(url,headers=UA),timeout=timeout) as res:return res.read()
def km(a,b,c,d):
 r=math.pi/180
 x=math.sin((c-a)*r/2)**2+math.cos(a*r)*math.cos(c*r)*math.sin((d-b)*r/2)**2
 return 12742*math.asin(min(1,math.sqrt(x)))
@lru_cache(maxsize=8)
def network(state):
 url=f"https://mesonet.agron.iastate.edu/geojson/network/{state}_COOP.geojson"
 raw=request(url);data=json.loads(raw)
 rows={}
 for f in data.get("features",[]):
  co=f.get("geometry",{}).get("coordinates",[])
  if len(co)<2:continue
  if not (-130<float(co[0])<-65 and 20<float(co[1])<55):continue
  rows[f.get("id")]={"station":f.get("id"),"lat":co[1],"lon":co[0],"name":f.get("properties",{}).get("sname") or f.get("id"),"network":state+"_COOP"}
 return rows
@lru_cache(maxsize=60)
def daily(state,day):
 # IEM reports are COOP daily local-day accumulations, NOT hourly storm totals.
 d=dt.date.fromisoformat(day);url=("https://mesonet.agron.iastate.edu/cgi-bin/request/daily.py?network="+state+
   "_COOP&year1="+str(d.year)+"&month1="+str(d.month)+"&day1="+str(d.day)+
   "&year2="+str(d.year)+"&month2="+str(d.month)+"&day2="+str(d.day)+"&na=blank&format=csv")
 raw=request(url).decode("utf-8-sig")
 table=list(csv.DictReader(io.StringIO(raw)))
 if not table or not {"station","day","snow_in"}.issubset(set(table[0])):raise ValueError("No full station COOP snowfall columns")
 return {"url":url,"sha256":hashlib.sha256(raw.encode()).hexdigest(),"rows":table}
@lru_cache(maxsize=60)
def nohrsc(day):
 stamp=day.replace("-","");url=f"https://www.nohrsc.noaa.gov/snowfall_v2/data/{stamp[:6]}/sfav2_CONUS_24h_{stamp}12_grid184.grb2"
 try:
  blob=request(url,timeout=45)
  pos=blob.find(b"GRIB")
  if pos<0:raise ValueError("Not a GRIB archive")
  size=int.from_bytes(blob[pos+8:pos+16],"big")
  if size<100 or pos+size>len(blob):raise ValueError("Incomplete NOHRSC file")
  raw=blob[pos:pos+size];h=codes_new_from_message(raw)
  try:
   unit=str(codes_get(h,"units"));samples={}
   for id,(lat,lon,state) in PLACES.items():
    n=codes_grib_find_nearest(h,lat,lon)[0]
    if n["distance"]>20:continue
    vals=[{"km_from_site":round(float(n["distance"]),2),"raw_value":float(n["value"])}]
    for da,db in [(0,.20),(.2,0),(-.2,0),(0,-.20)]:
     spot=codes_grib_find_nearest(h,lat+da,lon+db)[0]
     if spot["distance"]<20:vals.append({"km_from_site":round(float(spot["distance"]),2),"raw_value":float(spot["value"])})
    samples[id]=vals
  finally:codes_release(h)
  return {"status":"available","source":url,"sha256":hashlib.sha256(blob).hexdigest(),"analysis_valid_at":day+"T12:00:00Z","units":unit,"sampled_values":samples,"caution":"NOHRSC is a gridded, observation-informed ANALYSIS, not independent station truth. Nearest samples do not identify exact band positions."}
 except Exception as e:return {"status":"unavailable","source":url,"reason":str(e)[:140]}
def gauge(state,at,day):
 metadata=network(state)
 dataset=daily(state,day)
 observed=[]
 for r in dataset["rows"]:
  s=metadata.get(r["station"])
  if s is None:continue
  dist=km(at[0],at[1],s["lat"],s["lon"])
  if dist>KM_LIMIT:continue
  raw=r.get("snow_in","").strip()
  # IEM uses 0.0001 inches for trace; no observation is NOT 0.
  try:value=float(raw)
  except (TypeError,ValueError):continue
  if not (0<=value<=120):continue
  observed.append({"station":s["station"],"name":s["name"],"lat":s["lat"],"lon":s["lon"],"km":round(dist,1),
     "snow_in":max(value,0),"reported_day":day,"source":dataset["url"]})
 observed.sort(key=lambda x:(x["km"],x["station"]))
 return {"station_observations":observed,"source":dataset["url"],"source_sha256":dataset["sha256"]}
def snow_forecast(c,begin,end):
 start=dt.datetime.fromisoformat(begin.replace("Z","+00:00"));stop=dt.datetime.fromisoformat(end.replace("Z","+00:00"))
 vals=[p for p in c.get("periods",[]) if start<=dt.datetime.fromisoformat(p["startTime"].replace("Z","+00:00"))<stop]
 return {"valid_hours":len(vals),"forecast_snow_hours":sum(bool(p.get("nws_categorical_snow")) for p in vals),
         "wind_aligned_hours":sum(bool(p.get("nws_categorical_snow")) and aligned(c["region_id"],p.get("windDirection")) for p in vals),
         "forecast_signal":sum(bool(p.get("nws_categorical_snow")) for p in vals)>=2}
def main():
 root=json.loads(INPUT.read_text())
 if root.get("schema")!="nws-ndfd-historical-point-replay-v1" or len(root["cases"])<14:
  raise ValueError("Authentic original NWS NDFD replay fixture missing")
 results=[]
 for c in root["cases"]:
  site=c["region_id"];lat,lon,state=PLACES[site]
  issued=dt.datetime.fromisoformat(c["issued_cycle_utc"].replace("Z","+00:00"))
  eventday=dt.date.fromisoformat(c["issue_day"])
  # COOP observation date is a local DAILY report; it is not issue+24h exact.
  windows=[]
  for lead in (1,2,3):
   day=(eventday+dt.timedelta(days=lead)).isoformat()
   data=gauge(state,(lat,lon),day)
   stations=data["station_observations"]
   positive=[x for x in stations if x["snow_in"]>=1.0]
   situation="reported_snow_nearby" if positive else "reporting_stations_no_1in_snow" if len(stations)>=3 else "insufficient_station_coverage"
   # Spatially meaningful radii from source reports. A positive at 60 km is
   # evidence of a regional storm, NOT measured snow at the selected checkpoint.
   radii={str(d)+"km":sum(x["km"]<=d for x in positive) for d in (15,30,65)}
   beg=(issued+dt.timedelta(hours=(lead-1)*24)).isoformat().replace("+00:00","Z")
   end=(issued+dt.timedelta(hours=lead*24)).isoformat().replace("+00:00","Z")
   forecast=snow_forecast(c,beg,end)
   windows.append({"relative_day":lead,"local_observation_day":day,**forecast,
     "evidence_status":situation,"station_count":len(stations),"positive_report_count":len(positive),
     "positive_by_radius":radii,
     "closest_positive_km":min((x["km"] for x in positive),default=None),
     "gauge_reports":stations[:50],"provenance":{"station":data["source"],"sha256":data["source_sha256"]},
     "nohrsc_24h":nohrsc(day),
     "alignment_caution":"Local-day station interval is not identical to UTC issuance-relative 24h. This is only a DAY-SCALE spatial diagnostic."})
  results.append({"region_id":site,"issue_day":c["issue_day"],"issued_cycle_utc":c["issued_cycle_utc"],
    "original_nws_source_keys":c["source_keys"],"forecast_provenance":c["forecast_provenance"],
    "daily_windows":windows})
 out={"schema":"lake-effect-independent-station-evidence-v1","source":"Iowa Environmental Mesonet raw NWS COOP daily snowfall reports (station points); NOAA NOHRSC 24h gridded analysis separately",
   "distance_km":KM_LIMIT,
   "boundary":"Evidence of reported regional snow, not proof of exact snowfall at point or hour. Missing station/trace/null is unknown, not no snow. NOHRSC is gridded analysis not independent observations.",
   "events":results}
 OUT.parent.mkdir(exist_ok=True,parents=True);OUT.write_text(json.dumps(out,indent=2)+"\n")
 print("STATION_GROUND_TRUTH_SUMMARY_START")
 print(json.dumps({"cases":len(results),"by_site_day":[{"site":c["region_id"],"issued":c["issue_day"],
 "days":[{"day":w["relative_day"],"stations":w["station_count"],"positives":w["positive_report_count"],
  "closest_positive_km":w["closest_positive_km"],"nohrsc":w["nohrsc_24h"]["status"]} for w in c["daily_windows"]]} for c in results]},indent=2))
 print("STATION_GROUND_TRUTH_SUMMARY_END")
if __name__=="__main__":main()
