#!/usr/bin/env python3
"""Download and optimize Genshin character, weapon, and artifact set icons."""

from __future__ import annotations

import argparse
import io
import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from PIL import Image, ImageDraw, ImageOps


ROOT = Path(__file__).resolve().parents[1]
CHARACTER_DATA = ROOT / "games/genshin/data/characters.json"
WEAPON_DATA = ROOT / "games/genshin/data/weapons.json"
ARTIFACT_SET_DATA = ROOT / "games/genshin/data/artifact-sets.json"
IMAGE_ROOT = ROOT / "games/images/genshin"
CHARACTER_OUTPUT = IMAGE_ROOT / "characters"
WEAPON_OUTPUT = IMAGE_ROOT / "weapons"
ARTIFACT_OUTPUT = IMAGE_ROOT / "artifacts"
FALLBACK_OUTPUT = IMAGE_ROOT / "fallback.webp"
FALLBACK_ITEMS_OUTPUT = IMAGE_ROOT / "fallback-items.json"

AVATAR_METADATA_URL = "https://raw.githubusercontent.com/EnkaNetwork/API-docs/master/store/gi/avatars.json"
WEAPON_METADATA_URL = "https://raw.githubusercontent.com/EnkaNetwork/API-docs/master/store/gi/weapons.json"
ARTIFACT_METADATA_URL = "https://raw.githubusercontent.com/EnkaNetwork/API-docs/master/store/gi/relics.json"
ENKA_ASSET_ORIGIN = "https://enka.network"
USER_AGENT = "tetinet-image-sync/1.0 (+https://tetinet.com/)"
OUTPUT_SIZE = 96
WEBP_QUALITY = 84


def read_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def fetch_bytes(url: str, attempts: int = 3) -> bytes:
    request = Request(url, headers={"User-Agent": USER_AGENT})
    last_error: Exception | None = None
    for attempt in range(attempts):
        try:
            with urlopen(request, timeout=30) as response:
                return response.read()
        except (HTTPError, URLError, TimeoutError) as error:
            last_error = error
            if attempt + 1 < attempts:
                time.sleep(0.6 * (attempt + 1))
    raise RuntimeError(f"Failed to download {url}: {last_error}")


def fetch_json(url: str) -> dict[str, Any]:
    return json.loads(fetch_bytes(url).decode("utf-8"))


def normalize_asset_path(path: str) -> str:
    return path if path.startswith("/") else f"/{path}"


def character_asset_candidates(metadata: dict[str, Any]) -> list[str]:
    side_icon = normalize_asset_path(str(metadata.get("SideIconName") or ""))
    if not side_icon.strip("/"):
        return []
    square_icon = side_icon.replace("/UI_AvatarIcon_Side_", "/UI_AvatarIcon_", 1)
    return list(dict.fromkeys([square_icon, side_icon]))


def weapon_asset_candidates(metadata: dict[str, Any]) -> list[str]:
    icon = normalize_asset_path(str(metadata.get("Icon") or ""))
    return [icon] if icon.strip("/") else []


def artifact_asset_candidates(metadata: dict[str, Any]) -> list[str]:
    icon = normalize_asset_path(str(metadata.get("Icon") or ""))
    return [icon] if icon.strip("/") else []


def artifact_set_metadata(items: dict[str, Any], local_ids: set[str]) -> dict[str, dict[str, Any]]:
    sets: dict[str, dict[str, Any]] = {}
    for metadata in items.values():
        set_id = str(metadata.get("SetId") or "")
        if set_id not in local_ids or metadata.get("EquipType") != 0:
            continue
        current = sets.get(set_id)
        if current is None or int(metadata.get("Rarity") or 0) > int(current.get("Rarity") or 0):
            sets[set_id] = metadata
    return sets


def valid_webp(path: Path) -> bool:
    if not path.is_file() or path.stat().st_size < 16:
        return False
    with path.open("rb") as handle:
        header = handle.read(12)
    return header[:4] == b"RIFF" and header[8:12] == b"WEBP"


