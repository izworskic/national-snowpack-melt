# Genuine archived NWS forecast replay — 25 October 2026

## Disposition

**Completed now from prior winters. No dependence on 2026–27 storm observations.**
The original NOAA National Digital Forecast Database **issued** weather, surface-wind and snow-amount GRIB2 files have been recovered, geographically validated and decoded for two winters, with forecasts evaluated strictly before their valid times. The current production forecast decision functions (`hourRows` and `assess`) were actually executed against these dated data.

**Scope: authentic NWS gridded forecast reconstruction, NOT identical archived `api.weather.gov/gridpoints/.../forecast/hourly` JSON.** NWS point API JSON was not archived as an exact issue-time copy. The genuine NDFD 5km data comes from the same national forecast ecosystem, but categorical Wx codes were explicitly mapped into concise text and three-hour weather/wind valid times were nearest-neighbor resampled to hourly (at most 90 minutes away). Historical NWS active-alert feeds and dated NOAA lake-temperature inputs were NOT recovered in this replay. Therefore, the `winter-hazard` warning pathway, exact source text, high-confidence labels, warning lead time, and true snow-band location skill remain **unverified**. This is a real NWS forecast backtest of the forecast-snow/wind decision paths, not an artificial hindcast using observations as model inputs.

## Historical sources and locked sample

