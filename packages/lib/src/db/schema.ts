/**
 * Drizzle ORM schema for anipotts-db (Cloudflare D1 / SQLite).
 *
 * THE canonical schema source. Defines all regular tables that exist in
 * the live database, including rate_limits (created by SQL migration, not
 * auto-created at runtime).
 *
 * Out-of-ORM objects (Drizzle cannot express them) live in the companion
 * migration drizzle/migrations/0003_reconcile.sql:
 *   - thoughts_fts (FTS5 virtual table)
 *   - thoughts_fts_insert / thoughts_fts_delete / thoughts_fts_update triggers
 * Companion migrations are applied manually via `wrangler d1 execute`,
 * never auto-run. See drizzle/README.md.
 */

import {
  sqliteTable,
  text,
  integer,
  index,
  primaryKey,
  real,
} from "drizzle-orm/sqlite-core";

// ---------------------------------------------------------------------------
// 1. thoughts (blog posts / content)
// ---------------------------------------------------------------------------

export const thoughts = sqliteTable(
  "thoughts",
  {
    id: text("id").primaryKey(),
    slug: text("slug").unique().notNull(),
    title: text("title").notNull(),
    summary: text("summary"),
    content: text("content"),
    tags: text("tags").default("[]"),
    created_at: text("created_at"),
    updated_at: text("updated_at"),
    views: integer("views").default(0),
    published: integer("published", { mode: "boolean" }).default(false),
    section: text("section"),

    // content hub fields
    content_type: text("content_type").default("article"),
    series_type: text("series_type"),
    status: text("status").default("draft"),
    artifact_url: text("artifact_url"),
    artifact_type: text("artifact_type"),
    platforms_targeted: text("platforms_targeted").default("[]"),
    platforms_posted: text("platforms_posted").default("[]"),
    voice_mode: text("voice_mode"),
    project: text("project"),
    published_at: text("published_at"),

    // scheduling
    scheduled_at: text("scheduled_at"),

    // distribution IDs (migration 003)
    buttondown_email_id: text("buttondown_email_id"),
    typefully_x_draft_id: text("typefully_x_draft_id"),
    typefully_linkedin_draft_id: text("typefully_linkedin_draft_id"),
  },
  (table) => [
    index("idx_thoughts_slug").on(table.slug),
    index("idx_thoughts_published").on(table.published, table.created_at),
    index("idx_thoughts_status").on(table.status),
    index("idx_thoughts_series_type").on(table.series_type),
    index("idx_thoughts_content_type").on(table.content_type),
    index("idx_thoughts_project").on(table.project),
  ],
);

// ---------------------------------------------------------------------------
// 2. atoms (platform-specific micro-content)
// ---------------------------------------------------------------------------

export const atoms = sqliteTable(
  "atoms",
  {
    id: text("id").primaryKey(),
    content_id: text("content_id").references(() => thoughts.id, {
      onDelete: "cascade",
    }),
    platform: text("platform").notNull(),
    atom_content: text("atom_content").notNull(),
    voice_mode: text("voice_mode"),
    hashtags: text("hashtags").default("[]"),
    status: text("status").default("draft"),
    typefully_draft_id: text("typefully_draft_id"),
    scheduled_at: text("scheduled_at"),
    posted_at: text("posted_at"),
    external_url: text("external_url"),
    created_at: text("created_at"),
    updated_at: text("updated_at"),
  },
  (table) => [
    index("idx_atoms_content_id").on(table.content_id),
    index("idx_atoms_platform").on(table.platform),
    index("idx_atoms_status").on(table.status),
  ],
);

// ---------------------------------------------------------------------------
// 3. projects (portfolio items)
// ---------------------------------------------------------------------------

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    slug: text("slug").unique().notNull(),
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    description: text("description"),
    year: text("year"),
    category: text("category"),
    role: text("role"),
    duration: text("duration"),
    tags: text("tags").default("[]"),
    status: text("status"),
    featured: integer("featured", { mode: "boolean" }).default(false),
    icon: text("icon"),
    image_url: text("image_url"),
    thumbnail_url: text("thumbnail_url"),
    link_live: text("link_live"),
    link_repo: text("link_repo"),
    link_page: text("link_page"),
    sort_order: integer("sort_order").default(0),
    visible: integer("visible", { mode: "boolean" }).default(true),
    created_at: text("created_at"),
    updated_at: text("updated_at"),
  },
  (table) => [
    index("idx_projects_slug").on(table.slug),
    index("idx_projects_visible").on(table.visible, table.sort_order),
  ],
);

