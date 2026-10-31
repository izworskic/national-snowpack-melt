# Lake-Effect Snow — Experience OS v1.2 connected state trial

**Date:** October 31, 2026. **Owner:** `izworskic/national-snowpack-melt`. **Canonical:** https://chrisizworski.com/lake-effect-snow/. **Status:** source-side trial; PR, QA and deployment evidence must be recorded separately.

## Visitor decision, source scope and what already exists
The visitor wants to see when a lake-effect setup may change and where nearby official forecast evidence differs. Three already released tools describe **different phenomena, time intervals and sources**: the NWS hourly representative-point comparison (3-hour selectable steps), NOAA/NDFD six-hour gridded accumulation/instantaneous wind and temperature, and NOAA/WPC Day 1–3 24-hour snowfall exceedance probability polygons. The radar is historical observation. **They must not be fused into a fictitious single snowband animation or forecast.**

Source: [official NOAA WPC snowfall probability GIS service](https://mapservices.weather.noaa.gov/vector/rest/services/precip/wpc_prob_winter_precip/MapServer). Its 24-hour probabilities describe reaching at least 4, 8 or 12 inches of snow, in three differently issued Day 1–3 windows. Their blue/green/red outlines are 10–39%, 40–69% and 70–100% categories. The public ArcGIS /export image and /query responses are independently loaded. Relevant earlier source-backed experience briefs: `LAKE_EFFECT_TIME_LENS_20261031.md`, `LAKE_EFFECT_WPC_GEOGRAPHIC_PROGRESSION_20261031.md`.

The primary interaction already changes `day`, `threshold`, WPC `windowData.layer`, selected point, published 24-hour validity, map image, and linked point explanation. This trial fixes an asynchronous integrity gap **without** changing the forecast model or public presentation.

## Competing concepts
- **A (selected):** maintain separate timelines and add a strict selection-evidence barrier in the WPC map. On every day, threshold or region change, invalidate the previous image callbacks and point requests before awaiting new WPC issued/valid timestamps; remove existing map overlays. On hung WPC image fetch, time out, remove the overlay and retain official source link and text. Minimal JS, stable real forecast data.
- **B (rejected):** link 3-hour, 6-hour and 24-hour sliders to a global timeline as though their products represent the same instant. A WPC 24-hour exceedance probability cannot be presented as an hourly snowfall forecast, while an NDFD six-hour amount cannot be played as a live observation. It would introduce false temporal/spatial precision.

## Explicit state invariants
The stable product state is a tuple `day + threshold + issuance + validStart/validEnd + layer + selected map point`; not a naked timestamp or a generic "snow" score. A published window must match `LAYERS[day][threshold]`. The interactive map and point evidence must never show a previous tuple, nor claim “no snow” when the official contour query lacks data.

| Scenario | Visitor input | Expected visible answer | Failure path/test |
| --- | --- | --- | --- |
| Initial WPC load | Day 1, 4 in; select snowbelt | Published issue and exact 24h window, source-linked WPC map and point evidence | Existing four-viewport browser smoke |
| Day and threshold | Day 2 + 8 in; then Day 3 | New layer and period, no previous image or point status | New browser race with delayed old Day 2 point error and delayed new Day 3 window |
| Quick reversal | Day 3 → Day 2; 8 → 12 in | The new tuple, not the old layer's late callback | Old callbacks invalidated via `viewId`, `pointId`, `fetchId` |
| Map response stalls | Valid Day 1 4in inventory but NOAA image pending | Timed-out map removed; source and truthful textual limitation remain | New delayed real-image route in Chromium at 390px |
| NOAA source metadata fails | Day 3 12 in 503 / stale source | No probability or map layer inferred | Existing browser outage fixture |
| NDFD frames and time lens | Switch NDFD six-hour layer and NWS 3-hour forecast separately | Separate meaning, issue times and forecast intervals | Existing Chromium and unit tests; **do not** forcibly synchronize |
| Observed radar | Historical MRMS playback | Observation labels distinct from forecast windows | Existing browser suite |

## Source/provenance and safeguards
No source-issued timestamp is synthesized. The WPC API already checks issue freshness and layer IDs. This enhancement is strictly a presentation-evidence lifetime guarantee. No new forecast values, spatial interpolation, UI framework, API routes, Vercel keys, Redis, geolocation, ads or canonical/Person identity changes. The existing source-controlled JavaScript asset must be versioned in the canonical site shell **only after the source PR passes and deploys**; protect any other in-flight NDFD grid asset changes.

## v1.2 acceptance evidence
Run the existing `npm test` contract and `scripts/lake-effect-browser-smoke.cjs` (360/390/768/1280). The test must demonstrate old WPC point errors cannot overwrite newly requested windows while new metadata is pending, and a hung image cannot occupy a map indefinitely. Real browser screenshot review and source deployment/live public smoke are separate release gates. The central 100-point scorecard must not be declared complete based solely on CI. Record failures/re-runs rather than inventing performance, visitor-conversion or SEO gains.

**Transferable v1.2 lesson:** synchronization is not always “share one clock”; when source products have incompatible time intervals, enforce shared selected geography and **separate exact evidence windows**. On each selection, invalidate stale asynchronous evidence *before* fetching the next product.