- 30 **real NOAA-issued NDFD WMO files** (`wmo/wx`, `wmo/wdir`, `wmo/snow`): authenticated from the [NOAA Open Data NDFD archive](https://registry.opendata.aws/noaa-ndfd/). Each source has its original WMO filename, issue timestamp, archive modification timestamp, byte length, SHA-256 and ETag in the GitHub Actions artifact.
- 14 issuance/site combinations across **7 checkpoint locations in 5 states**: Buffalo (NY), Oswego (NY), Cleveland (OH), Erie (PA), Marquette (MI), Gaylord (MI), Milwaukee (WI).
- Issue dates: **December 31, 2024; January 1, 2025; November 8–9, 26–29, 2025; December 27–28, 2025**. The dates are taken from two earlier winters. Original NWS forecasts were already available before the storm windows.
- The NDFD gridded weather key codes were decoded using the official NDFD GRIB2 **Section 2 weather string lookup table**, not inferred from later snowfall. `S`/ `SW` represent falling snow; `BS` alone represents *blowing* snow and must not become new snowfall. Valid coordinate grids are checked within 15 km; off-region forecasts are rejected.
- Reference (not forecast): frozen **ERA5 gridded snowfall** from `tests/fixtures/lake-effect-history`, 1cm/6-hour binary reference threshold. ERA5 is a reanalysis with a considerably coarser grid; it may miss narrow local snowbands. Previous independently dated NWS Local Storm Reports document positive events but **absence of reports never implies a zero**.

## Completed retrospective scores

These are **event-enriched, strongly correlated storm samples**, not a season-wide randomly selected validation. A six-hour bin is forecast-positive if >=2 of its reconstructed forecast hours indicate falling snow, compared with >=1cm snowfall in ERA5 over the same hours. A wind-converging forecast requires >=2 hours of snow+curated wind alignment. The independent original **NWS NDFD snow-amount grid** is forecast-positive for >=1cm projected accumulation over its own six-hour valid period. TP / FP / FN / TN refer to forecast versus ERA5 grid-cell criterion—not proof of actual ground snowfall.

| Original NWS forecast horizon | Evaluated six-hour bins (Wx) | Wx TP / FP / FN / TN | Wx CSI | Wx+wind CSI | Original NDFD 6h snow-amount CSI |
|---|---:|---|---:|---:|---:|
| 0–24 hours | 42; 14 excluded for incomplete Wx valid-hour coverage | 1 / 15 / 0 / 26 | **0.063** | **0.100** | **0.091** (56/56 bins) |
| 24–48 hours | 56 | 5 / 28 / 5 / 18 | **0.132** | **0.143** | **0.148** (56/56 bins) |
| 48–72 hours | 56 | 6 / 19 / 8 / 23 | **0.182** | **0.194** | **0.174** (56/56 bins) |

The standalone original NDFD snow-amount forecasts (the least interpolated NWS forecast evidence here) resulted in:
- 0–24h: TP 1, FP 10, FN 0, TN 45.
- 24–48h: TP 4, FP 17, FN 6, TN 29.
- 48–72h: TP 4, FP 10, FN 9, TN 33.

Unmodified `assess` first-12h forecast-snow path produced an eligible outcome in **14 of 14 replay checkpoints**, with TP 1, FP 5, FN 0 and TN 8 against the same ERA5 1cm/12h threshold (CSI 0.167). Many records are near the same system and event. **Do not advertise this 16.7% precision as an estimate of live performance or a user-facing accuracy score.** Low counts, comparison to coarse reanalysis and threshold mismatch between weather probabilities and accumulated snow make it inappropriate.

### Technical interpretation

1. The engine successfully reconstructs its *weather-plus-wind path* from actual historical, published NWS grids. This closes the previous **GFS-only-model-proxy** gap and requires no new season.
2. **Snow mentioned by an NWS forecast does not mean >=1cm definitely falls at a selected ERA5 grid cell.** Chance/scattered snow codes, drifting bands and resolution mismatch explain part of the high apparent false-positive rate. We cannot assign how much without independent high-resolution verified observations. Confidence remains descriptive rather than calibrated probability.
3. Adding a local wind-alignment filter increased CSI slightly in this 14-snapshot NDFD sample, whereas it reduced CSI in the earlier seven-location GFS-fixed-lead benchmark. The samples use different fields/horizons; neither establishes general predictive benefit of surface wind alone. **Do not tune exposure sectors or increase snow confidence from wind without out-of-sample proof.**
4. Historic NDFD gridded weather and wind can be valid at 3-hour intervals. `scripts/ndfd-historical-extract.py` preserves the exact original Wx and wind valid times for every resampled hour; the maximum permissible difference is 90 minutes. This time expansion introduces uncertainty. The independent **native six-hour NDFD snow-amount** comparison is provided to triangulate.
5. **Neither a positive radar echo nor a weather forecast verifies safe snow depth, grooming, operational lift status, snowmobile trail openings or road passability.** Downstream winter tools stay separately gated.
6. Keep engine logic unchanged pending better *station-based* snowfall truth with event attribution, archived alert state and a wider quiet-day sample. A winter warning is not a forecast verification label.

## Reproduce the completed test without waiting for winter

Run the [GitHub Actions NDFD historical validation workflow](../.github/workflows/ndfd-historical-probe.yml) against archived NOAA S3 WMO objects and the committed ERA5 reference fixtures:
```bash
python -m pip install eccodes==2.43.0
python -m unittest discover -s tests -p test_ndfd_weather.py -v
python scripts/ndfd-historical-probe.py
python scripts/ndfd-historical-extract.py
node scripts/score-ndfd-historical.cjs
```

GitHub Actions attaches source identity and **complete reconstructed hourly point evidence** (`tmp/lake-effect-nws-ndfd-history.json`) plus **case-by-case outputs and all scores** (`tmp/lake-effect-nws-ndfd-result.json`). In addition, this document permanently preserves headline metrics. These scripts make external NOAA downloads **only on validation CI**, not on every production merge or site request.

Source and method references:
- NOAA NDFD 2020–present WMO archive: https://www.ncei.noaa.gov/products/weather-climate-models/national-digital-forecast-database
- NOAA GRIB2 Section-2 categorical key encoding: https://graphical.weather.gov/docs/grib_design.html
- NWS WMO weather conventions: https://vlab.noaa.gov/web/mdl/degrib-ndfd-weather
- NOAA NDFD cloud archive description: https://registry.opendata.aws/noaa-ndfd/
- ERA5 reanalysis historical data: https://open-meteo.com/en/docs/historical-weather-api

**Remaining boundary:** Recovering *byte-identical archived NWS point-hourly JSON*, associated contemporaneous alert state and verified station observations would improve calibration and warning verification, but **the real NOAA-NDFD historical snow/wind replay and forecast-versus-analysis scoring are completed here now**.