// ---------------------------------------------------------------------------
// 4. social_links
// ---------------------------------------------------------------------------

export const socialLinks = sqliteTable("social_links", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  icon: text("icon").notNull(),
  description: text("description"),
  sort_order: integer("sort_order").default(0),
  visible: integer("visible", { mode: "boolean" }).default(true),
  created_at: text("created_at"),
  updated_at: text("updated_at"),
});

// ---------------------------------------------------------------------------
// 5. page_content (CMS pages)
// ---------------------------------------------------------------------------

export const pageContent = sqliteTable(
  "page_content",
  {
    id: text("id").primaryKey(),
    page_key: text("page_key").notNull(),
    content: text("content").notNull(),
    version: integer("version").default(1),
    published: integer("published", { mode: "boolean" }).default(false),
    updated_at: text("updated_at"),
    updated_by: text("updated_by"),
    created_at: text("created_at"),
    version_history: text("version_history").default("[]"),
  },
  (table) => [
    index("idx_page_content_key").on(table.page_key, table.published),
  ],
);

// ---------------------------------------------------------------------------
// 6. site_settings (key-value config)
// ---------------------------------------------------------------------------

export const siteSettings = sqliteTable("site_settings", {
  id: text("id").primaryKey(),
  key: text("key").unique().notNull(),
  value: text("value").notNull(),
  created_at: text("created_at"),
  updated_at: text("updated_at"),
});

// ---------------------------------------------------------------------------
// 7. github_events (webhook storage)
// ---------------------------------------------------------------------------

export const githubEvents = sqliteTable(
  "github_events",
  {
    id: text("id").primaryKey(),
    event_type: text("event_type").notNull(),
    event_action: text("event_action"),
    repo: text("repo").notNull(),
    repo_url: text("repo_url"),
    payload: text("payload").notNull().default("{}"),
    github_delivery_id: text("github_delivery_id").unique(),
    github_timestamp: text("github_timestamp").notNull(),
    created_at: text("created_at"),
  },
  (table) => [
    index("idx_github_events_time").on(table.github_timestamp),
    index("idx_github_events_type").on(
      table.event_type,
      table.github_timestamp,
    ),
  ],
);

// ---------------------------------------------------------------------------
// 8. contact_submissions
// ---------------------------------------------------------------------------

export const contactSubmissions = sqliteTable("contact_submissions", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  message: text("message").notNull(),
  status: text("status").default("new"),
  created_at: text("created_at"),
});

// ---------------------------------------------------------------------------
// 9. content_config (YAML configs as JSON)
// ---------------------------------------------------------------------------

export const contentConfig = sqliteTable("content_config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updated_at: text("updated_at"),
});

// ---------------------------------------------------------------------------
// 10. content_schedule (editorial calendar)
// ---------------------------------------------------------------------------

export const contentSchedule = sqliteTable(
  "content_schedule",
  {
    id: text("id").primaryKey(),
    content_id: text("content_id").references(() => thoughts.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    series_type: text("series_type"),
    scheduled_date: text("scheduled_date").notNull(),
    scheduled_time: text("scheduled_time"),
    platform: text("platform"),
    status: text("status").default("planned"),
    notes: text("notes"),
    created_at: text("created_at"),
    updated_at: text("updated_at"),
  },
  (table) => [
    index("idx_content_schedule_date").on(table.scheduled_date),
    index("idx_content_schedule_status").on(table.status),
  ],
);

// ---------------------------------------------------------------------------
// 11. update_alerts (AI update tracking)
// ---------------------------------------------------------------------------

export const updateAlerts = sqliteTable(
  "update_alerts",
  {
    id: text("id").primaryKey(),
    source: text("source").notNull(),
    title: text("title").notNull(),
    url: text("url"),
    detected_at: text("detected_at"),
    content_opportunity_score: text("content_opportunity_score").default(
      "medium",
    ),
    content_id: text("content_id").references(() => thoughts.id, {
      onDelete: "set null",
    }),
    status: text("status").default("new"),
    raw_data: text("raw_data"),
    created_at: text("created_at"),
  },
  (table) => [
    index("idx_update_alerts_status").on(table.status, table.detected_at),
    index("idx_update_alerts_source").on(table.source),
  ],
);

// ---------------------------------------------------------------------------
// 12. metrics_cache (GitHub/WakaTime stats)
// ---------------------------------------------------------------------------

export const metricsCache = sqliteTable("metrics_cache", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updated_at: text("updated_at"),
});

