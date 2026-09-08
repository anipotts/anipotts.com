import { z } from "zod";
import { json } from "./api";

const newsletterEmailSchema = z.string().trim().email().max(320);

export const subscribePayloadSchema = z.object({
  email: newsletterEmailSchema,
  website: z.string().max(0).optional().default(""),
});

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
};

type TokenRow = {
  id: string;
  subscriber_id: string;
  email: string;
  expires_at: string;
  used_at: string | null;
};

const CONFIRM_TTL_MS = 1000 * 60 * 60 * 24 * 7;

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
    headers: { "content-type": "text/html; charset=utf-8" },
  });
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

async function createToken(
  db: D1Database,
  input: {
    subscriberId: string;
    email: string;
    purpose: "confirm" | "unsubscribe";
    ttlMs: number;
  },
): Promise<string> {
  const token = randomToken();
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + input.ttlMs).toISOString();
  await db
    .prepare(
      "INSERT INTO newsletter_tokens (id, subscriber_id, email, purpose, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      crypto.randomUUID(),
      input.subscriberId,
      input.email,
      input.purpose,
      await tokenHash(token),
      expiresAt,
      createdAt,
    )
    .run();
  return token;
}

async function upsertPendingSubscriber(
  db: D1Database,
  email: string,
): Promise<SubscriberRow> {
  const current = await db
    .prepare(
      "SELECT id, email, status FROM newsletter_subscribers WHERE email = ?",
    )
    .bind(email)
    .first<SubscriberRow>();

  const ts = nowIso();
  if (current) {
    if (current.status !== "suppressed") {
      await db
        .prepare(
          "UPDATE newsletter_subscribers SET status = CASE WHEN status = 'unsubscribed' THEN 'pending' ELSE status END, subscribed_at = COALESCE(subscribed_at, ?), updated_at = ? WHERE id = ?",
        )
        .bind(ts, ts, current.id)
        .run();
    }
    return current;
  }

  const id = crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO newsletter_subscribers (id, email, status, source, subscribed_at, created_at, updated_at) VALUES (?, ?, 'pending', 'website', ?, ?, ?)",
    )
    .bind(id, email, ts, ts, ts)
    .run();
  return { id, email, status: "pending" };
}

