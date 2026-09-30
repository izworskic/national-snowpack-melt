const handler = require("./michigan-good-snow-spatial-engine");

module.exports = async function goodSnowCorsHandler(req, res) {
  const origin = String(req.headers && req.headers.origin || "");
  if (origin === "https://chrisizworski.com" || origin.endsWith(".chrisizworski.com")) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  return handler(req, res);
};

module.exports._test = handler._test;