// ---------------------------------------------------------------------------
// 13. status_checks (service monitoring)
// ---------------------------------------------------------------------------

export const statusChecks = sqliteTable(
  "status_checks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    service_url: text("service_url").notNull(),
    service_name: text("service_name").notNull(),
    status_code: integer("status_code"),
    response_time_ms: integer("response_time_ms").notNull(),
    is_up: integer("is_up", { mode: "boolean" }).notNull(),
    checked_at: text("checked_at").notNull(),
    service_id: text("service_id"),
  },
  (table) => [
    index("idx_status_checks_lookup").on(table.service_url, table.checked_at),
    index("idx_status_checks_service_id").on(
      table.service_id,
      table.checked_at,
    ),
  ],
);

// ---------------------------------------------------------------------------
// 14. favorite_numbers (interactive feature)
// ---------------------------------------------------------------------------

export const favoriteNumbers = sqliteTable("favorite_numbers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  number: integer("number").notNull(),
  submitted_at: text("submitted_at"),
  user_ip: text("user_ip"),
});

// ---------------------------------------------------------------------------
// 15. business_data (YAML data synced from Mac Mini)
// ---------------------------------------------------------------------------

export const businessData = sqliteTable("business_data", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  source_file: text("source_file"),
  updated_at: text("updated_at"),
});

// ---------------------------------------------------------------------------
// 16. analytics_events (granular analytics from all platforms)
// ---------------------------------------------------------------------------

export const analyticsEvents = sqliteTable(
  "analytics_events",
  {
    id: text("id").primaryKey(),
    source: text("source").notNull(),
    metric: text("metric").notNull(),
    value: real("value").notNull(),
    dimensions: text("dimensions").default("{}"),
    period_start: text("period_start").notNull(),
    period_end: text("period_end").notNull(),
    fetched_at: text("fetched_at").notNull(),
  },
  (table) => [
    index("idx_analytics_source").on(
      table.source,
      table.metric,
      table.period_start,
    ),
    index("idx_analytics_period").on(table.period_start, table.period_end),
  ],
);

// ---------------------------------------------------------------------------
// 17. ops_snapshots (Mac Mini health data)
// ---------------------------------------------------------------------------

export const opsSnapshots = sqliteTable(
  "ops_snapshots",
  {
    key: text("key").notNull(),
    category: text("category").notNull(),
    value: text("value").notNull(),
    updated_at: text("updated_at"),
  },
  (table) => [
    primaryKey({ columns: [table.key, table.category] }),
    index("idx_ops_category").on(table.category),
  ],
);

// ---------------------------------------------------------------------------
// 18. code_health (repo status from Mac Mini)
// ---------------------------------------------------------------------------

export const codeHealth = sqliteTable("code_health", {
  repo: text("repo").primaryKey(),
  dirty: integer("dirty", { mode: "boolean" }).default(false),
  unpushed_count: integer("unpushed_count").default(0),
  stale_branches: integer("stale_branches").default(0),
  last_commit_at: text("last_commit_at"),
  last_commit_msg: text("last_commit_msg"),
  deployment_status: text("deployment_status"),
  updated_at: text("updated_at"),
});

// ---------------------------------------------------------------------------
// 19. daily_rollups (historical aggregates from Mini API, hourly push)
// ---------------------------------------------------------------------------

export const dailyRollups = sqliteTable(
  "daily_rollups",
  {
    id: text("id").primaryKey(),
    date: text("date").notNull(),
    hour: integer("hour").notNull(),
    metric: text("metric").notNull(),
    value: real("value").notNull(),
    created_at: text("created_at"),
  },
  (table) => [index("idx_rollups_date").on(table.date, table.metric)],
);

// ---------------------------------------------------------------------------
// 20. email_queue (failed emails for retry)
// ---------------------------------------------------------------------------

