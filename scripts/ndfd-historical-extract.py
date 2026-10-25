#!/usr/bin/env python3
"""Rebuild dated NWS NDFD hourly weather+wind forecasts for genuine historic replay.

NOAA's WMO NDFD archives preserve issued GRIB2. The point-api /forecast/hourly
JSON does not: this is a reconstructed official NDFD-grid input, NOT byte-identical
NWS API replay. Never substitute ERA5/reanalysis into forecast periods.
"""
import datetime as dt
import hashlib
import json
import os
import pathlib
import re
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from functools import lru_cache
from eccodes import codes_new_from_message,codes_grib_find_nearest,codes_get,codes_get_elements,codes_release
from ndfd_weather import messages,weather_keys,key_at_index,categories

ROOT=pathlib.Path(__file__).resolve().parents[1]
BUCKET="https://noaa-ndfd-pds.s3.amazonaws.com/"
HEADERS={"User-Agent":"lake-effect-historical-verification/1.0"}
REGIONS={
 "ny-buffalo":(42.79,-78.84),"ny-oswego":(43.45,-76.51),
 "oh-cleveland":(41.52,-81.55),"pa-erie":(42.13,-80.09),
 "mi-marquette":(46.54,-87.40),"mi-gaylord":(45.03,-84.67),
 "wi-milwaukee":(43.04,-87.91)}
EVENTS=[
 ("2025-11-26",("ny-buffalo","ny-oswego")),
 ("2025-11-27",("ny-buffalo","ny-oswego")),
 ("2024-12-31",("oh-cleveland","pa-erie")),
 ("2025-01-01",("oh-cleveland","pa-erie")),
 ("2025-11-28",("mi-marquette",)),
 ("2025-11-29",("mi-marquette",)),
 ("2025-12-27",("mi-gaylord",)),
 ("2025-12-28",("mi-gaylord",)),
 ("2025-11-08",("wi-milwaukee",)),
 ("2025-11-09",("wi-milwaukee",))]
CODES={"wx":"YJUZ88","wdir":"YBUZ88","snow":"YSUZ88"}
TIMEOUT=35

def load_url(url):
 req=urllib.request.Request(url,headers=HEADERS)
 with urllib.request.urlopen(req,timeout=TIMEOUT) as r:return r.read()

@lru_cache(maxsize=40)
def select_archive(field,date):
 day=date.replace("-","/")
 prefix=f"wmo/{field}/{day}/"
 url=BUCKET+"?"+urllib.parse.urlencode({"list-type":"2","prefix":prefix,"max-keys":1000})
 root=ET.fromstring(load_url(url))
 ns={"s":"http://s3.amazonaws.com/doc/2006-03-01/"}
 if root.findtext("s:IsTruncated",namespaces=ns)=="true":
  raise RuntimeError("S3 listing truncated: cannot guarantee original issue selection")
 results=[]
 for v in root.findall("s:Contents",ns):
  key=v.findtext("s:Key",namespaces=ns)
  if key and key.rsplit("/",1)[-1].startswith(CODES[field]+"_"):
   results.append({"key":key,"etag":v.findtext("s:ETag",namespaces=ns),"bytes":int(v.findtext("s:Size",namespaces=ns) or 0),"modified":v.findtext("s:LastModified",namespaces=ns)})
 if not results:raise RuntimeError(f"No original NDFD archive {field} {date}")
 return sorted(results,key=lambda x:x["key"])[0]

