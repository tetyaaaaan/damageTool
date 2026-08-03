const fs = require("node:fs");
const path = require("node:path");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function resolveManifestPath(root, calcDir, file) {
  if (file.startsWith("/games/")) return path.join(root, file.slice(1));
  return path.resolve(calcDir, file);
}

function loadHsrDataFiles(root) {
  const calcDir = path.join(root, "games", "hsr", "data", "calc");
  const manifest = readJson(path.join(calcDir, "data-files.json"));
  const attackOverrideSources = (manifest.attackOverrides || []).map((file) => {
    const data = readJson(resolveManifestPath(root, calcDir, file));
    return { file, support: data.support || { status: "calculable", verified: true }, records: data.overrides || [] };
  });
  const modifierSources = (manifest.modifiers || []).map((file) => {
    const data = readJson(resolveManifestPath(root, calcDir, file));
    return { file, records: data.modifiers || [] };
  });
  return {
    manifest,
    attackOverrideSources,
    attackOverrides: attackOverrideSources.flatMap((source) => source.records.map((record) => ({ ...record, support: record.support || source.support }))),
    modifierSources,
    modifiers: modifierSources.flatMap((source) => source.records)
  };
}

module.exports = { loadHsrDataFiles };