export const emailQueue = sqliteTable(
  "email_queue",
  {
    id: text("id").primaryKey(),
    subject: text("subject").notNull(),
    html: text("html").notNull(),
    to_address: text("to_address").notNull(),
    status: text("status").default("pending"),
    attempts: integer("attempts").default(0),
    last_error: text("last_error"),
    created_at: text("created_at"),
    updated_at: text("updated_at"),
  },
  (table) => [index("idx_email_queue_status").on(table.status)],
);

// ---------------------------------------------------------------------------
// 21. service_registry (declarative state for platform-managed services)
// ---------------------------------------------------------------------------
// First table authored via @anipotts/services-platform. Tracks one row per
// service (mini-api, reel, etc.). status_checks.service_id joins here.

export const serviceRegistry = sqliteTable(
  "service_registry",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull().unique(),
    hostname: text("hostname").notNull(),
    visibility: text("visibility").notNull(),
    owner: text("owner").notNull(),
    port: integer("port"),
    manifest_sha: text("manifest_sha"),
    manifest_path: text("manifest_path"),
    deployed_at: text("deployed_at"),
    retired_at: text("retired_at"),
    created_at: text("created_at"),
    updated_at: text("updated_at"),
  },
  (table) => [
    index("idx_service_registry_name").on(table.name),
    index("idx_service_registry_active").on(table.retired_at),
  ],
);

// ---------------------------------------------------------------------------
// 22. brands_emails (Gmail brand-outreach log from email-labeler Apps Script)
// ---------------------------------------------------------------------------
// Replaces Content/logs/brands.yaml. Apps Script POSTs to the ingest worker
// (category "brands_email") on every Brands-labeled email. Dedup on Gmail
// message_id; backfilled rows use synthetic IDs prefixed "bf:".

export const brandsEmails = sqliteTable(
  "brands_emails",
  {
    message_id: text("message_id").primaryKey(), // Gmail ID or "bf:<hash>" for backfill
    thread_id: text("thread_id").notNull(),
    received_at: text("received_at").notNull(), // ISO-8601 from Gmail
    from_addr: text("from_addr").notNull(),
    subject: text("subject").notNull(),
    label: text("label").notNull(), // "Brands", "Brands/Paid", etc.
    deal_slug: text("deal_slug"), // optional link to Content/deals/<slug>/
    status: text("status").default("inbox"), // inbox | responding | won | lost | ghosted
    notes: text("notes"),
    ingested_at: text("ingested_at").notNull(), // auto-set by ingest worker
  },
  (table) => [
    index("idx_brands_emails_received_at").on(table.received_at),
    index("idx_brands_emails_from_addr").on(table.from_addr),
    index("idx_brands_emails_status").on(table.status),
  ],
);

// ---------------------------------------------------------------------------
// 23. rate_limits (sliding-window rate limiting for newsletter subscribe)
// ---------------------------------------------------------------------------
// Created by SQL migration (supabase-era baseline), NOT auto-created at
// runtime. The runtime keeps using raw db.prepare for the sliding window;
// this definition exists so the table is visible in the typed schema.

export const rateLimits = sqliteTable(
  "rate_limits",
  {
    key: text("key").notNull(),
    ts: integer("ts").notNull(),
  },
  (table) => [index("idx_rate_limits_key_ts").on(table.key, table.ts)],
);

// ---------------------------------------------------------------------------
// 24. first-party newsletter system
// ---------------------------------------------------------------------------

export const newsletterSubscribers = sqliteTable(
  "newsletter_subscribers",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull().unique(),
    status: text("status").notNull().default("pending"),
    source: text("source").notNull().default("website"),
    tags: text("tags").notNull().default("[]"),
    metadata: text("metadata").notNull().default("{}"),
    subscribed_at: text("subscribed_at"),
    confirmed_at: text("confirmed_at"),
    unsubscribed_at: text("unsubscribed_at"),
    suppressed_at: text("suppressed_at"),
    suppression_reason: text("suppression_reason"),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_newsletter_subscribers_status").on(table.status),
    index("idx_newsletter_subscribers_email").on(table.email),
  ],
);

