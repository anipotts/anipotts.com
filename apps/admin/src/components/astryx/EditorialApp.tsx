import {
  RECORD_SAVED_EVENT,
  createInventoryView,
  applyEditorialRecordSaved,
} from "../../lib/editorial-inventory-events";
import { clearEditorialRecovery } from "../../lib/draft-recovery";
import { Banner } from "@astryxdesign/core/Banner";
import { NewWriting } from "./NewWriting";
import React, { useEffect, useState, type ReactNode } from "react";
const HomeEditor = React.lazy(() =>
  import("./HomeEditor").then((module) => ({ default: module.HomeEditor })),
);
import {
  savedTheme,
  saveTheme,
  themedUrl,
  type ThemePreference,
} from "@anipotts/brand/theme";
import { Theme } from "@astryxdesign/core/theme";
import { editorialTheme } from "../../themes/editorial.js";
import { EditorialWorkspaceShell } from "./EditorialWorkspaceShell";
import { Button } from "@astryxdesign/core/Button";
import { Token } from "@astryxdesign/core/Token";
import { Card } from "@astryxdesign/core/Card";
import { Collapsible, CollapsibleGroup } from "@astryxdesign/core/Collapsible";
import { Breadcrumbs, BreadcrumbItem } from "@astryxdesign/core/Breadcrumbs";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import {
  MetadataList,
  MetadataListItem,
} from "@astryxdesign/core/MetadataList";
import { editorialFields } from "../../lib/editorial-fields";
import { AdminSkeleton } from "./AdminFeedback";
import type { AdminSearchResult } from "../../data/admin-search";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { Text } from "@astryxdesign/core/Text";
import { ContentLibrary, Updated, RecordStatus } from "./ContentLibrary";
export { matchingRecords, recentlyUpdated } from "./ContentLibrary";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import {
  CaretDownIcon,
  XIcon,
  MagnifyingGlassIcon,
} from "@phosphor-icons/react";

// The library owns the theme. Only the icons used by this interface differ.
const theme = {
  ...editorialTheme,
  icons: {
    chevronDown: <CaretDownIcon size="1em" aria-hidden="true" />,
    close: <XIcon size="1em" aria-hidden="true" />,
    search: <MagnifyingGlassIcon size="1em" aria-hidden="true" />,
  },
};

export type CatalogRecord = {
  title: string;
  href: string;
  status: string;
  summary?: string;
  section?: string;
  collection?: string;
  id?: string;
  changesPending?: boolean;
  changedFields?: string[];
  privateRevision?: number;
  privateUpdatedAt?: string;
  publishedUpdated?: { at: string; source: "git" | "local" | "private" };
  intendedVisibility?: string;
  capabilities?: {
    editable: boolean;
    previewable: boolean;
    reviewOnly: boolean;
  };
  updated?: { at: string; source: "git" | "local" | "private" };
};
export type CatalogGroup = {
  name: string;
  href: string;
  records: CatalogRecord[];
};
export type Review = {
  back: string;
  status: string;
  publicUrl?: string | null;
  metadata?: string[];
  summary?: string;
  media?: { src: string; alt: string; kind: string } | null;
  sections?: { heading: string; paragraphs: string[]; items?: string[] }[];
  fields?: unknown;
  contentFields?: unknown;
  claims?: unknown;
  sources?: unknown;
  updated?: CatalogRecord["updated"];
};
export type EditorialAppProps = {
  title: string;
  searchEntries?: AdminSearchResult[];
  area: "content" | "newsletter";
  localPreview: boolean;
  siteUrl: string;
  initialMode?: ThemePreference;
  groups?: CatalogGroup[];
  selectedGroup?: string;
  librarySearch?: string;
  review?: Review;
  inventoryError?: boolean;
  newWriting?: boolean;
  recoveryScope?: string;
  editHome?: boolean;
  editorRecord?: import("@anipotts/content/editorial/source").EditorialRecord;
  children?: ReactNode;
};

