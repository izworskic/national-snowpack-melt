# EXPERIENCE_OS_V1 — Lake-Effect Snow Forecast Time Lens
Date: 2026-10-31. Owning repository: izworskic/national-snowpack-melt.
Canonical: https://chrisizworski.com/lake-effect-snow/
Status: feature branch; release gate pending. This is a forecast *point comparison*, not a new geographical snow forecast.

## 1. Visitor question and decisive action
A visitor wants to know: **when does the NWS point-forecast snow signal change in my chosen Great Lakes snowbelt, and what does a second nearby or distant location show at exactly the same valid time?** They should see a direct, source-qualified answer before touching the time slider. The original main answer, alerts, storm reports and radar remain intact.

## 2. Evidence and source boundaries
- NWS /points/{lat},{lon} → forecastHourly, via the existing cached same-origin /api/lake-effect endpoint: https://www.weather.gov/documentation/services-web-api and https://weather-gov.github.io/api/gridpoints. Forecast valid time is **exact**: no interpolation. The NWS hour has a local representative-point grid, not town-wide or highway coverage. A report is usable only with verdict.data_ok and forecast_updated no older than 12h. The newest 72-hour rows are read on page load; no new paid feed.
- Broad regional wind-alignment sectors are curated, qualitative exposure hints, **not** measured wind aloft or a snowband location. The primary data is NWS hourly snow wording, not wind alone.
- Active NWS warnings are a separate at-retrieval hazard layer. The UI explicitly refuses to imply a warning is valid for a selected future hour, and marks unavailable alert feeds.
- Two representative coordinates come from the existing 15-region curated register. Map marks two **forecast points** only. It never invents spatial forecast raster cells, a band track or continuous snowfall fields.
- Observed MRMS radar in the existing lower panel is separately time-bound, not overlaid on forecast hours. NOAA nowCOAST distinguishes observed animation from future modeled layers: https://oceanservice.noaa.gov/facts/nowcoast.html.
- Map on demand: existing keyed CARTO public-config endpoint, after successful tile retrieval; OpenStreetMap basemap fallback and external map link when unavailable. Key remains server-configured and is not hardcoded. No automatic geolocation.
- Existing historical Buffalo snow-wall photo on the canonical site retains license and historical/nonlive caption; no new images or simulated photographic effects.

## 3. External experience research checked October 31, 2026
1. Windy Map Forecast documentation https://api.windy.com/map-forecast/docs: map time controls and point pickers can connect forecast time to a geographic location. Do not copy UI or proprietary forecasts; deliberately stay within existing NWS data.
2. NOAA nowCOAST https://www.nauticalcharts.noaa.gov/learn/nowcoast.html and https://oceanservice.noaa.gov/facts/nowcoast.html: animated past observations and future forecast layers coexist with geographic click-to-inspect. Preserve **forecast vs observation** separation rather than combining their timelines.
3. NWS https://www.weather.gov/grr/windAndLakeEffectSnow: wind shifts can alter favored bands, but a point wind observation/forecast does not determine band location.
4. Internal EXPERIENCE_OS_V1 patterns P01, P02, P03, P04, P06, P08; avoid A05 blank-map, A07 stale-year "live", A09 motion without altered explanation, A10 desynchronized state, A11 drag-only, A13 arbitrary percentage.

## 4. Two genuinely different concepts
**A. Whole Great Lakes animated snowband heatmap.** Sweeping visualization across all 15 regions; visually dramatic but NWS point forecasts cannot justify spatial interpolation and endpoint coverage/traffic would expand substantially. **Rejected**: misleading precision and data footprint.

**B. Paired forecast checkpoints with a time lens.** One primary chosen snowbelt + one comparison. Slider moves in **3-hour steps over exact NWS hours**, updates weather explanation, signal color on actual map markers, and qualitative decision. Map is opt-in. **Selected** for truth, performance, accessibility, and visible, reversible input/output connection.

## 5. Controls and failure behavior
- Compare dropdown selects any of the other 14 known regions. The initial comparator is the nearest *representative point*; it is not selected as "best" by algorithm. No more than two region forecast requests are made for this interaction.
- Timeline range and −3h/+3h buttons modify the exact valid hour. Keyboard arrow keys work; URL retains region, compare and lead hour without changing canonical URL. Play moves three hours per step and pauses at end; honors prefers-reduced-motion; disappears from animation loop when the tab is hidden.
- Map toggle lazy-loads Leaflet and a real tiled basemap. Card text and official NWS source links work independently of map, tiles, and motion.
- A fresh NWS forecast with two overlapping signals may be labelled *more supporting signals*, **never** "X is safe" or an exact snow forecast. Wind-only cannot outrank an explicit NWS snow forecast.
- Incomplete/stale/missing NWS report or exact valid hour → **comparison unavailable**, not clear weather, false zero, or last-known-good winning location. A missing wind direction with no forecast snow is not counted as a quiet verified point. A partial or failed comparison never reuses prior-point data.

## 6. Integration and rollout
Feature origin: own repository, not the chrisizworski-com mirror. Source-side static HTML loads the added CSS and JS; the canonical site's shell adds only remote asset tags after existing scripts. The source's main reader calls the optional lens after the standard explainer and radar reader. Existing 15-region NWS engine, radar, alerts, snapshots, noindex API, Person, canonical, ads and existing weather charts are unmodified.

Dependencies: source PR must merge, deploy and pass live smoke **before** the shell PR can be released. There is no new API cron, Redis, paid provider, framework, tracking, build step or ad unit.

## 7. Acceptance and measured state
Required 390 and 1280 browser scenarios: cross-region change of an actual NWS snow hour; keyboard slider/URL; omitted hourly rows and stale report; both forecast markers on loaded map tiles; CARTO and OpenStreetMap variants; radar independence. Existing browser harness extended. Node truth-contract unit tests added.
Still required before merge: tests and CI results, mobile screenshots (360/390/768 and desktop), live renderer/checkpoint verification, real map tile rendering, QA scorecard >=90 and each category >=4. These are **NOT MEASURED until observed**. No SEO, revenue or conversion uplift claim.

Exactly one release decision: **keep draft while any gate is unrun, unavailable or red**.
