/** Compatibility at the shared editor boundary. Legacy routes retain Astryx;
 * opted-in Writing renders actual Apps SDK UI controls with the same callbacks. */
import React, { useId, type ComponentProps } from "react";
import { Button as LegacyButton } from "@astryxdesign/core/Button";
import { IconButton as LegacyIconButton } from "@astryxdesign/core/IconButton";
import { TextInput as LegacyInput } from "@astryxdesign/core/TextInput";
import { TextArea as LegacyTextarea } from "@astryxdesign/core/TextArea";
import { ToggleButton as LegacyToggle } from "@astryxdesign/core/ToggleButton";
import { Banner as LegacyBanner } from "@astryxdesign/core/Banner";
import {
  Button as SDKButton,
  ButtonLink,
} from "@openai/apps-sdk-ui/components/Button";
import { Input } from "@openai/apps-sdk-ui/components/Input";
import { Textarea } from "@openai/apps-sdk-ui/components/Textarea";
import { Tooltip } from "@openai/apps-sdk-ui/components/Tooltip";
import { Alert } from "@openai/apps-sdk-ui/components/Alert";
import { useOpenAIUI, AdminPortalScope } from "../workspace/AdminUI";

export function Button(props: ComponentProps<typeof LegacyButton>) {
  const enabled = useOpenAIUI();
  const [pending, startAction] = React.useTransition();
  const inFlight = React.useRef(false);
  if (!enabled) return <LegacyButton {...props} />;
  const {
    label,
    icon,
    variant,
    isDisabled,
    isLoading,
    href,
    onClick,
    clickAction,
    className,
    type,
  } = props;
  const common = {
    color:
      variant === "primary" ? ("primary" as const) : ("secondary" as const),
    variant:
      variant === "ghost"
        ? ("ghost" as const)
        : variant === "primary"
          ? ("solid" as const)
          : ("outline" as const),
    size: "2xl" as const,
    disabled: isDisabled || isLoading || pending,
    className,
    onMouseDown: props.onMouseDown,
    onPointerDown: props.onPointerDown,
    "aria-describedby": props["aria-describedby"],
    "aria-label": props.isIconOnly ? label : props["aria-label"],
    title:
      !props.isIconOnly && typeof props.tooltip === "string"
        ? props.tooltip
        : undefined,
  };
  const control = href ? (
    <ButtonLink
      pill={false}
      {...common}
      href={href}
      target={props.target}
      rel={props.rel}
    >
      {icon}
      {label}
    </ButtonLink>
  ) : (
    <SDKButton
      pill={false}
      {...common}
      type={type ?? "button"}
      uniform={props.isIconOnly}
      ref={props.ref}
      loading={isLoading || pending}
      onKeyDown={props.onKeyDown}
      onBlur={props.onBlur}
      onClick={(event) => {
        if (inFlight.current) return;
        onClick?.(event);
        if (!clickAction || event.defaultPrevented) return;
        inFlight.current = true;
        startAction(async () => {
          try {
            await clickAction(event);
          } finally {
            inFlight.current = false;
          }
        });
      }}
    >
      {icon}
      {!props.isIconOnly && label}
      {props.children}
      {props.endContent}
    </SDKButton>
  );
  return props.isIconOnly ? (
    <Tooltip
      content={<AdminPortalScope>{props.tooltip || label}</AdminPortalScope>}
    >
      {control}
    </Tooltip>
  ) : (
    control
  );
}

