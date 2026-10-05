import React from "react";
import { projectMark } from "@anipotts/brand/project-marks";
import { BrandTile } from "../BrandTile";
import {
  BriefcaseIcon,
  ChartLineUpIcon,
  DesktopTowerIcon,
  HardDrivesIcon,
  BookOpenTextIcon,
  ActivityIcon,
  type Icon,
  WaveformIcon,
} from "@phosphor-icons/react";
import { projectMediaPreview } from "../../lib/project-media";
import type { CatalogRecord } from "../astryx/EditorialApp";
/** One project identity renderer for library rows and other catalog surfaces. */
export function ContentRecordMark({
  record,
  className,
}: {
  record: Pick<CatalogRecord, "id" | "href" | "projectIdentity">;
  className?: string;
}) {
  const id = record.id ?? record.href.split("?")[0].split("/").at(-1);
  const identity = record.projectIdentity;
  const artwork = identity
    ? projectMediaPreview(identity.logo_src, "https://anipotts.com")
    : projectMark(id);
  if (artwork)
    return (
      <BrandTile
        id={id}
        artwork={artwork}
        artworkTone={identity?.logo_tone}
        className={className}
      />
    );
  const configuredGlyph = (
    {
      briefcase: BriefcaseIcon,
      "chart-line-up": ChartLineUpIcon,
      "desktop-tower": DesktopTowerIcon,
      "hard-drives": HardDrivesIcon,
      "book-open-text": BookOpenTextIcon,
      waveform: WaveformIcon,
      activity: ActivityIcon,
    } as Record<string, Icon>
  )[identity?.icon ?? ""];
  const Glyph =
    configuredGlyph ??
    (id === "options-pricing-sensitivity"
      ? ChartLineUpIcon
      : id === "range-media-partners" || id === "saeshify"
        ? WaveformIcon
        : BriefcaseIcon);
  return <BrandTile glyph={Glyph} className={className} />;
}
