import {
  libraryPaths,
  libraryReturnPath,
} from "../../lib/content-library-state";
import { InlineNotice, WorkspacePage } from "../workspace/Workspace";
import { IconButton } from "@astryxdesign/core/IconButton";
import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import {
  RECORD_CREATED_EVENT,
  RECORD_SAVED_EVENT,
  createInventoryView,
  applyEditorialRecordCreated,
  applyEditorialRecordSaved,
} from "../../lib/editorial-inventory-events";
import { startEditorialInventoryRelay } from "../../lib/editorial-inventory-relay";
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
} from "../../lib/admin-theme";
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
import { adminThemeIcons } from "./adminThemeIcons";

// The library owns the theme. Only the icons used by this interface differ.
const theme = { ...editorialTheme, icons: adminThemeIcons };

export type CatalogRecord = {
  title: string;
  href: string;
  status: string;
  summary?: string;
  section?: string;
  collection?: string;
  id?: string;
  publishedSlug?: string;
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
  localOwner?: boolean;
  siteUrl: string;
  initialMode?: ThemePreference;
  homepageWritingOptions?: { slug: string; title: string; status: string }[];
  groups?: CatalogGroup[];
  selectedGroup?: string;
  librarySearch?: string;
  review?: Review;
  inventoryError?: boolean;
  newWriting?: boolean;
  newProject?: boolean;
  recoveryScope?: string;
  editHome?: boolean;
  editorRecord?: import("@anipotts/content/editorial/source").EditorialRecord;
  /** The slotted page content supplies its own primary heading. */
  hideHeader?: boolean;
  children?: ReactNode;
};

/** Record counts for the Content items in the sidebar, on every Content
 * route: from the libraries when the page has them, otherwise from the
 * inventory's search entries, which every Content page carries. */
export function navigationCounts(
  groups?: CatalogGroup[],
  entries?: AdminSearchResult[],
): Record<string, number> | undefined {
  if (groups)
    return Object.fromEntries(
      groups.map((group) => [group.name, group.records.length]),
    );
  if (!entries) return undefined;
  const counts: Record<string, number> = {
    website: 0,
    writing: 0,
    work: 0,
    newsletter: 0,
  };
  for (const entry of entries) {
    if (entry.domain !== "content") continue;
    const id =
      entry.kind === "projects"
        ? "work"
        : entry.kind === "writing" || entry.kind === "newsletter"
          ? entry.kind
          : "website";
    counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}

export function EditorialApp({
  title,
  area,
  localPreview,
  localOwner = false,
  siteUrl,
  initialMode = "light",
  searchEntries,
  groups,
  selectedGroup,
  librarySearch,
  review,
  editHome,
  newWriting,
  newProject,
  recoveryScope,
  inventoryError,
  homepageWritingOptions,
  editorRecord,
  hideHeader = false,
  children,
}: EditorialAppProps) {
  const [libraryBack, setLibraryBack] = useState<string | null>(null);
  useEffect(() => {
    const returnTo = new URLSearchParams(window.location.search).get(
      "returnTo",
    );
    setLibraryBack(returnTo ? libraryReturnPath(returnTo) : null);
  }, []);
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
    const created = (event: Event) => {
      if (event instanceof CustomEvent)
        setInventoryView((current) =>
          applyEditorialRecordCreated(current, event.detail),
        );
    };
    window.addEventListener(RECORD_SAVED_EVENT, saved);
    window.addEventListener(RECORD_CREATED_EVENT, created);
    const stopRelay = startEditorialInventoryRelay();
    return () => {
      stopRelay();
      window.removeEventListener(RECORD_SAVED_EVENT, saved);
      window.removeEventListener(RECORD_CREATED_EVENT, created);
    };
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
          (newProject
            ? "work"
            : newWriting
              ? "writing"
              : editHome
                ? "home"
                : undefined)
        }
        mode={mode}
        changeTheme={changeTheme}
        siteHref={siteHref}
        localPreview={localPreview}
        localOwner={localOwner}
        searchEntries={inventoryView.searchEntries}
        groupCounts={navigationCounts(
          inventoryView.groups,
          inventoryView.searchEntries,
        )}
      >
        <VStack
          gap={editorRecord ? 4 : 6}
          className={`editorial-content${groups ? " editorial-library-page" : ""}${editorRecord?.kind === "writing" ? " writing-content" : ""}`}
        >
          {(review || editHome || editorRecord || newWriting || newProject) && (
            <Breadcrumbs variant="supporting">
              <BreadcrumbItem
                href={
                  libraryBack ??
                  review?.back ??
                  (area === "newsletter"
                    ? libraryPaths.newsletter
                    : editorRecord?.kind === "writing" || newWriting
                      ? libraryPaths.writing
                      : editorRecord?.kind === "work" || newProject
                        ? libraryPaths.work
                        : libraryPaths.website)
                }
              >
                {area === "newsletter"
                  ? "Newsletter"
                  : editorRecord?.kind === "writing" || newWriting
                    ? "Writing"
                    : editorRecord?.kind === "work" || newProject
                      ? "Projects"
                      : "Pages"}
              </BreadcrumbItem>
              <BreadcrumbItem isCurrent>
                {editorRecord?.kind === "writing"
                  ? draftTitle || "Untitled article"
                  : title}
              </BreadcrumbItem>
            </Breadcrumbs>
          )}
          {!hideHeader &&
            !groups &&
            !editorRecord &&
            !editHome &&
            (review || children || newWriting || newProject) && (
              <WorkspacePage
                title={
                  newProject
                    ? "New project"
                    : newWriting
                      ? "New article"
                      : title
                }
              />
            )}
          {inventoryError && (
            <InlineNotice
              tone="warning"
              title="Private drafts couldn’t be loaded"
              action={
                <IconButton
                  label="Reload"
                  tooltip="Reload"
                  size="sm"
                  variant="ghost"
                  icon={
                    <ArrowClockwiseIcon weight="regular" aria-hidden="true" />
                  }
                  onClick={() => window.location.reload()}
                />
              }
            />
          )}
          {(newWriting || newProject) && (
            <NewWriting
              recoveryScope={recoveryScope}
              recordKind={newProject ? "work" : "writing"}
            />
          )}
          {groups && (
            <ContentLibrary
              title={title}
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
                pageTitle={title}
                homepageWritingOptions={homepageWritingOptions}
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
              <CollapsibleGroup type="multiple" density="balanced">
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
            !newProject &&
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
                    href={
                      area === "newsletter"
                        ? libraryPaths.newsletter
                        : libraryPaths.website
                    }
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
    return <Token size="sm" label={value ? "Enabled" : "Disabled"} />;
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
      <CollapsibleGroup type="multiple" density="balanced">
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
      <CollapsibleGroup type="multiple" density="balanced">
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
                trigger={key
                  .replaceAll("_", " ")
                  .replace(/^./, (letter) => letter.toUpperCase())}
              >
                <VStack gap={3} padding={3}>
                  <Fields value={item} />
                </VStack>
              </Collapsible>
            ) : (
              <MetadataList key={key}>
                <MetadataListItem
                  label={key
                    .replaceAll("_", " ")
                    .replace(/^./, (letter) => letter.toUpperCase())}
                >
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
