"use strict";

/*
 * Materialize the weapon entities represented by the first source-missing
 * transition shard.  The source resolver deliberately walks Git trees one
 * level at a time.  A recursive tree response (or a mutable branch URL) is
 * not sufficient evidence for this artifact.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { digestStable } = require("./genshinVersionEvidenceValidation.cjs");

const repositoryRoot = path.resolve(__dirname, "..");
const transitionRoot = path.join(repositoryRoot, "games", "genshin", "data", "v2", "version-transitions", "6.7-to-7.0");
const defaultOutputPath = path.join(transitionRoot, "weapon-entity-snapshot.json");
const defaultCheckpointPath = path.join(transitionRoot, "weapon-entity-capture-checkpoint.json");
const queuePath = path.join(repositoryRoot, "reports", "genshin-evidence-task-queue.json");
const sourceBase = "https://raw.githubusercontent.com/theBowja/genshin-db";
const apiBase = "https://api.github.com/repos/theBowja/genshin-db";

const revisions = {
    before: {
        gameVersion: "6.7",
        revision: "1bab2cdba4d218fd5caa46b5f54e7884ee8359a2",
        manifestDigest: "5ded2b3bab58218da17f6a1282209e653c1ec7ecd9297b95569558a737c2e8f6",
        manifestBytes: 1619
    },
    after: {
        gameVersion: "7.0",
        revision: "8b15995fa220c88a4d0d7ffe1e21b041d0b32588",
        manifestDigest: "3faf0b2220539a07af9260f5dd83afd0e964aa42868c9b3b73c6cb14065085c6",
        manifestBytes: 1619
    }
};

// The entity list is intentionally explicit.  It is the de-duplicated entity
// set of queue shard standard:01 (100 candidate claims -> 55 entities).  The
// Japanese catalog label is only an identity aid; source selection is proved
// by the pinned Git blob and parsed source id below.
const entities = [
    ["11301", "冷刃", ["coolsteel"]],
    ["11302", "黎明の神剣", ["harbingerofdawn"]],
    ["11304", "暗鉄剣", ["darkironsword"]],
    ["11305", "チ虎魚の刀", ["filletblade"]],
    ["11306", "飛天御剣", ["skyridersword"]],
    ["11402", "笛の剣", ["theflute"]],
    ["11404", "旧貴族長剣", ["royallongsword"]],
    ["11405", "匣中龍吟", ["lionsroar"]],
    ["11406", "斬岩·試作", ["prototyperancour"]],
    ["11407", "鉄蜂の刺し", ["ironsting"]],
    ["11408", "黒岩の長剣", ["blackclifflongsword"]],
    ["11409", "黒剣", ["theblacksword"]],
    ["11410", "ダークアレイの閃光", ["thealleyflash"]],
    ["11412", "降臨の剣", ["swordofdescension"]],
    ["11413", "腐植の剣", ["festeringdesire"]],
    ["11415", "シナバースピンドル", ["cinnabarspindle"]],
    ["11416", "籠釣瓶一心", ["kagotsurubeisshin"]],
    ["11417", "原木刀", ["sapwoodblade"]],
    ["11418", "サイフォスの月明かり", ["xiphosmoonlight"]],
    ["11419", "「一心伝」名刀", ["prizedisshinblade", "prizedisshinblade-01", "prizedisshinblade-02"]],
    ["11420", "「一心伝」名刀", ["prizedisshinblade", "prizedisshinblade-01", "prizedisshinblade-02"]],
    ["11421", "「一心伝」名刀", ["prizedisshinblade", "prizedisshinblade-01", "prizedisshinblade-02"]],
    ["11422", "東花坊時雨", ["toukaboushigure"]],
    ["11424", "狼牙", ["wolffang"]],
    ["11425", "海淵のフィナーレ", ["finaleofthedeep"]],
    ["11426", "サーンドルの渡し守", ["fleuvecendreferryman"]],
    ["11428", "水仙十字の剣", ["swordofnarzissenkreuz"]],
    ["11430", "ストロング・ボーン", ["sturdybone"]],
    ["11431", "エズピツァルの笛", ["fluteofezpitzal"]],
    ["11432", "厄水の災い", ["calamityofeshu"]],
    ["11433", "静謐の笛", ["serenityscall"]],
    ["11434", "月紡ぎの曙光", ["moonweaversdawn"]],
    ["11501", "風鷹剣", ["aquilafavonia"]],
    ["11502", "天空の刃", ["skywardblade"]],
    ["11504", "斬山の刃", ["summitshaper"]],
    ["11505", "磐岩結緑", ["primordialjadecutter"]],
    ["11510", "波乱月白経津", ["harangeppakufutsu"]],
    ["11511", "聖顕の鍵", ["keyofkhajnisut"]],
    ["11512", "萃光の裁葉", ["lightoffoliarincision"]],
    ["11513", "静水流転の輝き", ["splendoroftranquilwaters"]],
    ["11514", "有楽御簾切", ["urakumisugiri"]],
    ["11515", "赦罪", ["absolution"]],
    ["11516", "岩峰を巡る歌", ["peakpatrolsong"]],
    ["11517", "蒼耀", ["azurelight"]],
    ["11519", "三日月の含光", ["lightbearingmoonshard"]],
    ["12301", "鉄影段平", ["ferrousshadow"]],
    ["12302", "龍血を浴びた剣", ["bloodtaintedgreatsword"]],
    ["12305", "理屈責め", ["debateclub"]],
    ["12306", "飛天大御剣", ["skyridergreatsword"]],
    ["12404", "旧貴族大剣", ["royalgreatsword"]],
    ["12405", "雨裁", ["rainslasher"]],
    ["12406", "古華·試作", ["prototypearchaic"]],
    ["12407", "白影の剣", ["whiteblind"]],
    ["12408", "黒岩の斬刀", ["blackcliffslasher"]],
    ["12409", "螭龍の剣", ["serpentspine"]]
].map(([entityId, nameJa, slugCandidates]) => ({ entityId, nameJa, slugCandidates }));

const expectedEntityIds = entities.map((entity) => entity.entityId).sort();

// Shard standard:02 is deliberately kept as a separate capture namespace so
// its checkpoint/snapshot/raw paths cannot overwrite shard01.  Entity 12409
// is present in both authoritative shards; the separate namespace preserves
// that provenance without mutating shard01's evidence.
const shard02Entities = [
    ["12409", "螭龍の剣", ["serpentspine"]],
    ["12410", "千岩古剣", ["lithicblade"]],
    ["12411", "雪葬の星銀", ["snowtombedstarsilver"]],
    ["12412", "銜玉の海皇", ["luxurioussealord"]],
    ["12414", "桂木斬長正", ["katsuragikirinagamasa"]],
    ["12415", "マカイラの水色", ["makhairaaquamarine"]],
    ["12416", "惡王丸", ["akuoumaru"]],
    ["12417", "森林のレガリア", ["forestregalia"]],
    ["12418", "鉄彩の花", ["mailedflower"]],
    ["12424", "話死合い棒", ["talkingstick"]],
    ["12425", "タイダル·シャドー", ["tidalshadow"]],
    ["12426", "「スーパーアルティメット覇王魔剣」", ["ultimateoverlordsmegamagicsword"]],
    ["12431", "アースシェイカー", ["earthshaker"]],
    ["12432", "知恵の溶炎", ["flameforgedinsight"]],
    ["12433", "万能の鍵", ["masterkey"]],
    ["12501", "天空の傲", ["skywardpride"]],
    ["12502", "狼の末路", ["wolfsgravestone"]],
    ["12503", "松韻の響く頃", ["songofbrokenpines"]],
    ["12504", "無工の剣", ["theunforged"]],
    ["12510", "赤角石塵滅砕", ["redhornstonethresher"]],
    ["12511", "葦海の標", ["beaconofthereedsea"]],
    ["12512", "裁断", ["verdict"]],
    ["12513", "山の王の長牙", ["fangofthemountainking"]],
    ["12514", "千烈の日輪", ["athousandblazingsuns"]],
    ["12516", "超越の鍵", ["ateaspoonoftranscendence"]],
    ["13301", "白纓槍", ["whitetassel"]],
    ["13302", "鉾槍", ["halberd"]],
    ["13303", "黒纓槍", ["blacktassel"]],
    ["13401", "匣中滅龍", ["dragonsbane"]],
    ["13402", "星鎌·試作", ["prototypestarglitter"]],
    ["13403", "流月の針", ["crescentpike"]],
    ["13404", "黒岩の突槍", ["blackcliffpole"]],
    ["13405", "死闘の槍", ["deathmatch"]],
    ["13406", "千岩長槍", ["lithicspear"]],
    ["13408", "旧貴族猟槍", ["royalspear"]],
    ["13409", "ドラゴンスピア", ["dragonspinespear"]],
    ["13414", "喜多院十文字槍", ["kitaincrossspear"]],
    ["13415", "「漁獲」", ["thecatch"]],
    ["13416", "斬波のひれ長", ["wavebreakersfin"]],
    ["13417", "ムーンピアサー", ["moonpiercer"]],
    ["13419", "風信の矛", ["missivewindspear"]],
    ["13424", "フィヨルドの歌", ["balladofthefjords"]],
    ["13430", "鎮山の釘", ["mountainbracingbolt"]],
    ["13431", "虹の行方", ["footprintoftherainbow"]],
    ["13432", "玉響停の御噺", ["tamayurateinoohanashi"]],
    ["13433", "金掘りのシャベル", ["prospectorsshovel"]],
    ["13434", "聖祭者の輝杖", ["sacrificersstaff"]],
    ["13501", "護摩の杖", ["staffofhoma"]],
    ["13502", "天空の脊", ["skywardspine"]],
    ["13504", "破天の槍", ["vortexvanquisher"]],
    ["13505", "和璞鳶", ["primordialjadewingedspear"]],
    ["13507", "息災", ["calamityqueller"]],
    ["13509", "草薙の稲光", ["engulfinglightning"]],
    ["13511", "赤砂の杖", ["staffofthescarletsands"]],
    ["13512", "赤月のシルエット", ["crimsonmoonssemblance"]]
].map(([entityId, nameJa, slugCandidates]) => ({ entityId, nameJa, slugCandidates }));

const shard03Entities = [
    ["13513", "ルミドゥースの挽歌", ["lumidouceelegy"]],
    ["13514", "香りのシンフォニスト", ["symphonistofscents"]],
    ["13515", "砕け散る光輪", ["fracturedhalo"]],
    ["13516", "血染めの荒れ地", ["bloodsoakedruins"]],
    ["13517", "災憾", ["disasterandremorse"]],
    ["14301", "魔導緒論", ["magicguide"]],
    ["14302", "龍殺しの英傑譚", ["thrillingtalesofdragonslayers"]],
    ["14304", "翡玉法珠", ["emeraldorb"]],
    ["14305", "特級の宝玉", ["twinnephrite"]],
    ["14404", "旧貴族秘法録", ["royalgrimoire"]],
    ["14405", "匣中日月", ["solarpearl"]],
    ["14407", "万国諸海の図譜", ["mappamare"]],
    ["14408", "黒岩の緋玉", ["blackcliffagate"]],
    ["14409", "昭心", ["eyeofperception"]],
    ["14410", "ダークアレイの酒と詩", ["wineandsong"]],
    ["14412", "冬忍びの実", ["frostbearer"]],
    ["14413", "ドドコの物語", ["dodocotales"]],
    ["14414", "白辰の輪", ["hakushinring"]],
    ["14415", "誓いの明瞳", ["oathsworneye"]],
    ["14416", "彷徨える星", ["wanderingevenstar"]],
    ["14417", "満悦の実", ["fruitoffulfillment"]],
    ["14424", "古祠の瓏", ["sacrificialjade"]],
    ["14425", "純水流華", ["flowingpurity"]],
    ["14426", "果てなき紺碧の唄", ["balladoftheboundlessblue"]],
    ["14427", "蒼紋の角杯", ["ashgravendrinkinghorn"]],
    ["14430", "波乗りの旋回", ["waveridingwhirl"]],
    ["14431", "ヤシュチェの環", ["ringofyaxche"]],
    ["14432", "天光のリュート", ["etherlightspindlelute"]],
    ["14433", "烏髄の孤灯", ["blackmarrowlantern"]],
    ["14434", "霜辰", ["dawningfrost"]],
    ["14501", "天空の巻", ["skywardatlas"]],
    ["14502", "四風原典", ["lostprayertothesacredwinds"]],
    ["14504", "浮世の錠", ["memoryofdust"]],
    ["14505", "碧落の瓏", ["jadefallssplendor"]],
    ["14509", "神楽の真意", ["kagurasverity"]],
    ["14511", "千夜に浮かぶ夢", ["athousandfloatingdreams"]],
    ["14512", "トゥライトゥーラの記憶", ["tulaytullahsremembrance"]],
    ["14513", "凛流の監視者", ["cashflowsupervision"]],
    ["14514", "久遠流転の大典", ["tomeoftheeternalflow"]],
    ["14515", "鶴鳴の余韻", ["cranesechoingcall"]],
    ["14516", "サーフィンタイム", ["surfsup"]],
    ["14517", "祭星者の眺め", ["starcallerswatch"]],
    ["14518", "寝正月の初晴", ["sunnymorningsleepin"]],
    ["14519", "ヴィヴィッド・ハート", ["vividnotions"]],
    ["14520", "夜を紡ぐ天鏡", ["nightweaverslookingglass"]]
].map(([entityId, nameJa, slugCandidates]) => ({ entityId, nameJa, slugCandidates }));

const shard04Entities = [
    ["14520", "夜を紡ぐ天鏡", ["nightweaverslookingglass"]],
    ["14521", "真言の匣", ["reliquaryoftruth"]],
    ["14522", "帳の夜曲", ["nocturnescurtaincall"]],
    ["14523", "塵と光の七つの誓約", ["angelosheptades"]],
    ["15301", "鴉羽の弓", ["ravenbow"]],
    ["15302", "シャープシューターの誓い", ["sharpshootersoath"]],
    ["15304", "弾弓", ["slingshot"]],
    ["15305", "文使い", ["messenger"]],
    ["15404", "旧貴族長弓", ["royalbow"]],
    ["15405", "弓蔵", ["rust"]],
    ["15406", "澹月·試作", ["prototypecrescent"]],
    ["15407", "リングボウ", ["compoundbow"]],
    ["15408", "黒岩の戦弓", ["blackcliffwarbow"]],
    ["15409", "蒼翠の狩猟弓", ["theviridescenthunt"]],
    ["15410", "ダークアレイの狩人", ["alleyhunter"]],
    ["15411", "落霞", ["fadingtwilight"]],
    ["15412", "幽夜のワルツ", ["mitternachtswaltz"]],
    ["15413", "風花の頌歌", ["windblumeode"]],
    ["15414", "破魔の弓", ["hamayumi"]],
    ["15415", "プレデター", ["predator"]],
    ["15416", "曚雲の月", ["mouunsmoon"]],
    ["15417", "王の近侍", ["kingssquire"]],
    ["15418", "竭沢", ["endoftheline"]],
    ["15419", "トキの嘴", ["ibispiercer"]],
    ["15424", "烈日の後嗣", ["scionoftheblazingsun"]],
    ["15425", "静寂の唄", ["songofstillness"]],
    ["15426", "築雲", ["cloudforged"]],
    ["15430", "花飾りの羽", ["flowerwreathedfeathers"]],
    ["15431", "チェーンブレイカー", ["chainbreaker"]],
    ["15432", "冷寂の音", ["sequenceofsolitude"]],
    ["15433", "羅網の針", ["snarehook"]],
    ["15434", "虹蛇の雨弦", ["rainbowserpentsrainbow"]],
    ["15501", "天空の翼", ["skywardharp"]],
    ["15503", "終焉を嘆く詩", ["elegyfortheend"]],
    ["15507", "冬極の白星", ["polarstar"]],
    ["15508", "若水", ["aquasimulacra"]],
    ["15509", "飛雷の鳴弦", ["thunderingpulse"]],
    ["15511", "狩人の道", ["hunterspath"]],
    ["15512", "始まりの大魔術", ["thefirstgreatmagic"]],
    ["15513", "白雨心弦", ["silvershowerheartstrings"]],
    ["15514", "星鷲の紅き羽", ["astralvulturescrimsonplumage"]],
    ["15515", "暁を告げる歴史", ["thedaybreakchronicles"]]
].map(([entityId, nameJa, slugCandidates]) => ({ entityId, nameJa, slugCandidates }));

const selectedShard = process.argv.find((argument) => argument.startsWith("--shard="))?.slice("--shard=".length) || "01";
if (!["01", "02", "03", "04"].includes(selectedShard)) throw new Error(`unsupported weapon capture shard: ${selectedShard}`);
const activeEntities = selectedShard === "02"
    ? shard02Entities
    : selectedShard === "03"
        ? shard03Entities
        : selectedShard === "04"
            ? shard04Entities
            : entities;
const activeExpectedEntityIds = activeEntities.map((entity) => entity.entityId).sort();
const activeShardId = `weapons:weaponEffectSpec:sourceMissing:standard:${selectedShard}`;
const activeExpectedCandidateCount = { "01": 100, "02": 100, "03": 100, "04": 81 }[selectedShard];
const activeOutputPath = selectedShard === "02"
    ? path.join(transitionRoot, "weapon-entity-snapshot-shard02.json")
    : selectedShard === "03"
        ? path.join(transitionRoot, "weapon-entity-snapshot-shard03.json")
        : selectedShard === "04"
            ? path.join(transitionRoot, "weapon-entity-snapshot-shard04.json")
            : defaultOutputPath;
const activeCheckpointPath = selectedShard === "02"
    ? path.join(transitionRoot, "weapon-entity-capture-checkpoint-shard02.json")
    : selectedShard === "03"
        ? path.join(transitionRoot, "weapon-entity-capture-checkpoint-shard03.json")
        : selectedShard === "04"
            ? path.join(transitionRoot, "weapon-entity-capture-checkpoint-shard04.json")
            : defaultCheckpointPath;
const activeSourceNamespace = selectedShard === "02"
    ? "genshin-db-shard02"
    : selectedShard === "03"
        ? "genshin-db-shard03"
        : selectedShard === "04"
            ? "genshin-db-shard04"
            : "genshin-db";

function sha256(bytes) {
    return crypto.createHash("sha256").update(bytes).digest("hex");
}

function gitBlobSha(bytes) {
    const header = Buffer.from(`blob ${bytes.length}\0`, "utf8");
    return crypto.createHash("sha1").update(Buffer.concat([header, bytes])).digest("hex");
}

function relative(file) {
    return path.relative(repositoryRoot, file).replaceAll("\\", "/");
}

function sourcePath(revision, slug) {
    return path.join(transitionRoot, "sources", activeSourceNamespace, revision, "English", "weapons", `${slug}.json`);
}

function manifestPath(revision) {
    return path.join(transitionRoot, "sources", activeSourceNamespace, revision, "package.json");
}

function sourceUrl(revision, slug) {
    return `${sourceBase}/${revision}/src/data/English/weapons/${slug}.json`;
}

function manifestUrl(revision) {
    return `${sourceBase}/${revision}/package.json`;
}

async function fetchBytes(url) {
    const response = await fetch(url, { headers: { "User-Agent": "damageTool-genshin-transition-capture" } });
    if (!response.ok) throw new Error(`fetch failed ${response.status}: ${url}`);
    return Buffer.from(await response.arrayBuffer());
}

async function fetchTree(treeRef) {
    const url = `${apiBase}/git/trees/${treeRef}`;
    const response = await fetch(url, { headers: { "Accept": "application/vnd.github+json", "User-Agent": "damageTool-genshin-transition-capture" } });
    if (!response.ok) throw new Error(`tree fetch failed ${response.status}: ${url}`);
    const value = await response.json();
    if (!Array.isArray(value.tree) || value.truncated === true) throw new Error(`tree response invalid or truncated: ${treeRef}`);
    return { url, value };
}

/* Resolve exactly one path segment per Git tree request. */
async function resolveWeaponTree(revision) {
    try {
        let treeRef = revision;
        const pathSegments = ["src", "data", "English", "weapons"];
        const steps = [];
        for (const segment of pathSegments) {
            const response = await fetchTree(treeRef);
            const entry = response.value.tree.find((item) => item.path === segment && item.type === "tree");
            if (!entry) throw new Error(`tree segment missing: ${revision}:${segment}`);
            steps.push({
                requestedRef: treeRef,
                responseUrl: response.url,
                responseSha: response.value.sha,
                segment,
                treeSha: entry.sha,
                entryType: entry.type
            });
            treeRef = entry.sha;
        }
        const response = await fetchTree(treeRef);
        const entries = response.value.tree.map((entry) => ({
            path: entry.path,
            type: entry.type,
            mode: entry.mode,
            sha: entry.sha,
            size: entry.size === undefined ? null : entry.size,
            url: entry.url || null
        }));
        return {
            method: "gitTreeApiNonRecursive",
            recursive: false,
            requestedRevision: revision,
            finalTreeSha: response.value.sha,
            finalTreeUrl: response.url,
            steps,
            entries
        };
    } catch (error) {
        // The unauthenticated GitHub API has a finite rate limit.  The raw
        // content endpoint is still pinned to the immutable revision, so it
        // is a safe acquisition fallback, but it is explicitly marked as a
        // fallback and never represented as a tree proof.
        if (!/tree fetch failed 403|rate limit|API rate/i.test(String(error.message))) throw error;
        const slugs = [...new Set(activeEntities.flatMap((entity) => entity.slugCandidates))].sort();
        return {
            method: "immutableRawPathFallback",
            recursive: false,
            requestedRevision: revision,
            fallbackReason: String(error.message),
            finalTreeSha: null,
            finalTreeUrl: null,
            steps: [],
            entries: slugs.map((slug) => ({
                path: `${slug}.json`,
                type: "blob",
                mode: "100644",
                sha: null,
                size: null,
                url: sourceUrl(revision, slug)
            }))
        };
    }
}