export function EditorialApp({
  title,
  area,
  localPreview,
  siteUrl,
  initialMode = "light",
  searchEntries,
  groups,
  selectedGroup,
  librarySearch,
  review,
  editHome,
  newWriting,
  recoveryScope,
  inventoryError,
  editorRecord,
  children,
}: EditorialAppProps) {
  const [mode, setMode] = useState<ThemePreference>(initialMode);
  const [inventoryView, setInventoryView] = useState(() =>
    createInventoryView(groups, searchEntries),
  );
  useEffect(() => {
    setInventoryView(createInventoryView(groups, searchEntries));
  }, [groups, searchEntries]);
  useEffect(() => {
    const saved = (event: Event) => {
      if (event instanceof CustomEvent)
        setInventoryView((current) =>
          applyEditorialRecordSaved(current, event.detail),
        );
    };
    window.addEventListener(RECORD_SAVED_EVENT, saved);
    return () => window.removeEventListener(RECORD_SAVED_EVENT, saved);
  }, []);

  useEffect(() => {
    const logout = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.("a");
      if (link && new URL(link.href).pathname === "/cdn-cgi/access/logout") {
        try {
          clearEditorialRecovery(localStorage);
        } catch {
          /* Storage may be disabled. */
        }
      }
    };
    document.addEventListener("click", logout, true);
    return () => document.removeEventListener("click", logout, true);
  }, []);
  const [draftTitle, setDraftTitle] = useState(title);
  const comparisonSiteUrl = localPreview ? "https://anipotts.com/" : siteUrl;
  const [siteHref, setSiteHref] = useState(comparisonSiteUrl);
  useEffect(() => {
    const saved = savedTheme();
    setMode(saved);
    setSiteHref(themedUrl(comparisonSiteUrl, saved));
  }, []);
  function changeTheme(next: ThemePreference) {
    setMode(next);
    saveTheme(next);
    setSiteHref(themedUrl(comparisonSiteUrl, next));
  }
  return (
    <Theme theme={theme} mode={mode}>
      <EditorialWorkspaceShell
        area={area}
        selectedGroup={selectedGroup}
        recordKind={
          editorRecord?.kind ??
          (newWriting ? "writing" : editHome ? "home" : undefined)
        }
        mode={mode}
        changeTheme={changeTheme}
        siteHref={siteHref}
        localPreview={localPreview}
        searchEntries={inventoryView.searchEntries}
      >
        <VStack
          gap={editorRecord?.kind === "writing" ? 4 : 6}
          className={`editorial-content${editorRecord?.kind === "writing" ? " writing-content" : ""}`}
        >
          {(review || editHome || editorRecord || newWriting) && (
            <Breadcrumbs variant="supporting">
              <BreadcrumbItem
                href={
                  review?.back ??
                  (area === "newsletter"
                    ? "/newsletter"
                    : editorRecord?.kind === "writing" || newWriting
                      ? "/content?group=writing"
                      : "/content")
                }
              >
                {area === "newsletter"
                  ? "Newsletter"
                  : editorRecord?.kind === "writing" || newWriting
                    ? "Writing"
                    : "Content"}
              </BreadcrumbItem>
              <BreadcrumbItem isCurrent>
                {editorRecord?.kind === "writing"
                  ? draftTitle || "Untitled article"
                  : title}
              </BreadcrumbItem>
            </Breadcrumbs>
          )}
          {editorRecord?.kind !== "writing" &&
            (groups || review || children || newWriting || editorRecord) && (
              <HStack gap={3} hAlign="between" vAlign="center" wrap="wrap">
                <Heading level={1}>
                  {newWriting
                    ? "New article"
                    : groups && selectedGroup === "writing"
                      ? "Writing"
                      : groups &&
                          area === "content" &&
                          (!selectedGroup || selectedGroup === "pages")
                        ? "Overview"
                        : title}
                </Heading>
                {groups && selectedGroup === "writing" && (
                  <Button
                    label="New article"
                    href="/content/new"
                    variant="primary"
                    size="sm"
                  />
                )}
              </HStack>
            )}
          {inventoryError && (
            <Banner
              status="warning"
              title="Private drafts couldn’t be loaded"
              description="Published records are still available. Reload to try your private drafts again."
            />
          )}
          {newWriting && <NewWriting recoveryScope={recoveryScope} />}
          {groups && (
            <ContentLibrary
              groups={inventoryView.groups ?? groups}
              selectedGroup={selectedGroup}
              initialSearch={librarySearch}
              inventoryError={inventoryError}
              area={area}
            />
          )}
          {(editHome || editorRecord) && (
            <React.Suspense
              fallback={
                <AdminSkeleton
                  fields={editorialFields(
                    editorRecord ?? { kind: "page", id: "home" },
                  )}
                />
              }
            >
              <HomeEditor
                onTitleChange={setDraftTitle}
                localPreview={localPreview}
                key={editorRecord?.id ?? "home"}
                record={editorRecord ?? { kind: "page", id: "home" }}
              />
            </React.Suspense>
          )}
          {review && !editHome && !editorRecord && (
            <>
              {review.publicUrl && (
                <Button
                  label="View published page"
                  href={themedUrl(review.publicUrl, mode)}
                />
              )}
              <MetadataList orientation="horizontal">
                <MetadataListItem label="Status">
                  <RecordStatus status={review.status} />
                </MetadataListItem>
                {review.updated && (
                  <MetadataListItem label="Updated">
                    <Updated updated={review.updated} />
                  </MetadataListItem>
                )}
              </MetadataList>
              {review.metadata?.filter(Boolean).map((value, i) => (
                <Text key={i} color="secondary">
                  {value}
                </Text>
              ))}
              <Card padding={5}>
                <VStack gap={5} className="editorial-prose">
                  {review.summary && <Text as="p">{review.summary}</Text>}
                  {review.media &&
                    (review.media.kind === "video" ? (
                      <video
                        controls
                        preload="metadata"
                        src={review.media.src}
                        aria-label={review.media.alt}
                      />
                    ) : (
                      <img src={review.media.src} alt={review.media.alt} />
                    ))}
                  {review.sections?.map((section, i) => (
                    <VStack gap={3} key={i}>
                      {section.heading && (
                        <Heading level={2}>{section.heading}</Heading>
                      )}
                      {section.paragraphs.map((paragraph, j) => (
                        <Text as="p" key={j}>
                          {paragraph}
                        </Text>
                      ))}
                      {section.items && (
                        <ul>
                          {section.items.map((item, j) => (
                            <li key={j}>{item}</li>
                          ))}
                        </ul>
                      )}
                    </VStack>
                  ))}
                  {review.contentFields != null && (
                    <Fields value={review.contentFields} />
                  )}
                  {children}
                </VStack>
              </Card>
              <CollapsibleGroup type="multiple" hasDividers>
                {review.claims != null && (
                  <Collapsible value="claims" trigger="Claims to review">
                    <Fields value={review.claims} />
                  </Collapsible>
                )}
                {review.sources != null && (
                  <Collapsible value="sources" trigger="Sources">
                    <Fields value={review.sources} />
                  </Collapsible>
                )}
                {review.fields != null && (
                  <Collapsible value="details" trigger="Details">
                    <Fields value={review.fields} />
                  </Collapsible>
                )}
              </CollapsibleGroup>
            </>
          )}
          {!groups &&
            !review &&
            !newWriting &&
            !editorRecord &&
            !editHome &&
            (children || (
              <EmptyState
                title={title}
                headingLevel={1}
                actions={
                  <Button
                    label={
                      area === "newsletter"
                        ? "Back to drafts"
                        : "Back to content"
                    }
                    href={area === "newsletter" ? "/newsletter" : "/content"}
                  />
                }
              />
            ))}
        </VStack>
      </EditorialWorkspaceShell>
    </Theme>
  );
}

