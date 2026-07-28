#!/usr/bin/env python3
"""Build the HSR runtime catalog and optional WebP thumbnails.

The runtime never reads the downloaded upstream JSON directly.  This script
normalizes stable game IDs into the small contract used by the browser.
"""

from __future__ import annotations

import argparse
import io
import json
import urllib.request
from datetime import date
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
BASE = "https://raw.githubusercontent.com/Mar-7th/StarRailRes/master"
INDEX = f"{BASE}/index_new/jp"
DATA_DIR = ROOT / "games" / "hsr" / "data"
IMAGE_DIR = ROOT / "games" / "images" / "hsr"
LICENSE_DIR = ROOT / "third_party_licenses"

SOURCE_FILES = (
    "characters",
    "character_promotions",
    "character_ranks",
    "character_skills",
    "character_skill_trees",
    "light_cones",
    "light_cone_promotions",
    "light_cone_ranks",
    "relic_sets",
    "paths",
    "elements",
)

# Description strings are never parsed.  Each supported damage component is
# reviewed against the in-game parameter order and declared explicitly here.
ATTACK_RULES = {
    "100101": {"characterId": "1001", "scaling": "atk", "param": 0, "target": "single", "type": "normal", "hits": 1},
    "100103": {"characterId": "1001", "scaling": "atk", "param": 0, "target": "aoe", "type": "ultimate", "hits": 1},
    "100104": {"characterId": "1001", "scaling": "atk", "param": 0, "target": "single", "type": "followUp", "hits": 1},
    "100201": {"characterId": "1002", "scaling": "atk", "param": 0, "target": "single", "type": "normal", "hits": 1},
    "100202": {"characterId": "1002", "scaling": "atk", "param": 0, "target": "single", "type": "skill", "hits": 1},
    "100203": {"characterId": "1002", "scaling": "atk", "param": 0, "target": "single", "type": "ultimate", "hits": 1,
               "conditional": {"id": "target-slowed", "label": "敵が減速状態", "bonusParam": 1}},
    "100301": {"characterId": "1003", "scaling": "atk", "param": 0, "target": "single", "type": "normal", "hits": 1},
    "100302": {"characterId": "1003", "scaling": "atk", "param": 0, "adjacentParam": 1, "target": "blast", "type": "skill", "hits": 1},
    "100303": {"characterId": "1003", "scaling": "atk", "param": 0, "target": "aoe", "type": "ultimate", "hits": 1},
    "100304": {"characterId": "1003", "scaling": "atk", "param": 0, "target": "aoe", "type": "followUp", "hits": 1},
    "110201": {"characterId": "1102", "scaling": "atk", "param": 0, "target": "single", "type": "normal", "hits": 1},
    "110202": {"characterId": "1102", "scaling": "atk", "param": 0, "target": "single", "type": "skill", "hits": 1},
    "110203": {"characterId": "1102", "scaling": "atk", "param": 0, "target": "single", "type": "ultimate", "hits": 1},
}

# Explicit parameter mappings for representative party effects. Descriptions
# stay display-only; calculation values always come from a reviewed param index.
PARTY_MODIFIER_RULES = (
    {"id": "tingyun-ultimate-damage", "sourceId": "1202", "skillId": "120203", "param": 2, "name": "慶雲光覆儀祷・与ダメージ", "category": "damageBonus", "trigger": "必殺技の効果中", "scope": "allySingle"},
    {"id": "bronya-skill-damage", "sourceId": "1101", "skillId": "110102", "param": 0, "name": "作戦再展開・与ダメージ", "category": "damageBonus", "trigger": "戦闘スキルの効果中", "scope": "allySingle"},
    {"id": "pela-ultimate-defense", "sourceId": "1106", "skillId": "110603", "param": 1, "name": "領域制圧・防御ダウン", "category": "defenseReduction", "trigger": "敵が「一般解」状態", "scope": "enemyAll"},
    {"id": "ruanmei-skill-damage", "sourceId": "1303", "skillId": "130302", "param": 0, "name": "弦外の音・与ダメージ", "category": "damageBonus", "trigger": "「弦外の音」の効果中", "scope": "partyAll"},
    {"id": "ruanmei-ultimate-res", "sourceId": "1303", "skillId": "130303", "param": 0, "name": "結界・全属性耐性貫通", "category": "resistancePenetration", "trigger": "必殺技の結界展開中", "scope": "partyAll"},
)


