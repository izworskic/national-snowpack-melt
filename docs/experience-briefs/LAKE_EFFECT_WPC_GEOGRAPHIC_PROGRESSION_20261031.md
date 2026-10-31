# Lake-Effect Snow Geographic Progression · EXPERIENCE_OS_V1
Date: October 31, 2026
Canonical: https://chrisizworski.com/lake-effect-snow/
Engine: izworskic/national-snowpack-melt
Integration: izworskic/chrisizworski-com

## Visitor problem
The existing NWS time lens compares two hourly forecast points but cannot establish a geographic footprint. Interpolating a snowband from point data would invent forecast detail.

## Source selection
Evaluated NWS/NDFD gridded WMS forecast layers versus the NOAA Weather Prediction Center's official Day 1–3 probabilistic snowfall polygon service:
https://mapservices.weather.noaa.gov/vector/rest/services/precip/wpc_prob_winter_precip/MapServer

NDFD WMS is time enabled but its valid-time inventory must be verified before using any particular hour. Its documentation states that a request for an unavailable time can fall back to a default image. That could falsely appear to show a changing snowstorm.

WPC publishes specific layers for probability of meeting/exceeding 4, 8 or 12 inches in 24 hours:
Day 1 layer IDs: 1, 2, 3. Day 2: 6, 7, 8. Day 3: 11, 12, 13.
Each feature has actual issue_time, start_time, end_time, valid_time, outlook and dn fields. The ArcGIS WPC service itself is not time-enabled: days are distinct official layer IDs, not assumed frame times.

WPC original renderer outlines: blue 10–39%, green 40–69%, red 70–100%. These are 24-hour snowfall accumulation exceedance probabilities, not the probability of hourly snow, an hourly band-position forecast or a road-safety score.

## Product architecture
An independent WPC geographic outlook follows the existing 3-hour NWS point comparison. Visitors choose Day 1, 2, or 3 and a 4, 8 or 12 inch accumulation threshold. The map uses real NOAA WPC ArcGIS PNG export, not a hand-drawn probability surface. Selecting any map point checks the actual WPC polygon query and returns the published category, or explicitly says no ≥10% contour was established there.

The source serverless endpoint verifies publication timestamps and real 24-hour start/end dates, accepts only allowlisted NOAA layer IDs, and fails closed when the product is stale or source fields are malformed. When a time selection changes, the previous risk overlay is removed immediately. An unshaded location is never presented as a guarantee of no snow.

The map uses CARTO tiles when available, OSM fallback, Leaflet, zoom/pan, and Great Lakes reset. Reduced motion is supported. Shareable geoDay and geoSnow query parameters do not disturb existing region, lead or window. Same-origin production API is connected through a narrow rewrite. No Redis, paid data provider, sensitive keys, extra permissions, ad, schema, canonical, photo, or identity changes.

## Release gates
1. Live NOAA WPC service issue/validity smoke for all 3 days.
2. Node unit tests for strict source dates, mappings, classification, absent contour versus absent evidence.
3. Mobile and desktop browser tests at 360, 390, 768 and 1280 pixels, including geographic image, source window and map-point selection, URL persistence, reduced motion, and fail-closed NOAA outages.
4. Merge/deploy engine first; verify source API and deployed assets. Merge/deploy canonical site second; verify live map and responsive design.
5. Do not misrepresent these daily WPC accumulation forecasts as 3-hour lake-effect snowband progression.

## Next investment
After uptake, add precisely time-indexed NDFD layers only after verifying the exact valid-time inventory, temporal period and geospatial legend; do not interpolate these three WPC daily forecasts into an hourly moving band.
