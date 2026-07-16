"use strict";

const fs = require("node:fs");
const path = require("node:path");

const repositoryRoot = path.resolve(__dirname, "..");
const calcDirectory = path.join(repositoryRoot, "games/genshin/data/calc");

function collectProblems(data, file = "") {
    const problems = [];
    function visit(value) {
        if (Array.isArray(value)) return value.forEach(visit);
        if (!value || typeof value !== "object") return;
        if (value.category === "statBonus"
            && (value.applyTo || []).includes("elementalMastery")
            && value.unit === "percent"
            && !value.reference) {
            problems.push({ file, id: value.id || "", target: "elementalMastery", actualUnit: value.unit, expectedUnit: "flat" });
        }
        Object.values(value).forEach(visit);
    }
    visit(data);
    return problems;
}

function fixSource(source, problems) {
    let output = source;
    for (const problem of problems) {
        const idMarker = `"id": "${problem.id}"`;
        const idIndex = output.indexOf(idMarker);
        const unitIndex = output.indexOf('"unit": "percent"', idIndex);
        if (idIndex < 0 || unitIndex < 0 || unitIndex - idIndex > 2000) {
            throw new Error(`${problem.id}: unit field not found near modifier`);
        }
        output = output.slice(0, unitIndex)
            + '"unit": "flat"'
            + output.slice(unitIndex + '"unit": "percent"'.length);
    }
    return output;
}

function auditFiles() {
    return fs.readdirSync(calcDirectory)
        .filter((file) => file.endsWith("-modifiers.json"))
        .flatMap((file) => {
            const source = fs.readFileSync(path.join(calcDirectory, file), "utf8");
            return collectProblems(JSON.parse(source), file);
        });
}

function main() {
    let problems = auditFiles();
    if (process.argv.includes("--fix")) {
        const byFile = Object.groupBy(problems, (problem) => problem.file);
        Object.entries(byFile).forEach(([file, fileProblems]) => {
            const filePath = path.join(calcDirectory, file);
            const source = fs.readFileSync(filePath, "utf8");
            fs.writeFileSync(filePath, fixSource(source, fileProblems));
        });
        problems = auditFiles();
    }
    process.stdout.write(`${JSON.stringify({ problems }, null, 2)}\n`);
    if (problems.length) process.exitCode = 1;
}

if (require.main === module) main();

module.exports = { auditFiles, collectProblems, fixSource };