export function IconButton(props: ComponentProps<typeof LegacyIconButton>) {
  const enabled = useOpenAIUI();
  if (!enabled) return <LegacyIconButton {...props} />;
  const {
    label,
    icon,
    tooltip,
    isDisabled,
    href,
    onClick,
    onPointerDown,
    className,
  } = props;
  const common = {
    color: "secondary" as const,
    variant: "ghost" as const,
    size: "2xl" as const,
    disabled: isDisabled,
    className,
    "aria-label": label,
    onClick,
    onPointerDown,
    "aria-expanded": props["aria-expanded"],
    "aria-haspopup": props["aria-haspopup"],
    "aria-describedby": props["aria-describedby"],
    onMouseDown: props.onMouseDown,
    onKeyDown: props.onKeyDown,
    onBlur: props.onBlur,
  };
  return (
    <Tooltip content={<AdminPortalScope>{tooltip || label}</AdminPortalScope>}>
      {href ? (
        <ButtonLink
          pill={false}
          {...common}
          href={href}
          target={props.target}
          rel={props.rel}
        >
          {icon}
        </ButtonLink>
      ) : (
        <SDKButton
          pill={false}
          {...common}
          ref={props.ref}
          type="button"
          uniform
        >
          {icon}
        </SDKButton>
      )}
    </Tooltip>
  );
}

export function ToggleButton(props: ComponentProps<typeof LegacyToggle>) {
  const enabled = useOpenAIUI();
  const group = React.useContext(ToggleContext);
  if (!enabled) return <LegacyToggle {...props} />;
  const {
    label,
    icon,
    isIconOnly,
    isPressed,
    isDisabled,
    onPressedChange,
    className,
  } = props;
  const pressed =
    props.value && group ? group.value.includes(props.value) : isPressed;
  return (
    <Tooltip
      content={<AdminPortalScope>{props.tooltip || label}</AdminPortalScope>}
    >
      <SDKButton
        pill={false}
        color="secondary"
        variant="ghost"
        size="2xl"
        type="button"
        className={className}
        uniform={isIconOnly}
        aria-label={label}
        aria-pressed={pressed}
        onMouseDown={props.onMouseDown}
        onPointerDown={props.onPointerDown}
        ref={props.ref}
        onKeyDown={props.onKeyDown}
        selected={pressed}
        disabled={isDisabled || group?.disabled}
        onClick={(event) => {
          props.onClick?.(event);
          if (event.defaultPrevented) return;
          if (props.value && group) group.change(props.value);
          else onPressedChange?.(!isPressed, event);
        }}
      >
        {icon}
        {!isIconOnly && label}
      </SDKButton>
    </Tooltip>
  );
}

export function TextInput(props: ComponentProps<typeof LegacyInput>) {
  const enabled = useOpenAIUI();
  const id = useId();
  if (!enabled) return <LegacyInput {...props} />;
  const {
    label,
    value,
    onChange,
    onEnter,
    onBlur,
    placeholder,
    isDisabled,
    isReadOnly,
    isLabelHidden,
    status,
    ref,
    className,
  } = props;
  const help = status?.message || props.description;
  return (
    <div className={`writing-control-field ${className ?? ""}`}>
      <label
        htmlFor={id}
        className={isLabelHidden ? "sr-only" : "writing-control-label"}
      >
        {label}
      </label>
      <Input
        id={id}
        ref={ref}
        type={props.type}
        required={props.isRequired}
        onFocus={props.onFocus}
        value={value}
        size="2xl"
        placeholder={placeholder}
        disabled={isDisabled}
        readOnly={isReadOnly}
        invalid={status?.type === "error"}
        aria-describedby={help ? `${id}-help` : undefined}
        onChange={(event) => onChange?.(event.target.value, event)}
        onBlur={onBlur}
        onKeyDown={(event) => {
          props.onKeyDown?.(event);
          if (
            !event.defaultPrevented &&
            event.key === "Enter" &&
            !event.nativeEvent.isComposing &&
            onEnter
          ) {
            event.preventDefault();
            onEnter();
          }
        }}
      />
      {help && (
        <small id={`${id}-help`} className="writing-control-help">
          {help}
        </small>
      )}
    </div>
  );
}

