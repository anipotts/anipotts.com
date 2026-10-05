import type { ReactNode } from "react";
import {
  ToggleButton,
  ToggleButtonGroup,
} from "@astryxdesign/core/ToggleButton";
import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@astryxdesign/core/DropdownMenu";
import { DotsThreeIcon } from "@phosphor-icons/react";
import { FilterMenu } from "./Workspace";

/** Two shortcuts and one complete menu. The selected overflow kind remains named. */
export function KindFilters<T extends string>({
  options,
  value,
  onChange,
  label,
  disabled = false,
}: {
  options: readonly { value: T; label: string; icon: ReactNode }[];
  value: T | null;
  onChange: (value: T | null) => void;
  label: string;
  disabled?: boolean;
}) {
  const shortcuts = options.slice(0, 2);
  const overflow = options.find(
    (option) =>
      option.value === value &&
      !shortcuts.some((shortcut) => shortcut.value === value),
  );
  return (
    <>
      <ToggleButtonGroup
        label={label}
        size="sm"
        isDisabled={disabled}
        value={value}
        onChange={(next) => onChange(next as T | null)}
      >
        {shortcuts.map((option) => (
          <ToggleButton
            key={option.value}
            value={option.value}
            label={option.label}
            icon={option.icon}
          />
        ))}
      </ToggleButtonGroup>
      <div inert={disabled || undefined}>
        <FilterMenu
          label="More types"
          icon={DotsThreeIcon}
          value={overflow?.label ?? "All kinds"}
          isActive={Boolean(overflow)}
        >
          <DropdownMenuRadioGroup
            label={label}
            value={value ?? ""}
            onChange={(next) => onChange(next ? (next as T) : null)}
          >
            <DropdownMenuRadioItem value="" label="All kinds" />
            {options.map((option) => (
              <DropdownMenuRadioItem
                key={option.value}
                value={option.value}
                label={option.label}
              />
            ))}
          </DropdownMenuRadioGroup>
        </FilterMenu>
      </div>
    </>
  );
}
