const handler = require("./michigan-good-snow-spatial-engine");

module.exports = async function goodSnowCorsHandler(req, res) {
  const origin = String(req.headers && req.headers.origin || "");
  // Vercel may cache a request with no Origin before a browser request arrives.
  // All variants must declare Origin as a cache key, not just allowed variants.
  res.setHeader("Vary", "Origin");
  if (origin === "https://chrisizworski.com" || origin.endsWith(".chrisizworski.com")) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  return handler(req, res);
};

module.exports._test = handler._test;
