import React, { useEffect, useRef, useState } from "react";
import { VStack } from "@astryxdesign/core/VStack";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { Heading } from "@astryxdesign/core/Heading";
import { TextInput } from "@astryxdesign/core/TextInput";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import {
  ArrowLeftIcon,
  ArrowSquareOutIcon,
  DotsThreeIcon,
} from "@phosphor-icons/react";
import { RichTextField } from "./RichTextField";
import { editableHomeSummary } from "../../lib/rich-text";
import { editorialFields } from "../../lib/editorial-fields";
import { ReviewChanges } from "./ReviewChanges";
import { PublicationProgress } from "./PublicationProgress";
import { TextArea } from "@astryxdesign/core/TextArea";
import { Button } from "@astryxdesign/core/Button";
import { MoreMenu } from "@astryxdesign/core/MoreMenu";
import { TabList, Tab } from "@astryxdesign/core/TabList";
import { Compartment, EditorState } from "@codemirror/state";
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

export function HomeEditor({
  record,
  localPreview = false,
}: {
  record: EditorialRecord;
  localPreview?: boolean;
}) {
  const query = new URLSearchParams(record).toString();
  const endpoint = (action: string) => `/api/editorial/${action}?${query}`;
  const [state, setState] = useState<SaveState | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("edit");
  const [previewRevision, setPreviewRevision] = useState<number | null>(null);
  const editor = useRef<HomeAutosave | null>(null);
  const csrf = useRef("");
  const importInput = useRef<HTMLInputElement | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [publication, setPublication] = useState<PublishJob | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publicationStale, setPublicationStale] = useState(false);
  const [reviewSource, setReviewSource] = useState<string | null>(null);
  const [comparison, setComparison] = useState<HomeBase | null>(null);
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
          setPublicationStale(false);
          setPublication(data.publication);
        }
      } catch {
        if (!cancelled) {
          setPublicationStale(true);
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
  let fields = editorialFields(record);
  let values: string[] = [];
  let parseable = false;
  let valid = false;
  try {
    const parsed = parseEditorialSource(state.source);
    parseable = true;
    fields = editorialFields(record, parsed.data);
    values = fields.map((field) =>
      String(parsed.document.getIn(field.path) ?? ""),
    );
    if (record.kind === "page" && record.id === "home") {
      const index = fields.findIndex((field) => field.rich);
      values[index] = editableHomeSummary(
        values[index] ?? "",
        (parsed.data as { sections: { intro: { mention_keys?: string[] } } })
          .sections.intro.mention_keys ?? [],
        (parsed.data as { mentions: Parameters<typeof editableHomeSummary>[2] })
          .mentions,
        parsed.document.getIn(["sections", "intro", "subheading_format"]) ===
          "markdown",
      );
    }
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
    setPreviewRevision(null);
    if (!valid || snapshot.draft?.discardedAt) {
      setError("Save a valid, active draft before previewing.");
      return;
    }
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
  const openHistory = async () => {
    setTab("history");
    setHistoryLoading(true);
    try {
      await editor.current!.flush();
      const response = await fetch(endpoint("record"));
      if (!response.ok) throw new Error();
      const data: Snapshot = await response.json();
      setSnapshot((previous) =>
        previous ? { ...previous, history: data.history } : previous,
      );
      setError("");
    } catch {
      setError("Couldn’t load history. Reopen Version history to try again.");
    } finally {
      setHistoryLoading(false);
    }
  };
  const compareWebsite = async () => {
    try {
      const response = await fetch(endpoint("record"));
      if (!response.ok) throw new Error();
      const data: Snapshot = await response.json();
      setComparison(data.base);
      setError("");
    } catch {
      setError("Couldn’t load the current website source. Try again.");
    }
  };
  const isDocumentView = tab === "edit" || tab === "preview";
  return (
    <VStack gap={5} className="editor-workspace">
      <HStack gap={3} wrap="wrap" className="editor-actionbar" vAlign="center">
        <HStack gap={3} vAlign="center" className="editor-save-group">
          <Button
            label={isDocumentView ? "Content" : "Back to editor"}
            variant="ghost"
            icon={<ArrowLeftIcon size={18} />}
            href={
              isDocumentView
                ? `/content?group=${record.kind === "page" ? "pages" : record.kind}`
                : undefined
            }
            onClick={isDocumentView ? undefined : () => setTab("edit")}
            size="sm"
          />
          <HStack gap={2} vAlign="center" role="status">
            <StatusDot
              variant={state.status === "saved" ? "success" : "warning"}
              label={state.status}
            />
            <Text color="secondary">
              {snapshot.draft?.discardedAt
                ? "Discarded draft"
                : state.status === "saved"
                  ? localPreview
                    ? "Saved locally"
                    : "Saved privately"
                  : state.status === "saving"
                    ? "Saving…"
                    : state.status === "conflict"
                      ? "Resolve conflicting edits"
                      : "Unsaved changes"}
            </Text>
          </HStack>
        </HStack>
        <HStack gap={2} wrap="wrap" className="editor-primary-actions">
          {tab !== "publish" && (
            <Button
              label="Review changes"
              variant="primary"
              size="sm"
              onClick={() => {
                setReviewSource(state.source);
                setTab("publish");
              }}
              isDisabled={!valid || Boolean(snapshot.draft?.discardedAt)}
            />
          )}
          <MoreMenu
            label="Document actions"
            icon={<DotsThreeIcon size={20} />}
            size="sm"
            alignment="end"
            items={[
              { label: "View source", onClick: () => setTab("source") },
              {
                label: "Version history",
                onClick: () => {
                  void openHistory();
                },
              },
              {
                label: "Compare with website",
                onClick: () => {
                  void compareWebsite();
                },
              },
              { type: "divider" },
              { label: "Download draft", onClick: download },
              {
                label: "Import draft…",
                isDisabled: Boolean(snapshot.draft?.discardedAt),
                onClick: () => importInput.current?.click(),
              },
              ...(state.status === "unsaved"
                ? [
                    { type: "divider" as const },
                    {
                      label: "Save now",
                      isDisabled: Boolean(snapshot.draft?.discardedAt),
                      onClick: () => {
                        void editor.current!.flush();
                      },
                    },
                  ]
                : []),
            ]}
          />
        </HStack>
      </HStack>
      {publication && (
        <PublicationProgress publication={publication} stale={publicationStale}>
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
                    setPublicationStale(false);
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
            !["publication_base_changed", "record_changed"].includes(
              publication.blocked,
            ) && (
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
                    setPublicationStale(false);
                    setPublication({ ...publication, blocked: null });
                  } catch {
                    setError(
                      "couldn’t retry. reload to check the latest publication.",
                    );
                  }
                }}
              />
            )}
        </PublicationProgress>
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
      {comparison && (
        <VStack gap={2}>
          <Text>
            compare the current website with your draft. update your draft below
            before keeping it over the website version.
          </Text>
          <TextArea
            label="current website source"
            value={comparison.source}
            isReadOnly
            rows={5}
          />
          <TextArea
            label="your draft source"
            value={state.source}
            isReadOnly
            rows={5}
          />
          <Button
            label="keep draft over this website version"
            isDisabled={
              state.status !== "saved" ||
              Boolean(snapshot.draft?.discardedAt) ||
              Boolean(
                publication &&
                !["live", "cancelled"].includes(publication.phase),
              )
            }
            clickAction={async () => {
              try {
                await editor.current!.ensureDraft();
                const current = editor.current!.state;
                if (current.status !== "saved") throw new Error();
                const result = await post("rebase", {
                  source: current.source,
                  expectedRevision: current.revision,
                  requestId: crypto.randomUUID(),
                  reviewedBaseCommit: comparison.baseCommit,
                  reviewedBaseFileHash: comparison.baseFileHash,
                });
                if (result.error === "upstream_changed") {
                  setComparison(result.base);
                  setError(
                    "website changed again. compare the updated source before continuing.",
                  );
                  return;
                }
                if (!result.ok) throw new Error();
                setSnapshot({
                  ...snapshot,
                  base: comparison,
                  draft: result.draft,
                });
                editor.current!.resolve(
                  result.draft,
                  editor.current!.state.source !== result.draft.source,
                );
                setComparison(null);
                setPreviewRevision(null);
                setError("");
              } catch {
                setError(
                  "couldn’t update the draft base. reload to compare the latest saved revision.",
                );
              }
            }}
          />
          <Button
            label="close comparison"
            onClick={() => setComparison(null)}
          />
        </VStack>
      )}
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
      {isDocumentView ? (
        <HStack gap={3} wrap="wrap" vAlign="center" className="editor-viewbar">
          <TabList
            size="sm"
            value={tab}
            onChange={(next) => {
              setTab(next);
              if (next === "preview") void refreshPreview();
            }}
          >
            <Tab label="Edit" value="edit" />
            <Tab label="Preview" value="preview" />
          </TabList>
        </HStack>
      ) : (
        <Heading level={2}>
          {tab === "publish"
            ? "Review changes"
            : tab === "source"
              ? "Source"
              : "Version history"}
        </Heading>
      )}
      {tab === "preview" && (
        <VStack gap={2}>
          {previewRevision ? (
            <iframe
              title={`${record.id} draft preview`}
              src={`/preview/${record.kind === "page" && record.id === "home" ? "home" : "record"}?${query}&revision=${previewRevision}`}
              sandbox="allow-scripts"
              referrerPolicy="no-referrer"
              className="editorial-preview"
            />
          ) : (
            <Text role="status">
              {error
                ? "Preview unavailable. Return to Edit to check your draft."
                : "Preparing preview…"}
            </Text>
          )}
        </VStack>
      )}
      {tab === "edit" && (
        <VStack gap={6} className="editor-fields">
          {fields.map((field, index) =>
            field.rich ? (
              <RichTextField
                key={field.path.join(".")}
                label={field.label}
                description={field.description}
                value={values[index] ?? ""}
                disabled={!parseable || Boolean(snapshot.draft?.discardedAt)}
                onChange={(value) => {
                  let next = setEditorialField(
                    editor.current!.state.source,
                    field.path,
                    value,
                  );
                  if (record.kind === "page" && record.id === "home")
                    next = setEditorialField(
                      next,
                      ["sections", "intro", "subheading_format"],
                      "markdown",
                    );
                  editor.current!.edit(next);
                }}
              />
            ) : (
              <TextInput
                key={field.path.join(".")}
                label={field.label}
                value={values[index] ?? ""}
                isDisabled={!parseable || Boolean(snapshot.draft?.discardedAt)}
                onChange={(value) =>
                  editor.current!.edit(
                    setEditorialField(
                      editor.current!.state.source,
                      field.path,
                      value,
                    ),
                  )
                }
              />
            ),
          )}
        </VStack>
      )}
      {tab === "publish" && (
        <VStack gap={4} className="editor-review">
          <ReviewChanges
            destination={`anipotts.com${record.kind === "page" ? (record.id === "home" ? "/" : `/${record.id}`) : `/${record.kind}/${record.id}`}`}
            before={snapshot.base.source}
            after={state.source}
            changes={fields.flatMap((field) => {
              try {
                return [
                  {
                    label: field.label,
                    rich: field.rich,
                    before: String(
                      parseEditorialSource(snapshot.base.source).document.getIn(
                        field.path,
                      ) ?? "",
                    ),
                    after: String(
                      parseEditorialSource(state.source).document.getIn(
                        field.path,
                      ) ?? "",
                    ),
                  },
                ];
              } catch {
                return [];
              }
            })}
          />
          {state.source !== reviewSource && (
            <Text role="alert">
              The draft changed after this review opened. Open Review changes
              again before approving.
            </Text>
          )}
          <HStack gap={2} wrap="wrap">
            <Button
              label="Approve and publish"
              variant="primary"
              size="sm"
              isDisabled={
                localPreview ||
                snapshot.publishing !== "ready" ||
                state.source !== reviewSource ||
                state.source === snapshot.base.source ||
                !valid ||
                Boolean(snapshot.draft?.discardedAt) ||
                Boolean(
                  publication &&
                  !["live", "cancelled"].includes(publication.phase),
                )
              }
              isLoading={publishing}
              tooltip={
                localPreview
                  ? "Publishing is available in the production editor"
                  : snapshot.publishing === "ready"
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
                    current.source !== reviewSource ||
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
                  setPublicationStale(false);
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
            {localPreview && (
              <Button
                label="Open production editor"
                size="sm"
                icon={<ArrowSquareOutIcon size={18} />}
                href={`https://admin.anipotts.com/content/${record.kind === "page" ? (record.id === "home" ? "home" : `${record.id}Page`) : record.kind === "work" ? "projects" : "writing"}/${record.id}`}
                target="_blank"
                rel="noopener noreferrer"
              />
            )}
          </HStack>
        </VStack>
      )}
      {tab === "source" && (
        <VStack gap={3}>
          <Text color="secondary">
            The complete Markdown file. Formatting uses standard Markdown;
            underlines use &lt;u&gt;. Use Document actions to import or download
            a draft. Imports replace this private draft and retain revision
            history.
          </Text>
        </VStack>
      )}
      <input
        ref={importInput}
        type="file"
        hidden
        accept=".md,text/markdown,text/plain"
        aria-label="Import draft"
        disabled={Boolean(snapshot.draft?.discardedAt)}
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          if (file.size > 512 * 1024) {
            setError("Choose a Markdown file smaller than 512 KB.");
            return;
          }
          try {
            const source = await file.text();
            if (!validateEditorialSource(record, source).success)
              throw new Error();
            editor.current!.edit(source);
            setTab("edit");
            setError("");
          } catch {
            setError(
              "That file does not match this record. Your draft was kept.",
            );
          }
        }}
      />
      <SourceEditor
        source={state.source}
        onChange={(source) => editor.current!.edit(source)}
        hidden={tab !== "source"}
        readOnly={Boolean(snapshot.draft?.discardedAt)}
      />
      {!valid && (
        <Text role="alert">
          source needs correction before preview or publishing.
        </Text>
      )}
      {tab === "history" && (
        <VStack gap={2}>
          <Text color="secondary">
            Restore an earlier version as a new draft. Existing revisions stay
            available.
          </Text>
          {historyLoading && <Text role="status">Loading revisions…</Text>}
          {snapshot.history.map((revision) => (
            <HStack
              key={revision.revision}
              gap={3}
              wrap="wrap"
              vAlign="center"
              className="editor-history-row"
            >
              <VStack gap={1}>
                <Text weight="semibold">Revision {revision.revision}</Text>
                <Text color="secondary" type="supporting">
                  {new Date(revision.updatedAt).toLocaleString()}
                </Text>
              </VStack>
              <Button
                label="Restore"
                aria-label={`Restore revision ${revision.revision}`}
                variant="ghost"
                size="sm"
                isDisabled={Boolean(snapshot.draft?.discardedAt)}
                onClick={() => {
                  editor.current!.edit(revision.source);
                  setTab("edit");
                }}
              />
            </HStack>
          ))}
          {!historyLoading && snapshot.history.length === 0 && (
            <Text>No saved revisions yet.</Text>
          )}
        </VStack>
      )}
    </VStack>
  );
}

function SourceEditor({
  source,
  onChange,
  hidden,
  readOnly = false,
}: {
  source: string;
  onChange: (source: string) => void;
  hidden: boolean;
  readOnly?: boolean;
}) {
  const host = useRef<HTMLElement | null>(null);
  const view = useRef<EditorView | null>(null);
  const readOnlyMode = useRef(new Compartment());
  const change = useRef(onChange);
  change.current = onChange;
  useEffect(() => {
    const instance = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: source,
        extensions: [
          markdown(),
          readOnlyMode.current.of(EditorState.readOnly.of(readOnly)),
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
    view.current?.dispatch({
      effects: readOnlyMode.current.reconfigure(
        EditorState.readOnly.of(readOnly),
      ),
    });
  }, [readOnly]);
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
