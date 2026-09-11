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
import { AppShell } from "@astryxdesign/core/AppShell";
import { TopNav, TopNavHeading } from "@astryxdesign/core/TopNav";
import { Button } from "@astryxdesign/core/Button";
import { IconButton } from "@astryxdesign/core/IconButton";
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
import { AdminCommandPalette } from "./AdminCommandPalette";
import type { AdminSearchResult } from "../../data/admin-search";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
} from "@astryxdesign/core/DropdownMenu";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Table, proportional, pixel } from "@astryxdesign/core/Table";
import { TabList, Tab } from "@astryxdesign/core/TabList";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@astryxdesign/core/SegmentedControl";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import {
  CaretDownIcon,
  XIcon,
  MagnifyingGlassIcon,
  SunIcon,
  MoonIcon,
  DesktopIcon,
  FilesIcon,
  EnvelopeSimpleIcon,
  ArrowUpRightIcon,
  SignOutIcon,
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
  review?: Review;
  inventoryError?: boolean;
  newWriting?: boolean;
  editHome?: boolean;
  editorRecord?: import("@anipotts/content/editorial/source").EditorialRecord;
  children?: ReactNode;
};

export function matchingRecords(
  records: CatalogRecord[],
  query: string,
  status: string,
  sections?: string[],
): CatalogRecord[] {
  const text = query.trim().toLocaleLowerCase();
  return records.filter(
    (record) =>
      (status === "all" || record.status === status) &&
      (sections === undefined || sections.includes(record.section ?? "")) &&
      `${record.title} ${record.summary ?? ""} ${record.section ?? ""}`
        .toLocaleLowerCase()
        .includes(text),
  );
}

export function recentlyUpdated(records: CatalogRecord[]): CatalogRecord[] {
  const latest = (record: CatalogRecord): number =>
    Date.parse(record.updated?.at ?? "") || 0;
  return [...records].sort(
    (a, b) => latest(b) - latest(a) || a.title.localeCompare(b.title),
  );
}

function Updated({
  updated,
  column = false,
}: {
  updated: CatalogRecord["updated"];
  column?: boolean;
}) {
  if (!updated)
    return column ? <Text color="secondary">not recorded</Text> : null;
  const date = new Date(updated.at);
  if (!Number.isFinite(date.getTime())) return null;
  return (
    <HStack gap={2} wrap="wrap">
      <Timestamp
        value={updated.at}
        format="date"
        tooltipEntries={[
          {
            label:
              updated.source === "private"
                ? "Private draft saved"
                : updated.source === "local"
                  ? "Local edit"
                  : "Latest Git change",
            timezoneID: "UTC",
            format: "full",
          },
        ]}
      />
      {updated.source === "local" && (
        <Text type="supporting" color="secondary">
          local edit
        </Text>
      )}
    </HStack>
  );
}

/** One link per destination: visible words on desktop, named icons on mobile. */
function NavigationLink({
  label,
  href,
  icon,
  active = false,
  newTab = false,
}: {
  label: string;
  href: string;
  icon: ReactNode;
  active?: boolean;
  newTab?: boolean;
}) {
  return (
    <Button
      label={label}
      href={href}
      target={newTab ? "_blank" : undefined}
      rel={newTab ? "noopener noreferrer" : undefined}
      tooltip={newTab ? `${label} in a new tab` : label}
      size="sm"
      variant={active ? "primary" : "secondary"}
      aria-current={active ? "page" : undefined}
      className="editorial-nav-link"
    >
      <Text
        as="span"
        className="editorial-nav-icon"
        style={{ color: "inherit" }}
      >
        {icon}
      </Text>
      <Text
        as="span"
        className="editorial-nav-label"
        style={{ color: "inherit" }}
      >
        {label}
      </Text>
    </Button>
  );
}

function RecordStatus({ status }: { status: string }) {
  const visible = ["published", "featured", "listed"].includes(status);
  return (
    <Token
      size="sm"
      label={status.replaceAll("_", " ")}
      icon={
        <StatusDot
          variant={visible ? "success" : "neutral"}
          label={visible ? "public" : "not public"}
        />
      }
    />
  );
}

