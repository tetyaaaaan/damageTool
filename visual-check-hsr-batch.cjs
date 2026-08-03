const { chromium } = require("C:/Users/teti/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");

(async () => {
  const browser = await chromium.launch({ executablePath:"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless:true });
  const page = await browser.newPage({ viewport:{width:1440,height:1000}, deviceScaleFactor:1 });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto("http://127.0.0.1:4173/games/hsr/", { waitUntil:"domcontentloaded" });
  await page.waitForSelector("#hsrCharacterTrigger");
  console.log("loaded");

  async function choose(id, name) {
    await page.click("#hsrCharacterTrigger");
    await page.fill("#hsrSelectionSearch", name);
    await page.click(`[data-selection-id="${id}"]`);
    await page.waitForFunction((expected) => document.querySelector("#hsrCharacterName")?.value === expected, name);
  }
  async function setValue(selector, value) {
    await page.locator(selector).fill(String(value));
    await page.locator(selector).dispatchEvent("input");
    await page.locator(selector).dispatchEvent("change");
  }
  async function openTraceConditions() {
    await page.click("#hsrConditionDialogOpen");
    await page.click('[data-condition-tab="軌跡"]');
  }

  await choose("1210", "桂乃芬");
  console.log("guinaifen-selected");
  await page.selectOption("#hsrEidolon", "6");
  await setValue('[data-stat="atk"]', 1000);
  await setValue('[data-stat="critRate"]', 0);
  await openTraceConditions();
  console.log("guinaifen-conditions-open");
  const guinaifenText = await page.locator("#hsrConditionList").innerText();
  if (!guinaifenText.includes("天賦「火喰い」") || !guinaifenText.includes("星魂2") || !guinaifenText.includes("追加能力「裸足踏刀」")) throw new Error("Guinaifen conditions missing");
  await page.selectOption('[data-structured-input="guinaifen-firekiss-stacks"]', "4");
  await page.check('[data-structured-toggle="guinaifen-burn-active"]');
  await page.check('[data-structured-toggle="enemy-burning"]');
  const pcMetrics = await page.locator("#hsrConditionDialog").evaluate((dialog) => ({width:dialog.getBoundingClientRect().width,scrollWidth:dialog.scrollWidth,clientWidth:dialog.clientWidth,scrollHeight:dialog.scrollHeight,clientHeight:dialog.clientHeight}));
  await page.click("#hsrConditionDialogClose");
  await page.click("#hsrCalculateButton");
  console.log("guinaifen-calculated");
  await page.waitForSelector("#hsrResults .hsr-attack-result");
  const damageTextOn = await page.locator("#hsrResults").innerText();
  if (!damageTextOn.includes("出だし好調・燃焼") || !damageTextOn.includes("十八番を披露するね・燃焼誘発")) throw new Error("Burn attacks missing from result");
  await page.click('[data-result-tab="modifiers"]');
  const auditText = await page.locator('[data-result-panel="modifiers"]').innerText();
  if (!auditText.includes("火喰い") || !auditText.includes("星魂2")) throw new Error("Guinaifen modifier audit missing");

  await choose("1208", "符玄");
  console.log("fuxuan-selected");
  await page.selectOption("#hsrEidolon", "6");
  await setValue('[data-stat="hp"]', 8000);
  await openTraceConditions();
  console.log("fuxuan-conditions-open");
  const fuText = await page.locator("#hsrConditionList").innerText();
  if (!fuText.includes("味方全体最大HP") || !fuText.includes("累計HP損失")) throw new Error("Fu Xuan conditions missing");
  await page.check('[data-structured-toggle="fuxuan-matrix-active"]');
  await setValue('[data-structured-input="fuxuan-e6-lost-hp-percent"]', 120);
  const providerValue = await page.locator('[data-structured-provider-stat="hp"]').inputValue();
  if (providerValue !== "8000") throw new Error(`Fu Xuan provider HP not synchronized: ${providerValue}`);
  await page.screenshot({path:"hsr-batch-pc.png",fullPage:false});

  await page.setViewportSize({width:390,height:844});
  const mobileMetrics = await page.locator("#hsrConditionDialog").evaluate((dialog) => ({width:dialog.getBoundingClientRect().width,scrollWidth:dialog.scrollWidth,clientWidth:dialog.clientWidth,bodyScrollWidth:document.body.scrollWidth,viewport:innerWidth,scrollHeight:dialog.scrollHeight,clientHeight:dialog.clientHeight}));
  await page.screenshot({path:"hsr-batch-mobile.png",fullPage:false});
  console.log(JSON.stringify({errors,guinaifen:{hasBurnResults:true,hasAudit:true},fuXuan:{providerHp:providerValue,hasMatrix:true,hasE6:true},pcMetrics,mobileMetrics},null,2));
  await browser.close();
})().catch((error) => { console.error(error); process.exit(1); });
