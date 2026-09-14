import { z } from "zod";
import { json } from "./api";

const newsletterEmailSchema = z.string().trim().email().max(320);

export const subscribePayloadSchema = z.object({
  email: newsletterEmailSchema,
  website: z.string().max(0).optional().default(""),
});

export const SUBSCRIBE_BODY_LIMIT_BYTES = 4 * 1024;
export const TOKEN_BODY_LIMIT_BYTES = 2 * 1024;
export const WEBHOOK_BODY_LIMIT_BYTES = 64 * 1024;

// Only the fields the webhook reads are checked; the rest is kept as payload.
const resendWebhookSchema = z
  .object({
    type: z.string().regex(/^[A-Za-z0-9_.-]{1,100}$/),
    created_at: z.string().max(64).optional(),
    data: z
      .object({
        email_id: z.string().max(256).nullable().optional(),
        to: z.array(z.string().max(320)).max(50).optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

type ResendWebhook = z.infer<typeof resendWebhookSchema>;

type NewsletterQueueMessage =
  | {
      type: "confirm";
      subscriberId: string;
      email: string;
      token: string;
      baseUrl: string;
    }
  | {
      type: "issue_delivery";
      deliveryId: string;
      issueId: string;
      subscriberId: string;
    };

export type NewsletterEnv = {
  DB: D1Database;
  NEWSLETTER_QUEUE?: Queue<NewsletterQueueMessage>;
  NEWSLETTER_BASE_URL?: string;
  NEWSLETTER_FROM?: string;
  NEWSLETTER_REPLY_TO?: string;
  NEWSLETTER_MAILING_ADDRESS?: string;
  RESEND_WEBHOOK_SECRET?: string;
};

type SubscriberRow = {
  id: string;
  email: string;
  status: string;
  suppressed_at: string | null;
};

type TokenRow = {
  id: string;
  subscriber_id: string;
  email: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
};

type ResendWebhookHeaders = {
  id: string;
  timestamp: string;
  signature: string;
};

const CONFIRM_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const CONFIRM_SEND_WINDOW_MS = 1000 * 60 * 60 * 24;
const CONFIRM_SENDS_PER_WINDOW = 3;
const WEBHOOK_TOLERANCE_SECONDS = 300;
const UNSUBSCRIBE_REASON = "user_unsubscribe";

function nowIso(): string {
  return new Date().toISOString();
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function baseUrl(env: { NEWSLETTER_BASE_URL?: string }, request: Request) {
  return env.NEWSLETTER_BASE_URL ?? new URL(request.url).origin;
}

export function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

/** tokens are 32 random bytes in base64url; anything else is not worth a lookup. */
export function isTokenShaped(token: string): boolean {
  return /^[A-Za-z0-9_-]{1,128}$/.test(token);
}

/** an expiry that does not parse counts as expired. */
function isUnexpired(expiresAt: string): boolean {
  return Date.parse(expiresAt) > Date.now();
}

async function tokenHash(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return hex(new Uint8Array(digest));
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

/** issue a confirmation token unless the address already reached its send
 *  budget for the window. the count and insert are one statement, so
 *  concurrent requests cannot overshoot it. */
async function createConfirmToken(
  db: D1Database,
  input: { subscriberId: string; email: string },
): Promise<string | null> {
  const token = randomToken();
  const now = Date.now();
  const result = await db
    .prepare(
      "INSERT INTO newsletter_tokens (id, subscriber_id, email, purpose, token_hash, expires_at, created_at) SELECT ?, ?, ?, 'confirm', ?, ?, ? WHERE (SELECT COUNT(*) FROM newsletter_tokens WHERE subscriber_id = ? AND purpose = 'confirm' AND created_at >= ?) < ?",
    )
    .bind(
      crypto.randomUUID(),
      input.subscriberId,
      input.email,
      await tokenHash(token),
      new Date(now + CONFIRM_TTL_MS).toISOString(),
      new Date(now).toISOString(),
      input.subscriberId,
      new Date(now - CONFIRM_SEND_WINDOW_MS).toISOString(),
      CONFIRM_SENDS_PER_WINDOW,
    )
    .run();
  return result.meta.changes === 1 ? token : null;
}

async function upsertPendingSubscriber(
  db: D1Database,
  email: string,
): Promise<{
  id: string;
  status: string;
  blocked: boolean;
  unsubscribed: boolean;
}> {
  const current = await db
    .prepare(
      "SELECT id, email, status, suppressed_at FROM newsletter_subscribers WHERE email = ?",
    )
    .bind(email)
    .first<SubscriberRow>();
  const suppression = await db
    .prepare("SELECT reason FROM newsletter_suppressions WHERE email = ?")
    .bind(email)
    .first<{ reason: string }>();
  const unsubscribed = suppression?.reason === UNSUBSCRIBE_REASON;
  // Bounces, complaints and provider blocks are permanent. suppressed_at also
  // marks rows where an older unsubscribe overwrote one of them.
  const blocked =
    (Boolean(suppression) && !unsubscribed) ||
    current?.status === "suppressed" ||
    Boolean(current?.suppressed_at);

  const ts = nowIso();
  if (current) {
    if (!blocked) {
      await db
        .prepare(
          "UPDATE newsletter_subscribers SET status = CASE WHEN status = 'unsubscribed' THEN 'pending' ELSE status END, subscribed_at = COALESCE(subscribed_at, ?), updated_at = ? WHERE id = ?",
        )
        .bind(ts, ts, current.id)
        .run();
    }
    return { id: current.id, status: current.status, blocked, unsubscribed };
  }

  const id = crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO newsletter_subscribers (id, email, status, source, subscribed_at, created_at, updated_at) VALUES (?, ?, 'pending', 'website', ?, ?, ?)",
    )
    .bind(id, email, ts, ts, ts)
    .run();
  return { id, status: "pending", blocked, unsubscribed };
}

async function recordNewsletterEvent(
  db: D1Database,
  event: {
    type: string;
    subscriberId?: string | null;
    issueId?: string | null;
    deliveryId?: string | null;
    email?: string | null;
    provider?: string | null;
    providerEventId?: string | null;
    providerEmailId?: string | null;
    payload?: unknown;
  },
): Promise<void> {
  await db
    .prepare(
      "INSERT OR IGNORE INTO newsletter_events (id, subscriber_id, issue_id, delivery_id, email, type, provider, provider_event_id, provider_email_id, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      crypto.randomUUID(),
      event.subscriberId ?? null,
      event.issueId ?? null,
      event.deliveryId ?? null,
      event.email ?? null,
      event.type,
      event.provider ?? null,
      event.providerEventId ?? null,
      event.providerEmailId ?? null,
      JSON.stringify(event.payload ?? {}),
      nowIso(),
    )
    .run();
}

/** callers respond the same way whatever happens here, so the response never
 *  reveals whether an address is new, pending, confirmed or suppressed. */
export async function createDoubleOptIn(
  env: NewsletterEnv,
  request: Request,
  email: string,
): Promise<void> {
  const subscriber = await upsertPendingSubscriber(env.DB, email);
  await recordNewsletterEvent(env.DB, {
    type: "subscribe_requested",
    subscriberId: subscriber.id,
    email,
  });

  if (subscriber.blocked) return;
  // A confirmed row that still carries the reader's own unsubscribe is not
  // receiving issues, so it goes through double opt-in again. Older code left
  // rows in that state after a resubscribe or a stale confirmation link.
  if (subscriber.status === "confirmed" && !subscriber.unsubscribed) return;

  const token = await createConfirmToken(env.DB, {
    subscriberId: subscriber.id,
    email,
  });
  if (!token) return;

  if (!env.NEWSLETTER_QUEUE) {
    await recordNewsletterEvent(env.DB, {
      type: "confirm_email_mocked",
      subscriberId: subscriber.id,
      email,
      payload: { reason: "NEWSLETTER_QUEUE missing" },
    });
    return;
  }

  try {
    await env.NEWSLETTER_QUEUE.send({
      type: "confirm",
      subscriberId: subscriber.id,
      email,
      token,
      baseUrl: baseUrl(env, request),
    });
  } catch (error) {
    // A queue outage must not answer differently from the states that send
    // nothing, so it is recorded here instead of surfacing to the caller.
    console.error("newsletter confirm queue error", error);
    await recordNewsletterEvent(env.DB, {
      type: "confirm_email_failed",
      subscriberId: subscriber.id,
      email,
      payload: { reason: "queue_send_failed" },
    }).catch(() => undefined);
  }
}

export async function confirmSubscriber(
  db: D1Database,
  rawToken: string,
): Promise<"confirmed" | "suppressed" | "invalid" | "expired" | "used"> {
  const hash = await tokenHash(rawToken);
  const token = await db
    .prepare(
      "SELECT id, subscriber_id, email, expires_at, used_at, created_at FROM newsletter_tokens WHERE purpose = 'confirm' AND token_hash = ?",
    )
    .bind(hash)
    .first<TokenRow>();

  if (!token) return "invalid";
  if (token.used_at) return "used";
  if (!isUnexpired(token.expires_at)) return "expired";

  const ts = nowIso();
  const results = await db.batch([
    db
      .prepare("UPDATE newsletter_tokens SET used_at = ? WHERE id = ?")
      .bind(ts, token.id),
    // Opting in again reverses the subscriber's own earlier unsubscribe, which
    // the newsletter worker otherwise treats as a delivery block. Provider
    // suppressions stay, including ones an older unsubscribe overwrote.
    db
      .prepare(
        "DELETE FROM newsletter_suppressions WHERE email = ? AND reason = ? AND created_at < ? AND EXISTS (SELECT 1 FROM newsletter_subscribers WHERE id = ? AND email = ? AND status != 'suppressed' AND suppressed_at IS NULL)",
      )
      .bind(
        token.email,
        UNSUBSCRIBE_REASON,
        token.created_at,
        token.subscriber_id,
        token.email,
      ),
    db
      .prepare(
        "UPDATE newsletter_subscribers SET status = 'confirmed', confirmed_at = COALESCE(confirmed_at, ?), updated_at = ? WHERE id = ? AND status != 'suppressed' AND NOT EXISTS (SELECT 1 FROM newsletter_suppressions WHERE newsletter_suppressions.email = newsletter_subscribers.email)",
      )
      .bind(ts, ts, token.subscriber_id),
    // Recorded only when the update above took effect.
    db
      .prepare(
        "INSERT INTO newsletter_events (id, subscriber_id, email, type, payload, created_at) SELECT ?, ?, ?, 'subscribe_confirmed', '{}', ? WHERE EXISTS (SELECT 1 FROM newsletter_subscribers WHERE id = ? AND status = 'confirmed' AND NOT EXISTS (SELECT 1 FROM newsletter_suppressions WHERE newsletter_suppressions.email = newsletter_subscribers.email))",
      )
      .bind(
        crypto.randomUUID(),
        token.subscriber_id,
        token.email,
        ts,
        token.subscriber_id,
      ),
  ]);
  // A remaining provider suppression blocks the status update; the reader is
  // told so instead of being told they are on the list.
  return results[2]?.meta.changes === 1 ? "confirmed" : "suppressed";
}

export async function unsubscribeByToken(
  db: D1Database,
  rawToken: string,
): Promise<"unsubscribed" | "invalid" | "expired"> {
  const hash = await tokenHash(rawToken);
  const token = await db
    .prepare(
      "SELECT id, subscriber_id, email, expires_at, used_at, created_at FROM newsletter_tokens WHERE purpose = 'unsubscribe' AND token_hash = ?",
    )
    .bind(hash)
    .first<TokenRow>();

  if (!token) return "invalid";
  if (!isUnexpired(token.expires_at)) return "expired";

  const ts = nowIso();
  await db.batch([
    db
      .prepare(
        "UPDATE newsletter_tokens SET used_at = COALESCE(used_at, ?) WHERE id = ?",
      )
      .bind(ts, token.id),
    // Confirmation links sent before this point must not reverse it.
    db
      .prepare(
        "UPDATE newsletter_tokens SET used_at = COALESCE(used_at, ?) WHERE subscriber_id = ? AND purpose = 'confirm'",
      )
      .bind(ts, token.subscriber_id),
    db
      .prepare(
        "UPDATE newsletter_subscribers SET status = CASE WHEN status = 'suppressed' THEN status ELSE 'unsubscribed' END, unsubscribed_at = COALESCE(unsubscribed_at, ?), updated_at = ? WHERE id = ?",
      )
      .bind(ts, ts, token.subscriber_id),
    // An existing bounce or complaint keeps its reason.
    db
      .prepare(
        "INSERT OR IGNORE INTO newsletter_suppressions (email, subscriber_id, reason, provider, created_at, metadata) VALUES (?, ?, ?, 'first_party', ?, '{}')",
      )
      .bind(token.email, token.subscriber_id, UNSUBSCRIBE_REASON, ts),
    db
      .prepare(
        "INSERT INTO newsletter_events (id, subscriber_id, email, type, payload, created_at) VALUES (?, ?, ?, 'unsubscribe', '{}', ?)",
      )
      .bind(crypto.randomUUID(), token.subscriber_id, token.email, ts),
  ]);
  return "unsubscribed";
}

/** record a verified provider event and any suppression it implies in one
 *  batch. a redelivery with the same svix-id re-applies the suppression
 *  harmlessly, so a retry after a failed write is never skipped. */
export async function recordResendEvent(
  db: D1Database,
  event: {
    type: string;
    email: string | null;
    providerEventId: string;
    providerEmailId: string | null;
    suppressionReason: string | null;
    payload: unknown;
  },
): Promise<void> {
  const ts = nowIso();
  const payload = JSON.stringify(event.payload ?? {});
  const statements = [
    db
      .prepare(
        "INSERT OR IGNORE INTO newsletter_events (id, subscriber_id, issue_id, delivery_id, email, type, provider, provider_event_id, provider_email_id, payload, created_at) VALUES (?, NULL, NULL, NULL, ?, ?, 'resend', ?, ?, ?, ?)",
      )
      .bind(
        crypto.randomUUID(),
        event.email,
        event.type,
        event.providerEventId,
        event.providerEmailId,
        payload,
        ts,
      ),
  ];
  if (event.email && event.suppressionReason) {
    const email = normalizeEmail(event.email);
    statements.push(
      // The first provider suppression is kept; it only replaces an unsubscribe.
      db
        .prepare(
          "INSERT INTO newsletter_suppressions (email, subscriber_id, reason, provider, provider_event_id, created_at, metadata) VALUES (?, (SELECT id FROM newsletter_subscribers WHERE email = ?), ?, 'resend', ?, ?, ?) ON CONFLICT (email) DO UPDATE SET subscriber_id = COALESCE(newsletter_suppressions.subscriber_id, excluded.subscriber_id), reason = excluded.reason, provider = excluded.provider, provider_event_id = excluded.provider_event_id, created_at = excluded.created_at, metadata = excluded.metadata WHERE newsletter_suppressions.reason = ?",
        )
        .bind(
          email,
          email,
          event.suppressionReason,
          event.providerEventId,
          ts,
          payload,
          UNSUBSCRIBE_REASON,
        ),
      db
        .prepare(
          "UPDATE newsletter_subscribers SET status = 'suppressed', suppressed_at = COALESCE(suppressed_at, ?), suppression_reason = COALESCE(suppression_reason, ?), updated_at = ? WHERE email = ? AND status != 'suppressed'",
        )
        .bind(ts, event.suppressionReason, ts, email),
    );
  }
  await db.batch(statements);
}

/** svix headers, shape-checked before the body is read. */
export function readResendWebhookHeaders(
  request: Request,
): ResendWebhookHeaders | null {
  const id = request.headers.get("svix-id") ?? "";
  const timestamp = request.headers.get("svix-timestamp") ?? "";
  const signature = request.headers.get("svix-signature") ?? "";
  if (!/^[\x21-\x7e]{1,255}$/.test(id)) return null;
  if (!/^\d{1,12}$/.test(timestamp)) return null;
  if (!/^[\x20-\x7e]{1,2048}$/.test(signature)) return null;
  return { id, timestamp, signature };
}

export async function verifyResendWebhook(
  headers: ResendWebhookHeaders,
  secret: string,
  rawBody: string,
  now = Date.now(),
): Promise<boolean> {
  // Svix's replay window: integer seconds within five minutes either way.
  const skew = Math.abs(now / 1000 - Number(headers.timestamp));
  if (!(skew <= WEBHOOK_TOLERANCE_SECONDS)) return false;

  const signed = `${headers.id}.${headers.timestamp}.${rawBody}`;
  const keyBytes = decodeWebhookSecret(secret);
  if (!keyBytes.length) return false;
  const rawKey = new ArrayBuffer(keyBytes.byteLength);
  new Uint8Array(rawKey).set(keyBytes);
  const key = await crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signed)),
  );

  return headers.signature
    .split(" ")
    .filter((part) => part.startsWith("v1,"))
    .some((part) => timingSafeEqual(digest, base64Bytes(part.slice(3))));
}

export function parseJsonBody(body: string): unknown {
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return null;
  }
}

export function parseResendWebhook(body: string): ResendWebhook | null {
  const parsed = resendWebhookSchema.safeParse(parseJsonBody(body));
  return parsed.success ? parsed.data : null;
}

export function missingDbResponse(): Response {
  return json({ error: "newsletter database not configured" }, 500);
}

function decodeWebhookSecret(secret: string): Uint8Array {
  const raw = secret.startsWith("whsec_")
    ? secret.slice("whsec_".length)
    : secret;
  return base64Bytes(raw);
}

function base64Bytes(value: string): Uint8Array {
  try {
    const binary = atob(value);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return new Uint8Array();
  }
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
