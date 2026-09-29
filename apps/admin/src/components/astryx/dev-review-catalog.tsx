import React, { useEffect, useId, useState } from "react";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { Text } from "@astryxdesign/core/Text";
import { Selector } from "@astryxdesign/core/Selector";
import { HomeAutosave, type SaveState } from "../../lib/home-autosave";
import type { Draft, SaveResult } from "../../editorial/draft-store";
import { ReviewChanges, ReviewHeading } from "./ReviewChanges";
import { saveStatusFromController } from "./SaveStatus";

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
  const card = copy === "long" ? longCard : afterCard;
  useEffect(() => {
    let active = true;
    const fixture = reviewCatalogScenario(
      scenario,
      (next) => {
        if (active) setState(next);
      },
      source(afterSubtitle, card),
    );
    return () => {
      active = false;
      fixture.dispose();
    };
  }, [scenario, card]);
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
          before={before}
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
                ]
          }
        />
      </VStack>
    </VStack>
  );
}