export const newsletterPreferences = sqliteTable(
  "newsletter_preferences",
  {
    subscriber_id: text("subscriber_id")
      .notNull()
      .references(() => newsletterSubscribers.id),
    key: text("key").notNull(),
    value: text("value").notNull(),
    updated_at: text("updated_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.subscriber_id, table.key] })],
);

export const newsletterIssues = sqliteTable(
  "newsletter_issues",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    subject: text("subject").notNull(),
    summary: text("summary"),
    html: text("html"),
    text: text("text"),
    status: text("status").notNull().default("draft"),
    scheduled_at: text("scheduled_at"),
    published_at: text("published_at"),
    source_thought_id: text("source_thought_id"),
    buttondown_id: text("buttondown_id"),
    metadata: text("metadata").notNull().default("{}"),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_newsletter_issues_status").on(table.status, table.scheduled_at),
  ],
);

export const newsletterDeliveries = sqliteTable(
  "newsletter_deliveries",
  {
    id: text("id").primaryKey(),
    issue_id: text("issue_id").references(() => newsletterIssues.id),
    subscriber_id: text("subscriber_id")
      .notNull()
      .references(() => newsletterSubscribers.id),
    email: text("email").notNull(),
    kind: text("kind").notNull(),
    status: text("status").notNull().default("queued"),
    resend_email_id: text("resend_email_id"),
    attempt_count: integer("attempt_count").notNull().default(0),
    last_error: text("last_error"),
    queued_at: text("queued_at").notNull(),
    sent_at: text("sent_at"),
    delivered_at: text("delivered_at"),
    opened_at: text("opened_at"),
    clicked_at: text("clicked_at"),
    bounced_at: text("bounced_at"),
    complained_at: text("complained_at"),
    unsubscribed_at: text("unsubscribed_at"),
    updated_at: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_newsletter_deliveries_issue_status").on(
      table.issue_id,
      table.status,
    ),
    index("idx_newsletter_deliveries_subscriber").on(
      table.subscriber_id,
      table.updated_at,
    ),
    index("idx_newsletter_deliveries_resend_email").on(table.resend_email_id),
  ],
);

export const newsletterEvents = sqliteTable(
  "newsletter_events",
  {
    id: text("id").primaryKey(),
    subscriber_id: text("subscriber_id").references(
      () => newsletterSubscribers.id,
    ),
    issue_id: text("issue_id").references(() => newsletterIssues.id),
    delivery_id: text("delivery_id").references(() => newsletterDeliveries.id),
    email: text("email"),
    type: text("type").notNull(),
    provider: text("provider"),
    provider_event_id: text("provider_event_id"),
    provider_email_id: text("provider_email_id"),
    payload: text("payload").notNull().default("{}"),
    created_at: text("created_at").notNull(),
  },
  (table) => [
    index("idx_newsletter_events_type_created").on(
      table.type,
      table.created_at,
    ),
  ],
);

export const newsletterTokens = sqliteTable(
  "newsletter_tokens",
  {
    id: text("id").primaryKey(),
    subscriber_id: text("subscriber_id")
      .notNull()
      .references(() => newsletterSubscribers.id),
    email: text("email").notNull(),
    purpose: text("purpose").notNull(),
    token_hash: text("token_hash").notNull().unique(),
    expires_at: text("expires_at").notNull(),
    used_at: text("used_at"),
    created_at: text("created_at").notNull(),
  },
  (table) => [
    index("idx_newsletter_tokens_lookup").on(
      table.purpose,
      table.token_hash,
      table.expires_at,
    ),
  ],
);

export const newsletterSuppressions = sqliteTable(
  "newsletter_suppressions",
  {
    email: text("email").primaryKey(),
    subscriber_id: text("subscriber_id").references(
      () => newsletterSubscribers.id,
    ),
    reason: text("reason").notNull(),
    provider: text("provider"),
    provider_event_id: text("provider_event_id"),
    created_at: text("created_at").notNull(),
    metadata: text("metadata").notNull().default("{}"),
  },
  (table) => [
    index("idx_newsletter_suppressions_reason").on(
      table.reason,
      table.created_at,
    ),
  ],
);

// ---------------------------------------------------------------------------
// 25. admin passkey auth staging
// ---------------------------------------------------------------------------

