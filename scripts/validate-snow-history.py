#!/usr/bin/env python3
"""Historical (non-production) SNODAS modeled snow depth versus dated ACIS observations.

Uses a single day, one 18.5 MB official masked NOAA/NSIDC archive and one
ACIS state-wide station query. Standard library only; no paid API, no key,
no cron. Outputs summary diagnostics and actual station-to-pixel pairs.
The 06 UTC analysis and later daily station reports are NOT identical times.
"""
import argparse, datetime, gzip, io, json, statistics, sys, tarfile, urllib.request, urllib.parse

CELL=0.008333333333333333
UL_LON=-124.729583333333
UL_LAT=52.870416666667
COLS=6935
ROWS=3351
NO_DATA={-9999,-999,-9998}
BBOX='-90.45,41.65,-82.30,47.75'

def fetch(url,timeout=40,limit=35_000_000):
    req=urllib.request.Request(url,headers={
      'User-Agent':'ChrisIzworskiSnowValidation/1.0 (+https://chrisizworski.com/michigan-snow-depth/)',
      'Accept':'*/*'})
    with urllib.request.urlopen(req,timeout=timeout) as resp:
        body=resp.read(limit+1)
    if len(body)>limit: raise ValueError('Source exceeded bounded download limit')
    return body

def sample(raw,lat,lon):
    # NOAA masked SNODAS rasters are registered to pixel centers.
    col=round((lon-UL_LON)/CELL); row=round((UL_LAT-lat)/CELL)
    if col<0 or col>=COLS or row<0 or row>=ROWS: return None
    offset=2*(row*COLS+col)
    native=int.from_bytes(raw[offset:offset+2],'big',signed=True)
    if native in NO_DATA or native<0: return None
    # SNODAS SNOD product native integer is millimeters; convert mm to in.
    return round(native/25.4,2)

def stations(day):
    payload={'bbox':BBOX,'date':day,'elems':['snwd'],
             'meta':['name','ll','sids','uid','state'],'output':'json'}
    url='https://data.rcc-acis.org/MultiStnData?params='+urllib.parse.quote(json.dumps(payload,separators=(',',':')))
    data=json.loads(fetch(url,timeout=35,limit=10_000_000))
    result=[]
    for station in data.get('data',[]):
        meta=station.get('meta',{}); coord=meta.get('ll') or []
        if str(meta.get('state','')).upper()!='MI':continue
        values=station.get('data') or []
        if len(coord)!=2 or not values:continue
        # A one-day request is ["SNWD"], unlike date-range [["SNWD"],...].
        if isinstance(values[0],list): values=values[0]
        val=str(values[0]).strip()
        try: observed=float(val)
        except ValueError:continue
        if not 0<=observed<=120:continue
        result.append({'id':str(meta.get('uid') or ''),'station':meta.get('name') or '',
                       'lat':float(coord[1]),'lon':float(coord[0]),
                       'observedIn':observed})
    return result

def validate(day,min_pairs):
    d=datetime.datetime.strptime(day,'%Y-%m-%d')
    ymd=d.strftime('%Y%m%d')
    month=d.strftime('%m_%b')
    url=f'https://noaadata.apps.nsidc.org/NOAA/G02158/masked/{d.year}/{month}/SNODAS_{ymd}.tar'
    tar_data=fetch(url,timeout=75,limit=35_000_000)
    with tarfile.open(fileobj=io.BytesIO(tar_data)) as tar:
        files=[m for m in tar.getmembers() if 'ssmv11036tS' in m.name and
               m.name.endswith('.dat.gz') and m.isfile()]
        if len(files)!=1:raise ValueError('Expected exactly one depth .dat.gz: '+str([m.name for m in files]))
        with tar.extractfile(files[0]) as fp:
            raw=gzip.decompress(fp.read())
    if len(raw)!=2*COLS*ROWS:raise ValueError(f'Depth grid bytes mismatch: {len(raw)}')
    observations=stations(day)
    paired=[]; bare=[]; seen=set()
    for s in observations:
        key=(round(s['lat'],3),round(s['lon'],3))
        if key in seen:continue
        seen.add(key)
        model=sample(raw,s['lat'],s['lon'])
        if model is None:continue
        if s['observedIn']==0:
            bare.append({'station':s['station'],'modeledIn':model})
            continue
        s['modeledIn']=model;s['absErrorIn']=round(abs(model-s['observedIn']),2)
        paired.append(s)
    if len(paired)<min_pairs:raise ValueError(f'Only {len(paired)} valid nonzero depth pairs (minimum {min_pairs})')
    errs=[r['absErrorIn'] for r in paired]
    print(json.dumps({'model':'NOAA SNODAS G02158 archived masked 1km snow depth',
      'archiveDate':day,'archiveUrl':url,'analysisValidTime':'~06:00 UTC nominal',
      'measuredStationDate':day,'pairCount':len(paired),
      'meanAbsoluteErrorIn':round(statistics.mean(errs),2),
      'p90AbsoluteErrorIn':round(sorted(errs)[int((len(errs)-1)*0.90)],2),
      'zeroSnowPairs':len(bare),
      'model3InOrMoreWhenStationZero':sum(b['modeledIn']>=3 for b in bare),
      'medianAbsoluteErrorIn':round(statistics.median(errs),2),
      'percentWithin3In':round(100*sum(x<=3 for x in errs)/len(errs),1),
      'regionalAndTimestampCaveat':'MI-only dates, 1-km analysis near stations. Station daily observation time may differ from 06UTC; NOAA assimilates some station data. Agreement is NOT independent predictive validation.',
      'examples':sorted(paired,key=lambda p:p['absErrorIn'])[:8],
      'largestDifferences':sorted(paired,key=lambda p:p['absErrorIn'],reverse=True)[:8]
      },indent=2))
    return 0

def main():
    arg=argparse.ArgumentParser()
    arg.add_argument('--date',default='2026-01-15')
    arg.add_argument('--min-pairs',type=int,default=10)
    args=arg.parse_args()
    if args.min_pairs<1:raise ValueError('min-pairs must be positive')
    return validate(args.date,args.min_pairs)

if __name__=='__main__':
    try:sys.exit(main())
    except Exception as e:
        print('HISTORICAL_VALIDATION_FAILED:',str(e),file=sys.stderr)
        sys.exit(1)