def extract(field,date,sites):
 entry=select_archive(field,date)
 # This is the original NOAA-published blob. Freeze its identity and hash.
 if entry["bytes"]>12000000:raise RuntimeError("Unexpectedly huge CONUS GRIB file")
 blob=load_url(BUCKET+urllib.parse.quote(entry["key"],safe="/"))
 if len(blob)!=entry["bytes"]:raise RuntimeError("GRIB transfer size mismatch")
 entry={**entry,"sha256":hashlib.sha256(blob).hexdigest(),"field":field}
 values={}
 original_ref=None
 indices={}
 weather_sample=None
 for message in messages(blob):
  h=codes_new_from_message(message)
  try:
   reference=str(codes_get(h,"dataDate"))+str(int(codes_get(h,"dataTime"))).zfill(4)
   if original_ref is None:original_ref=reference
   elif reference!=original_ref:raise RuntimeError("Archive mixes forecast reference cycles")
   valid=str(codes_get(h,"validityDate"))+str(int(codes_get(h,"validityTime"))).zfill(4)
   at=dt.datetime.strptime(valid,"%Y%m%d%H%M").replace(tzinfo=dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
   if field=="wx":
    table=weather_keys(message)
    weather_sample=weather_sample or table[:2]
   for site in sites:
    if site not in indices:
     lat,lon=REGIONS[site]
     near=codes_grib_find_nearest(h,lat,lon)[0]
     if near["distance"]>15:raise RuntimeError("Wrong NDFD geographic grid for "+site)
     indices[site]=near["index"]
    try:num=float(codes_get_elements(h,"values",[indices[site]])[0])
    except Exception:
     lat,lon=REGIONS[site]
     num=float(codes_grib_find_nearest(h,lat,lon)[0]["value"])
    if num>=9999 or num<=-9999:out=None
    elif field=="wx":
     key=key_at_index(table,num)
     if key is None:raise RuntimeError("Missing NDFD weather key for index "+str(num))
     sn,bl,text=categories(key)
     out={"shortForecast":text,"snow":sn,"blowing_only":bl,"nws_wx_key":key}
    elif field=="wdir":
     out=int(num) if 0<=num<=360 else None
    else:out=num if 0<=num<=10 else None # meters of snow in a forecast accumulation
    values.setdefault(site,{})[at]=out
  finally:codes_release(h)
 if not original_ref:raise RuntimeError("GRIB had no forecast messages")
 entry["reference_cycle_utc"]=dt.datetime.strptime(original_ref,"%Y%m%d%H%M").replace(tzinfo=dt.timezone.utc).isoformat().replace("+00:00","Z")
 entry["weather_key_example"]=weather_sample
 entry["site_coverage"]={site:len(values.get(site,{})) for site in sites}
 return entry,values

def main():
 cases=[]
 source_manifest=[]
 for day,sites in EVENTS:
  products={}
  for field in ("wx","wdir","snow"):
   src,rows=extract(field,day,sites)
   source_manifest.append(src)
   products[field]=rows
  for site in sites:
   issued=products["wx"][site]
   wind=products["wdir"][site]
   snowfall=products["snow"][site]
   weather_times=sorted(issued)
   periods=[]
   # NDFD Wx grids may be 3-hourly while issued wind-direction grids are hourly.
   # For each genuine wind valid-hour, select the closest already-issued Wx
   # grid valid time within 90 minutes. This is TEMPORAL RESAMPLING, not raw
   # /forecast/hourly JSON; preserve original Wx valid hour for audit.
   for at in sorted(wind):
    if wind[at] is None:continue
    closest=min(weather_times,key=lambda w:abs((dt.datetime.fromisoformat(w.replace("Z","+00:00"))-dt.datetime.fromisoformat(at.replace("Z","+00:00"))).total_seconds()))
    delta=abs((dt.datetime.fromisoformat(closest.replace("Z","+00:00"))-dt.datetime.fromisoformat(at.replace("Z","+00:00"))).total_seconds())
    if delta>5400:continue
    wx=issued[closest]
    if not isinstance(wx,dict):continue
    periods.append({"startTime":at,"windDirection":str(wind[at]),"shortForecast":wx["shortForecast"],
      "temperature":None,"forecast_nws_wx_key":wx["nws_wx_key"],"nws_categorical_snow":wx["snow"],
      "original_nws_wx_valid_at":closest,"resampled_weather":closest!=at})
   if len(periods)<12:raise RuntimeError(f"Missing reconstructed hourly forecast for {site} at {day}")
   fixture=json.loads((ROOT/"tests"/"fixtures"/"lake-effect-history"/({
    "ny-buffalo":"buf-2025-11","ny-oswego":"oswego-2025-11",
    "oh-cleveland":"cle-2025-01","pa-erie":"erie-2025-01",
    "mi-marquette":"marquette-2025-11","mi-gaylord":"gaylord-2025-12",
    "wi-milwaukee":"milwaukee-2025-11"}[site]+".json")).read_text())
   reference={r[0]+":00Z":r[7] for r in fixture["rows"]}
   snow_periods=[{"endTime":at,"accumulation_m":v} for at,v in snowfall.items() if v is not None]
   archive_time=dt.datetime.strptime(day,"%Y-%m-%d").replace(tzinfo=dt.timezone.utc)
   forecast_updated=next(x["modified"] for x in reversed(source_manifest[-3:]) if x["field"]=="wx")
   cases.append({
    "region_id":site,"issue_day":day,
    "forecast_provenance":"NWS_NDFD_WMO_GRIB2_5KM_RECONSTRUCTED_NOT_NWS_POINT_API_JSON",
    "issued_cycle_utc":next(x["reference_cycle_utc"] for x in source_manifest[-3:] if x["field"]=="wx"),
    "published_at_utc":forecast_updated,"periods":periods,"snow_amount_periods":snow_periods,
    "reference_era5_cm_by_hour":reference,
    "caveat":"NDFD categorical weather (often three-hourly) and 10-m wind (hourly) are real issued NWS gridded fields; NDFD Wx is nearest-valid-time resampled to wind forecast hours within 90 minutes. This is not original api.weather.gov/forecast/hourly text. Active alerts and historic lake temperatures not replayed.",
    "source_keys":[x["key"] for x in source_manifest[-3:]]
   })
 out={"schema":"nws-ndfd-historical-point-replay-v1",
   "scope":"ARCHIVED_NWS_GRIDDED_WEATHER_AND_WIND",
   "not_equivalent_to":"Original NWS /gridpoints/.../forecast/hourly JSON (not archived)",
   "source_archive":"NOAA public noaa-ndfd-pds S3, wmo parameter WMO messages, first original issuance in UTC day",
   "reference":"ERA5 model analysis from prior frozen 2025 fixture, never used to form forecast",
   "cases":cases,"sources":source_manifest}
 dest=ROOT/"tmp"/"lake-effect-nws-ndfd-history.json"
 dest.parent.mkdir(parents=True,exist_ok=True)
 dest.write_text(json.dumps(out,indent=2)+"\n")
 print("ARCHIVED_NDFD_FETCH_COMPLETE",json.dumps({
    "case_count":len(cases),"actual_issued_files":len(source_manifest),
    "site_hours":[{"id":c["region_id"],"day":c["issue_day"],"hours":len(c["periods"]),"snow_amount_periods":len(c["snow_amount_periods"])} for c in cases],
    "output":str(dest)}))
if __name__=="__main__":main()
