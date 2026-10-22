import { Markdown } from "@astryxdesign/core/Markdown";
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { Badge } from "@astryxdesign/core/Badge";

/** Core renders Markdown nodes as React elements and sanitizes destinations.
 * Math stays inert text; executable HTML and KaTeX are not enabled. */
function CopyableCode({ code, language }: { code: string; language?: string }) {
  return (
    <CodeBlock
      code={code}
      language={language}
      hasCopyButton
      container="section"
    />
  );
}
const markdownComponents = { code: CopyableCode };
export function WorkspaceMarkdown({ children }: { children: string }) {
  return (
    <Markdown autolink="gfm" components={markdownComponents}>
      {children}
    </Markdown>
  );
}
export type PersistenceState =
  | "idle"
  | "saving"
  | "saved"
  | "reconnecting"
  | "stale"
  | "failed"
  | "conflict";
/** Caller owns transport evidence. Only pass saved after current-revision acknowledgement. */
export function PersistenceStatus({
  state,
  destination,
  message,
}: {
  state: PersistenceState;
  destination?: string;
  message?: string;
}) {
  const label =
    message ??
    {
      idle: "Not saved",
      saving: "Saving",
      saved: destination ? `Saved to ${destination}` : "Saved",
      reconnecting: "Reconnecting",
      stale: "Out of date",
      failed: "Save failed",
      conflict: "Conflicting changes",
    }[state];
  const color =
    state === "failed"
      ? "error"
      : state === "conflict" || state === "stale"
        ? "warning"
        : state === "saved"
          ? "success"
          : "neutral";
  return (
    <span
      role={state === "failed" || state === "conflict" ? "alert" : "status"}
    >
      <Badge variant={color} label={label} />
    </span>
  );
}
