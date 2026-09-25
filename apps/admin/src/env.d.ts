/// <reference types="astro/client" />

type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  run(): Promise<{ results?: unknown[]; success?: boolean; meta?: unknown }>;
  all<T = unknown>(): Promise<{ results?: T[] }>;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
  batch(
    statements: D1PreparedStatement[],
  ): Promise<Array<{ results?: unknown[]; success?: boolean; meta?: unknown }>>;
};

/** Worker bindings and vars; read them through src/lib/runtime-env.ts. */
type AdminEnv = {
  DB: D1Database;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_POLICY_AUD: string;
  /** Private reader issuance stays off unless exactly "true". */
  PRIVATE_READER_ENABLED?: string;
  /** Observability ops:read issuance and reads; off unless exactly "true". */
  PRIVATE_READER_OPS_ENABLED?: string;
  /** Data Health health:read issuance and reads; off unless exactly "true". */
  PRIVATE_READER_HEALTH_ENABLED?: string;
  /** Data Knowledge entity reads; off unless exactly "true". */
  PRIVATE_READER_KNOWLEDGE_ENABLED?: string;
  /** Dedicated ES256 private JWK. Not installed; absent means 503. */
  PRIVATE_READER_SIGNING_KEY?: string;
  /** The ap-mini reader canary; off unless exactly "true". */
  PRIVATE_READER_CANARY_ENABLED?: string;
  /** AUD of the Access application scoped to the canary path. */
  PRIVATE_READER_CANARY_ACCESS_AUD?: string;
  /** Client id of the one Access service token the canary admits. */
  PRIVATE_READER_CANARY_CLIENT_ID?: string;
};

/**
 * True only in a dev server or build started with ADMIN_LOCAL_OWNER=1. Vite
 * replaces it with a literal; Astro's env handling never sees it, so it cannot
 * become a runtime process.env or Worker binding read.
 */
declare const __LOCAL_OWNER_BUILD__: boolean;

declare namespace App {
  interface Locals {
    adminPrincipal?: import("./lib/admin-auth").AdminPrincipal;
    /** Set by middleware after it verifies the Access assertion. */
    accessOwner?: import("./lib/access-identity").AccessOwner;
    /** Durations and counts only; see lib/server-timing.ts. */
    serverTiming?: import("./lib/server-timing").ServerTiming;
  }
}

declare module "cloudflare:workers" {
  /** The Worker's bindings; src/lib/runtime-env.ts narrows them to AdminEnv. */
  export const env: unknown;
}
