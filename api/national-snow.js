const { finite, sourceMeta } = require("@izworskic/national-outdoor-core");

const NOHRSC_BASE = "https://www.nohrsc.noaa.gov/nsa/discussions_text/National";
const AWDB_BASE = "https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1";
const NWS_POINTS = "https://api.weather.gov/points";
const UA = "ChrisIzworskiNationalSnow/1.0 (+https://chrisizworski.com/national-tools/snow/)";

const CONTEXT_RADIUS_MILES = 120;
const DECISION_RADIUS_MILES = 60;
const SNOTEL_RADIUS_MILES = 150;

async function fetchText(url, timeout = 4000) {
  const response = await fetch(url, {
    headers: { accept: "text/plain,*/*;q=0.8", "user-agent": UA },
    signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok) throw new Error(new URL(url).hostname + " returned " + response.status);
  return response.text();
}
async function fetchJson(url, timeout = 4000) {
  const response = await fetch(url, {
    headers: { accept: "application/geo+json,application/json", "user-agent": UA },
    signal: AbortSignal.timeout(timeout),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(new URL(url).hostname + " returned " + response.status);
  try { return JSON.parse(body); } catch (_) { throw new Error(new URL(url).hostname + " returned non-JSON"); }
}
function rad(v) { return Number(v) * Math.PI / 180; }
function miles(a, b, c, d) {
  const lat1 = finite(a, -90, 90), lon1 = finite(b, -180, 180), lat2 = finite(c, -90, 90), lon2 = finite(d, -180, 180);
  if ([lat1, lon1, lat2, lon2].some((v) => v == null)) return Infinity;
  const dl = rad(lat2 - lat1), dn = rad(lon2 - lon1);
  const x = Math.sin(dl / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dn / 2) ** 2;
  return 3958.7613 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
function round1(v) { return v == null ? null : Math.round(Number(v) * 10) / 10; }
function isoNohrsc(value) {
  const match = String(value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2})/);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]))).toISOString();
}
function nohrscRows(body) {
  const lines = String(body || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const out = [];
  for (const line of lines) {
    if (line.startsWith("!")) continue;
    if (/^Station_Id\|/i.test(line)) continue;
    const p = line.split("|");
    if (p.length < 9) continue;
    const latitude = finite(p[2], -90, 90), longitude = finite(p[3], -180, 180), amount = finite(p[7]);
    if (!p[0] || latitude == null || longitude == null || amount == null) continue;
    out.push({
      station_id: p[0],
      name: p[1] || p[0],
      latitude,
      longitude,
      elevation_ft: finite(String(p[4] || "").replace(/\s*feet/i, "")),
      physical_element: p[5] || null,
      observed_at: isoNohrsc(p[6]),
      amount,
      unit: p[8] || null,
      zip_code: p[9] || null,
    });
  }
  return out;
}
function nearest(rows, lat, lon, maxMiles) {
  return (rows || [])
    .map((row) => Object.assign({}, row, { distance_miles: miles(lat, lon, row.latitude, row.longitude) }))
    .filter((row) => Number.isFinite(row.distance_miles) && row.distance_miles <= maxMiles)
    .sort((a, b) => a.distance_miles - b.distance_miles)[0] || null;
}
function ymd(date) {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}
function reportAnchor(now = new Date()) {
  const anchor = new Date(now);
  if (anchor.getUTCHours() < 6) anchor.setUTCDate(anchor.getUTCDate() - 1);
  anchor.setUTCHours(6, 0, 0, 0);
  return anchor;
}
function nohrscUrl(variable, date) {
  const stamp = ymd(date);
  return NOHRSC_BASE + "/" + variable + "/" + stamp.slice(0, 6) + "/" + variable + "_" + stamp + "06_e.txt";
}
async function fetchNohrscReport(variable, startDate) {
  const start = new Date(startDate || reportAnchor());
  let lastError = null;
  for (let offset = 0; offset < 3; offset += 1) {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() - offset);
    const url = nohrscUrl(variable, date);
    try {
      const body = await fetchText(url, 3500);
      const rows = nohrscRows(body);
      if (rows.length) return { variable, date, url, rows };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("NOHRSC " + variable + " report unavailable");
}
function priorValue(current, priorRows) {
  if (!current) return null;
  const row = (priorRows || []).find((item) => item.station_id === current.station_id);
  return row || null;
}
function observationSummary(current, prior) {
  if (!current) return null;
  return {
    station_id: current.station_id,
    name: current.name,
    distance_miles: round1(current.distance_miles),
    elevation_ft: current.elevation_ft,
    observed_at: current.observed_at,
    value: round1(current.amount),
    unit: current.unit,
    change_24h: prior && finite(prior.amount) != null ? round1(current.amount - prior.amount) : null,
    previous_observed_at: prior && prior.observed_at || null,
    provisional: true,
  };
}
async function nohrscContext(lat, lon) {
  const anchor = reportAnchor();
  const [depthCurrent, sweCurrent] = await Promise.all([
    fetchNohrscReport("snowdepth", anchor),
    fetchNohrscReport("swe", anchor),
  ]);
  const priorDate = new Date(anchor);
  priorDate.setUTCDate(priorDate.getUTCDate() - 1);
  const [depthPrior, swePrior] = await Promise.allSettled([
    fetchNohrscReport("snowdepth", priorDate),
    fetchNohrscReport("swe", priorDate),
  ]);
  const depth = nearest(depthCurrent.rows, lat, lon, CONTEXT_RADIUS_MILES);
  const swe = nearest(sweCurrent.rows, lat, lon, CONTEXT_RADIUS_MILES);
  return {
    depth: observationSummary(depth, priorValue(depth, depthPrior.status === "fulfilled" ? depthPrior.value.rows : [])),
    swe: observationSummary(swe, priorValue(swe, swePrior.status === "fulfilled" ? swePrior.value.rows : [])),
    report_urls: { snow_depth: depthCurrent.url, swe: sweCurrent.url },
    report_date: depthCurrent.date.toISOString(),
  };
}
function awdbStationUrl(stateCode) {
  const state = /^[A-Z]{2}$/.test(String(stateCode || "").toUpperCase()) ? String(stateCode).toUpperCase() : "*";
  const q = new URLSearchParams({
    stationTriplets: "*:" + state + ":SNTL",
    elements: "WTEQ,SNWD",
    durations: "DAILY",
    returnStationElements: "false",
    activeOnly: "true",
  });
  return AWDB_BASE + "/stations?" + q.toString();
}
function awdbDataUrl(stationTriplet) {
  const q = new URLSearchParams({
    stationTriplets: stationTriplet,
    elements: "WTEQ,SNWD",
    duration: "DAILY",
    beginDate: "-7",
    endDate: "0",
    returnFlags: "true",
    returnSuspectData: "false",
  });
  return AWDB_BASE + "/data?" + q.toString();
}
function nearestSnotel(stations, lat, lon) {
  return nearest((Array.isArray(stations) ? stations : []).map((row) => ({
    station_id: row.stationId,
    station_triplet: row.stationTriplet,
    name: row.name,
    state_code: row.stateCode,
    network_code: row.networkCode,
    latitude: finite(row.latitude, -90, 90),
    longitude: finite(row.longitude, -180, 180),
    elevation_ft: finite(row.elevation),
  })).filter((row) => row.station_triplet && row.latitude != null && row.longitude != null), lat, lon, SNOTEL_RADIUS_MILES);
}
function awdbElement(payload, code) {
  const station = Array.isArray(payload) ? payload[0] : null;
  const data = station && Array.isArray(station.data) ? station.data : [];
  const item = data.find((entry) => String(entry && entry.stationElement && entry.stationElement.elementCode || "").toUpperCase() === code);
  const values = (item && Array.isArray(item.values) ? item.values : [])
    .filter((value) => finite(value && value.value) != null && value && value.date)
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  if (!values.length) return null;
  const latest = values[values.length - 1];
  const earlier = values.length > 1 ? values[Math.max(0, values.length - 4)] : null;
  return {
    value: round1(latest.value),
    observed_at: new Date(String(latest.date).replace(" ", "T") + (String(latest.date).includes("Z") ? "" : "Z")).toISOString(),
    change_3d: earlier ? round1(latest.value - earlier.value) : null,
    qc_flag: latest.qcFlag || null,
    qa_flag: latest.qaFlag || null,
    unit: item && item.stationElement && item.stationElement.storedUnitCode || "in",
  };
}
async function snotelContext(lat, lon, stateCode) {
  const stationListUrl = awdbStationUrl(stateCode);
  const stations = await fetchJson(stationListUrl, 5000);
  const station = nearestSnotel(stations, lat, lon);
  if (!station) return { station: null, snow_depth: null, swe: null, station_list_url: stationListUrl, data_url: null };
  const dataUrl = awdbDataUrl(station.station_triplet);
  const data = await fetchJson(dataUrl, 3500);
  return {
    station: {
      id: station.station_id,
      triplet: station.station_triplet,
      name: station.name,
      state_code: station.state_code,
      elevation_ft: station.elevation_ft,
      distance_miles: round1(station.distance_miles),
    },
    snow_depth: awdbElement(data, "SNWD"),
    swe: awdbElement(data, "WTEQ"),
    station_list_url: stationListUrl,
    data_url: dataUrl,
  };
}
function tempF(value, unit) {
  const n = finite(value);
  if (n == null) return null;
  return String(unit || "F").toUpperCase() === "C" ? n * 9 / 5 + 32 : n;
}
function forecastSummary(periods, updatedAt) {
  const hours = (Array.isArray(periods) ? periods : []).slice(0, 48).map((p) => {
    const text = String(p.shortForecast || "").toLowerCase();
    return {
      time: p.startTime || null,
      temperature_f: round1(tempF(p.temperature, p.temperatureUnit)),
      precipitation_probability: finite(p.probabilityOfPrecipitation && p.probabilityOfPrecipitation.value, 0, 100),
      short_forecast: p.shortForecast || null,
      snow: /\bsnow|snow shower|flurr/.test(text),
      rain: /\brain|shower|drizzle/.test(text) && !/snow/.test(text),
    };
  }).filter((p) => p.time && p.temperature_f != null);
  const temps = hours.map((h) => h.temperature_f);
  const above = hours.filter((h) => h.temperature_f > 32).length;
  const freezing = hours.filter((h) => h.temperature_f <= 32).length;
  const warm = hours.filter((h) => h.temperature_f >= 40).length;
  const snow = hours.filter((h) => h.snow).length;
  const rain = hours.filter((h) => h.rain).length;
  let firstRefreeze = null, firstThaw = null;
  for (let i = 1; i < hours.length; i += 1) {
    if (!firstThaw && hours[i - 1].temperature_f <= 32 && hours[i].temperature_f > 32) firstThaw = hours[i].time;
    if (!firstRefreeze && hours[i - 1].temperature_f > 32 && hours[i].temperature_f <= 32) firstRefreeze = hours[i].time;
  }
  return {
    updated_at: updatedAt || null,
    hours: hours.length,
    max_temperature_f: temps.length ? round1(Math.max(...temps)) : null,
    min_temperature_f: temps.length ? round1(Math.min(...temps)) : null,
    above_freezing_hours: above,
    freezing_hours: freezing,
    warm_40f_hours: warm,
    snow_signal_hours: snow,
    rain_signal_hours: rain,
    first_thaw_time: firstThaw,
    first_refreeze_time: firstRefreeze,
    periods: hours.slice(0, 12),
  };
}
async function nwsForecast(lat, lon) {
  const pointsUrl = NWS_POINTS + "/" + Number(lat).toFixed(3) + "," + Number(lon).toFixed(3);
  const points = await fetchJson(pointsUrl, 3000);
  const hourlyUrl = points && points.properties && points.properties.forecastHourly;
  if (!hourlyUrl) throw new Error("NWS hourly forecast link unavailable");
  const hourly = await fetchJson(hourlyUrl, 3500);
  return {
    forecast: forecastSummary(hourly && hourly.properties && hourly.properties.periods, hourly && hourly.properties && hourly.properties.updated),
    points_url: pointsUrl,
    hourly_url: hourlyUrl,
  };
}
function choosePack(nohrsc, snotel) {
  const candidates = [];
  if (nohrsc && nohrsc.depth) candidates.push({ source: "NOAA/NOHRSC", kind: "depth", distance_miles: nohrsc.depth.distance_miles, value: nohrsc.depth.value, change: nohrsc.depth.change_24h, unit: nohrsc.depth.unit, station: nohrsc.depth.name });
  if (nohrsc && nohrsc.swe) candidates.push({ source: "NOAA/NOHRSC", kind: "swe", distance_miles: nohrsc.swe.distance_miles, value: nohrsc.swe.value, change: nohrsc.swe.change_24h, unit: nohrsc.swe.unit, station: nohrsc.swe.name });
  if (snotel && snotel.station && snotel.snow_depth) candidates.push({ source: "NRCS SNOTEL", kind: "depth", distance_miles: snotel.station.distance_miles, value: snotel.snow_depth.value, change: snotel.snow_depth.change_3d, unit: snotel.snow_depth.unit, station: snotel.station.name });
  if (snotel && snotel.station && snotel.swe) candidates.push({ source: "NRCS SNOTEL", kind: "swe", distance_miles: snotel.station.distance_miles, value: snotel.swe.value, change: snotel.swe.change_3d, unit: snotel.swe.unit, station: snotel.station.name });
  const positive = candidates.filter((c) => c.value > 0).sort((a, b) => a.distance_miles - b.distance_miles);
  const any = candidates.sort((a, b) => a.distance_miles - b.distance_miles);
  return positive[0] || any[0] || null;
}
function changeLanguage(nohrsc, snotel) {
  const pieces = [];
  const depth = nohrsc && nohrsc.depth;
  const swe = nohrsc && nohrsc.swe;
  if (depth && depth.change_24h != null && Math.abs(depth.change_24h) >= 0.5) pieces.push("NOHRSC snow depth " + (depth.change_24h > 0 ? "rose " : "fell ") + Math.abs(depth.change_24h).toFixed(1) + " in over roughly 24 hours at " + depth.name);
  if (swe && swe.change_24h != null && Math.abs(swe.change_24h) >= 0.1) pieces.push("NOHRSC SWE " + (swe.change_24h > 0 ? "rose " : "fell ") + Math.abs(swe.change_24h).toFixed(1) + " in over roughly 24 hours at " + swe.name);
  if (!pieces.length && snotel && snotel.station) {
    if (snotel.snow_depth && snotel.snow_depth.change_3d != null && Math.abs(snotel.snow_depth.change_3d) >= 0.5) pieces.push("SNOTEL snow depth " + (snotel.snow_depth.change_3d > 0 ? "rose " : "fell ") + Math.abs(snotel.snow_depth.change_3d).toFixed(1) + " in over the recent multi-day comparison");
    if (snotel.swe && snotel.swe.change_3d != null && Math.abs(snotel.swe.change_3d) >= 0.1) pieces.push("SNOTEL SWE " + (snotel.swe.change_3d > 0 ? "rose " : "fell ") + Math.abs(snotel.swe.change_3d).toFixed(1) + " in over the recent multi-day comparison");
  }
  return pieces.length ? pieces.join(". ") + "." : "A comparable recent measured snowpack change is unavailable nearby.";
}
function decision(nohrsc, snotel, forecast) {
  const pack = choosePack(nohrsc, snotel);
  const representative = pack && pack.distance_miles <= DECISION_RADIUS_MILES;
  const f = forecast || {};
  const snowIncoming = (f.snow_signal_hours || 0) >= 3;
  if (!representative || !(pack && pack.value > 0)) {
    if (snowIncoming) return {
      level: "snow-possible",
      headline: "Snow appears in the 48-hour forecast, but current measured pack is not verified nearby",
      detail: "The weather signal is local to the searched point. Nearby measured snowpack is either absent or too far away to support a local pack-phase conclusion.",
      melt_pressure: "not-evaluated",
      confidence: "low",
      what_changed: changeLanguage(nohrsc, snotel),
      what_next: (f.snow_signal_hours || 0) + " of the next " + (f.hours || 48) + " forecast hours contain a snow signal.",
    };
    return {
      level: "pack-unverified",
      headline: "No nearby measured snowpack is close enough for a local melt conclusion",
      detail: pack ? "The nearest measured snow signal is about " + round1(pack.distance_miles) + " miles away. It is shown as regional context only." : "No measured NOHRSC or SNOTEL snowpack observation was found within the context radius.",
      melt_pressure: "not-evaluated",
      confidence: "low",
      what_changed: changeLanguage(nohrsc, snotel),
      what_next: f.hours ? "The 48-hour NWS weather pattern is available, but it is not converted into a melt conclusion without nearby measured pack." : "The next-period weather signal is unavailable.",
    };
  }

  let level = "pack-holding", headline = "Measured snowpack is present; the next 48 hours do not show a strong melt signal", melt = "low-to-moderate";
  if ((f.rain_signal_hours || 0) >= 3 && (f.above_freezing_hours || 0) >= 20 && (f.max_temperature_f || -99) >= 40) {
    level = "melt-pressure-high";
    headline = "Warm, rainy weather creates elevated melt pressure over the next 48 hours";
    melt = "elevated";
  } else if ((f.warm_40f_hours || 0) >= 12 || ((f.above_freezing_hours || 0) >= 24 && (f.max_temperature_f || -99) >= 38)) {
    level = "melt-pressure-moderate";
    headline = "Sustained above-freezing weather favors continued snowpack loss";
    melt = "moderate";
  } else if ((f.snow_signal_hours || 0) >= 4 && (f.max_temperature_f || 99) <= 36) {
    level = "accumulation-supportive";
    headline = "Cold weather and forecast snow favor pack retention or gain";
    melt = "low";
  } else if ((f.above_freezing_hours || 0) >= 6 && (f.freezing_hours || 0) >= 6) {
    level = "freeze-thaw";
    headline = "A freeze-thaw cycle is likely within the next 48 hours";
    melt = "variable";
  } else if ((f.above_freezing_hours || 0) <= 4 && (f.max_temperature_f || 99) <= 34) {
    level = "cold-hold";
    headline = "Mostly freezing temperatures favor snowpack retention";
    melt = "low";
  }
  const confidence = pack.distance_miles <= 25 ? "high" : "medium";
  const nextBits = [];
  if (f.max_temperature_f != null) nextBits.push("48-hour high " + f.max_temperature_f.toFixed(1) + "°F");
  if (f.above_freezing_hours != null) nextBits.push(f.above_freezing_hours + " hours above freezing");
  if (f.rain_signal_hours) nextBits.push(f.rain_signal_hours + " rain-signal hours");
  if (f.snow_signal_hours) nextBits.push(f.snow_signal_hours + " snow-signal hours");
  return {
    level,
    headline,
    detail: "This is a weather-driven interpretation using nearby measured snowpack plus the local NWS hourly forecast. It is not an agency snowmelt forecast or a trail-surface report.",
    melt_pressure: melt,
    confidence,
    pack_basis: pack,
    what_changed: changeLanguage(nohrsc, snotel),
    what_next: nextBits.length ? nextBits.join(" · ") + "." : "48-hour forecast detail is limited.",
  };
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=900");
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const lat = finite(req.query && req.query.lat, -90, 90), lon = finite(req.query && req.query.lon, -180, 180);
  if (lat == null || lon == null) return res.status(400).json({ error: "Valid latitude and longitude are required" });
  const state = String(req.query && req.query.state || "").toUpperCase();

  const settled = await Promise.allSettled([
    nohrscContext(lat, lon),
    snotelContext(lat, lon, state),
    nwsForecast(lat, lon),
  ]);
  const nohrsc = settled[0].status === "fulfilled" ? settled[0].value : null;
  const snotel = settled[1].status === "fulfilled" ? settled[1].value : null;
  const nws = settled[2].status === "fulfilled" ? settled[2].value : null;
  const forecast = nws && nws.forecast || null;
  const verdict = decision(nohrsc, snotel, forecast);
  const pack = choosePack(nohrsc, snotel);
  const packAvailable = Boolean(pack && pack.value > 0);
  const snowRelevant = packAvailable || Boolean(forecast && forecast.snow_signal_hours > 0);

  const nohrscUpdated = [nohrsc && nohrsc.depth && nohrsc.depth.observed_at, nohrsc && nohrsc.swe && nohrsc.swe.observed_at].filter(Boolean).sort().at(-1) || null;
  const snotelUpdated = [snotel && snotel.snow_depth && snotel.snow_depth.observed_at, snotel && snotel.swe && snotel.swe.observed_at].filter(Boolean).sort().at(-1) || null;
  const sources = [
    sourceMeta({
      name: "NOAA/NOHRSC National Snow Analyses station observations",
      url: nohrsc && (nohrsc.report_urls.snow_depth || nohrsc.report_urls.swe) || "https://www.nohrsc.noaa.gov/nsa/",
      updatedAt: nohrscUpdated,
      staleAfterMinutes: 1440,
      available: Boolean(nohrsc && (nohrsc.depth || nohrsc.swe)),
      status: settled[0].status === "rejected" ? "unavailable" : "provisional-observation",
    }),
    sourceMeta({
      name: "USDA NRCS AWDB / SNOTEL",
      url: snotel && (snotel.data_url || snotel.station_list_url) || "https://wcc.sc.egov.usda.gov/awdbRestApi/swagger-ui.html",
      updatedAt: snotelUpdated,
      staleAfterMinutes: 2880,
      available: Boolean(snotel && snotel.station && (snotel.snow_depth || snotel.swe)),
      status: settled[1].status === "rejected" ? "unavailable" : null,
    }),
    sourceMeta({
      name: "NOAA/NWS hourly forecast",
      url: nws && nws.hourly_url || "https://api.weather.gov/",
      updatedAt: forecast && forecast.updated_at,
      staleAfterMinutes: 360,
      available: Boolean(forecast && forecast.hours),
      status: settled[2].status === "rejected" ? "unavailable" : null,
    }),
  ];

  return res.status(200).json({
    retrieved_at: new Date().toISOString(),
    degraded: settled.some((item) => item.status === "rejected"),
    snow_relevant: snowRelevant,
    pack_available: packAvailable,
    context_radius_miles: CONTEXT_RADIUS_MILES,
    decision_radius_miles: DECISION_RADIUS_MILES,
    location: { latitude: lat, longitude: lon, stateCode: /^[A-Z]{2}$/.test(state) ? state : null },
    decision: verdict,
    nohrsc: nohrsc,
    snotel: snotel,
    forecast_48h: forecast,
    sources,
    limitations: [
      "NOHRSC station observations are unofficial and provisional; station conditions may not represent the searched point.",
      "SNOTEL coverage is concentrated in snow-monitoring regions and is not treated as nationwide point coverage.",
      "A measured station beyond 60 miles is regional context only and cannot drive a local pack-phase conclusion.",
      "Melt pressure is a transparent weather-driven interpretation of measured snowpack plus NWS forecast temperatures and precipitation wording; it is not a NOAA or NRCS snowmelt forecast.",
      "This tool does not report avalanche danger, groomed-trail condition, road access, ice safety or a universal go/no-go recreation score.",
      "Missing snowpack data stays unavailable rather than being converted to zero snow or favorable conditions.",
    ],
  });
};

module.exports._test = {
  awdbDataUrl,
  awdbElement,
  awdbStationUrl,
  choosePack,
  decision,
  forecastSummary,
  miles,
  nearest,
  nearestSnotel,
  nohrscContext,
  nohrscRows,
  nohrscUrl,
  nwsForecast,
  observationSummary,
  reportAnchor,
  snotelContext,
};
