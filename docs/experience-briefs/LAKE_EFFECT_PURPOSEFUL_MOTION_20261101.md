# Lake-Effect Snow purposeful-motion pilot — Experience OS v1.2

**Date:** 2026-11-01. **Owner:** `izworskic/national-snowpack-melt`. **Canonical:** https://chrisizworski.com/lake-effect-snow/. **Source baseline:** `c0a18d74d840cf9c4a6c2bccff408ae703b83fc6`. **Status:** proposed PR; production and human usability not yet verified.

## Visitor question

When, over the next 72 hours, do the supporting NWS snow-and-wind signals change between two representative snowbelt points? One instant on the slider should change the forecast comparison, source-backed status, mapped point markers and a discrete evidence overview.

## Existing source and limits

Existing `public/assets/lake-effect-time-lens.js` checks 72 NWS hourly forecast rows and separate point forecasts through `/api/lake-effect`. Existing official geographic layers use NOAA/NDFD six-hour grid images and distinct WPC 24-hour probability contours. This pilot modifies **neither source**, neither data model, nor the static HTML/canonical. The motion does not depict narrow lake-effect snowbands, travel safety or exact accumulation. Wind-only is never forecast snow; absent/stale hours are unknown, not clear weather.

Primary source: https://www.weather.gov/documentation/services-web-api ; WPC https://www.wpc.ncep.noaa.gov/wwd/winter_wx.shtml ; NOAA NDFD https://digital.weather.gov/ ; original source evaluation in `docs/LAKE_EFFECT_DECISION_BRIEF_2026.md`.

## Design alternatives

**A: Full animated contour overlay.** Rejected because NWS point forecasts contain no geographic snowband path; tweening contours implies unsupported spatial predictions, likely costs more CPU and makes maps inaccessible without tiles.

**B: Evidence ribbon with a moving selection needle (selected).** Two rows of 24 **discrete three-hour samples** from the same NWS point forecasts, visually encoding snow+aligned wind, snow-only, wind-only, neither, or unknown. The existing slider drives a tiny CSS needle. Source-backed comparison text and optional map remain authoritative. No library, no auto-play added, no new weather claims. Allows visitors to see future signal intervals without mentally scrubbing all 24 positions.

**External inspiration:** WCAG animation-from-interactions (https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions), Motion performance guidance (https://motion.dev/docs/performance); both accessed 2026-11-01 for design principles only. No appearance/code copied.

## Interaction contract and scenarios

| Action | State and data | Visible change | Fallback/test |
| --- | --- | --- | --- |
| Select +18h by keyboard | `lead=6`, exact NWS forecast instant | Needle advances, selected answer + point marker states update | Existing native slider and text; browser smoke |
| Switch comparison Oswego → Buffalo → Oswego | One `choice` with abort/token guard | New 24-block row, unknown until verified; previous response cannot overwrite new | Failed API shows 24 unknown samples; browser smoke |
| No valid hours or stale issued forecast | Per-point `verified()` and `signal()` | Hatched unknown; 0 confidence claims | Unit tests on absent/stale exact hours |
| Prefers reduced motion | CSS and media preference | Stationary immediate needle changes; manual slider works; playback disabled/stops | Browser media emulation |
| JS unavailable / map blocked | Existing static introduction, official links and separate base hourly tool | No ribbon; source answer unaffected | No production HTML changes; browser QA required |

## Distinctiveness

Compared with Tahquamenon Falls and Sleeping Giant, this is a **forecast verification** instrument rather than immersive park storytelling or trail choice. Compared with Lake-Effect Snow's own NOAA 6-hour *geographic* grid, the ribbon is a dual **point observation of forecast evidence**: it never draws continuous movement across a map. Its two-color-band plus time needle addresses the precise question of *when comparisons diverge*.

## Acceptance and limits

- Unit: exactly 24 sampled instants, three-hour valid-time spacing; missing and stale fail closed; no invented intermediate data.
- Browser: A→B→A, slider keyboard, visual needle, map remains optional, reduced motion, unavailable source, 360/390/768/1280 screenshots and overflow checks in existing smoke.
- Performance: native JS and scoped CSS only, no new asset or dependency; field LCP/INP/CLS **NOT MEASURED**. Human comprehension and real-device benefit **NOT MEASURED**.
- Site integrity: no change to canonical/Person/ads/sitemap or new public route. Independent production smoke and CI are **NOT VERIFIED** until executed. Do not merge while checks fail.
- Experience OS scores: **NOT MEASURED** until actual browser artifacts and human review are inspected.

**Proposed lesson:** meaningful movement can follow a *verified selection* while the forecast remains an honest sequence of discrete samples, not a video of invented weather.
