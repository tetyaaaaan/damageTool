"""Build the local level-based Genshin base-stat data used by the calculator.

The selection catalog remains the source of truth for supported IDs. Numerical
growth data is synchronized from EnkaNetwork's public game-data store and is
written as a compact, deterministic JSON file for offline/runtime use.
"""

from __future__ import annotations

import json
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = ROOT / "games" / "genshin" / "data"
OUTPUT = DATA_ROOT / "base-stats.json"
SOURCES = {
    "avatars": "https://raw.githubusercontent.com/EnkaNetwork/API-docs/master/store/gi/avatars.json",
    "weapons": "https://raw.githubusercontent.com/EnkaNetwork/API-docs/master/store/gi/weapons.json",
    "curves": "https://raw.githubusercontent.com/EnkaNetwork/API-docs/master/store/gi/curves.json",
}


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def fetch_json(url: str):
    request = urllib.request.Request(url, headers={"User-Agent": "tetinet-data-sync/1.0"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def numeric_map(value):
    return {str(key): number for key, number in (value or {}).items() if isinstance(number, (int, float))}


def main():
    supported_characters = read_json(DATA_ROOT / "characters.json")
    supported_weapons = read_json(DATA_ROOT / "weapons.json")
    avatars = fetch_json(SOURCES["avatars"])
    weapons = fetch_json(SOURCES["weapons"])
    curves = fetch_json(SOURCES["curves"])

    character_stats = {}
    used_curve_ids = set()
    for item_id in supported_characters:
        source = avatars.get(str(item_id))
        if not source:
            continue
        curve_ids = numeric_map(source.get("PropGrowCurves"))
        used_curve_ids.update(str(value) for value in curve_ids.values())
        character_stats[str(item_id)] = {
            "baseProps": numeric_map(source.get("BaseProps")),
            "curveIds": curve_ids,
            "promoteProps": [numeric_map(item) for item in source.get("PromoteProps", [])],
        }

    weapon_stats = {}
    for item_id in supported_weapons:
        source = weapons.get(str(item_id))
        if not source:
            continue
        curve_ids = numeric_map(source.get("PropGrowCurves"))
        used_curve_ids.update(str(value) for value in curve_ids.values())
        weapon_stats[str(item_id)] = {
            "baseProps": numeric_map(source.get("BaseProps")),
            "curveIds": curve_ids,
            "basePromote": list(source.get("BasePromote", [])),
        }

    compact_curves = {
        curve_id: curves[curve_id]
        for curve_id in sorted(used_curve_ids, key=int)
        if curve_id in curves
    }
    payload = {
        "schemaVersion": 1,
        "maxLevel": 100,
        "source": SOURCES,
        "curves": compact_curves,
        "characters": character_stats,
        "weapons": weapon_stats,
    }
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"wrote {OUTPUT.relative_to(ROOT)}: {len(character_stats)} characters, {len(weapon_stats)} weapons")


if __name__ == "__main__":
    main()
