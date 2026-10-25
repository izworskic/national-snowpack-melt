# Ground-truth and geographic verification of lake-effect forecasts
Updated 2026-10-25.

## Why
The earlier historical replay used original 2024–25 and 2025–26 NWS NDFD categorical weather, gridded snowfall and surface wind forecasts against ERA5 reanalysis. ERA5 is much coarser than narrow snowbands and cannot by itself verify local snowfall. This phase adds **dated ground-station observations** and a separate NOAA snowfall analysis. No new 2026–27 winter weather is required.

## Dated historical reference sources
1. **NWS COOP point reports (observations):** the Iowa Environmental Mesonet [raw daily COOP data API](https://mesonet.agron.iastate.edu/cgi-bin/request/daily.py) plus [COOP geolocated station catalog](https://mesonet.agron.iastate.edu/COOP/) supplies station/day, measured daily snowfall (inches), coordinates and site identity for MI, WI, OH, PA and NY. Missing, blank and invalid readings are excluded; missing does *not* mean zero snowfall. CoCoRaHS-origin reports can also appear among NWS local storm reports, but this sample does **not** imply complete separate CoCoRaHS network coverage.
2. **NOAA NOHRSC SNOWFALL VERSION 2 GRIB2:** historical 24-hour accumulated snowfall analyses from [NOHRSC](https://www.nohrsc.noaa.gov/snowfall_v2/), valid at 12 UTC. These are **gridded analyses informed by observations**, not independent gauge reports. Their sampled grid values and original units are stored separately and are never used to create the forecast.
3. **NWS forecast:** the [original issued NOAA NDFD GRIB2 WMO archive](https://registry.opendata.aws/noaa-ndfd/) decoded in `scripts/ndfd-historical-extract.py`. Forecast issuance occurs before valid time. Observations are joined by region and approximately comparable local reporting day, **not substituted into archived forecast fields**.
4. **Current storm reports (UI only):** the [IEM real-time local storm report (LSR) GeoJSON feed](https://mesonet.agron.iastate.edu/geojson/lsr.geojson), strictly positive SNOW reports within 50 km and 36 hours. If no valid reports are returned, the correct label is **unverified**—never snow-free.

## Geography and comparison rules
- **Seven checkpoints** in five states: Buffalo, Oswego, Cleveland, Erie, Marquette, Gaylord, Milwaukee. Historical sample contains at least 14 individual issue-site snapshots and their next three reporting days.
- **15/30/65 km radii** show spatial sensitivity. A reported accumulation outside 15km but within 65km confirms the *region*, **not snowfall at the selected town** and not a correct exact band-placement forecast.
- Primary station report threshold for this exploratory benchmark: **>= 1 inch new snowfall on the recorded local reporting day**. Values reported as trace remain below threshold but count as a reported reading.
- **Regional negative** requires at least three stations with numeric snowfall observations *inside the tested radius* and zero stations reporting >=1 inch. Sparse stations, missing reports or dates are **excluded** rather than judged snow-free.
- The source issue timestamp and a station's **local reporting day** cannot be equated to a UTC rolling 24-hour forecast exactly. This is a **day-level spatial diagnostic**, not an hourly forecast verification, lead-time skill or proof of isolated lake-effect origin.
- Date/scenario choices were made before verifying ground truth. The holdout group is **Oswego, Erie and Gaylord**; the development group is Buffalo, Cleveland, Marquette and Milwaukee. No thresholds are fitted to the holdout.
- Two source-only forecasting screens are compared on exactly the same labeled observation days: original NWS categorical forecast snow, and the subset when NWS-published snow overlaps an exposed surface-wind sector. These are **diagnostic** screens, not trained alternatives.
- The 2024–25 and 2025–26 samples are event-enriched. Check independent quiet periods and additional winter seasons before concluding general accuracy or changing the product's wind sectors.

## Completed station / NOHRSC results (25 October 2026)

The [successful historical verification run](https://github.com/izworskic/national-snowpack-melt/actions/runs/40202093774) reconstructed the original NOAA NDFD forecasts, sampled 42 of 42 available NOAA NOHRSC daily snowfall analyses and measured actual IEM/NWS COOP station reports on 42 of 42 source issue/reporting days. Every tested 65-km report footprint had at least three numeric reporting COOP gauges. **37 of 42** were positive for at least one station reporting >=1 inch new snow within 65 km; five were non-positive under the three-gauge rule.

The **source-only NWS categorical snow forecast** was the baseline. The stricter candidate additionally required >=2 forecast hours with weather-snow and matching local wind-sector alignment. Both used identical station truth, selected forecast issue days and spatial reporting filters. Confusion matrices below are TP / FP / FN / TN vs nearby 1-inch station-day snow, *not* exact site snowfall:

| Radius | Eligible of 42 | Baseline TP/FP/FN/TN | CSI | Wind-gated TP/FP/FN/TN | CSI |
|---|---:|---|---:|---|---:|
| 15 km | 13 | 7/0/3/3 | **0.700** | 4/0/6/3 | **0.400** |
| 30 km | 29 | 14/2/5/8 | **0.667** | 10/2/9/8 | **0.476** |
| 65 km | 42 | 25/1/12/4 | **0.658** | 21/0/16/5 | **0.568** |

For geographically held-out Oswego, Erie and Gaylord (**18 station-days within 65 km**), the original NWS snow screen scored **CSI 0.611** (11/1/6/0) against **0.471** (8/0/9/1) for added local wind gating. Because the holdout shares some regional weather patterns with development locations, it is not an independent storm-system split; results remain exploratory.

**Decision:** No production changes to the engine's threshold, forecast category, confidence labels or wind-sector geometry. Wind-gating reduced recall and critical success index in all radii and held-out cases. The tool may display wind as meteorological context but must not use it to reject otherwise official NWS snow forecasts. Forecast-snow does not establish a snow-covered road, usable grooming or current snowfall.

**Spatial diagnosis:** In the November 26, 2025 forecast issue, Buffalo's nearest positive station was 12.9 km away on the first corresponding reporting day; Oswego's was 64.7 km. A 65-km regional hit therefore cannot establish that a band actually impacted the city. At a 15-km verification radius, 29 out of 42 reporting days were excluded for sparse station coverage; those exclusions cannot be called correct quiet forecasts.

**Limits:** Only two winter seasons and an event-enriched sample; the comparison is by *local station reporting day*, not perfectly aligned UTC 24h forecast intervals. No CoCoRaHS-only sampling claim is made: previous archived positive NWS Local Storm Reports include CoCoRaHS reports for corroboration, but the full station-based contingency table comes from the separately downloaded COOP network. NOHRSC is **observation-informed analysis** used for cross-checking, not added independent stations. No claims of a calibrated forecast accuracy rate, exact-band placement, snowfall accumulation prediction or winter-wide generalization.

## Public experience
The existing Lake-Effect Snow Engine verdict (no new ad block) contains three distinct evidence cards:
- **Setup:** qualitative regional meteorological context.
- **NWS snow forecast:** prospective conditions/uncertain placement; still the forecast authority.
- **Recent observations:** actual nearby positive measured snow reports with age, distance and source, or **unverified** when no qualifying report exists.

The observational channel **never changes the forecast level, warning status or confidence**. Recent regional reports are not a snow-depth measurement, proof of a safe road, groomed XC trail, operating ski hill or rideable snowmobile base.

## Reproduction and release gate
```bash
python -m pip install eccodes==2.43.0
python scripts/ndfd-historical-extract.py
node scripts/score-ndfd-historical.cjs
python scripts/lake-effect-groundtruth.py
node scripts/score-lake-effect-stations.cjs
node --test tests/lake-effect*.test.js
```
[Historical validation CI](../.github/workflows/ndfd-historical-probe.yml) publishes generated archive manifests, station- and grid-source identities, and daily sensitivity/holdout metrics as a workflow artifact. All data downloads occur **only in the manual/PR historical validation workflow**, not in public site builds or every merge.

**Release rule:** any source coverage/format failure causes a failed CI step. No production snowfall thresholds, NWS warnings, site ad scripts or automated SEO pipeline are modified. Publish the measured metrics with sample sizes rather than promising broad forecasting skill.