function loadQueueShard() {
    const queue = JSON.parse(fs.readFileSync(queuePath, "utf8"));
    const shards = (queue.unlockClusters || []).flatMap((cluster) => cluster.shards || []);
    const shard = shards.find((item) => item.shardId === activeShardId);
    if (!shard || !Array.isArray(shard.candidateIds) || shard.candidateIds.length !== activeExpectedCandidateCount) {
        throw new Error(`authoritative weapon shard ${selectedShard} is missing or not the expected ${activeExpectedCandidateCount}-candidate shard`);
    }
    const entityIds = [...new Set(shard.candidateIds.map((candidateId) => {
        const match = String(candidateId).match(/^w_(\d+)_/);
        if (!match) throw new Error(`weapon candidate identity invalid: ${candidateId}`);
        return match[1];
    }))].sort();
    if (digestStable(entityIds) !== digestStable(activeExpectedEntityIds)) throw new Error(`weapon entity inventory does not match queue shard ${selectedShard}`);
    return {
        shardId: shard.shardId,
        candidateIds: [...shard.candidateIds].sort(),
        candidateCount: shard.candidateIds.length,
        entityIds,
        candidateIdDigest: digestStable([...shard.candidateIds].sort())
    };
}

function validateManifestBytes(revision, bytes) {
    const expected = revisions[revision];
    if (bytes.length !== expected.manifestBytes || sha256(bytes) !== expected.manifestDigest) {
        throw new Error(`${expected.gameVersion} package manifest digest/length mismatch`);
    }
    const manifest = JSON.parse(bytes.toString("utf8"));
    const statement = String(manifest.description || "");
    if (!statement.includes(`Genshin Impact v${expected.gameVersion} JSON data`)) {
        throw new Error(`${expected.gameVersion} package manifest lacks explicit gameVersion statement`);
    }
    return manifest;
}