export const adminPasskeyCredentials = sqliteTable(
  "admin_passkey_credentials",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id").notNull(),
    credential_id: text("credential_id").notNull().unique(),
    public_key: text("public_key").notNull(),
    counter: integer("counter").notNull().default(0),
    transports: text("transports").notNull().default("[]"),
    device_type: text("device_type"),
    backed_up: integer("backed_up", { mode: "boolean" })
      .notNull()
      .default(false),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull(),
    last_used_at: text("last_used_at"),
    revoked_at: text("revoked_at"),
  },
  (table) => [
    index("idx_admin_passkey_credentials_user_active").on(
      table.user_id,
      table.revoked_at,
    ),
    index("idx_admin_passkey_credentials_credential").on(table.credential_id),
  ],
);

export const adminPasskeyChallenges = sqliteTable(
  "admin_passkey_challenges",
  {
    id: text("id").primaryKey(),
    purpose: text("purpose").notNull(),
    challenge: text("challenge").notNull().unique(),
    credential_id: text("credential_id"),
    created_at: text("created_at").notNull(),
    expires_at: text("expires_at").notNull(),
    used_at: text("used_at"),
  },
  (table) => [
    index("idx_admin_passkey_challenges_lookup").on(
      table.purpose,
      table.used_at,
      table.expires_at,
    ),
    index("idx_admin_passkey_challenges_challenge").on(table.challenge),
  ],
);

export const adminPasskeySessions = sqliteTable(
  "admin_passkey_sessions",
  {
    id: text("id").primaryKey(),
    token_hash: text("token_hash").notNull().unique(),
    credential_id: text("credential_id").notNull(),
    created_at: text("created_at").notNull(),
    expires_at: text("expires_at").notNull(),
    last_seen_at: text("last_seen_at"),
    revoked_at: text("revoked_at"),
    updated_at: text("updated_at"),
  },
  (table) => [
    index("idx_admin_passkey_sessions_lookup").on(
      table.token_hash,
      table.revoked_at,
      table.expires_at,
    ),
    index("idx_admin_passkey_sessions_credential").on(
      table.credential_id,
      table.revoked_at,
    ),
  ],
);

export const adminPasskeyAudit = sqliteTable(
  "admin_passkey_audit",
  {
    id: text("id").primaryKey(),
    event_type: text("event_type").notNull(),
    credential_id: text("credential_id"),
    summary: text("summary").notNull(),
    created_at: text("created_at").notNull(),
  },
  (table) => [
    index("idx_admin_passkey_audit_type_created").on(
      table.event_type,
      table.created_at,
    ),
  ],
);

// ---------------------------------------------------------------------------
// 26. content editor operation staging
// ---------------------------------------------------------------------------

export const contentRecords = sqliteTable(
  "content_records",
  {
    id: text("id").primaryKey(),
    content_key: text("content_key").notNull().unique(),
    surface: text("surface").notNull(),
    route: text("route").notNull(),
    field_path: text("field_path").notNull(),
    value: text("value").notNull(),
    value_format: text("value_format").notNull().default("text"),
    status: text("status").notNull().default("draft"),
    version: integer("version").notNull().default(1),
    source_ref: text("source_ref").notNull(),
    proof_ids: text("proof_ids").notNull().default("[]"),
    metadata: text("metadata").notNull().default("{}"),
    published_at: text("published_at"),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull(),
    updated_by: text("updated_by"),
  },
  (table) => [
    index("idx_content_records_surface_route").on(table.surface, table.route),
    index("idx_content_records_status").on(table.status, table.updated_at),
  ],
);