export function TextArea(props: ComponentProps<typeof LegacyTextarea>) {
  const enabled = useOpenAIUI();
  const id = useId();
  if (!enabled) return <LegacyTextarea {...props} />;
  const {
    label,
    value,
    onChange,
    onBlur,
    placeholder,
    isDisabled,
    isReadOnly,
    isLabelHidden,
    status,
    ref,
    className,
    rows,
  } = props;
  return (
    <div className="writing-control-field">
      <label
        htmlFor={id}
        className={isLabelHidden ? "sr-only" : "writing-control-label"}
      >
        {label}
      </label>
      <Textarea
        id={id}
        ref={ref}
        className={className}
        rows={rows}
        required={props.isRequired}
        onFocus={props.onFocus}
        onKeyDown={props.onKeyDown}
        value={value}
        placeholder={placeholder}
        disabled={isDisabled}
        readOnly={isReadOnly}
        invalid={status?.type === "error"}
        aria-describedby={status?.message ? `${id}-help` : undefined}
        onChange={(event) => onChange?.(event.target.value, event)}
        onBlur={onBlur}
      />
      {status?.message && (
        <small id={`${id}-help`} className="writing-control-help">
          {status.message}
        </small>
      )}
    </div>
  );
}

export function Banner(props: ComponentProps<typeof LegacyBanner>) {
  const enabled = useOpenAIUI();
  if (!enabled) return <LegacyBanner {...props} />;
  return (
    <Alert
      color={
        props.status === "error"
          ? "danger"
          : props.status === "warning"
            ? "warning"
            : "info"
      }
      title={props.title}
      description={
        <>
          {props.description}
          {props.children && <div>{props.children}</div>}
        </>
      }
      actions={props.endContent}
    />
  );
}

import { ToggleButtonGroup as LegacyToggleGroup } from "@astryxdesign/core/ToggleButton";
const ToggleContext = React.createContext<{
  value: string[];
  disabled?: boolean;
  change: (value: string) => void;
} | null>(null);
export function ToggleButtonGroup(
  props: ComponentProps<typeof LegacyToggleGroup>,
) {
  const enabled = useOpenAIUI();
  if (!enabled) return <LegacyToggleGroup {...props} />;
  const value = Array.isArray(props.value)
    ? props.value
    : props.value
      ? [props.value]
      : [];
  return (
    <ToggleContext.Provider
      value={{
        value,
        disabled: props.isDisabled,
        change: (next) => {
          if (props.type === "multiple")
            props.onChange?.(
              value.includes(next)
                ? value.filter((v) => v !== next)
                : [...value, next],
            );
          else props.onChange?.(next);
        },
      }}
    >
      <div role="group" aria-label={props.label} className="writing-toolbar">
        {props.children}
      </div>
    </ToggleContext.Provider>
  );
}

import { Selector as LegacySelector } from "@astryxdesign/core/Selector";
import { MoreMenu as LegacyMoreMenu } from "@astryxdesign/core/MoreMenu";
import {
  DropdownMenu as LegacyDropdown,
  DropdownMenuRadioGroup as LegacyRadioGroup,
  DropdownMenuRadioItem as LegacyRadioItem,
} from "@astryxdesign/core/DropdownMenu";
import { Menu } from "@openai/apps-sdk-ui/components/Menu";
import { AdminMenuContent } from "../workspace/AdminUI";

export function Selector(props: ComponentProps<typeof LegacySelector>) {
  const enabled = useOpenAIUI();
  const id = useId();
  if (!enabled) return <LegacySelector {...props} />;
  const options = props.options.flatMap((option) =>
    typeof option === "string"
      ? [{ value: option, label: option, disabled: false }]
      : "value" in option
        ? [option]
        : [],
  );
  const selected = options.find((option) => option.value === props.value);
  return (
    <div className="writing-control-field">
      <span id={id} className="writing-control-label">
        {props.label}
      </span>
      <Menu>
        <Menu.Trigger disabled={props.isDisabled}>
          <SDKButton
            pill={false}
            color="secondary"
            variant="outline"
            size="2xl"
            type="button"
            aria-labelledby={id}
            disabled={props.isDisabled}
          >
            {selected?.label ?? props.placeholder ?? "Choose"}
          </SDKButton>
        </Menu.Trigger>
        <AdminMenuContent>
          <Menu.RadioGroup
            value={String(props.value ?? "")}
            onChange={(value) => props.onChange?.(value)}
          >
            {options.map((option) => (
              <Menu.RadioItem
                key={option.value}
                value={option.value}
                disabled={option.disabled}
              >
                {option.label}
              </Menu.RadioItem>
            ))}
          </Menu.RadioGroup>
        </AdminMenuContent>
      </Menu>
      {props.status?.message && (
        <small className="writing-control-help">{props.status.message}</small>
      )}
    </div>
  );
}

