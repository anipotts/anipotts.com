import React, { createContext, useContext } from "react";
import {
  CaretDownIcon,
  MagnifyingGlassIcon,
  XIcon,
  SidebarSimpleIcon,
} from "@phosphor-icons/react";

/** Scope the navigation toggle without changing other dialog close icons. */
export const NavigationIconScope = createContext(false);
function CloseIcon() {
  return useContext(NavigationIconScope) ? (
    <SidebarSimpleIcon size="1em" weight="regular" aria-hidden="true" />
  ) : (
    <XIcon size="1em" aria-hidden="true" />
  );
}

/** Astryx draws a few glyphs of its own (the sidebar group chevron, close and
 * search). Admin swaps them for Phosphor so every icon comes from one set. */
export const adminThemeIcons = {
  chevronDown: <CaretDownIcon size="1em" aria-hidden="true" />,
  close: <CloseIcon />,
  search: <MagnifyingGlassIcon size="1em" aria-hidden="true" />,
};
