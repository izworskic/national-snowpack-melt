# Michigan Snow on the Ground — Phase 1 Evidence Research

Status: research branch only. Does not alter the live Michigan Snow Depth ranking. Updated October 21, 2026.

## Product question
Where in Michigan does snow cover exist, how deep is it, and will it be worth driving to this weekend? Keep three distinct products separate:
1. NOHRSC/National Snow Analyses: modeled 1-km snow depth and SWE, incorporating observations.
2. USNIC IMS: analyzed snow COVER at 1 km, not a depth estimate.
3. RCC ACIS: timestamped ground observations, including CoCoRaHS stations where indexed.

## Confirmed primary providers
- NOAA NOHRSC MapServer: https://mapservices.weather.noaa.gov/raster/rest/services/snow/NOHRSC_Snow_Analysis/MapServer
- USNIC IMS ImageServer: https://mapservices.weather.noaa.gov/raster/rest/services/obs/usnic_ims_snow_ice_1km/ImageServer
- NSIDC IMS guide (class legend): https://nsidc.org/sites/default/files/g02156-v001-userguide_1_1.pdf
- ACIS Web Services: https://docs.rcc-acis.org/acisws/
- NWS API: https://www.weather.gov/documentation/services-web-api
- NOHRSC dated archive: https://www.nohrsc.noaa.gov/archived_data/

NOHRSC's live MapServer is NOT time enabled. Its latest map cannot establish an archived time series. IMS's ImageServer is likewise NOT time enabled. NSIDC identifies IMS code 0 as outside, 1 open water, 2 snow-free land, 3 sea/lake ice, 4 snow-covered land. The IMS image service documentation says it updates daily, but a per-request valid timestamp was NOT verified; the research endpoint deliberately reports analysisValidAt=null.

RCC ACIS MultiStnData returns daily element snwd = snow depth (inches) and snow = snowfall (inches). Missing is M and trace is T; only dated numeric SNWD is a measured depth. ACIS station metadata has codes for CoCoRaHS and GHCN, but the presence of a code is not proof that every observation stream is available or current.

## What was added
- lib/michigan-snow-ground-evidence.js: conservative IMS class and ACIS observation adapters, separate from existing raster-depth calculations.
- api/michigan-snow-ground-evidence.js: research-only, bounded, rounded location sampling, cached for one hour; missing/failed sources remain missing, not zero. The endpoint never makes a trip recommendation.
- tests/michigan-snow-ground-evidence.test.js: missing/trace/zero, stale data, cover-vs-depth and disagreement regression tests.
- scripts/audit-noaa-snow-units.cjs: opt-in raw NOAA MapServer field/unit inspection for five Michigan points.

## Critical unit hold
Existing lib/nohrsc-snodas.js interprets a field named Pixel Value as inches; other code in the website treats Service Pixel Value as meters and converts. The NOHRSC product supports 1-km modeled depth, but the observed REST identify attribute's numeric unit has not been verified against the live service in this session. Do not alter production scores by guessing. Run the manual audit during winter, preserve example JSON fixtures and NOAA metadata, cross-check a set of measured CoCoRaHS or NWS stations with known depths, then normalize depth AND SWE with explicit unit assumptions and fail-closed tests. Do not present pseudo-precision from a single pixel or unverified time.

## Production readiness gates
1. Live access and response-shape tests for NOAA IMS identify and ACIS bbox MultiStnData (could not validate live payloads in this research run).
2. Capture source validity time separately from retrieval time. Until proven, IMS classifications are not decision-grade for 'today.'
3. Prove NOAA depth/SWE units and quality flags with 10+ snow-covered and zero-snow location/day comparisons.
4. Verify ACIS station freshness, duplicate station aliases, flagged accumulated values and CoCoRaHS network coverage.
5. Add age-aware historical snapshots or archive ingestion rather than treating latest MapServer as historical.
6. Bound sampling queries and CDN cache. Avoid serverless per-user statewide scraping. Use no Redis/Upstash.
7. Use permissioned road/land-access destinations; investigate production-grade routing rather than relying on the public OSRM demo.
8. Build backtest of 50-100 independently dated Michigan location-days across first snow, lake effect, midwinter, thaw and spring retreat.
9. Measure false positive recommendations, absolute depth error, coverage class agreement, median latency, source-freshness gaps and accessible destinations.
10. Only after thresholds are met, integrate an explorable CARTO map and activity-specific rankings into the existing canonical /michigan-snow-depth/ URL.

## Honest operational language
- 'NOAA analyzed snow-covered land' does not equal 'measured 4 inches.'
- 'Station measured 4 inches yesterday' does not establish the whole surrounding area has 4 inches.
- 'Source unavailable' does not mean bare ground.
- 'Fetched just now' does not imply the raster's analysis was updated just now.
- Road snapping to an arbitrary point is not proof of legal access or parking.
- Keep this research endpoint out of the existing destination-ranking pipeline until unit and timestamp gates pass.

## Cost and rollout
One feature-branch commit; no merge or production release in this phase. Audit is manual and does not run on each GitHub merge or Vercel build. Hosted Open-Meteo free-tier conditions do not permit advertising sites, so this phase adds no dependency on that hosted API. In future, consider archived NOAA snow-depth snapshots via low-frequency batch processing, an appropriate routing provider, and a single shared snow data service for other winter tools.
