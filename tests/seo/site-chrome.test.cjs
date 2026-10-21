const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {site,renderHeader,renderFooter} = require('../../scripts/lib/siteChrome.cjs');
const {targets,synchronize,run} = require('../../scripts/syncSiteChrome.cjs');
const pages = targets();
const shell = (html,type) => html.match(new RegExp(`<!-- site-chrome:${type}:start -->[\\s\\S]*?<!-- site-chrome:${type}:end -->`))[0];
const content = html => html.replace(/<!-- site-chrome:(header|footer):start -->[\s\S]*?<!-- site-chrome:\1:end -->/g,'');

test('all published shared shells match the single authoring source',()=> {
    for (const route of ['/','/games/genshin/','/games/hsr/','/guides/']) assert.ok(pages.some(page=>page.currentPath===route));
    assert.ok(pages.length >= 17);
    assert.equal(run(true).changed.length,0);
    for (const page of pages) {
        assert.equal(synchronize(page.html,page.currentPath),page.html,page.relative);
        assert.ok(shell(page.html,'header').includes(renderHeader(page.currentPath)));
        assert.ok(shell(page.html,'footer').includes(renderFooter()));
        for (const [,url] of (shell(page.html,'header')+shell(page.html,'footer')).matchAll(/(?:href|src)="([^"]+)"/g)) {
            assert.match(url,/^(?:\/|https:\/\/)/);
            if (url.startsWith('/')) assert.ok(fs.existsSync(path.join(__dirname,'../..',url)),url);
        }
    }
});

test('one copy or URL change propagates to every page without changing page content',()=> {
    const config=structuredClone(site);
    config.description='共通文言変更の確認';
    config.links.tools.url='/updated-tools/';
    config.links.tools.label='更新後ツール';
    for (const page of pages) {
        const result=synchronize(page.html,page.currentPath,{
            renderHeader:route=>renderHeader(route,config),renderFooter:()=>renderFooter(config)
        });
        assert.match(shell(result,'header'),/href="\/updated-tools\/"/);
        assert.match(shell(result,'footer'),/共通文言変更の確認/);
        assert.match(shell(result,'footer'),/更新後ツール/);
        assert.equal(content(result),content(page.html));
        assert.equal(synchronize(result,page.currentPath),page.html);
    }
});

test('missing shells fail visibly and deploy synchronizes static markup before serving',()=> {
    assert.throws(()=>synchronize('<main>body</main>','/'),/expected one site header/);
    assert.throws(()=>synchronize(renderHeader('/')+renderHeader('/')+renderFooter(),'/'),/found 2/);
    const config=fs.readFileSync(path.join(__dirname,'../../wrangler.toml'),'utf8');
    assert.match(config,/\[build\][\s\S]*command = "node scripts\/prepareWorkerRelease.cjs --check-release && node scripts\/syncSiteChrome.cjs && node scripts\/prepareWorkerRelease.cjs --check-release"/);
    const worker=fs.readFileSync(path.join(__dirname,'../../worker.js'),'utf8');
    assert.doesNotMatch(worker,/function render(?:InfoPage|TetinetHome|HomePage)\(/);
});
