const MAPSERVER = "https://mapservices.weather.noaa.gov/raster/rest/services/snow/NOHRSC_Snow_Analysis/MapServer";
const DEPTH_LAYER = 3;
const SWE_LAYER = 7;

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

function pixelValue(result, max) {
  if (!result) return null;
  const attrs = result.attributes || {};
  const raw = attrs["Pixel Value"] ?? attrs["Pixel value"] ?? attrs.pixelValue ?? result.value;
  if (raw == null || /nodata|null|undefined/i.test(String(raw))) return null;
  return round1(finite(raw, 0, max));
}

function parseIdentify(payload) {
  return {
    depth_inches: pixelValue(resultForLayer(payload, DEPTH_LAYER), 300),
    swe_inches: pixelValue(resultForLayer(payload, SWE_LAYER), 100)
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

function parseMetadata(payload) {
  const features = Array.isArray(payload && payload.features) ? payload.features : [];
  const rows = features.map(f => f && f.attributes || {});
  const dates = rows.flatMap(a => [a.idp_validtime, a.idp_filedate, a.idp_issueddate, a.idp_ingestdate])
    .map(arcDate).filter(Boolean).sort();
  return { updated_at: dates.at(-1) || null };
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

async function fetchGrid(destinations, fetchJson, concurrency = 8) {
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
  return { byId, failures, sampled: settled.length };
}

async function fetchMetadata(fetchJson) {
  const url = metadataUrl();
  const data = parseMetadata(await fetchJson(url, 3000));
  return { ...data, url: MAPSERVER };
}

module.exports = {
  MAPSERVER,
  DEPTH_LAYER,
  SWE_LAYER,
  identifyUrl,
  parseIdentify,
  metadataUrl,
  parseMetadata,
  fetchGrid,
  fetchMetadata,
  _test: { finite, pixelValue, resultForLayer, arcDate, mapLimit }
};
