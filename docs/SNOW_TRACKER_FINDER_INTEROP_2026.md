# Michigan Snow Finder ⇄ National Snowpack Tracker

Date: October 21, 2026. Status: **draft PR**; source-unit and independent Michigan snowpack validation gates remain.

## Distinct jobs, one origin
- National tracker: `/national-tools/snow/` — regional measured NOAA/NOHRSC station depth, SWE, SNOTEL when available, and an NWS-derived 48h melt/refreeze interpretation.
- Michigan finder: `/michigan-snow-depth/` — spatial 1km modeled depth discovery, station checks, recent snowfall, future survival and road-time filtering.
- Michigan snow totals: `/michigan-snow-totals/` — actual new snowfall reports. **Not** depth and not a third finder.
- The snow finder and the national tracker live in the same extraction repository and already share upstream sources. Avoid repeating national snow logic or merging canons.

## Implemented low-cost interoperability (this PR)
1. Each snow-zone result links to `/national-tools/snow/?lat=<point>&lon=<point>&place=<text>&state=MI`; the national page directly queries the provided coordinates rather than geocoding a nearby town. Optional `?q=<city>` behavior is preserved.
2. Optional on-demand disclosure per Michigan result retrieves nearby **dated measured station** depth from `/api/michigan-snow-ground-evidence`. The visitor opens this disclosure intentionally; the ranking request does not incur any new upstream calls.
3. The station panel makes no changes to score or snow/no-snow verdict, does not display unvalidated IMS classification, and says when no recent station reading is available.
4. The Michigan results footer separately displays the NOAA analysis valid time (when present) and the retrieval time.
5. Cross-origin read-only endpoint is explicitly allowlisted for the primary canonical website and preview website. No new paid API, no Redis/Upstash, no cron, no build-trigger integration.

## Validation hold
- NOHRSC raster native SNOD meters and WEASD kg/m² conversions are corrected and regression tested, but **do not merge** until 10+ snow-covered Michigan station/date comparisons validate numerical behavior.
- IMS class disagreement near Gaylord requires geospatial/class code reconciliation before feeding snow rankings or user displays.
- Do not assert measured snowpack at snow-zone location from reports some miles away.
- Snowmobile trail base and XC grooming remain separate specialty tools; the national tracker gives weather and measured depth context, not trail certification.
- Open-source OSRM demo usage and final legal-access/parking verification remain separate release blockers for a full statewide trip recommender.

## Acceptance
- No second canonical duplicate snow page.
- Exact spatial point survives the trip-finder → national checker handoff.
- Both tools are still usable independently.
- Station requests are lazy and source failures are fail-soft.
- Data access is local to source repo and read-only; no duplicated score engine.
- CI and preview must pass before any merge.


## Release readiness / dated winter backtest (2026-10-21)
A one-off PR-only GitHub Action successfully downloaded the official NSIDC G02158 masked NOAA SNODAS daily depth archive and compared the 1km pixel at Michigan station coordinates with same-date ACIS SNWD observations. The script remains at \`scripts/validate-snow-history.py\`, but its action was deliberately **removed from routine CI** after the successful one-time run to avoid repeated 80 MB downloads.

| Model date | Michigan nonzero station pairs | Mean absolute difference | Median absolute difference | P90 absolute difference | Zero-snow station cases / model >=3in |
| Jan 15, 2026 | 202 | 2.01in | 1.44in | 4.50in | 16 / 1 |
| Feb 15, 2026 | 195 | 2.01in | 1.04in | 4.77in | 11 / 2 |
| Mar 15, 2026 | 124 | 5.03in | 3.38in | 12.28in | 66 / 0 |
| Apr 01, 2026 | 66 | 4.42in | 2.63in | 14.00in | 148 / 2 |
| **Total** | **587** | — | — | — | **241 / 5** |

GitHub Actions source logs: https://github.com/izworskic/national-snowpack-melt/actions/runs/39596189268

Interpretation: Date-aligned checks include some stations assimilated into the NOAA analysis, and station timestamps do not perfectly match the ~06UTC grid. These comparisons **do not demonstrate independent predictive skill**. They do support a conservative rule: a model-only 1km depth receives lower confidence when thaw or rain is forecast. The existing forecast-survival penalty remains separate.

New routing gate: If the top-rated Michigan candidate has only approximate road time, or its spatial road-snap failed, the backend labels the verdict \`route-unverified\` and the UI does not assert a verified drive-time window. These unverified points cannot be presented as a confident "best snow within X hours" verdict.

The main website references a versioned externally hosted Michigan JS asset. Before release, review cache invalidation/version update with the site-shell repo. Protected preview browser navigation has not been independently tested.


## Public destination release strategy
Official Michigan DNR and operator pages document Hartwick Pines, Young State Park, Tahquamenon Falls, Hoffmaster and Porcupine Mountains Winter Sports Complex as public recreation destinations with snowshoe/XC/winter experiences. The sampled coordinate is the **park or venue vicinity**, not a surveyed parking stall. Parking, trail grooming, closures, posted rules and plowing must still be checked on the official page.

Porkies **winter road closure**: approach the winter sports complex from the east via M-64; South Boundary Road is not plowed and closes to vehicle use during winter, per https://www.michigan.gov/skitheporkies/plan-your-visit. The resort ski chalet sampling point matches DNR's archived N46°49.080' W89°39.010' public GPS list. Model-only raw pixels can never generate a navigation destination.

The OSRM public demo is never called in the runtime itinerary flow. Directions use Google Maps to the official named public address; internal drive durations remain labeled **estimated**, and the verdict cannot claim a verified time-window reachability. NOAA snow zones remain *observation-only* map overlays.

The map is click-to-load, CARTO keyed via main site's existing \`/api/carto-basemap-config\`, with venue popup/official source/directions, observation-only hollow pins, and a no-tiles fallback to the destination list.

## Final browser verification and release preparation, Oct 21 2026
After two harness-only fixes, the one-time Playwright Chromium job
https://github.com/izworskic/national-snowpack-melt/actions/runs/39600220745
passed at 390px and 1280px, with checked keyed CARTO tiles and lazy ground-station reads (one station request per opened panel), no horizontal overflow, no console page errors, and successful exact-coordinate national-snow handoff. The repository unit/integration suite passed 68/68.

The protected Vercel preview itself was not opened in this browser run. Instead Chromium served the exact checked-in Michigan page HTML fixture with the snow repository's current branch assets and deterministic NOAA fixture JSON. This proves browser behavior independently of live backend availability. Use a post-merge production smoke to confirm integration of both Vercel repositories.

Release strategy: keep `scripts/snow-browser-qa.cjs` as an opt-in script but remove the temporary Chromium download from the normal GitHub workflow so future merges have no browser-install cost. All recommendations remain public venues with **unverified parking** and **estimated driving times**. NOAA raster pixels are observation-only map elements and cannot be used for directions.
