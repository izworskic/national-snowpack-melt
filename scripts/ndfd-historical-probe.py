#!/usr/bin/env python3
"""NOAA NDFD historical GRIB2 field probe; source data must be issued before storm."""
import datetime as dt
import json, os, pathlib, re, sys, tempfile, urllib.parse, urllib.request, xml.etree.ElementTree as ET
from eccodes import codes_grib_new_from_file,codes_get,codes_grib_find_nearest,codes_release,codes_get_array,codes_get_string
BUCKET="https://noaa-ndfd-pds.s3.amazonaws.com/"
PROBE_DATE="2025/11/27"
FIELDS=("wx","snow","wdir","temp")
PLACES={"buffalo":(42.79,-78.84),"oswego":(43.45,-76.51),"marquette":(46.54,-87.40)}
def keys(prefix,limit=1000):
 url=BUCKET+"?"+urllib.parse.urlencode({"list-type":"2","prefix":prefix,"max-keys":limit})
 with urllib.request.urlopen(urllib.request.Request(url,headers={"User-Agent":"snow-history-test/0.1"}),timeout=30) as f: root=ET.fromstring(f.read())
 ns={"s":"http://s3.amazonaws.com/doc/2006-03-01/"}
 out=[]
 for entry in root.findall("s:Contents",ns):
  k=entry.findtext("s:Key",namespaces=ns)
  if k:out.append((k,int(entry.findtext("s:Size",namespaces=ns) or 0)))
 return out
def meta(handle):
 result={}
 for key in ["name","shortName","typeOfLevel","parameterCategory","parameterNumber","dataDate","dataTime","validityDate","validityTime","stepRange","stepType","gridType","numberOfPoints","localUsePresent","productDefinitionTemplateNumber","typeOfStatisticalProcessing","scaleFactorOfFirstFixedSurface"]:
  try:result[key]=str(codes_get(handle,key))
  except Exception as e:result[key]="UNKNOWN "+str(e)[:70]
 for name,(lat,lon) in PLACES.items():
  try:
   near=codes_grib_find_nearest(handle,lat,lon)
   result[name]={"near":near}
  except Exception as e:result[name]={"error":str(e)[:150]}
 return result
def main():
 results={}
 for field in FIELDS:
  prefix=f"wmo/{field}/{PROBE_DATE}/"
  try:
   objects=keys(prefix)
   results[field]={"objects":len(objects),"first":objects[:2]}
   if not objects:continue
   # select first issuance of this day: issued-before-valid event
   key,size=objects[0]
   if size>20_000_000:raise RuntimeError("large grib ignored")
   with tempfile.NamedTemporaryFile(suffix=".grib2") as f:
    with urllib.request.urlopen(BUCKET+urllib.parse.quote(key,safe="/"),timeout=40) as response:
     while True:
      block=response.read(1048576)
      if not block:break
      f.write(block)
    f.flush();f.seek(0)
    gribs=[]
    for i in range(4):
     try:h=codes_grib_new_from_file(f)
     except Exception as e:gribs.append({"readerror":str(e)});break
     if h is None:break
     try:gribs.append(meta(h))
     finally:codes_release(h)
    results[field]["gribs"]=gribs
  except Exception as e:results[field]["error"]=type(e).__name__+": "+str(e)[:300]
 print("NDFD_PROBE_JSON_BEGIN")
 print(json.dumps(results,indent=2,default=str))
 print("NDFD_PROBE_JSON_END")
 if not any(x.get("gribs") for x in results.values()):sys.exit(2)
if __name__=="__main__":main()
