/** Shared workspace controls use the same Core implementation on every route. */
import type { ComponentProps } from "react";
import { useOpenAIUI } from "./AdminUI";
export { Button } from "@astryxdesign/core/Button";
export { IconButton } from "@astryxdesign/core/IconButton";
export { TextInput } from "@astryxdesign/core/TextInput";
export { TextArea } from "@astryxdesign/core/TextArea";
export { NumberInput } from "@astryxdesign/core/NumberInput";
export {
  ToggleButton,
  ToggleButtonGroup,
} from "@astryxdesign/core/ToggleButton";
export { Banner } from "@astryxdesign/core/Banner";
export { Selector } from "@astryxdesign/core/Selector";
export { MoreMenu } from "@astryxdesign/core/MoreMenu";
export {
  DropdownMenu,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@astryxdesign/core/DropdownMenu";

/** File pickers retain native FileList and ref-clearing semantics. */
export function FileInput({
  label,
  ...props
}: Omit<
  ComponentProps<"input">,
  "type" | "value" | "defaultValue" | "children"
> & {
  label: string;
}) {
  const enabled = useOpenAIUI();
  return (
    <label className={enabled ? "writing-control-field" : undefined}>
      <span className={enabled ? "writing-control-label" : undefined}>
        {label}
      </span>
      <input {...props} type="file" />
    </label>
  );
}
