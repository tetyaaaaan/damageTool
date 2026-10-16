"use strict";
const fs = require("node:fs");
const path = require("node:path");
const {renderHeader,renderFooter} = require("./lib/siteChrome.cjs");
const root = path.resolve(__dirname,"..");
const skipped = new Set([".git",".codex",".agents","node_modules","mockups","tests","docs","scripts","data","images","__pycache__"]);
function pageFiles(directory = root) {
    return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=> {
        if (skipped.has(entry.name)) return [];
        const file=path.join(directory,entry.name);
        return entry.isDirectory() ? pageFiles(file) : entry.name.endsWith(".html") ? [file] : [];
    });
}
function region(type) {
    return new RegExp(`(?:<!-- site-chrome:${type}:start -->\\s*)?<${type}\\b[^>]*class="[^"]*teti-site-${type}[^"]*"[^>]*>[\\s\\S]*?<\\/${type}>(?:\\s*<!-- site-chrome:${type}:end -->)?`,"g");
}
function synchronize(html,currentPath,renderers={renderHeader,renderFooter}) {
    for (const type of ["header","footer"]) {
        const matches=[...html.matchAll(region(type))];
        if (matches.length !== 1) throw new Error(`${currentPath}: expected one site ${type}, found ${matches.length}`);
        const markup=type === "header" ? renderers.renderHeader(currentPath) : renderers.renderFooter();
        html=html.replace(region(type),()=>`<!-- site-chrome:${type}:start -->\n${markup}\n<!-- site-chrome:${type}:end -->`);
    }
    return html;
}
function targets() {
    return pageFiles().flatMap(file=> {
        const html=fs.readFileSync(file,"utf8");
        if (!html.includes('class="teti-site-header"') && !html.includes('class="teti-site-footer"')) return [];
        const relative=path.relative(root,file).replaceAll(path.sep,"/");
        const currentPath="/"+relative.replace(/index\.html$/,"");
        return [{file,relative,currentPath,html}];
    });
}
function run(check=false) {
    const pages=targets(), stale=[];
    for (const page of pages) {
        const result=synchronize(page.html,page.currentPath);
        if (result === page.html) continue;
        stale.push(page.relative);
        if (!check) fs.writeFileSync(page.file,result);
    }
    if (check && stale.length) throw new Error(`Site chrome is out of date: ${stale.join(", ")}. Run node scripts/syncSiteChrome.cjs`);
    return {pages:pages.length,changed:stale};
}
if (require.main === module) {
    try { const result=run(process.argv.includes("--check")); console.log(`Site chrome: ${result.pages} pages; ${result.changed.length} updated.`); }
    catch(error) { console.error(error.message);process.exitCode=1; }
}
module.exports={targets,synchronize,run};