export const contentDraftOperations = sqliteTable(
  "content_draft_operations",
  {
    operation_id: text("operation_id").primaryKey(),
    kind: text("kind").notNull().default("content_draft"),
    surface: text("surface").notNull(),
    route: text("route").notNull(),
    source_ref: text("source_ref").notNull(),
    field_path: text("field_path").notNull(),
    current_value_ref: text("current_value_ref").notNull(),
    proposed_value: text("proposed_value").notNull(),
    status: text("status").notNull().default("draft"),
    risk_level: text("risk_level").notNull().default("low"),
    authority_state: text("authority_state").notNull(),
    required_approval_ids: text("required_approval_ids")
      .notNull()
      .default("[]"),
    allowed_actions: text("allowed_actions").notNull().default("[]"),
    forbidden_actions: text("forbidden_actions").notNull().default("[]"),
    preview_targets: text("preview_targets").notNull().default("[]"),
    proof_ids: text("proof_ids").notNull().default("[]"),
    evidence_uri: text("evidence_uri"),
    redaction: text("redaction").notNull(),
    created_by: text("created_by").notNull().default("agent"),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull(),
    expires_at: text("expires_at"),
    rollback_ref: text("rollback_ref").notNull(),
    reviewer_note: text("reviewer_note"),
    metadata: text("metadata").notNull().default("{}"),
    page_key: text("page_key"),
    slug: text("slug"),
    title: text("title"),
    visibility: text("visibility"),
    updated_by: text("updated_by"),
    published_from_operation_id: text("published_from_operation_id"),
  },
  (table) => [
    index("idx_content_draft_operations_status").on(
      table.status,
      table.updated_at,
    ),
    index("idx_content_draft_operations_surface_route").on(
      table.surface,
      table.route,
    ),
    index("idx_content_draft_operations_risk").on(
      table.risk_level,
      table.authority_state,
    ),
    index("idx_content_draft_operations_page_key_status").on(
      table.page_key,
      table.status,
      table.updated_at,
    ),
    index("idx_content_draft_operations_slug").on(table.slug),
    index("idx_content_draft_operations_visibility").on(
      table.visibility,
      table.updated_at,
    ),
  ],
);

export const contentPublishEvents = sqliteTable(
  "content_publish_events",
  {
    id: text("id").primaryKey(),
    operation_id: text("operation_id").references(
      () => contentDraftOperations.operation_id,
    ),
    content_record_id: text("content_record_id").references(
      () => contentRecords.id,
    ),
    event_type: text("event_type").notNull(),
    status: text("status").notNull(),
    summary: text("summary").notNull(),
    proof_ids: text("proof_ids").notNull().default("[]"),
    rollback_ref: text("rollback_ref").notNull(),
    created_by: text("created_by").notNull().default("agent"),
    created_at: text("created_at").notNull(),
    metadata: text("metadata").notNull().default("{}"),
  },
  (table) => [
    index("idx_content_publish_events_operation").on(
      table.operation_id,
      table.created_at,
    ),
    index("idx_content_publish_events_record").on(
      table.content_record_id,
      table.created_at,
    ),
    index("idx_content_publish_events_type").on(
      table.event_type,
      table.created_at,
    ),
  ],
);

// ---------------------------------------------------------------------------
// 27. admin control-plane event core and projections
// ---------------------------------------------------------------------------

export const adminEvents = sqliteTable(
  "admin_events",
  {
    schema_version: integer("schema_version").notNull().default(1),
    event_id: text("event_id").primaryKey(),
    dedupe_key: text("dedupe_key").notNull(),
    source: text("source").notNull(),
    provider: text("provider"),
    account: text("account"),
    actor: text("actor").notNull(),
    kind: text("kind").notNull(),
    ts: text("ts").notNull(),
    privacy: text("privacy").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    href: text("href"),
    payload_ref: text("payload_ref"),
    created_by: text("created_by").notNull(),
    created_at: text("created_at").notNull(),
  },
  (table) => [
    index("idx_admin_events_dedupe").on(table.dedupe_key),
    index("idx_admin_events_source_ts").on(table.source, table.ts),
    index("idx_admin_events_kind_ts").on(table.kind, table.ts),
  ],
);

export const adminInboxItems = sqliteTable(
  "admin_inbox_items",
  {
    item_id: text("item_id").primaryKey(),
    dedupe_key: text("dedupe_key").notNull().unique(),
    event_refs: text("event_refs").notNull().default("[]"),
    domain: text("domain").notNull().default("general"),
    entity_ref: text("entity_ref"),
    attention_kind: text("attention_kind").notNull().default("awareness"),
    source: text("source").notNull(),
    account: text("account"),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    href: text("href"),
    status: text("status").notNull(),
    urgency: text("urgency").notNull().default("normal"),
    owner: text("owner").notNull(),
    action_kind: text("action_kind").notNull().default("open"),
    expires_at: text("expires_at"),
    last_seen_at: text("last_seen_at"),
    updated_at: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_admin_inbox_status_urgency").on(table.status, table.urgency),
    index("idx_admin_inbox_source").on(table.source, table.updated_at),
    index("idx_admin_inbox_expires").on(table.expires_at),
  ],
);