def save_webp(source: bytes, output: Path) -> None:
    with Image.open(io.BytesIO(source)) as image:
        image = image.convert("RGBA")
        fitted = ImageOps.contain(image, (OUTPUT_SIZE, OUTPUT_SIZE), Image.Resampling.LANCZOS)
        canvas = Image.new("RGBA", (OUTPUT_SIZE, OUTPUT_SIZE), (0, 0, 0, 0))
        offset = ((OUTPUT_SIZE - fitted.width) // 2, (OUTPUT_SIZE - fitted.height) // 2)
        canvas.alpha_composite(fitted, offset)
        output.parent.mkdir(parents=True, exist_ok=True)
        temporary = output.with_suffix(".tmp.webp")
        canvas.save(temporary, "WEBP", quality=WEBP_QUALITY, method=6, exact=True)
        temporary.replace(output)


def create_fallback() -> None:
    image = Image.new("RGBA", (OUTPUT_SIZE, OUTPUT_SIZE), (10, 34, 46, 255))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((2, 2, 93, 93), radius=16, outline=(53, 210, 188, 150), width=3)
    draw.ellipse((34, 21, 62, 49), fill=(136, 166, 178, 255))
    draw.rounded_rectangle((25, 51, 71, 82), radius=19, fill=(136, 166, 178, 255))
    image.save(FALLBACK_OUTPUT, "WEBP", quality=WEBP_QUALITY, method=6)


def sync_one(kind: str, item_id: str, candidates: list[str], force: bool) -> tuple[str, str, str]:
    output_dir = {
        "characters": CHARACTER_OUTPUT,
        "weapons": WEAPON_OUTPUT,
        "artifacts": ARTIFACT_OUTPUT,
    }[kind]
    output = output_dir / f"{item_id}.webp"
    if not force and valid_webp(output):
        return kind, item_id, "cached"

    errors: list[str] = []
    for asset_path in candidates:
        url = f"{ENKA_ASSET_ORIGIN}{asset_path}"
        try:
            save_webp(fetch_bytes(url), output)
            return kind, item_id, asset_path
        except (RuntimeError, OSError) as error:
            errors.append(str(error))
    return kind, item_id, " | ".join(errors) or "metadata has no icon path"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true", help="download and replace existing images")
    parser.add_argument("--workers", type=int, default=6, help="maximum concurrent downloads")
    args = parser.parse_args()

    local_characters = read_json(CHARACTER_DATA)
    local_weapons = read_json(WEAPON_DATA)
    local_artifacts = read_json(ARTIFACT_SET_DATA)
    enka_characters = fetch_json(AVATAR_METADATA_URL)
    enka_weapons = fetch_json(WEAPON_METADATA_URL)
    enka_relics = fetch_json(ARTIFACT_METADATA_URL)
    enka_artifacts = artifact_set_metadata(enka_relics.get("Items", {}), set(local_artifacts))

    jobs: list[tuple[str, str, list[str]]] = []
    fallback_items: dict[str, list[str]] = {"characters": [], "weapons": [], "artifacts": []}
    for item_id in sorted(local_characters):
        metadata = enka_characters.get(item_id)
        if not metadata:
            fallback_items["characters"].append(item_id)
            continue
        jobs.append(("characters", item_id, character_asset_candidates(metadata)))
    for item_id in sorted(local_weapons):
        metadata = enka_weapons.get(item_id)
        if not metadata:
            fallback_items["weapons"].append(item_id)
            continue
        jobs.append(("weapons", item_id, weapon_asset_candidates(metadata)))
    for item_id in sorted(local_artifacts):
        metadata = enka_artifacts.get(item_id)
        if not metadata:
            fallback_items["artifacts"].append(item_id)
            continue
        jobs.append(("artifacts", item_id, artifact_asset_candidates(metadata)))

    IMAGE_ROOT.mkdir(parents=True, exist_ok=True)
    create_fallback()
    with FALLBACK_ITEMS_OUTPUT.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(fallback_items, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    failed: list[str] = []
    completed = 0
    cached = 0
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as executor:
        futures = [executor.submit(sync_one, kind, item_id, candidates, args.force) for kind, item_id, candidates in jobs]
        for future in as_completed(futures):
            kind, item_id, result = future.result()
            if result == "cached":
                cached += 1
            elif result.startswith("/ui/"):
                completed += 1
            else:
                failed.append(f"{kind}:{item_id}: {result}")

    expected = len(local_characters) + len(local_weapons) + len(local_artifacts)
    fallback_count = sum(len(item_ids) for item_ids in fallback_items.values())
    actual = sum(1 for item_id in local_characters if valid_webp(CHARACTER_OUTPUT / f"{item_id}.webp"))
    actual += sum(1 for item_id in local_weapons if valid_webp(WEAPON_OUTPUT / f"{item_id}.webp"))
    actual += sum(1 for item_id in local_artifacts if valid_webp(ARTIFACT_OUTPUT / f"{item_id}.webp"))
    print(f"Expected IDs: {expected} (characters={len(local_characters)}, weapons={len(local_weapons)}, artifacts={len(local_artifacts)})")
    print(f"Images ready: {actual} (downloaded={completed}, cached={cached}, fallback={fallback_count})")
    print(f"Fallback: {FALLBACK_OUTPUT.relative_to(ROOT)}")
    for kind, item_ids in fallback_items.items():
        if item_ids:
            print(f"Fallback {kind}: {', '.join(item_ids)}")
    if failed:
        print("Missing or failed images:", file=sys.stderr)
        for entry in sorted(failed):
            print(f"- {entry}", file=sys.stderr)
    return 0 if actual + fallback_count == expected and not failed else 1


if __name__ == "__main__":
    raise SystemExit(main())