function resolveEntry(tree, slug) {
    return tree.entries.find((entry) => entry.type === "blob" && entry.path === `${slug}.json`) || null;
}

function parseEntity(bytes, expectedEntityId, slug, revision) {
    let value;
    try {
        value = JSON.parse(bytes.toString("utf8"));
    } catch (error) {
        throw new Error(`${revision}/${slug} JSON invalid: ${error.message}`);
    }
    if (String(value.id) !== expectedEntityId) {
        throw new Error(`${revision}/${slug} id mismatch: expected ${expectedEntityId}, got ${value.id}`);
    }
    return value;
}

function normalizeRecord(value) {
    if (Array.isArray(value)) return value.map(normalizeRecord);
    if (value && typeof value === "object") {
        return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalizeRecord(value[key])]));
    }
    if (typeof value === "string") return value.replaceAll("\r\n", "\n");
    return value;
}

function pointerToken(value) {
    return String(value).replaceAll("~", "~0").replaceAll("/", "~1");
}

function normalizedDiffs(before, after, pointer = "") {
    if (digestStable(before) === digestStable(after)) return [];
    const beforeObject = before && typeof before === "object";
    const afterObject = after && typeof after === "object";
    if (!beforeObject || !afterObject || Array.isArray(before) !== Array.isArray(after)) {
        return [{
            jsonPointer: pointer || "/",
            beforeValue: before === undefined ? null : before,
            afterValue: after === undefined ? null : after,
            beforeFieldDigest: digestStable(before === undefined ? null : before),
            afterFieldDigest: digestStable(after === undefined ? null : after)
        }];
    }
    const keys = Array.isArray(before) && Array.isArray(after)
        ? Array.from({ length: Math.max(before.length, after.length) }, (_, index) => String(index))
        : [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])].sort();
    return keys.flatMap((key) => normalizedDiffs(before?.[key], after?.[key], `${pointer}/${pointerToken(key)}`));
}