export function DropdownMenuRadioGroup(
  props: ComponentProps<typeof LegacyRadioGroup>,
) {
  const enabled = useOpenAIUI();
  return enabled ? (
    <Menu.RadioGroup
      value={props.value ?? ""}
      onChange={(value) => props.onChange?.(value)}
    >
      {props.children}
    </Menu.RadioGroup>
  ) : (
    <LegacyRadioGroup {...props} />
  );
}
export function DropdownMenuRadioItem(
  props: ComponentProps<typeof LegacyRadioItem>,
) {
  const enabled = useOpenAIUI();
  return enabled ? (
    <Menu.RadioItem value={props.value} disabled={props.isDisabled}>
      {props.label}
    </Menu.RadioItem>
  ) : (
    <LegacyRadioItem {...props} />
  );
}

type MenuEntry = {
  type?: string;
  label?: React.ReactNode;
  title?: React.ReactNode;
  icon?: React.ReactNode;
  endContent?: React.ReactNode;
  isDisabled?: boolean;
  onClick?: () => void;
  items?: MenuEntry[];
};
function menuEntries(items: MenuEntry[]): React.ReactNode {
  return items.map((item, index) =>
    item.items ? (
      <section
        key={index}
        aria-label={typeof item.title === "string" ? item.title : undefined}
      >
        {item.title && <p className="writing-control-label">{item.title}</p>}
        {menuEntries(item.items)}
      </section>
    ) : (
      <Menu.Item key={index} disabled={item.isDisabled} onSelect={item.onClick}>
        {item.icon}
        {item.label}
        {item.endContent}
      </Menu.Item>
    ),
  );
}
export function MoreMenu(props: ComponentProps<typeof LegacyMoreMenu>) {
  const enabled = useOpenAIUI();
  if (!enabled) return <LegacyMoreMenu {...props} />;
  return (
    <Menu>
      <Menu.Trigger>
        <SDKButton
          pill={false}
          color="secondary"
          variant="ghost"
          size="2xl"
          uniform
          aria-label={props.label}
          title={props.label}
        >
          {props.icon ?? props.label}
        </SDKButton>
      </Menu.Trigger>
      <AdminMenuContent align="end">
        {menuEntries(props.items as MenuEntry[])}
      </AdminMenuContent>
    </Menu>
  );
}
export function DropdownMenu(props: ComponentProps<typeof LegacyDropdown>) {
  const enabled = useOpenAIUI();
  if (!enabled) return <LegacyDropdown {...props} />;
  return (
    <Menu
      onOpen={() => props.onOpenChange?.(true)}
      onClose={() => props.onOpenChange?.(false)}
    >
      <Menu.Trigger disabled={props.button?.isDisabled}>
        <SDKButton
          pill={false}
          color="secondary"
          variant="ghost"
          size="2xl"
          uniform={props.button?.isIconOnly}
          aria-label={props.button?.label}
          title={props.button?.label}
        >
          {props.button?.icon}
          {!props.button?.isIconOnly && props.button?.label}
        </SDKButton>
      </Menu.Trigger>
      <AdminMenuContent>
        {menuEntries((props.items ?? []) as MenuEntry[])}
      </AdminMenuContent>
    </Menu>
  );
}
