# Great Lakes Lake-Effect Snow Decision Engine — October 21, 2026

## Purpose and ownership
Implementation: izworskic/national-snowpack-melt. Intended canonical public path: https://chrisizworski.com/lake-effect-snow/. Preserve Michigan Snow Finder, Snow Totals, and national snowpack pages as separate decisions; no duplicate snow-depth ranking.

The first release includes 15 representative snowbelt checkpoints in Michigan, Wisconsin, Ohio, Pennsylvania and New York. It is NOT an exact lake-effect snowband forecast or a county-level impact polygon.

## Inputs and interpretation
- NWS API /points -> hourly forecast (time, temperature, surface wind, forecast text, precipitation chance). The point is on land; observed or forecast surface wind there is not upstream 850-mb wind over open lake.
- NWS active point alerts, with explicit lake-effect classification ONLY if the official alert says lake effect. Generic winter warnings are still important hazards, without claiming their origin.
- NOAA GLERL GLSEA daily lakewide surface temperatures from its official rolling 365-day text feed `glsea-temps_1024_3.dat` (year, day-of-year, five lakewide °C values). The ERDDAP `glsea_avgtemps_3` dataset was found to expose `Year` and `Day`, not a `time` column. The simpler official rolling text feed replaces an unverified ERDDAP request. All readings remain date-validated, lakewide, and satellite-derived—not shoreline temperatures or upper-air instability.
- Broad regional exposure sectors are heuristics, not polygons or forecast band positions. The chosen town does not describe conditions across the full snowbelt.
- No assumed radar track, snowfall totals, road safety claims or calibrated percent chance of an impact.

Primary references: https://www.weather.gov/documentation/services-web-api ; https://www.weather.gov/grr/windAndLakeEffectSnow ; https://www.weather.gov/apx/les ; https://www.weather.gov/dlh/lakesnow ; https://coastwatch.glerl.noaa.gov/satellite-data-products/lake-surface-temperature/ ; https://apps.glerl.noaa.gov/erddap/tabledap/glsea_avgtemps_3.html

WSSI and WSSI-P remain candidates for v2 only after GIS/valid-time ingestion is independently verified. WSSI is not an official watch or warning.

## Fail-closed rules
- An NWS wind match WITHOUT official forecast snow or a lake-effect alert is only a wind setup.
- Qualitative high/medium/low expresses forecast evidence agreement and data completeness; it is NOT an observed accuracy statistic, probability of snow or probability of precise band placement.
- Stale NWS issuance (>12 hours), insufficient first-12-hour wind metadata or missing hourly endpoint -> insufficient evidence.
- Unavailable alert feed -> explicit advisory that warnings could not be checked and confidence capped at low.
- Missing or stale NOAA GLSEA data -> show unavailable/stale. Never quietly fill with a seasonal average.
- Water temperature alone cannot prove 850-mb instability, adequate fetch, moisture, limited wind shear, open water, terrain enhancement, or band position.
- API calls are on-demand, per selected region, with 20-minute CDN cache and no cron, Redis, Upstash, or paid API.
- The optional device location button chooses the nearest listed checkpoint within 200 miles entirely on-device. Only the region ID reaches the backend.

## Release gates and site integration
1. Unit tests for coverage, wind wrap, NOAA CSV unit/age, snow/wind overlap, stale issue times and feed outages.
2. Source-repo CI and Vercel preview passing.
3. Real NWS and GLSEA smoke test with current timestamps.
4. Browser at 390px and 1280px: region changes, hourly scroll, keyboard navigation, location denied, graceful unavailable states and no horizontal body overflow.
5. Add one canonical HTML mirror in chrisizworski-com with only remote assets/API, not business logic; register /tools/, winter sitemap, tool-network graph and creator schema, and run full site verification. Respect publisher Auto Ads page policy without editing AdSense internals.
6. Merge only with passing gates; confirm both deployments and public URL in production.

The current feature branch is implementation work, not verified operational service. Search Console, GA4 and AdSense uplift: NOT AVAILABLE. 1 million impressions / 28 days and 5% CTR remain targets, not a predicted result.

