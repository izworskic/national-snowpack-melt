# Lake-Effect Snow: explain evidence instead of showing an ambiguous confidence grade

**Date:** November 1, 2026. **Owner:** `izworskic/national-snowpack-melt`. **Canonical:** https://chrisizworski.com/lake-effect-snow/. **Release state:** proposed; merge/production need independent verification.

## Problem and authoritative contract

A visitor read **"Evidence confidence: MEDIUM"** in November despite no NWS snow at the selected forecast checkpoint. Existing `lib/lake-effect.js` derives medium confidence from current NWS hourly coverage and available NOAA GLSEA temperature, *not* a 50% or medium chance of snow. The back-end confidence is intentionally retained for diagnostics, NWS prioritization and the weather engine; the visitor-facing presentation should make that distinction unmissable.

An actual November 1, 2026 check of Gaylord/Boyne country returned: **12/12 first-hourly slots**, **0 snow-forecast hours across 72**, **0 wind-alignment hours first 12**, a current NWS issuance, `level: limited` and `confidence: medium`. Those are *time- and checkpoint-specific* observations, not a seasonal rule.

## Alternatives and decision

A. Change the confidence algorithm seasonally so it reads LOW in fall. **Rejected:** it would silently redefine a qualitative completeness/concordance metric and incorrectly make seasonal timing a proxy for forecast skill or snow probability.

B. Explicitly separate **outlook / forecast coverage / snow forecast / NWS forecast freshness**, keeping the first 12h snow/wind overlap and official alert count. **Chosen:** the reader sees what the official forecast actually supports. The layout stays the current Lake-Effect Snow experience, not a generic extra dashboard, and adds no dependencies, routes, data feeds or map layers.

## Visitor-facing truth rules

- The outlook heading **"No snow signal identified"** is allowed only for a verified `limited` verdict with **72 distinct valid forecast hours**, explicit `official_snow_forecast: false`, and no winter warning/lake-effect alert. Otherwise preserve the official evaluated verdict heading.
- Coverage states the **first 12 valid hourly forecast slots** as `N of 12 hours`. It is not a forecast likelihood.
- If source-confirmed NWS snow exists, display **"NWS forecasts snow"** and the count of snow-forecast hours in the available 72h rows. This does *not* predict a precise lake-effect band.
- With a complete 72h series and **explicitly false** snow flag, display **"None at checkpoint"**, with the representative-point/nearby variability caveat.
- With an incomplete 72h series, if the first 12h are verified and snow is explicitly false, display **"None in available hours"** and **"N of 72 forecast hours available. Missing hours are unknown, not snow-free."** Never claim the entire 72h is clear.
- With insufficient/stale/unrecognized forecasts, show **"Not verified"**, not a positive or negative snow verdict.
- Only call the NWS forecast **"Current"** if its issued timestamp is not future by more than one hour and no older than 12 hours. This freshness is specific to the NWS forecast; NOAA lake readings and NWS alert-feed availability remain separate.
- Keep the existing warning count, source timestamp, method limitations, point alerts, map/radar, other decision engines, canonical, Person and ads unchanged. Internal `confidence` stays in API response.

## Distinctiveness and QA

This is a compact correction within a weather forecasting decision engine; it does not add a mandatory animation or port a park-guide template. Compared with the forecast's own discrete timeline and WPC/NDFD geography, the readout answers an upstream question: **what evidence is genuinely available to interpret those displays?**

Tests to run: `node --test tests/lake-effect*.test.js`, existing 360/390/768/1280 Chrome smoke with actual rendered source fixtures, full owner repository CI and NWS/NOAA live checks. Verify complete 72h no-snow, full snow-positive, partial 72h no-snow, stale/incomplete, keyboard/region change, source age and unchanged schema/canonical/ads. Inspect screenshot artifacts. Central-site mirror must adopt the reviewed source markup and load `lake-effect.js?v=20261101-2` after owner production is available. No visitor engagement impact or Core Web Vitals improvement is assumed.