function readArtifact(revisionHash, slug, expectedEntityId, treeEntry) {
    const revision = Object.values(revisions).find((item) => item.revision === revisionHash);
    if (!revision) throw new Error(`unknown source revision: ${revisionHash}`);
    const file = sourcePath(revision.revision, slug);
    if (!fs.existsSync(file)) throw new Error(`raw weapon artifact missing: ${relative(file)}`);
    const bytes = fs.readFileSync(file);
    if (treeEntry.size !== null && bytes.length !== treeEntry.size) throw new Error(`raw/tree byte mismatch: ${relative(file)}`);
    const value = parseEntity(bytes, expectedEntityId, slug, revision.revision);
    return {
        gameVersion: revision.gameVersion,
        revision: revision.revision,
        slug,
        path: relative(file),
        url: sourceUrl(revision.revision, slug),
        blobSha: treeEntry.sha,
        treeBlobBytes: treeEntry.size,
        rawArtifactBytes: bytes.length,
        rawArtifactDigest: sha256(bytes),
        normalizedRecordDigest: digestStable(normalizeRecord(value)),
        value
    };
}

async function acquire() {
    const progress = {
        schemaVersion: 1,
        kind: "genshinVersionTransitionWeaponEntityCaptureCheckpoint",
        generatedAt: new Date().toISOString(),
        transitionId: "genshin:6.7->7.0",
        status: "inProgress",
        requestedEntityCount: activeEntities.length,
        requestedEntityIds: activeExpectedEntityIds,
        revisions: Object.fromEntries(Object.entries(revisions).map(([key, revision]) => [key, {
            gameVersion: revision.gameVersion,
            revision: revision.revision,
            status: "pending",
            completedEntityIds: [],
            completedArtifactCount: 0
        }])),
        nextTask: "resolve nonrecursive Git tree for the first pending revision",
        gateEligibility: {
            canIssueEligibilityCertificate: false,
            canPromoteCanonical: false
        }
    };
    try {
        const queueShard = loadQueueShard();
        progress.queueShard = queueShard;
        for (const revisionKey of Object.keys(revisions)) {
            const revision = revisions[revisionKey];
            progress.revisions[revisionKey].status = "treeResolution";
            const tree = await resolveWeaponTree(revision.revision);
            const root = path.join(transitionRoot, "sources", activeSourceNamespace, revision.revision);
            fs.mkdirSync(root, { recursive: true });
            progress.revisions[revisionKey].status = "manifest";
            const manifestBytes = await fetchBytes(manifestUrl(revision.revision));
            validateManifestBytes(revisionKey, manifestBytes);
            fs.writeFileSync(manifestPath(revision.revision), manifestBytes);
            progress.revisions[revisionKey].status = "records";
            for (const entity of activeEntities) {
                const checkedCandidates = [];
                let selected = null;
                for (const slug of entity.slugCandidates) {
                    const entry = resolveEntry(tree, slug);
                    if (!entry) {
                        checkedCandidates.push({ slug, status: "treeEntryMissing" });
                        continue;
                    }
                    const bytes = await fetchBytes(sourceUrl(revision.revision, slug));
                    // In the API fallback the exact Git blob id is
                    // recomputed from the immutable raw bytes.  This is an
                    // integrity binding, not a claim that the tree was
                    // enumerated by the API.
                    entry.sha = entry.sha || gitBlobSha(bytes);
                    entry.size = bytes.length;
                    entry.url = sourceUrl(revision.revision, slug);
                    let parsedId = null;
                    try { parsedId = String(JSON.parse(bytes.toString("utf8")).id); } catch { /* parseEntity reports the selected failure */ }
                    checkedCandidates.push({ slug, status: parsedId === entity.entityId ? "idMatch" : "idMismatch", blobSha: entry.sha, treeBlobBytes: entry.size, parsedId });
                    if (parsedId === entity.entityId) {
                        if (selected) throw new Error(`multiple variant slugs match entity ${entity.entityId}: ${selected.slug}, ${slug}`);
                        selected = { slug, entry, bytes };
                    }
                }
                if (!selected) throw new Error(`no raw source slug resolved by parsed id for ${revision.gameVersion}/${entity.entityId}`);
                const file = sourcePath(revision.revision, selected.slug);
                fs.mkdirSync(path.dirname(file), { recursive: true });
                fs.writeFileSync(file, selected.bytes);
                progress.revisions[revisionKey].completedEntityIds.push(entity.entityId);
                progress.revisions[revisionKey].completedArtifactCount += 1;
            }
            // Keep the resolution evidence separate from the parsed records.
            // It proves that no recursive/mutable tree was silently used.
            fs.writeFileSync(path.join(root, "weapon-tree-resolution.json"), `${JSON.stringify({
                schemaVersion: 1,
                kind: "genshinDbWeaponTreeResolution",
                gameVersion: revision.gameVersion,
                revision: revision.revision,
                queueShard: queueShard.shardId,
                tree,
                fieldDigestAlgorithm: "sha256-stable-json-v1",
                fieldDigest: digestStable({ gameVersion: revision.gameVersion, revision: revision.revision, queueShard: queueShard.shardId, tree })
            }, null, 2)}\n`, "utf8");
            progress.revisions[revisionKey].status = "complete";
        }
        progress.status = "complete";
        progress.nextTask = "build weapon-entity-snapshot.json";
        fs.writeFileSync(activeCheckpointPath, `${JSON.stringify(progress, null, 2)}\n`, "utf8");
    } catch (error) {
        progress.status = "incompleteCheckpoint";
        progress.blocker = {
            kind: /tree fetch failed 403|rate limit|API rate/i.test(String(error.message)) ? "providerApiUnavailable" : "acquisitionError",
            message: String(error.message)
        };
        progress.nextTask = "resume acquisition from the first pending revision/entity; do not issue certificates or promote canonical";
        progress.fieldDigestAlgorithm = "sha256-stable-json-v1";
        progress.fieldDigest = digestStable({
            transitionId: progress.transitionId,
            requestedEntityIds: progress.requestedEntityIds,
            queueShard: progress.queueShard || null,
            revisions: progress.revisions,
            blocker: progress.blocker,
            nextTask: progress.nextTask,
            gateEligibility: progress.gateEligibility
        });
        fs.writeFileSync(activeCheckpointPath, `${JSON.stringify(progress, null, 2)}\n`, "utf8");
        throw error;
    }
}