function Fields({ value }: { value: unknown }): ReactNode {
  if (typeof value === "boolean")
    return <Token size="sm" label={value ? "enabled" : "disabled"} />;
  if (value instanceof Date)
    return <Timestamp value={value.toISOString()} format="date" />;
  if (
    Array.isArray(value) &&
    value.every((item) => typeof item === "string" && item.length <= 64)
  )
    return (
      <HStack gap={2} wrap="wrap">
        {value.map((item, index) => (
          <Token key={index} size="sm" label={item} />
        ))}
      </HStack>
    );
  if (Array.isArray(value))
    return (
      <CollapsibleGroup type="multiple" hasDividers>
        {value.map((item, index) =>
          item &&
          typeof item === "object" &&
          (typeof item.label === "string" || typeof item.title === "string") ? (
            <Collapsible
              key={index}
              value={String(index)}
              trigger={item.label ?? item.title}
            >
              <VStack padding={3}>
                <Fields
                  value={Object.fromEntries(
                    Object.entries(item).filter(
                      ([key]) => !["id", "label", "title"].includes(key),
                    ),
                  )}
                />
              </VStack>
            </Collapsible>
          ) : (
            <Fields key={index} value={item} />
          ),
        )}
      </CollapsibleGroup>
    );
  if (value && typeof value === "object")
    return (
      <CollapsibleGroup type="multiple" hasDividers>
        {Object.entries(value)
          .filter(
            ([, item]) =>
              item != null && (!Array.isArray(item) || item.length > 0),
          )
          .map(([key, item]) =>
            item && typeof item === "object" && !(item instanceof Date) ? (
              <Collapsible
                key={key}
                value={key}
                trigger={key.replaceAll("_", " ")}
              >
                <VStack gap={3} padding={3}>
                  <Fields value={item} />
                </VStack>
              </Collapsible>
            ) : (
              <MetadataList key={key}>
                <MetadataListItem label={key.replaceAll("_", " ")}>
                  <Fields value={item} />
                </MetadataListItem>
              </MetadataList>
            ),
          )}
      </CollapsibleGroup>
    );
  return (
    <Text color="secondary">{value == null ? "Not set" : String(value)}</Text>
  );
}
