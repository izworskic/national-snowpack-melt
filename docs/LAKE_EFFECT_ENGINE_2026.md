# Great Lakes Lake-Effect Snow Decision Engine — October 21, 2026

## Purpose and ownership
Implementation: izworskic/national-snowpack-melt. Intended canonical public path: https://chrisizworski.com/lake-effect-snow/. Preserve Michigan Snow Finder, Snow Totals, and national snowpack pages as separate decisions; no duplicate snow-depth ranking.

The first release includes 15 representative snowbelt checkpoints in Michigan, Wisconsin, Ohio, Pennsylvania and New York. It is NOT an exact lake-effect snowband forecast or a county-level impact polygon.

## Inputs and interpretation
- NWS API /points -> hourly forecast (time, temperature, surface wind, forecast text, precipitation chance). The point is on land; observed or forecast surface wind there is not upstream 850-mb wind over open lake.
- NWS active point alerts, with explicit lake-effect classification ONLY if the official alert says lake effect. Generic winter warnings are still important hazards, without claiming their origin.
- NOAA GLERL GLSEA daily lakewide surface temperature through ERDDAP glsea_avgtemps_3, dated and labeled satellite-derived, not a nearshore thermometer or upper-air instability.
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
