/**
 * Shared types for the state worker. Mirrored on clients so admin and other
 * frontends can deserialize WebSocket payloads with type safety.
 */

/** POST /api/links answers 400 for any other source. */
export const LINK_SOURCES = ["shortcut", "admin", "manual"] as const;
export type LinkSource = (typeof LINK_SOURCES)[number];

export type Link = {
  id: string;
  url: string;
  title?: string;
  tag?: string;
  note?: string;
  source?: LinkSource;
  savedAt: string;
};

/** LinkVault GET /summary: a count and one time, never a url or title. */
export type LinkVaultSummary = {
  held: number;
  last_saved_at: string | null;
};

export type LinkVaultEvent =
  | { type: "snapshot"; links: Link[] }
  | { type: "link.added"; link: Link }
  | { type: "link.removed"; id: string };

export type Commit = {
  sha: string;
  repo: string;
  subject: string;
  author: string;
  ts: string;
  branch?: string;
  parentCount?: number;
};

/** CodeStats GET /summary: a count and one time, never a sha or subject. */
export type CodeStatsSummary = {
  held: number;
  last_received_at: string | null;
};

export type CodeStatsEvent =
  | { type: "snapshot"; commits: Commit[] }
  | { type: "commit.added"; commit: Commit };

export type Bindings = {
  LINK_VAULT: DurableObjectNamespace;
  CODE_STATS: DurableObjectNamespace;
  COMMAND_RELAY: DurableObjectNamespace;
  ALLOWED_ORIGINS: string;
  STATE_PUBLISH_KEY?: string;
  CONTROL_PLANE_DEVICE_PUBLIC_JWK?: string;
};
