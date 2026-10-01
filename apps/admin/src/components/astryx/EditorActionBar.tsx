import React, { useEffect, useRef, useState } from "react";
import { AdminPortalScope } from "../workspace/AdminUI";
import { BottomSheet } from "@astryxdesign/core/BottomSheet";
import {
  Button,
  DropdownMenu,
  IconButton,
  ToggleButton,
} from "./WritingControls";
import { HStack } from "@astryxdesign/core/HStack";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { useTooltip } from "@astryxdesign/core/Tooltip";
import { VStack } from "@astryxdesign/core/VStack";
import {
  CaretLeftIcon,
  ClockCounterClockwiseIcon,
  DotsThreeIcon,
  EyeIcon,
  SlidersHorizontalIcon,
} from "@phosphor-icons/react";
import { below } from "../../lib/breakpoints";
import { SaveStatus, type SaveStatusState } from "./SaveStatus";

type EditorMenuItem = {
  label: string;
  onClick: () => void;
  isDisabled?: boolean;
};
/** A group of overflow items. A titled group names itself; the first and
 * the last (Unpublish) stand untitled. */
export type EditorMenuSection = { title?: string; items: EditorMenuItem[] };

const COMPACT = below("medium");

/** Phones get the overflow as an action sheet; wider screens a menu. */
function useCompact() {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(COMPACT);
    const update = () => setCompact(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  return compact;
}

type EditorPanelAction = {
  onClick: () => void;
  isDisabled?: boolean;
  isPressed?: boolean;
};

/** Compact controls retain native keyboard focus without instant hover noise. */
function EditorIconButton({
  label,
  ...props
}: Omit<React.ComponentProps<typeof IconButton>, "tooltip" | "size">) {
  const tooltip = useTooltip({ delay: 300, placement: "below" });
  return (
    <>
      <IconButton
        {...props}
        label={label}
        size="sm"
        ref={tooltip.ref}
        aria-describedby={tooltip.describedBy}
      />
      {tooltip.renderTooltip(
        <Text type="supporting" style={{ color: "inherit" }}>
          {label}
        </Text>,
      )}
    </>
  );
}

function PreviewButton({
  isPressed,
  isDisabled,
  onChange,
}: NonNullable<EditorActionBarProps["preview"]>) {
  const tooltip = useTooltip({ delay: 300, placement: "below" });
  return (
    <>
      <ToggleButton
        label="Preview"
        size="sm"
        isIconOnly
        icon={<EyeIcon weight="regular" aria-hidden="true" />}
        isPressed={isPressed}
        isDisabled={isDisabled}
        onPressedChange={onChange}
        ref={tooltip.ref}
        aria-describedby={tooltip.describedBy}
      />
      {tooltip.renderTooltip(
        <Text type="supporting" style={{ color: "inherit" }}>
          Preview
        </Text>,
      )}
    </>
  );
}

function EditorMoreMenu({ sections }: { sections: EditorMenuSection[] }) {
  const [open, setOpen] = useState(false);
  const tooltip = useTooltip({
    delay: 300,
    placement: "below",
    isEnabled: !open,
  });
  return (
    <>
      <DropdownMenu
        hasChevron={false}
        alignment="end"
        onOpenChange={setOpen}
        button={{
          label: "More actions",
          icon: <DotsThreeIcon weight="regular" aria-hidden="true" />,
          variant: "ghost",
          size: "sm",
          isIconOnly: true,
          ref: tooltip.ref,
          "aria-describedby": tooltip.describedBy,
        }}
        items={sections.map((section, index) => ({
          type: "section" as const,
          id: section.title ?? `group-${index}`,
          title: section.title,
          items: section.items,
        }))}
      />
      {tooltip.renderTooltip(
        <Text type="supporting" style={{ color: "inherit" }}>
          More actions
        </Text>,
      )}
    </>
  );
}

export type EditorActionBarProps = {
  back: { href: string; label: string };
  title: string;
  save?: SaveStatusState;
  preview?: {
    isPressed: boolean;
    onChange: (pressed: boolean) => void;
    isDisabled?: boolean;
  };
  publish?: {
    label: string;
    onClick: () => void;
    isLoading?: boolean;
    isDisabled?: boolean;
  };
  /** Frequent inspectors remain directly accessible at every width. */
  properties?: EditorPanelAction;
  history?: EditorPanelAction;
  menu?: EditorMenuSection[];
};

/**
 * The record editor's one bar, sticky at the top of every width: an icon
 * back to the library, the record's title and save evidence, then direct
 * actions. On phones the actions wrap beneath the record identity. It stands in for the page
 * header on record pages, and its title is the page's H1.
 */
export function EditorActionBar({
  back,
  title,
  save,
  preview,
  publish,
  properties,
  history,
  menu = [],
}: EditorActionBarProps) {
  const compact = useCompact();
  const barRef = useRef<HTMLElement>(null);
  const commandRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const bar = barRef.current;
    const workspace = bar?.closest<HTMLElement>(".editor-workspace");
    if (!bar || !workspace || typeof ResizeObserver === "undefined") return;
    const previousHeight = workspace.style.getPropertyValue(
      "--editor-bar-height",
    );
    const measure = () => {
      const height =
        (window.matchMedia(COMPACT).matches
          ? commandRef.current
          : bar
        )?.getBoundingClientRect().height ?? 0;
      if (height > 0)
        workspace.style.setProperty("--editor-bar-height", `${height}px`);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    if (commandRef.current) observer.observe(commandRef.current);
    measure();
    return () => {
      observer.disconnect();
      if (previousHeight)
        workspace.style.setProperty("--editor-bar-height", previousHeight);
      else workspace.style.removeProperty("--editor-bar-height");
    };
  }, []);
  const [sheet, setSheet] = useState(false);
  const sections = menu.filter((section) => section.items.length > 0);
  return (
    <HStack
      className="editor-bar"
      data-editor-bar=""
      ref={barRef}
      gap={2}
      vAlign="center"
      wrap="wrap"
    >
      <HStack className="editor-bar-identity" gap={2} vAlign="center">
        <EditorIconButton
          className="editor-bar-back"
          label={back.label}
          variant="ghost"
          icon={<CaretLeftIcon weight="regular" aria-hidden="true" />}
          href={back.href}
        />
        <VStack className="editor-bar-title" gap={0}>
          <Heading level={1}>{title}</Heading>
          {save && <SaveStatus state={save} />}
        </VStack>
      </HStack>
      <HStack
        className="editor-bar-actions"
        ref={commandRef}
        gap={1}
        vAlign="center"
        wrap="wrap"
      >
        {properties && (
          <EditorIconButton
            label="Properties"
            variant="ghost"
            icon={<SlidersHorizontalIcon weight="regular" aria-hidden="true" />}
            aria-pressed={properties.isPressed}
            isDisabled={properties.isDisabled}
            onClick={properties.onClick}
          />
        )}
        {history && (
          <EditorIconButton
            label="History"
            variant="ghost"
            icon={
              <ClockCounterClockwiseIcon weight="regular" aria-hidden="true" />
            }
            aria-pressed={history.isPressed}
            isDisabled={history.isDisabled}
            onClick={history.onClick}
          />
        )}
        {preview && <PreviewButton {...preview} />}
        {publish && (
          <Button
            label={publish.label}
            variant="primary"
            size="sm"
            isLoading={publish.isLoading}
            isDisabled={publish.isDisabled}
            onClick={publish.onClick}
          />
        )}
        {sections.length > 0 &&
          (compact ? (
            <EditorIconButton
              label="More actions"
              variant="ghost"
              icon={<DotsThreeIcon weight="regular" aria-hidden="true" />}
              aria-haspopup="dialog"
              aria-expanded={sheet}
              onClick={() => setSheet(true)}
            />
          ) : (
            <EditorMoreMenu sections={sections} />
          ))}
      </HStack>
      {compact && (
        <BottomSheet
          label="More actions"
          isOpen={sheet}
          onOpenChange={setSheet}
          height="hug"
          className="editor-action-sheet"
        >
          <AdminPortalScope>
            <VStack gap={4} padding={3}>
              {sections.map((section, index) => (
                <VStack
                  key={section.title ?? index}
                  gap={0}
                  role="group"
                  aria-label={section.title}
                >
                  {section.title && (
                    <Text
                      type="supporting"
                      color="secondary"
                      className="editor-action-sheet-title"
                    >
                      {section.title}
                    </Text>
                  )}
                  {section.items.map((item) => (
                    <Button
                      key={item.label}
                      label={item.label}
                      variant="ghost"
                      className="editor-action-sheet-item"
                      isDisabled={item.isDisabled}
                      onClick={() => {
                        setSheet(false);
                        item.onClick();
                      }}
                    />
                  ))}
                </VStack>
              ))}
            </VStack>
          </AdminPortalScope>
        </BottomSheet>
      )}
    </HStack>
  );
}