function loadTreeEvidence(revision, queueShard) {
    const file = path.join(transitionRoot, "sources", activeSourceNamespace, revision.revision, "weapon-tree-resolution.json");
    if (!fs.existsSync(file)) throw new Error(`tree resolution evidence missing: ${relative(file)}`);
    const evidence = JSON.parse(fs.readFileSync(file, "utf8"));
    const expectedClaim = { gameVersion: revision.gameVersion, revision: revision.revision, queueShard: queueShard.shardId, tree: evidence.tree };
    if (evidence.kind !== "genshinDbWeaponTreeResolution"
        || evidence.gameVersion !== revision.gameVersion
        || evidence.revision !== revision.revision
        || evidence.queueShard !== queueShard.shardId
        || evidence.fieldDigest !== digestStable(expectedClaim)
        || !["gitTreeApiNonRecursive", "immutableRawPathFallback"].includes(evidence.tree?.method)
        || evidence.tree?.recursive !== false) throw new Error(`tree resolution evidence invalid: ${revision.gameVersion}`);
    if (!Array.isArray(evidence.tree.entries) || evidence.tree.entries.length === 0) throw new Error(`tree entries missing: ${revision.gameVersion}`);
    return evidence;
}

function buildRevisionClaim(revisionKey, queueShard, treeEvidence) {
    const revision = revisions[revisionKey];
    const manifestFile = manifestPath(revision.revision);
    const manifestBytes = fs.readFileSync(manifestFile);
    const manifest = validateManifestBytes(revisionKey, manifestBytes);
    const records = activeEntities.map((entity) => {
        const candidateEntries = entity.slugCandidates.map((slug) => {
            const entry = resolveEntry(treeEvidence.tree, slug);
            return entry ? { slug, blobSha: entry.sha, treeBlobBytes: entry.size } : { slug, status: "treeEntryMissing" };
        });
        const selectedSlugs = candidateEntries.filter((entry) => entry.treeBlobBytes !== undefined && fs.existsSync(sourcePath(revision.revision, entry.slug)) && (() => {
            try { return String(JSON.parse(fs.readFileSync(sourcePath(revision.revision, entry.slug), "utf8")).id) === entity.entityId; } catch { return false; }
        })()).map((entry) => entry.slug);
        if (selectedSlugs.length !== 1) throw new Error(`resolved slug count ${selectedSlugs.length} for ${revision.gameVersion}/${entity.entityId}`);
        const slug = selectedSlugs[0];
        const treeEntry = resolveEntry(treeEvidence.tree, slug);
        const { value, ...artifact } = readArtifact(revision.revision, slug, entity.entityId, treeEntry);
        return {
            entityId: entity.entityId,
            nameJa: entity.nameJa,
            slugCandidates: entity.slugCandidates,
            checkedCandidates: candidateEntries,
            selectedSlug: slug,
            artifact
        };
    });
    return {
        gameVersion: revision.gameVersion,
        revision: revision.revision,
        repository: "theBowja/genshin-db",
        sourceFamily: "GenshinData-derived",
        versionBinding: {
            status: "strictlyBound",
            gameVersion: revision.gameVersion,
            evidenceArtifact: relative(manifestFile),
            evidenceUrl: manifestUrl(revision.revision),
            evidenceBlobSha: gitBlobSha(manifestBytes),
            evidenceDigest: sha256(manifestBytes),
            evidenceBytes: manifestBytes.length,
            providerOwnedStatement: String(manifest.description || "")
        },
        treeResolution: treeEvidence.tree,
        records
    };
}

