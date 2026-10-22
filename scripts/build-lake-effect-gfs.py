#!/usr/bin/env python3
"""Download NOAA GFS GRIB2 850/925-mb model snapshots for five lakes.

Runs in GitHub Actions, never during a website request. Valid-time checks and
no partial or fabricated forecast publication. Uses the supported NOMADS filter.
"""
import argparse
import datetime as dt
import json
import math
import pathlib
import tempfile
import time
import urllib.parse
import urllib.request
from eccodes import codes_get, codes_grib_find_nearest, codes_grib_new_from_file, codes_release

UTC = dt.timezone.utc
LAKES = {"Superior": (47.4, -87.2), "Michigan": (44.0, -86.0),
         "Huron": (45.0, -82.5), "Erie": (42.1, -81.4), "Ontario": (43.6, -77.5)}
HOURS = (0, 6, 12, 18, 24, 36, 48, 60, 72)
FIELDS = {"t850", "u850", "v850", "u925", "v925"}

def timestamp(t):
    return t.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")

def model_url(cycle, fh):
    params = {"file": "gfs.t%02dz.pgrb2.0p25.f%03d" % (cycle.hour, fh),
      "lev_850_mb": "on", "lev_925_mb": "on",
      "var_TMP": "on", "var_UGRD": "on", "var_VGRD": "on", "subregion": "",
      "leftlon": "267", "rightlon": "286", "toplat": "49", "bottomlat": "40",
      "dir": "/gfs.%s/%02d/atmos" % (cycle.strftime("%Y%m%d"), cycle.hour)}
    return "https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl?" + urllib.parse.urlencode(params)

def fetch_grib(url):
    req = urllib.request.Request(url, headers={"User-Agent": "ChrisIzworskiLakeEffect/2.0 (+https://chrisizworski.com/lake-effect-snow/)"})
    with urllib.request.urlopen(req, timeout=40) as response:
        binary = response.read(5 * 1024 * 1024 + 1)
    if len(binary) > 5 * 1024 * 1024 or not binary.startswith(b"GRIB"):
        raise ValueError("NOMADS missing/bad GRIB2, no publish")
    return binary

def wind_from(u,v):
    return round((math.degrees(math.atan2(-u,-v))+360)%360,1)

def sample(binary, cycle, fh):
    valid=cycle+dt.timedelta(hours=fh)
    values={lake:{} for lake in LAKES}
    with tempfile.TemporaryFile() as fp:
        fp.write(binary);fp.seek(0)
        while (message := codes_grib_new_from_file(fp)) is not None:
            try:
                if codes_get(message, "typeOfLevel") != "isobaricInhPa":
                    continue
                field=str(codes_get(message,"shortName"))+str(int(codes_get(message,"level")))
                if field not in FIELDS:
                    continue
                if (str(codes_get(message,"validityDate"))!=valid.strftime("%Y%m%d")
                   or int(codes_get(message,"validityTime"))//100!=valid.hour):
                    raise ValueError("GRIB valid time does not match cycle and forecast hour")
                for lake,(lat,lon) in LAKES.items():
                    plat,plon,val,distance,index=codes_grib_find_nearest(message,lat,lon%360,npoints=1)[0]
                    if distance>45 or not math.isfinite(val):
                        raise ValueError("GFS offshore point too distant/missing for "+lake)
                    values[lake][field]=float(val)
            finally:
                codes_release(message)
    if any(set(record)!=FIELDS for record in values.values()):
        raise ValueError("Missing 850/925 mb pressure level fields")
    lakes={}
    for name,v in values.items():
        t=v["t850"]-273.15
        u850,v850,u925,v925=(v[k] for k in ("u850","v850","u925","v925"))
        if not -90<t<45 or max(map(abs,(u850,v850,u925,v925)))>100:
            raise ValueError("Unphysical pressure level values")
        d850,d925=wind_from(u850,v850),wind_from(u925,v925)
        lakes[name]={"temp_850_c":round(t,1),
           "wind_850_from_deg":d850,"wind_850_mps":round(math.hypot(u850,v850),1),
           "wind_925_from_deg":d925,"wind_925_mps":round(math.hypot(u925,v925),1),
           "directional_shear_925_850_deg":round(abs((d925-d850+180)%360-180),1),
           "sample_lat":LAKES[name][0],"sample_lon":LAKES[name][1]}
    return {"valid_at":timestamp(valid),"lakes":lakes}

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--probe",action="store_true")
    parser.add_argument("--output",default="out/upper-air.json")
    args=parser.parse_args()
    now=dt.datetime.now(UTC)
    cycle=(now-dt.timedelta(hours=5)).replace(minute=0,second=0,microsecond=0)
    cycle=cycle.replace(hour=(cycle.hour//6)*6)
    first=None
    for choice in (cycle,cycle-dt.timedelta(hours=6)):
        try:
            first=sample(fetch_grib(model_url(choice,6)),choice,6)
            cycle=choice;break
        except Exception as exc:
            print("Cycle unavailable: "+timestamp(choice)+" "+str(exc)[:180],flush=True)
            time.sleep(10)
    if first is None:raise RuntimeError("No verified NOAA model cycle")
    if args.probe:
        print(json.dumps({"cycle":timestamp(cycle),"hour_6":first},indent=2));return
    snapshots={6:first}
    for fh in HOURS:
        if fh==6:continue
        time.sleep(10) # NOAA requests 10-second spacing to avoid rate limits
        snapshots[fh]=sample(fetch_grib(model_url(cycle,fh)),cycle,fh)
        print("Decoded f%03d"%fh,flush=True)
    payload={"schema":"lake-effect-upper-air-v1","model":"NCEP GFS 0.25 degree",
      "issued_at":timestamp(cycle),"generated_at":timestamp(dt.datetime.now(UTC)),
      "source":"https://nomads.ncep.noaa.gov/","reference_scope":"offshore model grid points",
      "samples":[snapshots[fh] for fh in HOURS]}
    target=pathlib.Path(args.output)
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_text(json.dumps(payload,separators=(",",":"))+"\n")
    print("Saved",target,target.stat().st_size,flush=True)

if __name__=="__main__":main()