export function EditorialApp({
  title,
  area,
  localPreview,
  siteUrl,
  initialMode = "light",
  searchEntries,
  groups,
  selectedGroup,
  review,
  editHome,
  newWriting,
  inventoryError,
  editorRecord,
  children,
}: EditorialAppProps) {
  const [mode, setMode] = useState<ThemePreference>(initialMode);
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
  const nextMode = { light: "dark", dark: "system", system: "light" }[
    mode
  ] as ThemePreference;
  const ThemeIcon = { light: SunIcon, dark: MoonIcon, system: DesktopIcon }[
    mode
  ];
  return (
    <Theme theme={theme} mode={mode}>
      <AppShell
        height="auto"
        variant="section"
        mobileNav={false}
        contentPadding={4}
        topNav={
          <TopNav
            label="admin"
            heading={<TopNavHeading heading="admin" headingHref="/content" />}
            endContent={
              <HStack gap={2} className="editorial-nav-actions" vAlign="center">
                <AdminCommandPalette
                  entries={searchEntries}
                  navItems={[]}
                  scope="editorial"
                  compact
                />
                <NavigationLink
                  label="content"
                  href="/content"
                  active={area === "content"}
                  icon={<FilesIcon size={20} />}
                />
                <NavigationLink
                  label="newsletter"
                  href="/newsletter"
                  active={area === "newsletter"}
                  icon={<EnvelopeSimpleIcon size={20} />}
                />
                <NavigationLink
                  label={localPreview ? "live site" : "view site"}
                  newTab
                  href={siteHref}
                  icon={<ArrowUpRightIcon size={20} />}
                />
                <IconButton
                  size="sm"
                  label={`${mode} theme: switch to ${nextMode}`}
                  tooltip={`${mode} theme: switch to ${nextMode}`}
                  icon={<ThemeIcon size={18} />}
                  onClick={() => changeTheme(nextMode)}
                />
                {!localPreview && (
                  <NavigationLink
                    label="log out"
                    href="/cdn-cgi/access/logout"
                    icon={<SignOutIcon size={20} />}
                  />
                )}
              </HStack>
            }
          />
        }
      >
        <VStack gap={6} className="editorial-content">
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
              <BreadcrumbItem isCurrent>{title}</BreadcrumbItem>
            </Breadcrumbs>
          )}
          {(groups || review || children || newWriting || editorRecord) && (
            <HStack gap={3} hAlign="between" vAlign="center" wrap="wrap">
              <Heading level={1}>
                {newWriting
                  ? "New article"
                  : groups && selectedGroup === "writing"
                    ? "Writing"
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
          {newWriting && <NewWriting />}
          {groups && <Catalog groups={groups} selectedGroup={selectedGroup} />}
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
                        ? "back to drafts"
                        : "back to content"
                    }
                    href={area === "newsletter" ? "/newsletter" : "/content"}
                  />
                }
              />
            ))}
        </VStack>
      </AppShell>
    </Theme>
  );
}

