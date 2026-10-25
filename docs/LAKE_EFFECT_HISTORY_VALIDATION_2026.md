# Historical predictive validation — 25 October 2026
**Decision: model-proxy replay COMPLETE; production NWS-hourly decision engine predictive skill NOT VERIFIED.**

This report is deliberately narrower than a claim of operational accuracy. An authentic 2025 forecast cannot be recreated by feeding retrospective snowfall or 2026 NWS current forecasts to the engine. The NWS `/gridpoints/.../forecast/hourly` endpoint is a live feed, not a replayable issue-time historical archive. We found official NCEI NDFD gridded archives and IEM NWS issued-text archives, but neither was converted here into a **dated, position-matched, versioned** `forecastHourly` input for `lib/lake-effect.js`. **Do not show a production precision/recall score or a prediction confidence percentage.**

## What was actually measured
- Seven curated checkpoint/event windows across **five states**: Buffalo and Oswego (NY), Cleveland (OH), Erie (PA), Marquette and Gaylord (MI), Milwaukee (WI).
- **1,272 hourly records / 212 non-overlapping six-hour blocks**, replayed separately for 24h, 48h and 72h forecast lead times.
- Actual previously issued forecast-model output: Open-Meteo `previous-runs-api`, **NCEP GFS global** snowfall and 10-meter wind direction from the previous 1, 2 and 3 days. Each valid-hour forecast is issued N days prior; hours in a six-hour block **are not from the same single model cycle**, so do not call it a 72h storm-track replay.
- Snowfall reference: Open-Meteo **ERA5 gridded snowfall reanalysis** (not snowfall observed at a weather station and not attribution to lake effect).
- Six-hour event threshold: snowfall **at least 1 cm / six hours** for forecast and reference; the wind-gated diagnostic additionally requires at least three of the six hours to be in the product's published surface-wind exposure sector. Thresholds were specified before computing the score; no local tuning.
- Five original, dated National Weather Service Area Forecast Discussions archived by Iowa Environmental Mesonet, plus **134 filtered positive snowfall report records** from NWS/IEM, freeze the provenance of the historical event windows. Reports can be multi-hour/cumulative, heterogeneous, sparse, and not uniquely independent; **their absence is NOT a negative outcome**. They are qualitative corroboration, not the numerical reference data.
- The sample deliberately contains notable storms and adjacent quiet hours. These are overlapping, geographically clustered cases; they are **not a random annual test set**, and overall performance cannot be extrapolated to all winter days or exact snowband tracks.

## Reproducible retrospective model-proxy score
All cells are six-hour bins against ERA5 snowfall reanalysis; TP / FP / FN / TN; CSI = TP / (TP+FP+FN).
| Lead | Forecast-snow TP/FP/FN/TN | Snow CSI | Snow + aligned wind TP/FP/FN/TN | Screened CSI |
|---|---|---:|---|---:|
| 24h | 12 / 7 / 8 / 185 | 0.444 | 7 / 6 / 13 / 186 | 0.269 |
| 48h | 8 / 14 / 12 / 178 | 0.235 | 5 / 12 / 15 / 180 | 0.156 |
| 72h | 8 / 7 / 12 / 185 | 0.296 | 7 / 7 / 13 / 185 | 0.259 |

**Finding:** Requiring the local surface-wind sector **reduced CSI** at all lead times in this sample. This does not mean aligned winds are unimportant to lake-effect meteorology. It means a single land-based checkpoint wind-exposure heuristic is **not empirically justified as a higher-confidence snow predictor** on these retrospective model-and-reanalysis inputs.

## Consequences for the live engine
1. **Keep wind and coarse offshore 850/925-mb model indicators as contextual diagnostics, not snow-event promotions.** The NWS warning and forecast snow remain authoritative, and `confidence` stays a qualitative evidence agreement label.
2. **Do not infer that no LSR is no snow, or a missing radar timestamp is a clear sky.**
3. **Do not convert ERA5, GFS model, IEM forecast discussion or NWS storm-warning text into the NWS `forecastHourly` input and report operational verification.** Strict validation rejects this.
4. **Do not tune the wind sectors to this small event-selected sample.** Favor independent holdout seasons and forecaster office assessment.
5. Cross-tool safety: model snowfall does not establish snow depth, groomed skiing, operating lifts, safe snowmobile trails or public access. Existing tool boundaries remain unchanged.

## Source and computation audit
- NOAA NCEI NDFD archive: https://www.ncei.noaa.gov/products/weather-climate-models/national-digital-forecast-database
- IEM dated NWS product retrieve API: https://mesonet.agron.iastate.edu/cgi-bin/afos/retrieve.py?help=
- IEM historical LSR GeoJSON API: https://mesonet.agron.iastate.edu/geojson/lsr.py?help=
- Open-Meteo previous runs (fixed 1/2/3 day lead): https://open-meteo.com/en/docs/previous-runs-api
- Open-Meteo ERA5 historical weather: https://open-meteo.com/en/docs/historical-weather-api
- Official storm crosschecks: https://www.weather.gov/cle/event_20250105_LES and https://www.weather.gov/mkx/events and https://www.weather.gov/buf/lesEventArchive?season=2025-2026
- Original source URLs, reference units, timestamps, model labels, and all **unmodified retrieved hourly values** are in `tests/fixtures/lake-effect-history/*.json`.
- Auditor: `node scripts/benchmark-lake-effect-history.cjs --check`. Tests: `node --test tests/lake-effect-history.test.js`. Full ordinary release CI remains required.
- `node scripts/benchmark-lake-effect-history.cjs --strict-production` **must fail** until issue-time NWS hourly forecast snapshots with location, issuance, valid hours and matched independently observed outcomes exist.

## Exact-engine verification gap and next data contract
To truly finish production historical skill, ingest archived **NWS-issued** forecast-hourly grids for the original 15 representative coordinates and original issuance times, using NOAA NDFD historical GRIB2 with preserved grid/product version and matching issue-time snapshots. A historic text forecast discussion can establish *that a forecast was published* but not the hourly input that the running engine would have received. Match to independent local station observations, NWS LSR positive witnesses and radar timestamps (with visibility/coverage metadata). Use stratified storm/non-storm periods, never label missing reports negative. Replay `M.hourRows` and `M.assess` against each issue snapshot before calculating skill. This requires substantial separate archived-GRIB extraction and observation coverage validation, so no score is claimed here.

The benchmark runs offline. It adds **no production API calls, paid services, scheduler or Vercel build-minute cadence** and does not change the published snowfall, radar or ski/snowmobile decision engines.
