import React, { useEffect, useState } from "react";
import { BottomSheet } from "@astryxdesign/core/BottomSheet";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { IconButton } from "@astryxdesign/core/IconButton";
import { MoreMenu } from "@astryxdesign/core/MoreMenu";
import { Text } from "@astryxdesign/core/Text";
import { ToggleButton } from "@astryxdesign/core/ToggleButton";
import { VStack } from "@astryxdesign/core/VStack";
import { CaretLeftIcon, DotsThreeIcon, EyeIcon } from "@phosphor-icons/react";
import { below } from "../../lib/breakpoints";
import { WordSafeText } from "../workspace/Workspace";
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

/** Whether the title's first word fits its slot. A word never shows cut:
 * where not even the first fits (a 320px phone), the title stays the
 * page's H1 for assistive technology but is not drawn, since the title
 * field under the bar shows it whole. */
function useFirstWordFits() {
  const [fits, setFits] = useState(true);
  const observer = React.useRef<ResizeObserver | null>(null);
  const ref = React.useCallback((node: HTMLDivElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!node || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const word = node.querySelector<HTMLElement>(".workspace-word");
      setFits(!word || word.offsetWidth <= node.clientWidth + 0.5);
    };
    const next = new ResizeObserver(measure);
    next.observe(node);
    observer.current = next;
    measure();
  }, []);
  return [fits, ref] as const;
}

/**
 * The record editor's one bar, sticky at the top of every width: an icon
 * back to the library, the record's title on one line, the save dot, the
 * preview toggle, Publish and the overflow. It stands in for the page
 * header on record pages, and its title is the page's H1.
 */
export function EditorActionBar({
  back,
  title,
  save,
  preview,
  publish,
  menu = [],
}: {
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
  menu?: EditorMenuSection[];
}) {
  const compact = useCompact();
  const [fits, titleRef] = useFirstWordFits();
  const [sheet, setSheet] = useState(false);
  const sections = menu.filter((section) => section.items.length > 0);
  return (
    <div className="editor-bar" data-editor-bar="">
      <IconButton
        className="editor-bar-back"
        label={back.label}
        tooltip={back.label}
        variant="ghost"
        icon={<CaretLeftIcon weight="regular" aria-hidden="true" />}
        href={back.href}
      />
      <div
        className="editor-bar-title"
        title={title}
        ref={titleRef}
        data-fit={fits ? undefined : "none"}
      >
        <Heading level={1}>
          <WordSafeText>{title}</WordSafeText>
        </Heading>
      </div>
      {save && <SaveStatus state={save} />}
      <div className="editor-bar-actions">
        {preview && (
          <ToggleButton
            label="Preview"
            tooltip="Preview"
            isIconOnly
            icon={<EyeIcon weight="regular" aria-hidden="true" />}
            isPressed={preview.isPressed}
            isDisabled={preview.isDisabled}
            onPressedChange={(pressed) => preview.onChange(pressed)}
          />
        )}
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
            <IconButton
              label="More actions"
              tooltip="More actions"
              variant="ghost"
              icon={<DotsThreeIcon weight="bold" aria-hidden="true" />}
              aria-haspopup="dialog"
              aria-expanded={sheet}
              onClick={() => setSheet(true)}
            />
          ) : (
            <MoreMenu
              label="More actions"
              icon={<DotsThreeIcon weight="bold" aria-hidden="true" />}
              size="sm"
              alignment="end"
              items={sections.map((section, index) => ({
                type: "section" as const,
                id: section.title ?? `group-${index}`,
                title: section.title,
                items: section.items,
              }))}
            />
          ))}
      </div>
      {compact && (
        <BottomSheet
          label="More actions"
          isOpen={sheet}
          onOpenChange={setSheet}
          height="hug"
          className="editor-action-sheet"
        >
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
        </BottomSheet>
      )}
    </div>
  );
}