## Next data improvements
NWS office-by-office exposure sector validation, historical-event hindcasts, credible ice/open-water mapping, WSSI-P severity interpretation, and regional travel alerts. Do not add unsupported local-town sprawl or high-resolution invented band geometry.

### October 21 source-format correction
Official NOAA GLSEA direct raw feed: https://apps.glerl.noaa.gov/coastwatch/ftp/glsea/avgtemps/glsea-temps_1024_3.dat . A browser/web fetch returned dated whitespace-delimited rows with day-of-year and °C fields. The live Vercel preview remains protected; deployed API egress and date freshness are not yet confirmed. Code fails open *for page readability*, but fails closed for any asserted temperature when NOAA retrieval is blocked.

## 2026-10-22 genuine GFS 850/925-mb air profiles (v3)
The authoritative NWS forecast and warnings retain decision authority. NOAA NOMADS GFS 0.25° supports 850-mb temperature and pressure-level wind plus 925-mb wind; each GRIB2 message is decoded offline with ECMWF ecCodes, checked against its model cycle and valid hour. Nine verified forecast snapshots span 0–72 hours (not hourly GFS values). A single offshore GFS point represents each Great Lake, so the diagnostic may miss nearby snowband structures. NOAA GLSEA temperature is a separate dated lakewide average; subtracting model 850-mb temperature gives a *coarse air-lake contrast screen*, where ~13°C is a climatological reference, not a probability of snowfall. 925-to-850 turning gives two-level directional shear; it does not resolve the inversion, vertical depth, fetch, convergence or exact band track.

The GitHub Action runs once on merge and at 05:47/11:47/17:47/23:47 UTC; each scheduled run subsets NOAA GRIB via https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl, 10-second spacing per NOAA recommendation, and replaces only a fixed JSON GitHub Release asset under https://github.com/izworskic/national-snowpack-melt/releases/download/lake-effect-gfs/upper-air.json . It does **not** commit refreshed data to the Vercel-linked branch, run on requests, use Redis, or incur recurring Vercel build minutes. A failed NOAA cycle leaves previously published data in place, which expires after 18 hours in the reader. Missing GitHub asset or unsupported JSON yields an explicit unavailable badge, not fake data.

Confidence *never increases* from GFS alone. For an NWS-indicated possible lake effect setup with no active NWS warning, inconsistent air-lake contrast or strong two-level wind turning may cap a previously high confidence label at medium, with a model-limitation note. NWS official warning and forecast snow statements are never suppressed. Model time and surface temperature date must be shown together.

### Pre-release acceptance
- Official real NOAA f006 offshore sample decoded for all five lakes with correct cycle, 850 and 925 pressure levels and units.
- Unit tests for positive/negative directional crossing, out-of-range data, stale cycles, missing lake reading and duplicate valid time.
- Frontend 390px/1280px smoke includes model panel, 72h NWS slider and safe fallback when the main forecast is unavailable.
- After merge, one-time data publication must complete and public production API must show a **dated current** GFS reading. Only then mark the live model enabled.

## 2026-10-22 observational and impact context (v2)
- Added official WPC WSSI **overall** Days 1–3 point intersection via NWS CloudGIS layer `outlooks/wpc_wssi/MapServer/4`. Use issue/start/end timestamps and strict age checks. Missing polygon means *not depicted at this checkpoint*, NOT no winter risk; impact bands are never a warning or lake-effect track. Source: https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/wpc_wssi/MapServer/4 .
- Added official USNIC total ice concentration **single offshore reference point**, `obs/usnic_greatlakes_ice_chart/MapServer/0`. Date and SIGRID-3 class `ct` must be known; absence does not equal open water, stale (over 72h) not presented as current. Reference point never translates to whole-lake percentages. Source: https://mapservices.weather.noaa.gov/vector/rest/services/obs/usnic_greatlakes_ice_chart/MapServer/0 .
- NO 850-mb instability derived: neither NWS point hourly wind nor land surface temperature yields 850-mb temperature. Do not present fake 13°C lake-to-850-mb delta. WSSI and ice fields remain independent interpretive context and cannot override an official NWS warning/verdict.
- Both data calls per region are optional and bounded at 5.5s with fail-closed parse; no new cron, caching backend, paid API, or exact-band map.
