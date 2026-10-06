const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const personId = "https://chrisizworski.com/#person";
const homepage = "https://chrisizworski.com/";
const pages = [
  {
    "file": "public/national-tools/snow/index.html",
    "types": [
      "WebSite",
      "SoftwareApplication"
    ]
  }
];

test("affected national snow root pages publish through the canonical Chris Person", () => {
  for (const page of pages) {
    const html = fs.readFileSync(path.join(__dirname, "..", page.file), "utf8");
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)];
    assert.equal(blocks.length, 1, page.file + ": expected one JSON-LD graph");
    const graph = JSON.parse(blocks[0][1])["@graph"];
    const personNode = graph.find((node) => node["@type"] === "Person" && node["@id"] === personId);
    assert.ok(personNode, page.file + ": canonical Person node missing");
    assert.equal(personNode.url, homepage, page.file + ": Person.url must resolve to homepage");
    for (const type of page.types) {
      const node = graph.find((item) => item["@type"] === type);
      assert.ok(node, page.file + ": missing " + type);
      assert.deepEqual(node.author, { "@id": personId }, page.file + ": " + type + " author ref");
      assert.deepEqual(node.publisher, { "@id": personId }, page.file + ": " + type + " publisher ref");
    }
  }
});
