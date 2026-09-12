import { describe, expect, it } from "vitest";
import { operatorWorkFixture } from "./dev-operator-work";
import {
  buildOperatorTaskSemanticReferences,
  defineKnownReference,
  defineMissingReference,
  googleCalendarDeadlineReference,
  googleCalendarEventReference,
  inferredDeadlineReference,
  inspectorDestination,
  internalDestination,
  internalRecordReference,
  isSafeInternalHref,
  providerDestination,
  renderSemanticReference,
} from "./semantic-reference";

const checkedAt = "2026-08-05T14:00:00.000Z";

describe("typed semantic references", () => {
  it("keeps internal records in the shared inspector", () => {
    const reference = internalRecordReference({
      id: "system:fleet",
      kind: "route",
      label: "Fleet",
      value: "Fleet",
      summary: "Two machine records.",
      source: "admin system index",
      source_ref: "/fleet",
      checked_at: checkedAt,
      source_state: "verified",
    });

    expect(renderSemanticReference(reference)).toMatchObject({
      element: "button",
      href: null,
      action_label: "inspect details",
      state_label: "verified source",
      authority_label: "admin source record",
    });
  });

  it("does not promote a stale internal record to current truth", () => {
    const reference = internalRecordReference({
      id: "work:chief-site",
      kind: "task",
      label: "chief/site",
      value: "chief/site",
      summary: "Last recorded work state.",
      source: "work projection",
      source_ref: "task:chief-site",
      source_state: "stale",
    });

    expect(renderSemanticReference(reference)).toMatchObject({
      element: "button",
      state_label: "last verified",
    });
    expect(reference.checked_at).toBeNull();
    expect(reference.confidence.level).toBe("medium");
  });

  it("opens only an explicit canonical Google Calendar event", () => {
    const reference = googleCalendarEventReference({
      id: "calendar:event:verified-demo",
      label: "calendar event",
      value: "review admin canvas",
      canonical_href:
        "https://calendar.google.com/calendar/event?eid=dmVyaWZpZWQtZXZlbnQ",
      source_ref: "google-calendar:event:verified-demo",
      checked_at: checkedAt,
    });

    expect(renderSemanticReference(reference)).toMatchObject({
      element: "link",
      href:
        reference.destination.type === "provider"
          ? reference.destination.href
          : null,
      target: "_blank",
      rel: "noreferrer",
      authority_label: "Google Calendar authoritative",
    });
  });

  it("rejects guessed or non-canonical Calendar destinations", () => {
    expect(() =>
      providerDestination(
        "google_calendar",
        "https://example.com/calendar/event?eid=guessed",
        "open event",
      ),
    ).toThrow(/unsafe google_calendar/);
    expect(() =>
      providerDestination(
        "google_calendar",
        "https://calendar.google.com/not-calendar/event",
        "open event",
      ),
    ).toThrow(/unsafe google_calendar/);
  });

  it("opens a verified deadline only at its exact Calendar view", () => {
    const reference = googleCalendarDeadlineReference({
      id: "deadline:verified-demo",
      label: "deadline",
      value: "2026-08-10T16:00:00.000Z",
      canonical_href:
        "https://calendar.google.com/calendar/u/0/r/day/2026/8/10",
      source_ref: "google-calendar:deadline:verified-demo",
      checked_at: checkedAt,
    });

    expect(renderSemanticReference(reference)).toMatchObject({
      element: "link",
      href: "https://calendar.google.com/calendar/u/0/r/day/2026/8/10",
      target: "_blank",
      authority_label: "Google Calendar authoritative",
    });
  });

  it("keeps an inferred deadline inside the provenance inspector", () => {
    const reference = inferredDeadlineReference({
      id: "deadline:inferred-demo",
      label: "deadline",
      value: "2026-08-10T16:00:00.000Z",
      source: "admin_projection",
      source_ref: "attention:inferred-demo",
      checked_at: checkedAt,
      confidence: "medium",
      explanation: "The date was inferred from bounded source metadata.",
    });

    expect(renderSemanticReference(reference)).toMatchObject({
      element: "button",
      href: null,
      action_label: "inspect deadline provenance",
      authority_label: "internal inference",
    });
  });

  it("keeps unchecked, absent, and unknown source values distinct", () => {
    const common = {
      kind: "source_time" as const,
      label: "source time",
      value: null,
      authority: { kind: "none" as const, label: "no provider authority" },
      provenance: {
        source: "calendar",
        source_ref: "calendar:event:missing",
        method: "projection" as const,
        evidence_refs: [] as string[],
      },
      confidence: {
        level: "unknown" as const,
        explanation: "No timestamp is currently available.",
      },
      sensitivity: "private" as const,
      validity: { valid_from: null, valid_until: null },
      retrieval_policy: {
        mode: "refresh_then_inspect" as const,
        refresh_href: "/life?inspect=calendar-source",
        explanation: "Refresh or inspect the Calendar source.",
      },
      destination: inspectorDestination("inspect source time"),
    };

    const unchecked = defineMissingReference({
      ...common,
      id: "source-time:unchecked",
      summary: "Calendar has not been queried for this value.",
      source_state: "unchecked",
      checked_at: null,
    });
    const absent = defineMissingReference({
      ...common,
      id: "source-time:absent",
      summary: "Calendar was checked and returned no timestamp.",
      source_state: "absent",
      checked_at: checkedAt,
    });
    const unknown = defineMissingReference({
      ...common,
      id: "source-time:unknown",
      summary: "The system cannot determine whether a timestamp exists.",
      source_state: "unknown",
      checked_at: checkedAt,
    });

    expect(renderSemanticReference(unchecked).state_label).toBe(
      "source not checked",
    );
    expect(renderSemanticReference(absent).state_label).toBe(
      "checked · no value found",
    );
    expect(renderSemanticReference(unknown).state_label).toBe("unknown");
  });

  it("requires proof before claiming known absence", () => {
    expect(() =>
      defineMissingReference({
        id: "source-time:false-absence",
        kind: "source_time",
        label: "source time",
        value: null,
        summary: "No timestamp.",
        source_state: "absent",
        checked_at: null,
        authority: { kind: "none", label: "no authority" },
        provenance: {
          source: "test",
          source_ref: "test:false-absence",
          method: "projection",
          evidence_refs: [],
        },
        confidence: { level: "unknown", explanation: "Not checked." },
        sensitivity: "internal",
        validity: { valid_from: null, valid_until: null },
        retrieval_policy: {
          mode: "inspect",
          refresh_href: null,
          explanation: "Inspect the source.",
        },
        destination: inspectorDestination(),
      }),
    ).toThrow(/cannot claim absence/);
  });

  it("renders explicit person and task destinations without name matching", () => {
    const person = defineKnownReference({
      id: "person:ani",
      kind: "person",
      label: "person",
      value: "ani potts",
      summary: "Canonical internal person entity.",
      source_state: "verified",
      checked_at: checkedAt,
      authority: { kind: "internal", label: "admin entity registry" },
      provenance: {
        source: "entity_registry",
        source_ref: "person:ani",
        method: "projection",
        evidence_refs: ["person:ani"],
      },
      confidence: { level: "high", explanation: "Exact entity ID supplied." },
      sensitivity: "private",
      validity: { valid_from: null, valid_until: null },
      retrieval_policy: {
        mode: "open_internal",
        refresh_href: null,
        explanation: "Open the exact internal person inspector.",
      },
      destination: internalDestination(
        "/knowledge?kind=person&entity=person%3Aani",
        "open person inspector",
      ),
    });
    const task = buildOperatorTaskSemanticReferences(
      operatorWorkFixture.task_states[0]!,
      "verified",
    ).task;

    expect(renderSemanticReference(person)).toMatchObject({
      element: "link",
      href: "/knowledge?kind=person&entity=person%3Aani",
    });
    expect(renderSemanticReference(task)).toMatchObject({
      element: "link",
      href: expect.stringContaining("/work?view=now#task-"),
    });
  });

  it("keeps stale task proof and repository values in the inspector", () => {
    const references = buildOperatorTaskSemanticReferences(
      operatorWorkFixture.task_states[0]!,
      "stale",
    );

    expect(renderSemanticReference(references.proof).element).toBe("button");
    expect(renderSemanticReference(references.repository)).toMatchObject({
      element: "button",
      state_label: "last verified",
      href: null,
    });
    expect(references.repository.value).toBe("anipotts/anipotts.com");
  });

  it("refuses unsafe internal route values", () => {
    expect(() =>
      internalDestination("https://github.com/anipotts", "open route"),
    ).toThrow(/unsafe internal/);
    expect(() =>
      internalDestination("//example.com/escape", "open route"),
    ).toThrow(/unsafe internal/);
  });

  it("rejects control characters before browser URL normalization", () => {
    const origin = "https://admin.example.test";
    for (const separator of ["\n", "\r", "\t"]) {
      const href = `/${separator}/example.com/escape`;
      expect(new URL(href, origin).origin).toBe("https://example.com");
      expect(isSafeInternalHref(href)).toBe(false);
      expect(() => internalDestination(href, "Open route")).toThrow(
        /unsafe internal/,
      );
    }
    for (const code of [0, 8, 12, 31, 127]) {
      expect(isSafeInternalHref(`/work?q=${String.fromCharCode(code)}`)).toBe(
        false,
      );
    }
  });

  it("preserves valid local paths, encoded queries, and anchors", () => {
    for (const href of [
      "/",
      "/work?view=now#task-example",
      "/knowledge?kind=person&entity=person%3Aani",
      "/content?q=two%20words&returnTo=%2Fcontent%3Fgroup%3Dwriting",
    ]) {
      expect(isSafeInternalHref(href)).toBe(true);
      expect(internalDestination(href, "Open route")).toMatchObject({ href });
    }
  });

  it("keeps a verified proof pointer inspectable when no provider owns it", () => {
    const reference = defineKnownReference({
      id: "proof:admin-proof-events",
      kind: "proof",
      label: "proof",
      value: "admin_proof_events",
      summary: "Internal proof row pointer.",
      source_state: "verified",
      checked_at: checkedAt,
      authority: { kind: "recorded", label: "internal proof registry" },
      provenance: {
        source: "admin_proof_events",
        source_ref: "proof:admin-proof-events",
        method: "projection",
        evidence_refs: ["proof:admin-proof-events"],
      },
      confidence: {
        level: "high",
        explanation: "The pointer was read from the proof projection.",
      },
      sensitivity: "internal",
      validity: { valid_from: null, valid_until: null },
      retrieval_policy: {
        mode: "inspect",
        refresh_href: null,
        explanation: "Inspect proof state before acting on it.",
      },
      destination: inspectorDestination("inspect proof"),
    });

    expect(renderSemanticReference(reference)).toMatchObject({
      element: "button",
      action_label: "inspect proof",
      href: null,
    });
  });
});
