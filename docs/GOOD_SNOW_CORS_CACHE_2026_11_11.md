## 2026-11-11 CORS variation repair

Read-only production audit of chrisizworski.com winter Sprints 1–8 found that an otherwise healthy Michigan Good Snow JSON response, when requested with Origin: https://chrisizworski.com, lacked Access-Control-Allow-Origin. The browser fetches this API cross-origin from national-snowpack-melt.vercel.app. Without ACAO it cannot read the otherwise successful source data.

The route had set Vary: Origin only for requests that already carried an allowed Origin. Vercel caches serverless API responses (this endpoint uses public s-maxage 900), and a previously cached no-Origin response had no Vary entry to separate it from a browser request.

This repair sends Vary: Origin for every request, including no-Origin visitors, and sends a specific ACAO only for the existing trusted chrisizworski.com origins. It neither opens the endpoint to arbitrary origins nor changes the spatial model, thresholds, sources, ads, metadata or path. Tests mock the downstream handler and prove all variants. Verify the actual production response header in a deployed smoke before calling the fix complete. Cache may need time to refresh; do not assert success based only on green builds.

Related main-site production audit: PR #1641, which validates browser-readable CORS and 14 other data contracts.
