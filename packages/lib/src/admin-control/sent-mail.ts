import { ADMIN_EVENT_SCHEMA_VERSION } from "./types";
import type {
  AdminAttentionKind,
  AdminEventEnvelope,
  AdminEventPrivacy,
  AdminInboxItem,
  AdminSentMailAttachmentPresence,
  AdminSentMailMetadata,
} from "./types";

export type SentMailFollowUpKind = "reply" | "payment" | "proof";

export type SentMailFollowUp = {
  id: string;
  dedupe_key: string;
  kind: SentMailFollowUpKind;
  title: string;
  summary: string;
  owner: string;
  domain?: string;
  entity_ref?: string | null;
  attention_kind?: AdminAttentionKind | string;
  urgency?: AdminInboxItem["urgency"];
  status?: string;
  href?: string | null;
  expires_at?: string | null;
  last_seen_at?: string | null;
};

export type BuildSentMailEventOptions = {
  actor?: string;
  created_by?: string;
  dedupe_key?: string;
  event_id?: string;
  privacy?: AdminEventPrivacy;
};

export type BuildSentMailAwarenessOptions = BuildSentMailEventOptions & {
  completed: boolean;
  follow_up?: SentMailFollowUp | null;
};

export function gmailSentDedupeKey(ref: string): string {
  return `gmail:sent:${ref}`;
}

export function buildSentMailMetadata(input: {
  account: string;
  sent_ref: string;
  subject: string;
  sent_at: string;
  has_attachments?: AdminSentMailAttachmentPresence;
  href?: string | null;
}): AdminSentMailMetadata {
  return {
    account: input.account,
    sent_ref: input.sent_ref,
    subject: input.subject,
    sent_at: input.sent_at,
    has_attachments: input.has_attachments ?? "unknown",
    href: input.href ?? null,
  };
}

export function buildSentMailEvent(
  metadata: AdminSentMailMetadata,
  options: BuildSentMailEventOptions = {},
): AdminEventEnvelope {
  const attachmentText =
    metadata.has_attachments === "unknown"
      ? "attachments unknown"
      : metadata.has_attachments
        ? "attachments present"
        : "no attachments";

  return {
    schema_version: ADMIN_EVENT_SCHEMA_VERSION,
    event_id: options.event_id ?? `evt-gmail-sent-${metadata.sent_ref}`,
    dedupe_key: options.dedupe_key ?? gmailSentDedupeKey(metadata.sent_ref),
    source: "gmail",
    provider: "gmail",
    account: metadata.account,
    actor: options.actor ?? "ani",
    kind: "outbound.sent",
    ts: metadata.sent_at,
    privacy: options.privacy ?? "private",
    title: `sent ${metadata.subject}`,
    summary: `sent mail recorded as metadata-only proof; ${attachmentText}; raw gmail identifiers and preview text omitted.`,
    href: metadata.href,
    payload_ref: null,
    created_by: options.created_by ?? "admin-sent-mail-adapter",
  };
}

export function buildSentMailFollowUpCard(
  metadata: AdminSentMailMetadata,
  event: AdminEventEnvelope,
  followUp: SentMailFollowUp,
): AdminInboxItem {
  return {
    item_id: followUp.id,
    dedupe_key: followUp.dedupe_key,
    event_refs: [event.event_id],
    domain: followUp.domain ?? "mail",
    entity_ref: followUp.entity_ref ?? `gmail:sent:${metadata.sent_ref}`,
    attention_kind:
      followUp.attention_kind ??
      (followUp.kind === "payment" ? "verification" : "review"),
    source: "gmail",
    account: metadata.account,
    title: followUp.title,
    summary: followUp.summary,
    href: followUp.href ?? metadata.href,
    status: followUp.status ?? `${followUp.kind}_followup`,
    urgency: followUp.urgency ?? "normal",
    owner: followUp.owner,
    action_kind: followUp.kind === "payment" ? "verify" : "open",
    expires_at: followUp.expires_at ?? null,
    last_seen_at: followUp.last_seen_at ?? null,
  };
}

export function buildSentMailAwareness(
  metadata: AdminSentMailMetadata,
  options: BuildSentMailAwarenessOptions,
): { event: AdminEventEnvelope; inbox_item: AdminInboxItem | null } {
  const event = buildSentMailEvent(metadata, options);
  return {
    event,
    inbox_item:
      options.completed && !options.follow_up
        ? null
        : options.follow_up
          ? buildSentMailFollowUpCard(metadata, event, options.follow_up)
          : null,
  };
}
