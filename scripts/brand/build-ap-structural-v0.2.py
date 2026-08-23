#!/usr/bin/env python3
"""Build the corrected AP Structural display face from the preserved v0.1 source.

The first candidate applied a 90% horizontal transform to every simple outline,
then applied the same transform again inside composite glyphs. This build
reverses both operations so the original optical proportions, metrics, anchors,
and kerning agree again while preserving the AP Structural family identity.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from fontTools.ttLib import TTFont


ROOT = Path(__file__).resolve().parents[2]
SOURCE_PACKET = ROOT / "packages/brand/ap-structural-v0.1.0-candidate.1"
OUTPUT_PACKET = ROOT / "packages/brand/ap-structural-v0.2.0-candidate.1"
SOURCE_FONT = (
    SOURCE_PACKET
    / "fonts/APStructuralDisplayBlack-v0.1.0-candidate.1.ttf"
)
TTF_OUTPUT = OUTPUT_PACKET / "fonts/APStructuralDisplayBlack-v0.2.0-candidate.1.ttf"
WOFF2_OUTPUT = OUTPUT_PACKET / "fonts/APStructuralDisplayBlack-v0.2.0-candidate.1.woff2"
HORIZONTAL_SCALE = 0.9000244140625
RESTORE_SCALE = 1 / HORIZONTAL_SCALE


def restore_horizontal_geometry(font: TTFont) -> None:
    glyf = font["glyf"]
    hmtx = font["hmtx"]

    for glyph_name in font.getGlyphOrder():
        glyph = glyf[glyph_name]
        advance, left_side_bearing = hmtx.metrics[glyph_name]
        hmtx.metrics[glyph_name] = (
            round(advance * RESTORE_SCALE),
            round(left_side_bearing * RESTORE_SCALE),
        )

        if glyph.isComposite():
            for component in glyph.components:
                component.x = round(component.x * RESTORE_SCALE)
                component.transform[0][0] *= RESTORE_SCALE
                component.transform[0][1] *= RESTORE_SCALE
        elif glyph.numberOfContours > 0:
            coordinates, _, _ = glyph.getCoordinates(glyf)
            for index, (x, y) in enumerate(coordinates):
                coordinates[index] = (round(x * RESTORE_SCALE), y)
            glyph.coordinates = coordinates

    for glyph_name in font.getGlyphOrder():
        glyph = glyf[glyph_name]
        if glyph.numberOfContours != 0:
            glyph.recalcBounds(glyf)


def update_metrics(font: TTFont) -> None:
    glyf = font["glyf"]
    hmtx = font["hmtx"]
    hhea = font["hhea"]
    bounds: list[tuple[int, int]] = []
    right_side_bearings: list[int] = []
    extents: list[int] = []

    for glyph_name in font.getGlyphOrder():
        glyph = glyf[glyph_name]
        advance, left_side_bearing = hmtx.metrics[glyph_name]
        if glyph.numberOfContours == 0:
            width = 0
            x_min = 0
            x_max = 0
        else:
            x_min = glyph.xMin
            x_max = glyph.xMax
            width = x_max - x_min
            bounds.append((x_min, x_max))
        right_side_bearings.append(advance - left_side_bearing - width)
        extents.append(left_side_bearing + width)

    hhea.advanceWidthMax = max(advance for advance, _ in hmtx.metrics.values())
    hhea.minLeftSideBearing = min(lsb for _, lsb in hmtx.metrics.values())
    hhea.minRightSideBearing = min(right_side_bearings)
    hhea.xMaxExtent = max(extents)
    font["head"].xMin = min(x_min for x_min, _ in bounds)
    font["head"].xMax = max(x_max for _, x_max in bounds)
    font["OS/2"].recalcAvgCharWidth(font)


def update_names(font: TTFont) -> None:
    replacements = {
        3: "0.201;ANIP;APStructuralDisplayBlack",
        5: "Version 0.201; width-corrected candidate.1",
    }
    for record in font["name"].names:
        replacement = replacements.get(record.nameID)
        if replacement is not None:
            record.string = replacement.encode(record.getEncoding())

    font["head"].fontRevision = 0.201
    font["OS/2"].usWidthClass = 5


def save_fonts(font: TTFont) -> None:
    TTF_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    font.recalcBBoxes = True
    font.recalcTimestamp = False
    font.save(TTF_OUTPUT, reorderTables=True)

    web_font = TTFont(TTF_OUTPUT, recalcTimestamp=False)
    web_font.flavor = "woff2"
    web_font.save(WOFF2_OUTPUT, reorderTables=True)


def validate_output() -> dict[str, int]:
    font = TTFont(TTF_OUTPUT, recalcTimestamp=False)
    expected_advances = {
        "I": 600,
        "a": 1218,
        "h": 1139,
        "i": 540,
        "m": 1777,
        "n": 1139,
        "o": 1120,
    }
    advances = {name: font["hmtx"].metrics[name][0] for name in expected_advances}
    for glyph_name, expected in expected_advances.items():
        actual = advances[glyph_name]
        if abs(actual - expected) > 1:
            raise ValueError(f"{glyph_name} advance {actual} did not restore to {expected}")

    i_components = font["glyf"]["i"].components
    if any(abs(component.transform[0][0] - 1) > 0.0001 for component in i_components):
        raise ValueError("i components remain horizontally compressed")

    if len(font.getGlyphOrder()) != 487:
        raise ValueError("glyph coverage changed")
    mapped_code_points = len({codepoint for table in font["cmap"].tables for codepoint in table.cmap})
    if mapped_code_points != 491:
        raise ValueError("mapped code-point coverage changed")
    return advances


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_manifest(advances: dict[str, int]) -> None:
    files = []
    for path in sorted(OUTPUT_PACKET.rglob("*")):
        if not path.is_file() or path.name == "MANIFEST.json":
            continue
        files.append(
            {
                "path": path.relative_to(OUTPUT_PACKET).as_posix(),
                "bytes": path.stat().st_size,
                "sha256": sha256(path),
            }
        )

    manifest = {
        "schemaVersion": 1,
        "family": "AP Structural",
        "master": "Display Black",
        "version": "0.2.0-candidate.1",
        "status": "web-ready",
        "builtOn": "2026-08-23",
        "intendedUse": "brand display headings",
        "license": {
            "name": "SIL Open Font License 1.1",
            "file": "license/OFL.txt",
            "provenance": "license/PROVENANCE.md",
        },
        "correction": {
            "sourcePacket": "ap-structural-v0.1.0-candidate.1",
            "sourceTtfSha256": sha256(SOURCE_FONT),
            "reversedHorizontalScale": HORIZONTAL_SCALE,
            "compositeTransformsRestored": True,
            "widthClass": 5,
            "referenceAdvances": advances,
        },
        "coverage": {
            "glyphs": 487,
            "mappedCodePoints": 491,
            "mapFile": "coverage/unicode-codepoints.txt",
        },
        "fonts": {
            "web": {
                "path": WOFF2_OUTPUT.relative_to(OUTPUT_PACKET).as_posix(),
                "format": "woff2",
            },
            "source": {
                "path": TTF_OUTPUT.relative_to(OUTPUT_PACKET).as_posix(),
                "format": "truetype",
            },
        },
        "files": files,
    }
    (OUTPUT_PACKET / "MANIFEST.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )


def main() -> None:
    font = TTFont(SOURCE_FONT, recalcTimestamp=False)
    restore_horizontal_geometry(font)
    update_metrics(font)
    update_names(font)
    save_fonts(font)
    advances = validate_output()
    write_manifest(advances)
    print(f"built {TTF_OUTPUT.relative_to(ROOT)}")
    print(f"built {WOFF2_OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
