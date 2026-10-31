# NOAA/NDFD six-hour forecast geography | Experience OS v1
Date: October 31, 2026
Canonical visitor experience: https://chrisizworski.com/lake-effect-snow/
Authoritative source repository: izworskic/national-snowpack-melt
Canonical integration: izworskic/chrisizworski-com

## Decision and source investigation

The prior WPC geography section provides three *daily* accumulated-snow probability windows. It cannot show precise intraday geographic change. The NWS hourly point comparison is truthful but provides no continuous map. This release adds a **separately sourced** NOAA National Digital Forecast Database gridded map in increments of six hours, an independently verified source-time progression, and optional weather context layers.

NOAA primary sources:
- https://digital.weather.gov/staticpages/mapservices.php
- https://www.weather.gov/gis/NDFD_metadata.html
- https://digital.weather.gov/scripts/get_issuancetimes.php?grid=ndfd&elmt=snowamt&region=conus&vt=2026-11-01T00:00
- https://digital.weather.gov/ndfd.conus/wms?REQUEST=GetCapabilities

The NDFD Snow Amount element represents total NEW snow over the preceding **six hours**, with validity ending at 00, 06, 12, or 18 UTC. It is **not** point-in-time precipitation intensity, snow on the ground, a lake-effect-only event, or a predicted narrow band's path. NDFD temperature, wind speed and wind direction are instantaneous (at the selected valid time); their colors and wind representation belong to the official NOAA WMS.

Critical verification discovery: The NWS WMS will return a default map image even for a nonexistent valid time, potentially creating visually believable but false progression. Exact WMS requests therefore **must not be generated from simple six-hour arithmetic alone**. The separate NOAA get_issuancetimes.php service was empirically tested on 2026-10-31 with valid 00/06/12 UTC and intentionally invalid 03 UTC. It returned real issuance time lists for valid forecasts, [] for nonexistent times. For each potential time the source API independently verifies a recent issuance and constructs an explicit VTIT=ValidTime_IssuedTime pair. Only pairs confirmed by NOAA are exposed to clients. Gaps are skipped, never filled or interpolated. A last-six-hours map is not the same as radar.

## Competing design approaches

1. Artistic moving snowband polygons based on a few NWS hourly point observations: rejected, unsupported.
2. Loading a WMS layer using evenly spaced future times without validating each value: rejected because the WMS silently falls back to an unrelated default time for invalid VTIT.
3. NOAA NDFD 6h new-snow, wind and temperature WMS imagery with per-frame independent issuance proof: selected.
4. WPC snow probability frames: retained in their own section and time scale, no blending with this layer.

## Shipped design

Scoped map-first Experience OS panel appears before the official daily WPC geography section. Field selector: (a) NDFD six-hour NEW snow accumulation, (b) surface wind direction, (c) wind speed, (d) two-meter air temperature. All share a list of authentic 6-hour-aligned sample times, but temperature and wind are explicitly labeled instantaneous. The official source determines whether a valid frame exists; not every frame exists out to 72 hours.

Controls: verified-frame slider, previous/next, play/pause with reduced-motion guard, shared link preserving gridField and gridAt, selected snowbelt point and official NWS MapClick location link. On the selected snowbelt, a separate NWS hourly text count reports published hours that mention snow or snowbelt-aligned wind where coverage exists. It does NOT try to extract a numeric forecast from WMS map pixels, overstate NWS point precision, or infer road safety.

Leaflet georeferences the official WMS PNG imagery in EPSG:3857. CARTO public keyed basemap is used when its tiles load; OSM fallback remains. The image layer is removed immediately when switching variables, time or when an upstream inventory fails. Only documented NDFD elements and CONUS are allowed. Cache is public <=4 minutes, no Redis or paid services. Canonical-site API uses a narrow same-origin Vercel rewrite. Source site and canonical page preserve radar, WPC geography, photography, SEO/JSON-LD, Person identity and ads.

## Quality gates

- Node unit tests: variable-specific accumulation versus instantaneous semantics; exact UTC candidate times and issue validation; malformed 03 UTC hour; stale/malformed/out-of-window issuance; gaps and total upstream failure; canonical/radar preservation.
- Live GitHub CI: verify official get_issuancetimes.php publication for actual snow, temperature and wind layer steps; ensure every server-returned VTIT matches a verified issuance.
- Four Playwright viewports 360, 390, 768, 1280: correct WMS endpoint and EPSG:3857 geometry, pinned valid+issue pair, layer changes, slider keyboard behavior, URL serialization, reduction-motion guard, stale overlay removed on NOAA outage, preserved WPC/radar, no horizontal overflow, and screenshots.
- Release order: source pull request CI green -> production Vercel READY -> source API published -> canonical site's PR CI green -> production READY -> live public page and NOAA WMS image verification.
- Explicitly no SEO-performance or traffic-growth claims without Search Console measurement.

## Next investment
If visitors use this, evaluate point values from NOAA's supported NDFD point services using time-specific official data at a selected lat/lon, then compare to NWS hourly text for that point. Never infer exact numeric snow totals from rendered WMS color pixels or interpolate unverified weather.