function buildSnapshot() {
    const queueShard = loadQueueShard();
    const beforeTree = loadTreeEvidence(revisions.before, queueShard);
    const afterTree = loadTreeEvidence(revisions.after, queueShard);
    const before = buildRevisionClaim("before", queueShard, beforeTree);
    const after = buildRevisionClaim("after", queueShard, afterTree);
    const afterById = new Map(after.records.map((record) => [record.entityId, record]));
    const records = before.records.map((beforeRecord) => {
        const afterRecord = afterById.get(beforeRecord.entityId);
        if (!afterRecord) throw new Error(`after record missing: ${beforeRecord.entityId}`);
        const beforeValue = JSON.parse(fs.readFileSync(path.join(repositoryRoot, beforeRecord.artifact.path), "utf8"));
        const afterValue = JSON.parse(fs.readFileSync(path.join(repositoryRoot, afterRecord.artifact.path), "utf8"));
        const normalizedBefore = normalizeRecord(beforeValue);
        const normalizedAfter = normalizeRecord(afterValue);
        const diffs = normalizedDiffs(normalizedBefore, normalizedAfter);
        return {
            entityId: beforeRecord.entityId,
            nameJa: beforeRecord.nameJa,
            before: beforeRecord,
            after: afterRecord,
            comparison: {
                rawRecordStatus: beforeRecord.artifact.rawArtifactDigest === afterRecord.artifact.rawArtifactDigest ? "rawRecordMatch" : "rawRecordChanged",
                normalizedStatus: diffs.length === 0 ? "normalizedRecordMatch" : "normalizedRecordChanged",
                changedFieldCount: diffs.length,
                fieldDiffs: diffs,
                beforeNormalizedDigest: digestStable(normalizedBefore),
                afterNormalizedDigest: digestStable(normalizedAfter)
            }
        };
    });
    const changed = records.filter((record) => record.comparison.normalizedStatus === "normalizedRecordChanged");
    const claim = {
        transitionId: "genshin:6.7->7.0",
        dataset: "weapon",
        provider: "genshin-db",
        sourceFamily: "GenshinData-derived",
        repository: "theBowja/genshin-db",
        queueShard,
        entityIds: activeExpectedEntityIds,
        before,
        after,
        records,
        coverage: {
            sourceRecordCoverage: "complete",
            normalizedDiffCoverage: "complete",
            entityCount: records.length,
            queueCandidateCount: queueShard.candidateCount,
            repositoryWeaponCandidateCoverage: "partial",
            canSatisfyCompleteEntityDiff: false,
            canIssueEligibilityCertificate: false,
            canPromoteCanonical: false
        },
        gateDisposition: {
            status: "singleCorrelatedFamilyFailClosed",
            providerIndependence: "correlated",
            reason: "genshin-db discloses Fandom/GenshinData lineage; this capture cannot approve or promote claims without a qualifying independent source family."
        }
    };
    return {
        schemaVersion: 1,
        kind: "genshinVersionTransitionWeaponEntitySnapshot",
        generatedAt: "2026-08-26T00:00:00.000Z",
        status: "completeProviderSnapshot",
        claim,
        summary: {
            entities: records.length,
            queueCandidates: queueShard.candidateCount,
            rawRecordsChanged: records.filter((record) => record.comparison.rawRecordStatus === "rawRecordChanged").length,
            normalizedRecordsChanged: changed.length,
            normalizedFieldsChanged: records.reduce((total, record) => total + record.comparison.changedFieldCount, 0),
            candidateEligibleClaims: 0
        },
        gateEligibility: {
            status: "singleCorrelatedFamilyFailClosed",
            canIssueEligibilityCertificate: false,
            canPromoteCanonical: false
        },
        fieldDigestAlgorithm: "sha256-stable-json-v1",
        fieldDigest: digestStable(claim)
    };
}

