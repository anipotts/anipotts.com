/**
 * The one tile every brand, app, device and fallback mark sits in: a rounded
 * square on the badge's neutral fill, with the badge's corner radius scaled
 * to the tile. Brand artwork keeps its own colours; black glyphs swap to the
 * dark ink in the dark theme. An id the registry does not know draws the
 * Phosphor glyph for its kind in the same tile, so a row never loses its lead.
 *
 * Sizes are 20 (inline), 24 (desktop rows) and 28 (phone rows and detail
 * headers). Without `size` the tile follows `--row-mark-size`, which RowTitle
 * sets for its `mark` slot. State never lives in the tile, and the tile is
 * never the tap target.
 */
import React, { type CSSProperties } from "react";
import {
  ArchiveIcon,
  ArrowsCounterClockwiseIcon,
  ArrowsLeftRightIcon,
  BrowserIcon,
  CalendarBlankIcon,
  ClockIcon,
  CloudArrowUpIcon,
  DatabaseIcon,
  DesktopTowerIcon,
  DevicesIcon,
  GaugeIcon,
  GearSixIcon,
  GlobeSimpleIcon,
  HardDriveIcon,
  HeartbeatIcon,
  PencilSimpleLineIcon,
  QuestionIcon,
  SparkleIcon,
  type Icon,
} from "@phosphor-icons/react";
import { brandMark } from "@anipotts/brand/marks";
import type { GlyphKind } from "../lib/marks";
import "./brand-tile.css";

export const TILE_GLYPHS: Readonly<Record<GlyphKind, Icon>> = {
  agenda: CalendarBlankIcon,
  backup: ArchiveIcon,
  browser: BrowserIcon,
  desktop: DesktopTowerIcon,
  device: DevicesIcon,
  handoff: ArrowsLeftRightIcon,
  health: HeartbeatIcon,
  host: HardDriveIcon,
  inference: SparkleIcon,
  job: ClockIcon,
  loopback: ArrowsCounterClockwiseIcon,
  sampler: GaugeIcon,
  service: GearSixIcon,
  snapshot: CloudArrowUpIcon,
  source: DatabaseIcon,
  unknown: QuestionIcon,
  web: GlobeSimpleIcon,
  writer: PencilSimpleLineIcon,
};

export type BrandTileSize = 20 | 24 | 28;

export function BrandTile({
  id,
  kind = "unknown",
  size,
  label,
  className,
}: {
  /** A registry mark id. Anything else draws the glyph for `kind`. */
  id?: string | null;
  /** The Phosphor fallback when `id` has no mark. */
  kind?: GlyphKind;
  /** Omit inside RowTitle's mark slot to follow `--row-mark-size`. */
  size?: BrandTileSize;
  /** The accessible name and tooltip. Omit when text beside the tile already
   * names the thing, and the tile is hidden from assistive technology. */
  label?: string;
  className?: string;
}) {
  const mark = brandMark(id);
  const style = {
    ...(size ? { "--brand-tile-size": `${size}px` } : {}),
    ...(mark?.color
      ? {
          "--brand-mark-color": mark.color,
          "--brand-mark-dark": mark.dark ?? mark.color,
        }
      : {}),
  } as CSSProperties;
  const naming = label
    ? { role: "img", "aria-label": label, title: label }
    : { "aria-hidden": true as const };
  const Glyph = TILE_GLYPHS[kind] ?? QuestionIcon;

  return (
    <span
      className={className ? `brand-tile ${className}` : "brand-tile"}
      data-mark={mark?.id ?? kind}
      data-fit={mark ? mark.fit : "glyph"}
      style={style}
      {...naming}
    >
      {!mark ? (
        <Glyph className="brand-tile-glyph" weight="regular" aria-hidden />
      ) : mark.art.type === "symbol" ? (
        <svg className="brand-tile-art" aria-hidden="true" focusable="false">
          <use href={mark.art.href} />
        </svg>
      ) : mark.art.type === "vector" ? (
        <img
          className="brand-tile-art"
          src={mark.art.src}
          alt=""
          loading="lazy"
          decoding="async"
        />
      ) : (
        <picture>
          <source
            type="image/webp"
            srcSet={`${mark.art.webp56} 56w, ${mark.art.webp112} 112w`}
            sizes={`${size ?? 28}px`}
          />
          <img
            className="brand-tile-art"
            src={mark.art.png}
            alt=""
            loading="lazy"
            decoding="async"
          />
        </picture>
      )}
    </span>
  );
}
