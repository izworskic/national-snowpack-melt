const MAPSERVER = "https://mapservices.weather.noaa.gov/raster/rest/services/snow/NOHRSC_Snow_Analysis/MapServer";
const DEPTH_LAYER = 3;
const SWE_LAYER = 7;
const MAX_ANALYSIS_AGE_MS = 36 * 3600e3;

function finite(v, min = -Infinity, max = Infinity) {
  if (v == null || v === "") return null;
  const n = Number.parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

function round1(v) {
  return v == null ? null : Math.round(Number(v) * 10) / 10;
}

function identifyUrl(lat, lon) {
  const y = finite(lat, -90, 90), x = finite(lon, -180, 180);
  if (x == null || y == null) throw new Error("valid latitude and longitude required");
  const pad = 0.06;
  const params = new URLSearchParams({
    geometry: `${x},${y}`,
    geometryType: "esriGeometryPoint",
    sr: "4269",
    layers: `all:${DEPTH_LAYER},${SWE_LAYER}`,
    tolerance: "1",
    mapExtent: `${x-pad},${y-pad},${x+pad},${y+pad}`,
    imageDisplay: "256,256,96",
    returnGeometry: "false",
    f: "json"
  });
  return `${MAPSERVER}/identify?${params}`;
}

function resultForLayer(payload, layerId) {
  const results = Array.isArray(payload && payload.results) ? payload.results : [];
  return results.find(r => Number(r && r.layerId) === layerId) || null;
}

// Live NOHRSC ArcGIS identify returns the *native* GRIB field "Service Pixel Value".
// SNOD is meters. WEASD is kg/m² (1 kg/m² = 1 mm liquid water). The
// similarly named "Classify.Pixel Value" and its class index are for map
// rendering and MUST NOT be treated as measured inches.
function pixelValue(result, max) {
  if (!result) return null;
  const raw = result.attributes && result.attributes["Service Pixel Value"];
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
}

function parseIdentify(payload) {
  const meters = pixelValue(resultForLayer(payload, DEPTH_LAYER), 7.62); // 300 inches
  const kgPerM2 = pixelValue(resultForLayer(payload, SWE_LAYER), 2540); // 100 inches water
  return {
    depth_inches: meters == null ? null : round1(meters * 39.37007874015748),
    swe_inches: kgPerM2 == null ? null : round1(kgPerM2 / 25.4)
  };
}

function arcDate(value) {
  if (value == null) return null;
  const numeric = Number(value);
  const d = Number.isFinite(numeric) ? new Date(numeric) : new Date(value);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function metadataUrl() {
  const params = new URLSearchParams({
    where: "1=1",
    outFields: "idp_validtime,idp_ingestdate,idp_filedate,idp_issueddate",
    returnGeometry: "false",
    f: "json"
  });
  return `${MAPSERVER}/2/query?${params}`;
}

function latestDate(values) {
  return values.map(arcDate).filter(Boolean).sort().at(-1) || null;
}

function parseMetadata(payload) {
  const features = Array.isArray(payload && payload.features) ? payload.features : [];
  const rows = features.map(f => f && f.attributes || {});
  return {
    valid_at: latestDate(rows.map(a => a.idp_validtime)),
    updated_at: latestDate(rows.flatMap(a => [a.idp_ingestdate, a.idp_filedate, a.idp_issueddate]))
  };
}

function isStale(meta, nowMs = Date.now(), maxAgeMs = MAX_ANALYSIS_AGE_MS) {
  const valid = Date.parse(meta && meta.valid_at);
  return !Number.isFinite(valid) || nowMs - valid > maxAgeMs || valid - nowMs > 6 * 3600e3;
}

async function mapLimit(items, limit, fn) {
  const input = Array.from(items || []);
  const output = new Array(input.length);
  let index = 0;
  async function worker() {
    while (index < input.length) {
      const i = index++;
      try { output[i] = { status: "fulfilled", value: await fn(input[i], i) }; }
      catch (reason) { output[i] = { status: "rejected", reason }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), input.length || 1) }, worker));
  return output;
}

async function fetchMetadata(fetchJson) {
  const url = metadataUrl();
  const data = parseMetadata(await fetchJson(url, 3000));
  return { ...data, url: MAPSERVER };
}

async function fetchGrid(destinations, fetchJson, concurrency = 8, nowMs = Date.now()) {
  const metadata = await fetchMetadata(fetchJson);
  if (isStale(metadata, nowMs)) throw new Error(`NOHRSC SNODAS analysis stale or undated: ${metadata.valid_at || "unknown"}`);
  const settled = await mapLimit(destinations, concurrency, async d => {
    const url = identifyUrl(d.lat, d.lon);
    const data = parseIdentify(await fetchJson(url, 3000));
    return { id: d.id, ...data };
  });
  const byId = new Map();
  let failures = 0;
  for (const item of settled) {
    if (item && item.status === "fulfilled") byId.set(item.value.id, item.value);
    else failures++;
  }
  return { byId, failures, sampled: settled.length, metadata };
}

module.exports = {
  MAPSERVER,
  DEPTH_LAYER,
  SWE_LAYER,
  MAX_ANALYSIS_AGE_MS,
  identifyUrl,
  parseIdentify,
  metadataUrl,
  parseMetadata,
  isStale,
  fetchGrid,
  fetchMetadata,
  _test: { finite, pixelValue, resultForLayer, arcDate, latestDate, isStale, mapLimit }
};
