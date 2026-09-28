import React, { useEffect, useId, useState } from "react";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { Text } from "@astryxdesign/core/Text";
import { Selector } from "@astryxdesign/core/Selector";
import { HomeAutosave, type SaveState } from "../../lib/home-autosave";
import type { Draft, SaveResult } from "../../editorial/draft-store";
import { ReviewChanges, ReviewHeading } from "./ReviewChanges";
import { saveStatusFromController } from "./SaveStatus";
import { ProjectSections } from "./ProjectSections";
import { PublicationProgress } from "./PublicationProgress";
import { ObservabilityWorkspace } from "./ObservabilityWorkspace";
import opsSample from "../../fixtures/ops_v1.sample.json";
import { newProjectSource } from "../../lib/project-draft";
import { setEditorialField } from "@anipotts/content/editorial/source";
import type { DirectPublicationStatus } from "../../lib/editorial-publication-status";

// Two incidents, including a start observed only as a bound. Kept within the
// development catalog so narrow layouts can be checked without a live reader.
const alignmentEvents = {
  version: "ops_events_v1",
  items: [
    {
      seq: 1,
      at: "2025-09-20T09:00:00Z",
      from_state: null,
      to_state: "failing",
    },
    {
      seq: 2,
      at: "2025-09-20T10:00:00Z",
      from_state: "failing",
      to_state: "ok",
    },
    {
      seq: 3,
      at: "2026-09-21T12:00:00Z",
      from_state: "ok",
      to_state: "failing",
    },
  ].map((event) => ({
    ...event,
    kind: "transition",
    subject: "pc.inference",
    status: null,
    ms: null,
    detail: "Synthetic incident",
  })),
  next_after: null,
};

const scenarios = [
  { value: "private", label: "Saved privately" },
  { value: "local", label: "Saved locally" },
  { value: "unchanged", label: "No changes" },
  { value: "unsaved", label: "Unsaved changes" },
  { value: "saving", label: "Saving" },
  { value: "failed", label: "Save failed" },
  { value: "conflict", label: "Conflict" },
] as const;
type Scenario = (typeof scenarios)[number]["value"];

const beforeSubtitle = "A small tool for keeping notes.";
const afterSubtitle = "A small tool for organizing field notes.";
const beforeCard = "Collect observations in one place.";
const afterCard = "Collect observations and sources in one place.";
const longCard = `${afterCard}\n研究ノート · café · ملاحظات\n${"UnbrokenReference".repeat(16)}`;

function source(subtitle: string, card: string) {
  return `---\nsubtitle: ${JSON.stringify(subtitle)}\ncard_copy: ${JSON.stringify(card)}\n---\n`;
}

const alignmentContext = Array.from(
  { length: 12 },
  (_, index) => `Unchanged line ${index + 1}.`,
).join("\n");
const alignmentBefore = `${alignmentContext}\n**Previous field notes.**`;
const alignmentAfter = `${alignmentContext}\n*Revised field notes.*`;
let alignmentProject = newProjectSource("alignment-example");
for (const [key, value] of Object.entries({
  story: [
    {
      title: "First story section",
      paragraphs: ["First paragraph.", "Second paragraph."],
    },
    {
      title:
        "A longer story section name to check wrapping on a narrow viewport",
      paragraphs: ["One paragraph."],
    },
  ],
  technical: [
    { title: "First technical section", paragraphs: ["Technical notes."] },
    { title: "Second technical section", paragraphs: ["Further notes."] },
  ],
  roadmap: [
    { text: "First roadmap item", status: "planned" },
    { text: "A roadmap item with a validation error", status: "unknown" },
    { text: "Final roadmap item", status: "done" },
  ],
}))
  alignmentProject = setEditorialField(alignmentProject, [key], value);
const alignmentPublication: DirectPublicationStatus = {
  id: "synthetic-alignment",
  phase: "verify",
  blocked: "verification_incomplete",
  version: 1,
  attempts: 1,
  dueAt: 0,
  lease: null,
  leaseUntil: 0,
  checkpoint: {},
  mode: "direct",
  revision: 2,
  sourceSha256: "a".repeat(64),
  baselineSha256: "b".repeat(64),
  publicationId: "synthetic-receipt",
  inventoryVersion: 3,
  verifiedAt: null,
  superseded: false,
  canCancel: false,
  queue: { position: null, pending: 0, head: null, alarmAt: null },
};

const before = source(beforeSubtitle, beforeCard);
const after = source(afterSubtitle, afterCard);

/** Synthetic records only; no browser recovery, API, or persistence adapter. */
function fixtureDraft(source: string, revision: number): Draft {
  return {
    key: "catalog/review-example",
    source,
    revision,
    baseCommit: "0".repeat(40),
    baseFileHash: null,
    updatedAt: 0,
    discardedAt: null,
  };
}