function Catalog({
  groups,
  selectedGroup,
}: {
  groups: CatalogGroup[];
  selectedGroup?: string;
}) {
  const group = groups.find((item) => item.name === selectedGroup) ?? groups[0];
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const sectionOptions = [
    ...new Set(
      group?.records.flatMap((item) => (item.section ? [item.section] : [])) ??
        [],
    ),
  ].sort();
  const [sections, setSections] = useState<string[]>(() => sectionOptions);
  if (!group) return <EmptyState title="no records" />;
  const records = recentlyUpdated(
    matchingRecords(
      group.records,
      query,
      status,
      sectionOptions.length > 1 ? sections : undefined,
    ),
  );
  const statuses = [...new Set(group.records.map((item) => item.status))];
  return (
    <VStack gap={4}>
      {groups.length > 1 && (
        <TabList size="sm" value={group.name} onChange={() => {}} hasDivider>
          {groups.map((item) => (
            <Tab
              key={item.name}
              value={item.name}
              label={item.name === "pages" ? "all pages" : item.name}
              href={item.href}
            />
          ))}
        </TabList>
      )}
      <TextInput
        label="search records"
        isLabelHidden
        placeholder="search records"
        startIcon="search"
        value={query}
        onChange={setQuery}
        hasClear
      />
      <HStack
        gap={2}
        hAlign="between"
        vAlign="center"
        className="editorial-filter-row"
      >
        {sectionOptions.length > 1 && (
          <DropdownMenu
            button={{
              label:
                sections.length === sectionOptions.length
                  ? "all sections"
                  : sections.length === 0
                    ? "no sections"
                    : sections.length <= 2
                      ? sections.join(", ")
                      : `${sections.length} sections`,
              size: "sm",
              variant: "secondary",
            }}
          >
            <DropdownMenuCheckboxItem
              label="all sections"
              value={sections.length === sectionOptions.length}
              onChange={(checked) => setSections(checked ? sectionOptions : [])}
            />
            {sectionOptions.map((section) => (
              <DropdownMenuCheckboxItem
                key={section}
                label={section}
                value={sections.includes(section)}
                onChange={(checked) =>
                  setSections((current) =>
                    checked
                      ? [...current, section]
                      : current.filter((item) => item !== section),
                  )
                }
              />
            ))}
          </DropdownMenu>
        )}
        {statuses.length > 1 && group.name !== "pages" && (
          <SegmentedControl
            size="sm"
            label="publication status"
            value={status}
            onChange={setStatus}
            className="editorial-status-filter"
          >
            {["all", ...statuses].map((item) => (
              <SegmentedControlItem
                key={item}
                value={item}
                label={item.replaceAll("_", " ")}
              />
            ))}
          </SegmentedControl>
        )}
        <Text
          type="supporting"
          color="secondary"
          aria-live="polite"
          className="editorial-record-count"
        >
          {records.length} {records.length === 1 ? "record" : "records"}
        </Text>
      </HStack>
      {records.length ? (
        <Card padding={0}>
          <Table
            className="editorial-record-table"
            data={records}
            idKey="href"
            density="compact"
            hasHover
            aria-label={`${group.name} records`}
            columns={[
              {
                key: "title",
                header: "title",
                width: proportional(1, { minWidth: 80 }),
                renderCell: (item) => (
                  <VStack gap={1}>
                    <HStack
                      gap={2}
                      vAlign="center"
                      className="editorial-record-heading"
                    >
                      <Button
                        size="sm"
                        label={item.title}
                        href={item.href}
                        variant="ghost"
                        className="record-link"
                      />
                      {item.section && item.title !== item.section && (
                        <Token
                          size="sm"
                          label={item.section}
                          color={
                            item.section === "work"
                              ? "blue"
                              : item.section === "writing"
                                ? "purple"
                                : "default"
                          }
                          description="page section"
                        />
                      )}
                    </HStack>
                    {item.summary && (
                      <Text color="secondary">{item.summary}</Text>
                    )}
                    <HStack className="editorial-mobile-status">
                      <RecordStatus status={item.status} />
                    </HStack>
                  </VStack>
                ),
              },
              {
                key: "status",
                header: "status",
                width: pixel(112),
                renderCell: (item) => <RecordStatus status={item.status} />,
              },
              {
                key: "updated",
                header: "last updated",
                width: pixel(112),
                renderCell: (item) => <Updated updated={item.updated} column />,
              },
            ]}
          />
        </Card>
      ) : (
        <EmptyState
          title="no matching records"
          actions={
            <Button
              label="clear filters"
              onClick={() => {
                setQuery("");
                setStatus("all");
                setSections(sectionOptions);
              }}
            />
          }
        />
      )}
    </VStack>
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
    <Text color="secondary">{value == null ? "not set" : String(value)}</Text>
  );
}
