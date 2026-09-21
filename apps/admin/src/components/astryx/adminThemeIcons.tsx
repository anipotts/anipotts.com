import React from "react";
import {
  CaretDownIcon,
  MagnifyingGlassIcon,
  XIcon,
} from "@phosphor-icons/react";

/** Astryx draws a few glyphs of its own (the sidebar group chevron, close and
 * search). Admin swaps them for Phosphor so every icon comes from one set. */
export const adminThemeIcons = {
  chevronDown: <CaretDownIcon size="1em" aria-hidden="true" />,
  close: <XIcon size="1em" aria-hidden="true" />,
  search: <MagnifyingGlassIcon size="1em" aria-hidden="true" />,
};