/** Runs the same controller transitions as HomeEditor with in-memory outcomes. */
export function reviewCatalogScenario(
  scenario: Scenario,
  notify: (state: SaveState) => void,
  candidate = after,
) {
  let finishPending: ((result: SaveResult) => void) | undefined;
  const controller = new HomeAutosave(
    scenario === "private" || scenario === "local" ? candidate : before,
    scenario === "unchanged" ? 0 : 1,
    async ({ source, expectedRevision }) => {
      if (scenario === "failed") throw new Error("synthetic_save_failure");
      if (scenario === "conflict")
        return {
          ok: false,
          code: "revision_conflict",
          current: fixtureDraft("Another synthetic revision.", 2),
          conflictId: "catalog-conflict",
        };
      if (scenario === "saving")
        return new Promise<SaveResult>((resolve) => {
          finishPending = resolve;
        });
      return { ok: true, draft: fixtureDraft(source, expectedRevision + 1) };
    },
    notify,
  );
  notify(controller.state);
  if (!["private", "local", "unchanged"].includes(scenario)) {
    controller.edit(candidate);
    if (scenario !== "unsaved") void controller.flush();
  }
  return {
    controller,
    dispose() {
      finishPending?.({ ok: false, code: "invalid_draft_request" });
    },
  };
}

export function DevReviewCatalog() {
  const [scenario, setScenario] = useState<Scenario>("private");
  const [copy, setCopy] = useState("standard");
  const [state, setState] = useState<SaveState>({
    source: after,
    revision: 1,
    status: "saved",
    conflict: null,
  });
  const headingId = useId();
  const noteId = useId();
  const alignment = copy === "alignment";
  const card = copy === "long" ? longCard : afterCard;
  const candidate =
    source(afterSubtitle, card) + (alignment ? alignmentAfter : "");
  const baseline = before + (alignment ? alignmentBefore : "");
  useEffect(() => {
    let active = true;
    const fixture = reviewCatalogScenario(
      scenario,
      (next) => {
        if (active) setState(next);
      },
      candidate,
    );
    return () => {
      active = false;
      fixture.dispose();
    };
  }, [scenario, candidate]);
  return (
    <VStack gap={5}>
      <VStack gap={3} as="section" aria-label="Review catalog controls">
        <Text type="supporting">Component catalog</Text>
        <Text id={noteId} color="secondary">
          Synthetic component examples. Save outcomes run in memory and do not
          save or publish content. The sidebar and diff controls use the actual
          admin components.
        </Text>
        <HStack gap={3} wrap="wrap" vAlign="end">
          <Selector
            label="Save scenario"
            options={[...scenarios]}
            value={scenario}
            onChange={(value) => setScenario(value as Scenario)}
            size="sm"
          />
          <Selector
            label="Content example"
            options={[
              { value: "standard", label: "Standard fields" },
              { value: "long", label: "Long text and Unicode" },
              { value: "alignment", label: "Alignment and wrapped states" },
            ]}
            value={copy}
            onChange={setCopy}
            size="sm"
          />
        </HStack>
      </VStack>
      <VStack gap={5} className="editor-workspace" data-editor-view="publish">
        <ReviewHeading
          id={headingId}
          level={1}
          saveStatus={{
            state: saveStatusFromController(state, {
              localPreview: scenario === "local",
            }),
            describedBy: noteId,
          }}
        />
        <ReviewChanges
          labelledBy={headingId}
          destination="example.test/work/field-notes"
          before={scenario === "unchanged" ? state.source : baseline}
          after={state.source}
          changes={
            scenario === "unchanged"
              ? []
              : [
                  {
                    label: "Subtitle",
                    before: beforeSubtitle,
                    after: afterSubtitle,
                    rich: true,
                  },
                  { label: "Card copy", before: beforeCard, after: card },
                  ...(alignment
                    ? [
                        {
                          label: "Rich field with unchanged context",
                          before: alignmentBefore,
                          after: alignmentAfter,
                          rich: true,
                          onEdit: () => {},
                        },
                      ]
                    : []),
                ]
          }
        />
      </VStack>
      {alignment && (
        <VStack gap={5} as="section" aria-label="Alignment component examples">
          <ProjectSections
            source={alignmentProject}
            errors={
              new Map([
                [
                  "roadmap.1.status",
                  "Choose a supported status before continuing with this roadmap item.",
                ],
              ])
            }
            onEdit={() => {}}
          />
          <PublicationProgress publication={alignmentPublication} compact />
          <ObservabilityWorkspace
            enabled={false}
            fixture={opsSample}
            eventsFixture={alignmentEvents}
            now={Date.parse("2026-09-21T18:00:00Z")}
            view="alerts"
            alert="pc.inference"
          />
        </VStack>
      )}
    </VStack>
  );
}