function writeSnapshot() {
    const snapshot = buildSnapshot();
    fs.writeFileSync(activeOutputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    if (fs.existsSync(activeCheckpointPath)) {
        const checkpoint = JSON.parse(fs.readFileSync(activeCheckpointPath, "utf8"));
        checkpoint.status = "complete";
        checkpoint.nextTask = "validate weapon-entity-snapshot.json and keep canonical promotion fail closed";
        checkpoint.materializedSnapshot = {
            path: relative(activeOutputPath),
            fieldDigest: snapshot.fieldDigest,
            entityCount: snapshot.summary.entities,
            normalizedRecordsChanged: snapshot.summary.normalizedRecordsChanged
        };
        checkpoint.fieldDigestAlgorithm = "sha256-stable-json-v1";
        checkpoint.fieldDigest = digestStable({
            transitionId: checkpoint.transitionId,
            requestedEntityIds: checkpoint.requestedEntityIds,
            queueShard: checkpoint.queueShard || null,
            revisions: checkpoint.revisions,
            blocker: checkpoint.blocker || null,
            nextTask: checkpoint.nextTask,
            materializedSnapshot: checkpoint.materializedSnapshot,
            gateEligibility: checkpoint.gateEligibility
        });
        fs.writeFileSync(activeCheckpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`, "utf8");
    }
    return snapshot;
}

async function main() {
    if (process.argv.includes("--fetch")) await acquire();
    process.stdout.write(`${JSON.stringify(writeSnapshot().summary, null, 2)}\n`);
}

if (require.main === module) main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
});

module.exports = {
    acquire,
    buildSnapshot,
    entities: activeEntities,
    expectedEntityIds: activeExpectedEntityIds,
    outputPath: activeOutputPath,
    revisions,
    resolveWeaponTree,
    checkpointPath: activeCheckpointPath,
    selectedShard,
    shardId: activeShardId,
    writeSnapshot
};