export async function recordNewsletterEvent(
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

export async function createDoubleOptIn(
  env: NewsletterEnv,
  request: Request,
  email: string,
): Promise<{ queued: boolean; mock: boolean }> {
  const subscriber = await upsertPendingSubscriber(env.DB, email);
  await recordNewsletterEvent(env.DB, {
    type: "subscribe_requested",
    subscriberId: subscriber.id,
    email,
  });

  if (subscriber.status === "suppressed") {
    return { queued: false, mock: true };
  }

  const token = await createToken(env.DB, {
    subscriberId: subscriber.id,
    email,
    purpose: "confirm",
    ttlMs: CONFIRM_TTL_MS,
  });

  if (!env.NEWSLETTER_QUEUE) {
    await recordNewsletterEvent(env.DB, {
      type: "confirm_email_mocked",
      subscriberId: subscriber.id,
      email,
      payload: { reason: "NEWSLETTER_QUEUE missing" },
    });
    return { queued: false, mock: true };
  }

  await env.NEWSLETTER_QUEUE.send({
    type: "confirm",
    subscriberId: subscriber.id,
    email,
    token,
    baseUrl: baseUrl(env, request),
  });
  return { queued: true, mock: false };
}

export async function confirmSubscriber(
  db: D1Database,
  rawToken: string,
): Promise<"confirmed" | "invalid" | "expired" | "used"> {
  const hash = await tokenHash(rawToken);
  const token = await db
    .prepare(
      "SELECT id, subscriber_id, email, expires_at, used_at FROM newsletter_tokens WHERE purpose = 'confirm' AND token_hash = ?",
    )
    .bind(hash)
    .first<TokenRow>();

  if (!token) return "invalid";
  if (token.used_at) return "used";
  if (Date.parse(token.expires_at) < Date.now()) return "expired";

  const ts = nowIso();
  await db.batch([
    db
      .prepare("UPDATE newsletter_tokens SET used_at = ? WHERE id = ?")
      .bind(ts, token.id),
    db
      .prepare(
        "UPDATE newsletter_subscribers SET status = 'confirmed', confirmed_at = COALESCE(confirmed_at, ?), updated_at = ? WHERE id = ? AND status != 'suppressed'",
      )
      .bind(ts, ts, token.subscriber_id),
    db
      .prepare(
        "INSERT INTO newsletter_events (id, subscriber_id, email, type, payload, created_at) VALUES (?, ?, ?, 'subscribe_confirmed', '{}', ?)",
      )
      .bind(crypto.randomUUID(), token.subscriber_id, token.email, ts),
  ]);
  return "confirmed";
}

export async function unsubscribeByToken(
  db: D1Database,
  rawToken: string,
): Promise<"unsubscribed" | "invalid" | "expired"> {
  const hash = await tokenHash(rawToken);
  const token = await db
    .prepare(
      "SELECT id, subscriber_id, email, expires_at, used_at FROM newsletter_tokens WHERE purpose = 'unsubscribe' AND token_hash = ?",
    )
    .bind(hash)
    .first<TokenRow>();

  if (!token) return "invalid";
  if (Date.parse(token.expires_at) < Date.now()) return "expired";

  const ts = nowIso();
  await db.batch([
    db
      .prepare(
        "UPDATE newsletter_tokens SET used_at = COALESCE(used_at, ?) WHERE id = ?",
      )
      .bind(ts, token.id),
    db
      .prepare(
        "UPDATE newsletter_subscribers SET status = 'unsubscribed', unsubscribed_at = COALESCE(unsubscribed_at, ?), updated_at = ? WHERE id = ?",
      )
      .bind(ts, ts, token.subscriber_id),
    db
      .prepare(
        "INSERT OR REPLACE INTO newsletter_suppressions (email, subscriber_id, reason, provider, created_at, metadata) VALUES (?, ?, 'user_unsubscribe', 'first_party', ?, '{}')",
      )
      .bind(token.email, token.subscriber_id, ts),
    db
      .prepare(
        "INSERT INTO newsletter_events (id, subscriber_id, email, type, payload, created_at) VALUES (?, ?, ?, 'unsubscribe', '{}', ?)",
      )
      .bind(crypto.randomUUID(), token.subscriber_id, token.email, ts),
  ]);
  return "unsubscribed";
}

export async function suppressEmail(
  db: D1Database,
  input: {
    email: string;
    reason: string;
    provider: string;
    providerEventId?: string | null;
    payload?: unknown;
  },
): Promise<void> {
  const email = normalizeEmail(input.email);
  const subscriber = await db
    .prepare("SELECT id FROM newsletter_subscribers WHERE email = ?")
    .bind(email)
    .first<{ id: string }>();
  const ts = nowIso();
  await db.batch([
    db
      .prepare(
        "INSERT OR REPLACE INTO newsletter_suppressions (email, subscriber_id, reason, provider, provider_event_id, created_at, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        email,
        subscriber?.id ?? null,
        input.reason,
        input.provider,
        input.providerEventId ?? null,
        ts,
        JSON.stringify(input.payload ?? {}),
      ),
    db
      .prepare(
        "UPDATE newsletter_subscribers SET status = 'suppressed', suppressed_at = COALESCE(suppressed_at, ?), suppression_reason = ?, updated_at = ? WHERE email = ?",
      )
      .bind(ts, input.reason, ts, email),
  ]);
}

export async function verifyResendWebhook(
  request: Request,
  secret: string,
  rawBody: string,
): Promise<boolean> {
  const id = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signature = request.headers.get("svix-signature");
  if (!id || !timestamp || !signature) return false;

  const signed = `${id}.${timestamp}.${rawBody}`;
  const keyBytes = decodeWebhookSecret(secret);
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

  return signature
    .split(" ")
    .map((part) => part.replace(/^v1,/, ""))
    .some((candidate) => timingSafeEqual(digest, base64Bytes(candidate)));
}

export function parseJsonBody(body: string): unknown {
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return null;
  }
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