def fetch_json(url: str):
    request = urllib.request.Request(url, headers={"User-Agent": "tetinet-hsr-catalog-sync/1.0"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(io.TextIOWrapper(response, encoding="utf-8"))


def sync_upstream_license():
    destination = LICENSE_DIR / "StarRailRes-AGPL-3.0.txt"
    if destination.exists():
        return
    request = urllib.request.Request(f"{BASE}/LICENSE", headers={"User-Agent": "tetinet-hsr-catalog-sync/1.0"})
    with urllib.request.urlopen(request, timeout=60) as response:
        text = response.read().decode("utf-8")
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(text, encoding="utf-8")


def level_80_stats(promotion):
    values = promotion.get("values") or []
    final = values[-1] if values else {}
    result = {}
    for target, source in (("hp", "hp"), ("atk", "atk"), ("def", "def"), ("speed", "spd")):
        value = final.get(source) or {}
        result[target] = round(float(value.get("base", 0)) + float(value.get("step", 0)) * 79, 3)
    return result


def referenced_rows(ids, table, mapper):
    return [mapper(table[item_id]) for item_id in ids if item_id in table]


def build_catalog(source):
    paths = source["paths"]
    elements = source["elements"]
    promotions = source["character_promotions"]
    cone_promotions = source["light_cone_promotions"]
    character_ranks = source["character_ranks"]
    character_skills = source["character_skills"]
    character_skill_trees = source["character_skill_trees"]
    light_cone_ranks = source["light_cone_ranks"]

    characters = []
    for item in source["characters"].values():
        path_name = paths.get(item["path"], {}).get("name", item["path"])
        character_name = item["name"]
        if character_name == "{NICKNAME}":
            gender = "男性" if int(item["id"]) % 2 else "女性"
            character_name = f"開拓者（{path_name}・{gender}）"
        characters.append({
            "id": str(item["id"]),
            "name": character_name,
            "rarity": item["rarity"],
            "path": item["path"],
            "pathName": path_name,
            "element": item["element"],
            "elementName": elements.get(item["element"], {}).get("name", item["element"]),
            "maxEnergy": item.get("max_sp"),
            "base": level_80_stats(promotions.get(str(item["id"]), {})),
            "skills": referenced_rows(item.get("skills", []), character_skills, lambda row: {
                "id": str(row["id"]),
                "name": row.get("name", ""),
                "type": row.get("type", ""),
                "target": row.get("target", ""),
                "description": row.get("desc", ""),
                "params": row.get("params", []),
            }),
            "traces": referenced_rows(item.get("skill_trees", []), character_skill_trees, lambda row: {
                "id": str(row["id"]),
                "name": row.get("name", ""),
                "maxLevel": row.get("max_level", 1),
                "description": row.get("desc", ""),
                "params": row.get("params", []),
                "levels": [{"promotion": level.get("promotion", 0), "level": level.get("level", 0), "properties": level.get("properties", [])} for level in row.get("levels", [])],
            }),
            "eidolons": referenced_rows(item.get("ranks", []), character_ranks, lambda row: {
                "id": str(row["id"]),
                "rank": row.get("rank", 0),
                "name": row.get("name", ""),
                "description": row.get("desc", ""),
                "levelUpSkills": row.get("level_up_skills", []),
            }),
            "image": f"/games/images/hsr/characters/{item['id']}.webp",
            "sourceImage": item.get("icon", ""),
        })

    light_cones = []
    for item in source["light_cones"].values():
        light_cones.append({
            "id": str(item["id"]),
            "name": item["name"],
            "rarity": item["rarity"],
            "path": item["path"],
            "pathName": paths.get(item["path"], {}).get("name", item["path"]),
            "base": level_80_stats(cone_promotions.get(str(item["id"]), {})),
            "effect": ({
                "name": light_cone_ranks[str(item["id"])].get("skill", ""),
                "description": light_cone_ranks[str(item["id"])].get("desc", ""),
                "paramsByRank": light_cone_ranks[str(item["id"])].get("params", []),
                "propertiesByRank": light_cone_ranks[str(item["id"])].get("properties", []),
            } if str(item["id"]) in light_cone_ranks else None),
            "image": f"/games/images/hsr/light-cones/{item['id']}.webp",
            "sourceImage": item.get("icon", ""),
        })

    relic_sets = []
    for item in source["relic_sets"].values():
        set_id = str(item["id"])
        relic_sets.append({
            "id": set_id,
            "name": item["name"],
            "type": "ornament" if int(set_id) >= 300 else "relic",
            "effects": [
                {"pieces": 2, "description": item.get("desc", [""])[0], "properties": item.get("properties", [])[0] if item.get("properties") else []},
                {"pieces": 4, "description": item.get("desc", ["", ""])[1], "properties": item.get("properties", [[], []])[1] if len(item.get("properties", [])) > 1 else []},
            ] if int(set_id) < 300 else [
                {"pieces": 2, "description": " ".join(item.get("desc", [])), "properties": [prop for group in item.get("properties", []) for prop in group]},
            ],
            "image": f"/games/images/hsr/relics/{set_id}.webp",
            "sourceImage": item.get("icon", ""),
        })

    return {
        "schemaVersion": 1,
        "generatedAt": date.today().isoformat(),
        "gameVersion": "StarRailRes master as of generation date; upstream does not declare an in-game version here",
        "characters": sorted(characters, key=lambda row: (row["rarity"], row["id"]), reverse=True),
        "lightCones": sorted(light_cones, key=lambda row: (row["rarity"], row["id"]), reverse=True),
        "relicSets": sorted(relic_sets, key=lambda row: (row["type"], row["id"])),
        "enemies": [
            {"id": "3001010", "name": "検証用エネミー A（画像ID 3001010）", "level": 80, "resistance": 0, "weakness": True, "toughnessActive": False, "maxToughness": 30, "image": "/games/images/hsr/enemies/3001010.webp", "sourceImage": "icon/avatar/Monster_3001010.png"},
            {"id": "3001020", "name": "検証用エネミー B（画像ID 3001020）", "level": 80, "resistance": 20, "weakness": False, "toughnessActive": True, "maxToughness": 30, "image": "/games/images/hsr/enemies/3001020.webp", "sourceImage": "icon/avatar/Monster_3001020.png"},
            {"id": "3002010", "name": "検証用エネミー C（画像ID 3002010）", "level": 80, "resistance": 40, "weakness": False, "toughnessActive": True, "maxToughness": 60, "image": "/games/images/hsr/enemies/3002010.webp", "sourceImage": "icon/avatar/Monster_3002010.png"},
        ],
        "sources": [{
            "name": "Mar-7th/StarRailRes",
            "url": "https://github.com/Mar-7th/StarRailRes",
            "license": "AGPL-3.0 (repository); HoYoverse retains rights to game content",
            "retrievedAt": date.today().isoformat(),
            "gameAssetRights": "HoYoverse retains all rights; repository license does not replace game-content terms",
        }],
    }


def build_attacks(source):
    skills = source["character_skills"]
    attacks = []
    for skill_id, rule in ATTACK_RULES.items():
        skill = skills[skill_id]
        attack = {
            "id": skill_id,
            "characterId": rule["characterId"],
            "name": skill["name"],
            "element": skill.get("element"),
            "type": rule["type"],
            "target": rule["target"],
            "scalingStat": rule["scaling"],
            "hitCount": rule["hits"],
            "canCrit": True,
            "multipliers": [round(row[rule["param"]] * 100, 4) for row in skill["params"]],
            "sourceSkillId": skill_id,
        }
        if "adjacentParam" in rule:
            attack["adjacentMultipliers"] = [round(row[rule["adjacentParam"]] * 100, 4) for row in skill["params"]]
        if "conditional" in rule:
            condition = dict(rule["conditional"])
            bonus_param = condition.pop("bonusParam")
            condition["bonusMultipliers"] = [round(row[bonus_param] * 100, 4) for row in skill["params"]]
            attack["condition"] = condition
        attacks.append(attack)
    return {"schemaVersion": 1, "attacks": attacks}


def build_modifiers(source):
    skills = source["character_skills"]
    rows = []
    for rule in PARTY_MODIFIER_RULES:
        skill = skills[rule["skillId"]]
        rows.append({
            "id": rule["id"], "sourceKind": "character", "sourceId": rule["sourceId"], "sourceSkillId": rule["skillId"],
            "name": rule["name"], "description": skill.get("desc", ""), "trigger": rule["trigger"],
            "appliesTo": rule["scope"], "targetElements": [], "targetPaths": [], "attackTypes": ["all"],
            "category": rule["category"], "valuesByLevel": [round(row[rule["param"]] * 100, 4) for row in skill["params"]],
            "unit": "percent", "operation": "additive", "stackable": False, "cap": 100,
            "applicationOrder": rule["category"], "defaultLevel": 10,
        })
    return {"schemaVersion": 1, "modifiers": rows}


def save_json(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def download_webp(relative_source: str, destination: Path, size: tuple[int, int]):
    if not relative_source or destination.exists():
        return
    request = urllib.request.Request(f"{BASE}/{relative_source}", headers={"User-Agent": "tetinet-hsr-image-sync/1.0"})
    with urllib.request.urlopen(request, timeout=60) as response:
        image = Image.open(io.BytesIO(response.read())).convert("RGBA")
    image.thumbnail(size, Image.Resampling.LANCZOS)
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, "WEBP", quality=82, method=6)


def sync_images(catalog):
    groups = (
        (catalog["characters"], "characters", (256, 256)),
        (catalog["lightCones"], "light-cones", (256, 256)),
        (catalog["relicSets"], "relics", (192, 192)),
        (catalog["enemies"], "enemies", (256, 256)),
    )
    for rows, folder, size in groups:
        for item in rows:
            download_webp(item["sourceImage"], IMAGE_DIR / folder / f"{item['id']}.webp", size)


def write_image_manifest(catalog):
    groups = (("characters", "characters"), ("lightCones", "light-cones"), ("relicSets", "relics"), ("enemies", "enemies"))
    expected = []
    missing = []
    for key, folder in groups:
        for item in catalog[key]:
            row = {"type": folder, "id": item["id"], "name": item["name"], "path": item["image"], "sourceImage": item.get("sourceImage", "")}
            expected.append(row)
            if not (IMAGE_DIR / folder / f"{item['id']}.webp").exists():
                missing.append(row)
    save_json(DATA_DIR / "image-manifest.json", {"generatedAt": date.today().isoformat(), "expected": len(expected), "available": len(expected) - len(missing), "missing": missing})


def create_local_fallbacks():
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    fallback = IMAGE_DIR / "fallback.webp"
    if not fallback.exists():
        source = ROOT / "games" / "images" / "theme" / "hsr-mascot-light.webp"
        image = Image.open(source).convert("RGBA")
        image.thumbnail((256, 256), Image.Resampling.LANCZOS)
        image.save(fallback, "WEBP", quality=82, method=6)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--images", action="store_true", help="download and convert thumbnails")
    parser.add_argument("--fallback-only", action="store_true", help="create local fallback and training-target images only")
    args = parser.parse_args()
    create_local_fallbacks()
    sync_upstream_license()
    if args.fallback_only:
        print("fallbacks=ready")
        return
    source = {name: fetch_json(f"{INDEX}/{name}.json") for name in SOURCE_FILES}
    catalog = build_catalog(source)
    save_json(DATA_DIR / "catalog.json", catalog)
    save_json(DATA_DIR / "attacks.json", build_attacks(source))
    save_json(DATA_DIR / "modifiers.json", build_modifiers(source))
    if args.images:
        sync_images(catalog)
    write_image_manifest(catalog)
    print(f"characters={len(catalog['characters'])} cones={len(catalog['lightCones'])} sets={len(catalog['relicSets'])}")


if __name__ == "__main__":
    main()
