import React, {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  BrowserIcon,
  BriefcaseIcon,
  EnvelopeSimpleIcon,
  ArticleIcon,
} from "@phosphor-icons/react";
import { VStack } from "@astryxdesign/core/VStack";
import { Text } from "@astryxdesign/core/Text";
import { BracketQueryControls } from "../workspace/BracketQueryControls";
import { Metric } from "../workspace/Metric";
import { ContentRecordMark } from "../workspace/ContentRecordMark";
import {
  CELL_WIDTHS,
  DataTable,
  RelativeTime,
  RowTitle,
  StateNotice,
} from "../workspace/Workspace";
import {
  activityMatches,
  activityQuery,
  initialActivityQuery,
  periodLabels,
  scopeLabels,
  type ActivityPeriod,
  type ActivityRecord,
} from "./content-activity";

const periods = ["today", "week", "month"] as const;

export function PageRouteMark() {
  return (
    <span className="overview-page-kind" aria-hidden="true">
      /
    </span>
  );
}

export function ContentActivityTable({
  rows,
  label = "Content activity",
}: {
  rows: ActivityRecord[];
  label?: string;
}) {
  return (
    <DataTable
      rows={rows}
      rowKey="id"
      label={label}
      noun={["record", "records"]}
      footer={false}
      columns={[
        {
          key: "title",
          header: "Title",
          priority: 0,
          render: (item) => {
            const [icon, label] =
              item.collection === "writing"
                ? [ArticleIcon, "Writing"]
                : item.collection === "projects"
                  ? [BriefcaseIcon, "Project"]
                  : item.href.startsWith("/newsletter/")
                    ? [EnvelopeSimpleIcon, "Newsletter"]
                    : [BrowserIcon, "Page"];
            return (
              <RowTitle
                icon={icon}
                mark={
                  label === "Project" ? (
                    <ContentRecordMark
                      preferOfficialArtwork
                      record={{
                        id: item.recordId,
                        href: item.href,
                        projectIdentity: item.projectIdentity,
                      }}
                    />
                  ) : label === "Page" ? (
                    <PageRouteMark />
                  ) : undefined
                }
                kind={label}
                title={item.title}
                href={item.href}
                time={item.updated.at}
              />
            );
          },
        },
        {
          key: "updated",
          header: "Updated",
          compact: "trailing",
          compactLabel: false,
          priority: 1,
          width: CELL_WIDTHS.time,
          render: (item) => <RelativeTime value={item.updated.at} />,
        },
      ]}
    />
  );
}

export function ContentActivity({
  records,
  now,
  loading = false,
  incomplete = false,
}: {
  records: readonly ActivityRecord[];
  now: number;
  loading?: boolean;
  incomplete?: boolean;
}) {
  const resultsId = useId();
  const input = useRef<HTMLInputElement>(null);
  const surface = useRef<HTMLElement>(null);
  const returnFocus = useRef(false);
  const [open, setOpen] = useState(false);
  const [problem, setProblem] = useState(false);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState(initialActivityQuery);
  useLayoutEffect(() => {
    if (open) input.current?.focus();
    else if (returnFocus.current) {
      surface.current
        ?.querySelector<HTMLButtonElement>(".workspace-bracket-query-launcher")
        ?.focus();
      returnFocus.current = false;
    }
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !surface.current?.contains(event.target)
      ) {
        setOpen(false);
        setProblem(false);
        setDraft("");
      }
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);
  const sorted = useMemo(
    () =>
      [...new Map(records.map((record) => [record.id, record])).values()].sort(
        (a, b) =>
          Date.parse(b.updated.at) - Date.parse(a.updated.at) ||
          a.id.localeCompare(b.id),
      ),
    [records],
  );
  const matches = (period: ActivityPeriod) =>
    activityMatches(sorted, { ...query, period }, now);
  const active = open ? matches(query.period) : [];
  const previous = open && query.compare ? matches("lastWeek") : [];
  const count = (length: number) =>
    loading || (incomplete && length === 0) ? null : length;
  return (
    <VStack
      gap={3}
      as="section"
      ref={surface}
      aria-label="Content activity"
      className="overview-activity"
      onKeyDown={(event) => {
        if (open && event.key === "Escape" && !event.nativeEvent.isComposing) {
          event.preventDefault();
          returnFocus.current = true;
          setOpen(false);
          setProblem(false);
          setDraft("");
        }
      }}
    >
      <BracketQueryControls
        label="Ask about content activity"
        open={open}
        value={draft}
        resultId={resultsId}
        inputRef={input}
        onOpen={() => setOpen(true)}
        onChange={(value) => {
          setDraft(value.slice(0, 240));
          setProblem(false);
        }}
        onSubmit={() => {
          const next = activityQuery(draft, query);
          setProblem(!next);
          if (next) {
            setQuery(next);
            setDraft("");
          }
        }}
      />
      {open && (
        <VStack id={resultsId} gap={3} aria-label="Activity results">
          {problem && (
            <Text role="status" type="supporting" color="secondary">
              Try “what changed this week?”, “only the homepage”, or “compare
              with last week”.
            </Text>
          )}
          <ul
            className="overview-activity-metrics"
            aria-label="Activity periods"
          >
            {periods.map((period) => (
              <Metric
                key={period}
                label={periodLabels[period]}
                value={count(matches(period).length)}
                incomplete={incomplete}
                selected={!query.compare && period === query.period}
                onSelect={() => {
                  setProblem(false);
                  setQuery({ ...query, period, compare: false });
                }}
              />
            ))}
            {(query.compare || query.period === "lastWeek") && (
              <Metric
                label="Last week"
                value={count(matches("lastWeek").length)}
                incomplete={incomplete}
              />
            )}
          </ul>
          <Text role="status" type="supporting" color="secondary">
            {query.compare
              ? "This week compared with last week"
              : periodLabels[query.period]}
            {", "}
            {scopeLabels[query.scope]}
            {incomplete ? ". Some activity is unavailable." : ""}
          </Text>
          {loading ? (
            <Text role="status">Loading content activity…</Text>
          ) : active.length || previous.length ? (
            <ContentActivityTable
              rows={[...active, ...previous]}
              label={
                query.compare
                  ? "Content activity across both weeks"
                  : "Content activity"
              }
            />
          ) : (
            <StateNotice
              kind={incomplete ? "error" : "empty"}
              title={
                incomplete
                  ? "Activity unavailable for this view"
                  : "No updated records in this period"
              }
            />
          )}
        </VStack>
      )}
    </VStack>
  );
}
