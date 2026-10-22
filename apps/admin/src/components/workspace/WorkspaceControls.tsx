/** Shared workspace controls use the same Core implementation on every route. */
import type { ComponentProps } from "react";
import { useMergedRefs } from "@astryxdesign/core/hooks";
import { useOpenAIUI } from "./AdminUI";
import { Button as CoreButton } from "@astryxdesign/core/Button";
import { IconButton as CoreIconButton } from "@astryxdesign/core/IconButton";
import { ToggleButton as CoreToggleButton } from "@astryxdesign/core/ToggleButton";
import { Banner as CoreBanner } from "@astryxdesign/core/Banner";
import { DropdownMenu as CoreDropdownMenu } from "@astryxdesign/core/DropdownMenu";

function tooltip(
  props: {
    label: string;
    tooltip?: string;
    "aria-describedby"?: string;
    isDisabled?: boolean;
    isLoading?: boolean;
  },
  fallback: boolean,
) {
  // Core keeps tooltip-bearing disabled buttons focusable with aria-disabled.
  // Workspace disabled/loading controls must retain native disabled semantics.
  return props.isDisabled ||
    props.isLoading ||
    Object.prototype.hasOwnProperty.call(props, "aria-describedby")
    ? undefined
    : (props.tooltip ?? (fallback ? props.label : undefined));
}
export function Button(props: ComponentProps<typeof CoreButton>) {
  return (
    <CoreButton
      {...props}
      tooltip={tooltip(props, Boolean(props.isIconOnly))}
    />
  );
}
export function IconButton(props: ComponentProps<typeof CoreIconButton>) {
  return <CoreIconButton {...props} tooltip={tooltip(props, true)} />;
}
export function ToggleButton(props: ComponentProps<typeof CoreToggleButton>) {
  return (
    <CoreToggleButton
      {...props}
      tooltip={tooltip(props, Boolean(props.isIconOnly))}
    />
  );
}
export function Banner({
  children,
  description,
  ...props
}: ComponentProps<typeof CoreBanner>) {
  return (
    <CoreBanner
      {...props}
      description={
        <>
          {description}
          {children && <div>{children}</div>}
        </>
      }
    />
  );
}
type CoreMenuProps = ComponentProps<typeof CoreDropdownMenu>;
type CoreTriggerProps = Parameters<
  NonNullable<CoreMenuProps["renderTrigger"]>
>[0];
function MenuTrigger({
  button,
  trigger,
}: {
  button: NonNullable<CoreMenuProps["button"]>;
  trigger: CoreTriggerProps;
}) {
  const ref = useMergedRefs(button.ref, trigger.ref);
  return (
    <Button
      {...button}
      {...trigger}
      ref={ref}
      onFocus={(event) => {
        button.onFocus?.(event);
        if (!event.defaultPrevented) trigger.onFocus(event);
      }}
      onPointerDown={(event) => {
        button.onPointerDown?.(event);
        if (!event.defaultPrevented) trigger.onPointerDown(event);
      }}
      onContextMenu={(event) => {
        button.onContextMenu?.(event);
        if (!event.defaultPrevented) trigger.onContextMenu(event);
      }}
      onClickCapture={(event) => {
        button.onClickCapture?.(event);
        if (!event.defaultPrevented) trigger.onClickCapture(event);
      }}
      onClick={(event) => {
        if (!event.defaultPrevented) trigger.onClick(event);
      }}
      onKeyDown={(event) => {
        button.onKeyDown?.(event);
        if (!event.defaultPrevented) trigger.onKeyDown?.(event);
      }}
    />
  );
}
export function DropdownMenu({ button, ...props }: CoreMenuProps) {
  if (!button || props.renderTrigger)
    return <CoreDropdownMenu {...props} button={button} />;
  return (
    <CoreDropdownMenu
      {...props}
      aria-label={props["aria-label"] ?? button.label}
      renderTrigger={(trigger) => (
        <MenuTrigger button={button} trigger={trigger} />
      )}
    />
  );
}
import { TextInput as CoreTextInput } from "@astryxdesign/core/TextInput";

/** A custom Enter action owns the key; plain fields retain native form behavior.
 * Handle it here rather than Core's onEnter, which runs before onKeyDown and
 * does not cancel the native default. Composition commits never run actions. */
export function TextInput({
  onEnter,
  onKeyDown,
  ...props
}: ComponentProps<typeof CoreTextInput>) {
  return (
    <CoreTextInput
      {...props}
      description={props.status?.message ? undefined : props.description}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (
          event.key === "Enter" &&
          !event.defaultPrevented &&
          !event.nativeEvent.isComposing &&
          event.nativeEvent.keyCode !== 229 &&
          onEnter
        ) {
          event.preventDefault();
          onEnter();
        }
      }}
    />
  );
}
export { TextArea } from "@astryxdesign/core/TextArea";
export { NumberInput } from "@astryxdesign/core/NumberInput";
export { ToggleButtonGroup } from "@astryxdesign/core/ToggleButton";
export { Selector } from "@astryxdesign/core/Selector";
export { MoreMenu } from "@astryxdesign/core/MoreMenu";
export {
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
