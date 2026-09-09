import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { Text } from "@astryxdesign/core/Text";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { MoreMenu } from "@astryxdesign/core/MoreMenu";
import { Button } from "@astryxdesign/core/Button";
import { IconButton } from "@astryxdesign/core/IconButton";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { useMemo } from "react";
import {
  Table,
  pixel,
  proportional,
  type TableColumn,
} from "@astryxdesign/core/Table";
import { MagnifyingGlassIcon } from "../admin-icons";
import { SourceMark } from "../SourceMark";
import type {
  OperatorTaskState,
  OperatorWorkLane,
} from "../../data/operator-work";
import { operatorTaskDisplay } from "../../data/operator-work-view";

type WorkRow = OperatorTaskState &
  Record<string, unknown> & {
    lane: OperatorWorkLane;
    semantic_reference_id: string;
    source_state: "verified" | "stale";
  };

type Props = {
  rows: WorkRow[];
};

const laneLabel: Record<OperatorWorkLane, string> = {
  foreground: "working",
  background: "background",
  waiting: "waiting",
  recently_completed: "completed",
};

const stateLabel = (row: WorkRow) =>
  row.source_state === "verified" ? laneLabel[row.lane] : "last verified";

function WorkActions({
  row,
  mobile = false,
}: {
  row: WorkRow;
  mobile?: boolean;
}) {
  return (
    <HStack gap={1}>
      {mobile ? (
        <Button
          label="Inspect"
          size="sm"
          variant="ghost"
          data-semantic-open={row.semantic_reference_id}
        />
      ) : (
        <IconButton
          size="sm"
          label={`Inspect ${row.canonical_title}`}
          tooltip="Inspect record"
          icon={<MagnifyingGlassIcon size={18} />}
          data-semantic-open={row.semantic_reference_id}
        />
      )}
      {row.attention_ref && (
        <MoreMenu
          label={`${row.canonical_title} actions`}
          size="sm"
          items={[
            {
              label: "Open linked inbox item",
              onClick: () =>
                window.location.assign(
                  `/?item=${encodeURIComponent(row.attention_ref!)}`,
                ),
            },
          ]}
        />
      )}
    </HStack>
  );
}

export function OperatorWorkTable({ rows }: Props) {
  const columns = useMemo<Array<TableColumn<WorkRow>>>(
    () => [
      {
        key: "canonical_title",
        header: "Work",
        width: proportional(1.45),
        renderCell: (row) => (
          <HStack gap={2} vAlign="center" className="quiet-work-identity">
            <SourceMark provider={row.provider} compact />
            <VStack gap={1}>
              <Text weight="semibold">{row.canonical_title}</Text>
              <Text color="secondary" type="supporting">
                {row.project_label}
              </Text>
            </VStack>
          </HStack>
        ),
      },
      {
        key: "operator_state",
        header: "State",
        width: pixel(132),
        renderCell: (row) => (
          <HStack gap={2} vAlign="center">
            <StatusDot
              variant={
                row.source_state === "stale"
                  ? "warning"
                  : row.lane === "recently_completed"
                    ? "success"
                    : "neutral"
              }
              label={stateLabel(row)}
            />
            <VStack gap={1}>
              <Text weight="semibold">{stateLabel(row)}</Text>
              <Text color="secondary" type="supporting">
                {row.source_state === "verified"
                  ? row.runtime_state
                  : "source stale"}
              </Text>
            </VStack>
          </HStack>
        ),
      },
      {
        key: "bounded_goal",
        header: "Now",
        width: proportional(2),
        renderCell: (row) => (
          <VStack gap={1}>
            <Text weight="semibold">
              {operatorTaskDisplay(row).bounded_goal}
            </Text>
            <Text color="secondary" type="supporting">
              {operatorTaskDisplay(row).next_action}
            </Text>
          </VStack>
        ),
      },
      {
        key: "last_observed_at",
        header: "Updated",
        width: pixel(132),
        renderCell: (row) => (
          <VStack gap={1}>
            <Timestamp value={row.last_observed_at} format="auto" />
            <Text color="secondary" type="supporting">
              {row.host}
            </Text>
          </VStack>
        ),
      },
      {
        key: "actions",
        header: <Text className="sr-only">Actions</Text>,
        width: pixel(92),
        align: "end",
        resizable: false,
        renderCell: (row) => <WorkActions row={row} />,
      },
    ],
    [],
  );

  if (!rows.length)
    return (
      <EmptyState
        title="No work in this view"
        description="Choose another work view to see retained records."
      />
    );
  return (
    <>
      <VStack className="quiet-work-table" data-operator-work-table>
        <Table
          data={rows}
          columns={columns}
          idKey="task_id"
          density="compact"
          dividers="rows"
          hasHover
          verticalAlign="middle"
          textOverflow="truncate"
        />
      </VStack>
      <VStack gap={4} className="quiet-work-stack">
        {rows.map((row) => (
          <article key={row.task_id} id={`task-${row.task_id}`}>
            <VStack gap={3}>
              <HStack gap={2} wrap="wrap" vAlign="center">
                <SourceMark provider={row.provider} compact />
                <Text weight="semibold">{row.canonical_title}</Text>
                <StatusDot
                  variant={row.source_state === "stale" ? "warning" : "neutral"}
                  label={stateLabel(row)}
                />
                <Text type="supporting">{stateLabel(row)}</Text>
              </HStack>
              <Text>{operatorTaskDisplay(row).bounded_goal}</Text>
              <Text type="supporting" color="secondary">
                {operatorTaskDisplay(row).next_action}
              </Text>
              <HStack gap={2} wrap="wrap" hAlign="between" vAlign="center">
                <Timestamp value={row.last_observed_at} format="auto" />
                <WorkActions row={row} mobile />
              </HStack>
            </VStack>
          </article>
        ))}
      </VStack>
    </>
  );
}
