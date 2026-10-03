import { Markdown } from "@openai/apps-sdk-ui/components/Markdown";
import { Badge } from "@openai/apps-sdk-ui/components/Badge";

/** Raw HTML is deliberately not rendered. SDK URL transform rejects unsafe URLs. */
export function WorkspaceMarkdown({ children }: { children: string }) {
  return (
    <Markdown skipHtml copyableCodeBlocks>
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
      ? "danger"
      : state === "conflict" || state === "stale"
        ? "warning"
        : state === "saved"
          ? "success"
          : "secondary";
  return (
    <span
      role={state === "failed" || state === "conflict" ? "alert" : "status"}
    >
      <Badge color={color} size="md">
        {label}
      </Badge>
    </span>
  );
}
