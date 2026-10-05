import React from "react";
import { projectMark } from "@anipotts/brand/project-marks";
import { BrandTile } from "../BrandTile";
import {
  BriefcaseIcon,
  ChartLineUpIcon,
  WaveformIcon,
} from "@phosphor-icons/react";
import type { CatalogRecord } from "../astryx/EditorialApp";
/** One project identity renderer for library rows and other catalog surfaces. */
export function ContentRecordMark({
  record,
}: {
  record: Pick<CatalogRecord, "id" | "href">;
}) {
  const id = record.id ?? record.href.split("?")[0].split("/").at(-1);
  const artwork = projectMark(id);
  if (artwork) return <BrandTile id={id} artwork={artwork} />;
  const Glyph =
    id === "options-pricing-sensitivity"
      ? ChartLineUpIcon
      : id === "range-media-partners" || id === "saeshify"
        ? WaveformIcon
        : BriefcaseIcon;
  return <Glyph weight="regular" aria-hidden="true" />;
}
