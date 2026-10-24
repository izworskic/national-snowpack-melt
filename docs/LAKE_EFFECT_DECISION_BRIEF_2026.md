# Lake-effect decision brief · 2026-10-24

## User decision
The data already contains 72 hourly NWS rows and separate offshore GFS pressure-level snapshots, but users should not need to interpret every marker to answer *when is it worth checking the forecast again?* The new briefing sits **inside the existing hourly forecast panel** (no extra ad-bearing panel boundary). It produces a conservative, NWS-first decision summary and selected-window state.

## Truth and evidence hierarchy
1. **Active NWS warning** at the representative point: dominant; tell users to review its actual geography/expiration. Never imply it remains active in a later 12–72h window.
2. **Fresh and reasonably covered NWS forecast:** within a chosen window, at least 60% of expected hourly rows (and at least six) are necessary for a status; current first 12h must also meet upstream `verdict.data_ok`. An unrepresented hour is **unknown**, not snow-free.
3. **Snow in NWS short forecast + locally aligned surface wind:** at least two hours in a covered window for *converging signals*, a window to monitor, not a forecast band or trip recommendation.
4. **NWS snow without aligned surface wind:** official snow forecast but no corroborating regional lake-effect wind screen.
5. **Wind-only:** explicitly no NWS snow forecast; GFS does not promote it into a snow event.
6. **No NWS snow in the available hourly rows:** state the number of available rows and coverage gaps; never present certainty of clear weather.
7. **Alerts unavailable:** separate explicit verification warning regardless of apparent forecast quiet.
8. **GFS only:** contextual 850mb/925mb chart readings; cannot fabricate snow or override NWS.

## Interaction and SEO
- Every window selector shows real evidence kind and hourly coverage, not a fabricated percentage or abstract score.
- Window links use `?region=<15-known-ids>&window=next-12h|12-24h|24-48h|48-72h#forecast-explainer`. HTML canonical remains `https://chrisizworski.com/lake-effect-snow/`.
- Direct links restore the selected forecast window after fresh data loads. Switching region clears the prior region's selected window to avoid miscontextualized explanations.
- Clipboard copy runs only after a click. Permission failure gives a real alternative (open the link); never claims a successful copy.
- No chart CDN, new ad break, paid API, cron, data cache or backend calls.
- GFS chart legend discloses the NOAA GLSEA lakewide water reading is a single **dated snapshot held constant across lead times**, not a predicted future water temperature.

## Loss function (release acceptance)
| Risk | Gate |
| --- | --- |
| False lake-effect claim | Never produce an NWS-snow status from wind or GFS alone; require NWS snow forecast |
| False absence from missing rows | `coverage < 60%` or `<6` -> gap; count checked rows; no zero-risk language |
| Misleading official hazard | Active NWS warning dominates; cite time/coverage limitations |
| UI friction | Decision visible before technical plots; one click switches window; URL opens same window |
| Broken regional context | Changing region resets old window context |
| Unsupported charts | Stale GFS plots empty, NWS panels remain |
| Mobile horizontal overflow | Browser tests at 390px and 1280px: body scrollWidth ≤ viewport+2 |
| Operational cost | No new API request, packages, Vercel cron, or extra build output required |

## Source interpretation
NWS Gaylord: https://www.weather.gov/apx/les and https://www.weather.gov/apx/lake_snow_parameter . The Lake Snow Parameter guidance specifically emphasizes spatial and temporal trends, not treating an index as proof snow will occur. Interpretation uses real hourly NWS forecast words and time-window alignment while retaining point-level caveats.
