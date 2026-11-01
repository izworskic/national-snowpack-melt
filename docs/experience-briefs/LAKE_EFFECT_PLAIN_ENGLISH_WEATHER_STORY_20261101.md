# Lake-Effect Snow — plain-English weather story pilot (Experience OS v1.2)

**November 1, 2026.** Owning tool: `izworskic/national-snowpack-melt`. Canonical: https://chrisizworski.com/lake-effect-snow/.

## The visitor's question

“What does this mean for my town? Should I expect snow, what could change, and what should I check before going out?” A technical confidence score or wind chart alone cannot answer that.

This is **meteorologist-style explanatory writing**, not a claim that a credentialed meteorologist authored or issued the automated reading. The new section says so clearly.

## Editorial approach

Add one purpose-built `The weather story` after the primary NWS forecast and coverage summary. Three compact statements: **what the forecast says / why it matters / what to watch next**. No second generic hero, new animation, library, API call, data dependency or extra SEO page. Rewrite static hero and forecast-explainer introductory copy into helpful, everyday language.

Use public NWS scientific guidance for explanations:

- https://www.weather.gov/safety/winter-lake-effect-snow
- https://www.weather.gov/apx/les
- https://www.weather.gov/grr/windAndLakeEffectSnow

Lake-effect snow needs favorable conditions, not warm lake water alone. Wind direction affects where narrow bands may form, sometimes dramatically from town to town. Surface-wind alignment is **not** an official NWS snow forecast or a verified future band path.

## Deterministic evidence ladder

1. Active NWS winter warning: lead with the warning, boundaries, expiration and route precautions.
2. NWS alert explicitly mentioning lake effect: lead with the official alert, not an invented hour-by-hour band.
3. Incomplete/stale NWS evidence: explicitly say reliable reading isn't possible. Do not call missing hours clear.
4. Official NWS snow with favored regional wind and adequate coverage: explain the setup while emphasizing that the precise band and impacts are unknown.
5. Official NWS snow without aligned wind: snow is possible per NWS, but the origin is unconfirmed.
6. Wind-only: wind is one ingredient; do not promote to forecast snow.
7. Verified snow-free 72h *at one checkpoint*: say the NWS point forecast is quiet, not that every town is safe or snow-free.
8. Partial 72h with no snow in available hours: disclose the exact number of available hours and call all missing hours unknown.
9. Unclassified: no confident claims.

All narratives use current `verdict`, `forecast_updated`, `hours` and `region`; never inference from season/month alone. If NWS alert feed is unavailable, append the explicit alert-check caveat. No snow accumulation predictions, percent probabilities or travel-safety assurances.

## QA and release contract

- Retain source verdict logic and internal confidence scoring unchanged.
- Browser verify 360, 390, 768 and 1280px for snow+wind, no snow, partial forecast, stale data and active warning. Ensure changing region updates all three narrative lines, including returning to a previous region. Screenshot primary verdict panel. Check no page overflow, accessible DOM text, no JS regression or console errors.
- NWS/NOAA live-source smoke and unit tests must pass. Preview screenshots require human review; no numerical visitor comprehension uplift claim.
- Owning source updates first; then change only HTML/copy and the remote `lake-effect.js` cache version on the central site's self-canonical mirror. Keep distinct hero markup, no schema/Person/canonical/Ads modifications.