export const adminProjectStates = sqliteTable(
  "admin_project_states",
  {
    project_id: text("project_id").primaryKey(),
    dedupe_key: text("dedupe_key").notNull().unique(),
    title: text("title").notNull(),
    domain: text("domain").notNull(),
    entity_ref: text("entity_ref"),
    lifecycle: text("lifecycle").notNull(),
    attention_kind: text("attention_kind").notNull(),
    native_runtime_status: text("native_runtime_status").notNull(),
    status_summary: text("status_summary").notNull(),
    owner: text("owner").notNull(),
    agent_source: text("agent_source").notNull(),
    event_refs: text("event_refs").notNull().default("[]"),
    task_refs: text("task_refs").notNull().default("[]"),
    updated_at: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_admin_project_domain_lifecycle").on(
      table.domain,
      table.lifecycle,
    ),
    index("idx_admin_project_attention").on(table.attention_kind),
  ],
);

export const adminTaskStates = sqliteTable(
  "admin_task_states",
  {
    task_id: text("task_id").primaryKey(),
    dedupe_key: text("dedupe_key").notNull().unique(),
    project_ref: text("project_ref").notNull(),
    title: text("title").notNull(),
    domain: text("domain").notNull(),
    entity_ref: text("entity_ref"),
    lifecycle: text("lifecycle").notNull(),
    attention_kind: text("attention_kind").notNull(),
    native_runtime_status: text("native_runtime_status").notNull(),
    status_summary: text("status_summary").notNull(),
    owner: text("owner").notNull(),
    agent_source: text("agent_source").notNull(),
    event_refs: text("event_refs").notNull().default("[]"),
    blocked_by: text("blocked_by").notNull().default("[]"),
    updated_at: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_admin_task_project").on(table.project_ref, table.lifecycle),
    index("idx_admin_task_attention").on(table.attention_kind),
  ],
);

export const adminTaskLineage = sqliteTable(
  "admin_task_lineage",
  {
    lineage_id: text("lineage_id").primaryKey(),
    task_ref: text("task_ref").notNull(),
    parent_task_ref: text("parent_task_ref"),
    root_task_ref: text("root_task_ref").notNull(),
    relation: text("relation").notNull(),
    agent_source: text("agent_source").notNull(),
    event_refs: text("event_refs").notNull().default("[]"),
    updated_at: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_admin_task_lineage_task").on(table.task_ref),
    index("idx_admin_task_lineage_root").on(table.root_task_ref),
  ],
);

export const adminPieceStates = sqliteTable(
  "admin_piece_states",
  {
    piece_id: text("piece_id").primaryKey(),
    dedupe_key: text("dedupe_key").notNull().unique(),
    event_refs: text("event_refs").notNull().default("[]"),
    title: text("title").notNull(),
    state: text("state").notNull(),
    channels: text("channels").notNull().default("[]"),
    source_refs: text("source_refs").notNull().default("[]"),
    updated_at: text("updated_at").notNull(),
  },
  (table) => [index("idx_admin_piece_state").on(table.state, table.updated_at)],
);

export const adminFleetStatus = sqliteTable(
  "admin_fleet_status",
  {
    subject_id: text("subject_id").primaryKey(),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    status: text("status").notNull(),
    summary: text("summary").notNull(),
    owner: text("owner").notNull(),
    href: text("href"),
    event_refs: text("event_refs").notNull().default("[]"),
    updated_at: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_admin_fleet_kind_status").on(table.kind, table.status),
  ],
);

export const adminDeployStates = sqliteTable(
  "admin_deploy_states",
  {
    deploy_id: text("deploy_id").primaryKey(),
    target: text("target").notNull(),
    status: text("status").notNull(),
    scope: text("scope").notNull(),
    href: text("href"),
    last_run_at: text("last_run_at"),
    event_refs: text("event_refs").notNull().default("[]"),
    updated_at: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_admin_deploy_target_status").on(table.target, table.status),
  ],
);

export const adminCapabilityStates = sqliteTable(
  "admin_capability_states",
  {
    capability_id: text("capability_id").primaryKey(),
    machine: text("machine").notNull(),
    status: text("status").notNull(),
    auth_model: text("auth_model").notNull(),
    write_enabled: integer("write_enabled", { mode: "boolean" })
      .notNull()
      .default(false),
    summary: text("summary").notNull(),
    event_refs: text("event_refs").notNull().default("[]"),
    updated_at: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_admin_capability_machine").on(table.machine, table.status),
  ],
);
