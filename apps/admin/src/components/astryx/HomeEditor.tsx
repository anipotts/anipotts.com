import React, { useEffect, useRef, useState } from "react";
import { VStack } from "@astryxdesign/core/VStack";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { Button } from "@astryxdesign/core/Button";
import { TabList, Tab } from "@astryxdesign/core/TabList";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { history, historyKeymap, defaultKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import {
  parseEditorialSource,
  setEditorialField,
  validateEditorialSource,
  type EditorialRecord,
} from "@anipotts/content/editorial/source";
import { HomeAutosave, type SaveState } from "../../lib/home-autosave";
import type { Draft, SaveResult } from "../../editorial/draft-store";
import type { HomeBase } from "../../lib/editorial-home-api";
import type { PublishJob } from "../../editorial/publication-jobs";

type Snapshot = {
  base: HomeBase;
  draft: Draft | null;
  history: Draft[];
  publishing: "ready" | "not_configured";
  publication: PublishJob | null;
};

export function HomeEditor({ record }: { record: EditorialRecord }) {
  const query = new URLSearchParams(record).toString();
  const endpoint = (action: string) => `/api/editorial/${action}?${query}`;
  const [state, setState] = useState<SaveState | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("edit");
  const [previewRevision, setPreviewRevision] = useState<number | null>(null);
  const editor = useRef<HomeAutosave | null>(null);
  const csrf = useRef("");
  const [publication, setPublication] = useState<PublishJob | null>(null);
  const [publishing, setPublishing] = useState(false);
  const publishRequest = useRef<{ revision: number; id: string } | null>(null);
  async function post(action: string, body: unknown) {
    if (!csrf.current) {
      const response = await fetch("/api/editorial/csrf");
      if (!response.ok) throw new Error("session expired");
      csrf.current = (await response.json()).csrf;
    }
    const response = await fetch(endpoint(action), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Editorial-CSRF": csrf.current,
      },
      body: JSON.stringify(body),
    });
    if (response.status === 401 || response.status === 403) {
      csrf.current = "";
      throw new Error("session expired");
    }
    if (!response.ok && response.status !== 409)
      throw new Error("save unavailable");
    return response.json();
  }
  useEffect(() => {
    let cancelled = false;
    fetch(endpoint("record"))
      .then(async (response) => {
        if (!response.ok) throw new Error("draft storage unavailable");
        const data: Snapshot = await response.json();
        if (cancelled) return;
        setSnapshot(data);
        setPublication(data.publication ?? null);
        const source = data.draft?.source ?? data.base.source;
        editor.current = new HomeAutosave(
          source,
          data.draft?.revision ?? 0,
          (input) => post("save", input) as Promise<SaveResult>,
          setState,
        );
        setState(editor.current.state);
      })
      .catch(() => {
        if (!cancelled)
          setError("couldn’t load this draft. reload to try again.");
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (
      !publication ||
      publication.blocked ||
      ["live", "cancelled"].includes(publication.phase)
    )
      return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `${endpoint("publication")}&operationId=${publication.id}`,
        );
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (!cancelled) {
          if (!data.publication) throw new Error();
          setPublication(data.publication);
        }
      } catch {
        if (!cancelled) {
          setError(
            "status unavailable. publishing continues; retrying status.",
          );
          setPublication({ ...publication });
        }
      }
    }, 4000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [publication]);
  useEffect(() => {
    if (state?.status !== "unsaved" || snapshot?.draft?.discardedAt) return;
    const timer = setTimeout(() => {
      void editor.current?.flush();
    }, 1000);
    return () => clearTimeout(timer);
  }, [state?.source, snapshot?.draft?.discardedAt]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (editor.current && editor.current.state.status !== "saved") {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, []);
  if (!state || !snapshot)
    return <Text role="status">{error || "loading draft"}</Text>;
  const fields =
    record.kind === "work"
      ? [
          { label: "title", path: ["title"] },
          { label: "subtitle", path: ["subtitle"] },
          { label: "card copy", path: ["card_copy"] },
          { label: "description", path: ["description"] },
        ]
      : record.kind === "writing"
        ? [
            { label: "title", path: ["title"] },
            { label: "subtitle", path: ["summary"] },
          ]
        : [{ label: "subheading", path: ["sections", "intro", "subheading"] }];
  let values: string[] = [];
  let parseable = false;
  let valid = false;
  try {
    const parsed = parseEditorialSource(state.source);
    parseable = true;
    values = fields.map((field) =>
      String(parsed.document.getIn(field.path) ?? ""),
    );
    valid = validateEditorialSource(record, state.source).success;
  } catch {
    /* Source remains editable and recoverable while malformed. */
  }
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([state.source], { type: "text/markdown;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `${record.id}-draft.md`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const refreshPreview = async () => {
    if (!valid || snapshot.draft?.discardedAt) return;
    await editor.current!.ensureDraft();
    const current = editor.current!.state;
    try {
      if (
        current.status === "saved" &&
        current.revision > 0 &&
        validateEditorialSource(record, current.source).success
      ) {
        setError("");
        setPreviewRevision(current.revision);
        return;
      }
    } catch {
      /* The source may have changed while its previous revision was saving. */
    }
    setError("save a valid draft before previewing.");
  };
  return (
    <VStack gap={4}>
      <HStack gap={2} wrap="wrap">
        <Button
          label="back to content"
          href={`/content?group=${record.kind === "page" ? "pages" : record.kind}`}
          size="sm"
        />
        <Text role="status">
          {snapshot.draft?.discardedAt ? "discarded draft" : state.status}
        </Text>
        <Button label="download source" size="sm" onClick={download} />
        {state.status === "unsaved" && (
          <Button
            label="retry save"
            size="sm"
            clickAction={() => editor.current!.flush()}
          />
        )}
        <Button
          label="publish"
          variant="primary"
          size="sm"
          isDisabled={
            snapshot.publishing !== "ready" ||
            state.source === snapshot.base.source ||
            !valid ||
            Boolean(snapshot.draft?.discardedAt) ||
            Boolean(
              publication && !["live", "cancelled"].includes(publication.phase),
            )
          }
          isLoading={publishing}
          tooltip={
            snapshot.publishing === "ready"
              ? "publishes this record’s source to GitHub and the website"
              : "publishing is not connected yet"
          }
          clickAction={async () => {
            setPublishing(true);
            setError("");
            try {
              await editor.current!.ensureDraft();
              const current = editor.current!.state;
              if (
                current.status !== "saved" ||
                !validateEditorialSource(record, current.source).success
              )
                throw new Error();
              if (publishRequest.current?.revision !== current.revision)
                publishRequest.current = {
                  revision: current.revision,
                  id: crypto.randomUUID(),
                };
              const result = await post("publish", {
                expectedRevision: current.revision,
                operationId: publishRequest.current.id,
                discloseSource: true,
              });
              if (!result.publication) throw new Error();
              setPublication(result.publication);
            } catch {
              setError(
                "couldn’t start publishing. your draft is retained; retry after saving.",
              );
            } finally {
              setPublishing(false);
            }
          }}
        />
      </HStack>
      {publication && (
        <HStack gap={2} wrap="wrap">
          <Text role="status">
            {publication.blocked
              ? publication.blocked === "publication_base_changed"
                ? "website changed. stop this publication, then edit your draft and publish again"
                : `blocked: ${publication.blocked.replaceAll("_", " ")}`
              : {
                  validate: "checking content",
                  commit: "preparing publication",
                  branch: "preparing publication",
                  pr: "opening review",
                  checks: "checking changes",
                  deploy: "deploying",
                  verify: "verifying website",
                  live: "live",
                  cancelled: "stopped. edit your draft to publish again",
                }[publication.phase]}
          </Text>
          {publication.checkpoint.prNumber && (
            <Button
              label="view changes"
              size="sm"
              href={`https://github.com/anipotts/anipotts.com/pull/${publication.checkpoint.prNumber}`}
            />
          )}
          {publication.blocked &&
            ["validate", "commit", "branch", "pr", "checks"].includes(
              publication.phase,
            ) && (
              <Button
                label="stop publishing"
                size="sm"
                clickAction={async () => {
                  try {
                    const result = await post("cancel-publication", {
                      expectedRevision: state.revision,
                      operationId: publication.id,
                      expectedVersion: publication.version,
                    });
                    if (!result.ok) throw new Error();
                    setError("");
                    setPublication({ ...publication, blocked: null });
                  } catch {
                    setError(
                      "couldn’t stop. reload to check the latest publication.",
                    );
                  }
                }}
              />
            )}
          {publication.blocked &&
            publication.blocked !== "publication_base_changed" && (
              <Button
                label="retry publishing"
                size="sm"
                clickAction={async () => {
                  try {
                    const result = await post("retry-publication", {
                      expectedRevision: state.revision,
                      operationId: publication.id,
                      expectedVersion: publication.version,
                    });
                    if (!result.ok) throw new Error();
                    setError("");
                    setPublication({ ...publication, blocked: null });
                  } catch {
                    setError(
                      "couldn’t retry. reload to check the latest publication.",
                    );
                  }
                }}
              />
            )}
        </HStack>
      )}
      {snapshot.draft?.discardedAt && (
        <Button
          label="recover draft"
          clickAction={async () => {
            try {
              const result = await post("restore", {
                expectedRevision: state.revision,
              });
              if (!result.draft) throw new Error();
              setSnapshot({ ...snapshot, draft: result.draft });
              editor.current!.resolve(result.draft, false);
            } catch {
              setError(
                "recovery failed. reload to compare the latest revision.",
              );
            }
          }}
        />
      )}
      {error && <Text role="alert">{error}</Text>}
      {state.conflict && (
        <VStack gap={2}>
          <Text role="alert">
            another edit was saved. compare before continuing.
          </Text>
          <TextArea
            label="saved on another tab or device"
            value={state.conflict.current?.source ?? ""}
            isReadOnly
            rows={5}
          />
          <HStack gap={2}>
            <Button
              label="keep my version"
              isDisabled={
                !state.conflict.current ||
                state.conflict.current.discardedAt !== null
              }
              clickAction={async () => {
                editor.current!.resolve(state.conflict!.current!, true);
                await editor.current!.flush();
              }}
            />
            <Button
              label="use saved version"
              isDisabled={
                !state.conflict.current ||
                state.conflict.current.discardedAt !== null
              }
              onClick={() =>
                editor.current!.resolve(state.conflict!.current!, false)
              }
            />
          </HStack>
        </VStack>
      )}
      <TabList
        size="sm"
        value={tab}
        onChange={(next) => {
          setTab(next);
          if (next === "preview") void refreshPreview();
        }}
      >
        {(record.kind === "page"
          ? ["edit", "source", "preview", "history"]
          : ["edit", "source", "history"]
        ).map((name) => (
          <Tab key={name} label={name} value={name} />
        ))}
      </TabList>
      {tab === "preview" && (
        <VStack gap={2}>
          <Button
            label="refresh preview"
            isDisabled={!valid || Boolean(snapshot.draft?.discardedAt)}
            clickAction={refreshPreview}
          />
          {previewRevision && (
            <iframe
              title="home draft preview"
              src={`/preview/home?revision=${previewRevision}`}
              sandbox="allow-scripts"
              referrerPolicy="no-referrer"
              className="editorial-preview"
            />
          )}
        </VStack>
      )}
      {tab === "edit" &&
        fields.map((field, index) => (
          <TextArea
            key={field.label}
            label={field.label}
            value={values[index] ?? ""}
            rows={field.label === "title" ? 2 : 4}
            isDisabled={!parseable || Boolean(snapshot.draft?.discardedAt)}
            disabledMessage="fix the source or recover the draft first"
            onChange={(value) =>
              editor.current!.edit(
                setEditorialField(state.source, field.path, value),
              )
            }
          />
        ))}
      <SourceEditor
        source={state.source}
        onChange={(source) => editor.current!.edit(source)}
        hidden={tab !== "source"}
      />
      {!valid && (
        <Text role="alert">
          source needs correction before preview or publishing.
        </Text>
      )}
      {tab === "history" && (
        <VStack gap={2}>
          <Button
            label="refresh history"
            clickAction={async () => {
              const response = await fetch(endpoint("record"));
              if (response.ok) {
                const data: Snapshot = await response.json();
                setSnapshot((previous) =>
                  previous ? { ...previous, history: data.history } : previous,
                );
              }
            }}
          />
          {snapshot.history.map((revision) => (
            <HStack key={revision.revision} gap={2} wrap="wrap">
              <Text>{new Date(revision.updatedAt).toLocaleString()}</Text>
              <Button
                label={`restore revision ${revision.revision}`}
                size="sm"
                isDisabled={Boolean(snapshot.draft?.discardedAt)}
                onClick={() => editor.current!.edit(revision.source)}
              />
            </HStack>
          ))}
          {snapshot.history.length === 0 && <Text>no saved revisions yet</Text>}
        </VStack>
      )}
    </VStack>
  );
}

function SourceEditor({
  source,
  onChange,
  hidden,
}: {
  source: string;
  onChange: (source: string) => void;
  hidden: boolean;
}) {
  const host = useRef<HTMLElement | null>(null);
  const view = useRef<EditorView | null>(null);
  const change = useRef(onChange);
  change.current = onChange;
  useEffect(() => {
    const instance = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: source,
        extensions: [
          markdown(),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ "aria-label": "record source" }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) change.current(update.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = instance;
    return () => {
      instance.destroy();
    };
  }, []);
  useEffect(() => {
    const current = view.current;
    if (current && current.state.doc.toString() !== source)
      current.dispatch({
        changes: { from: 0, to: current.state.doc.length, insert: source },
      });
  }, [source]);
  return (
    <section
      ref={host}
      hidden={hidden}
      className="editorial-source"
      aria-label="source editor"
    />
  );
}
