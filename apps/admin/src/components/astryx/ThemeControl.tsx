import React, { createContext, useContext } from "react";
import type { ThemePreference } from "@anipotts/brand/theme";
import { Button } from "@astryxdesign/core/Button";
import { Text } from "@astryxdesign/core/Text";
import { useTooltip } from "@astryxdesign/core/Tooltip";
import {
  CircleHalfIcon,
  MoonIcon,
  SunIcon,
  type Icon,
} from "@phosphor-icons/react";
import { nextTheme } from "../../lib/admin-theme";

export const THEME_NAMES: Record<ThemePreference, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};
export const THEME_ICONS: Record<ThemePreference, Icon> = {
  light: SunIcon,
  dark: MoonIcon,
  system: CircleHalfIcon,
};

/** Every control uses the shell's existing theme state and persistence. */
export const AdminThemeControls = createContext<{
  mode: ThemePreference;
  changeTheme: (mode: ThemePreference) => void;
} | null>(null);

export function ThemeControl({ className = "" }: { className?: string }) {
  const theme = useContext(AdminThemeControls);
  const tooltip = useTooltip({ delay: 300, placement: "below" });
  if (!theme) return null;
  const ThemeIcon = THEME_ICONS[theme.mode];
  const label = `${THEME_NAMES[theme.mode]} theme`;
  return (
    <>
      <Button
        className={`admin-theme-cycle ${className}`.trim()}
        label={label}
        ref={tooltip.ref}
        aria-describedby={tooltip.describedBy}
        isIconOnly
        variant="ghost"
        size="md"
        icon={<ThemeIcon size={18} aria-hidden="true" />}
        onClick={() => theme.changeTheme(nextTheme(theme.mode))}
      />
      {tooltip.renderTooltip(
        <Text type="supporting" style={{ color: "inherit" }}>
          {label}
        </Text>,
      )}
    </>
  );
}
