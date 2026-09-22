import { createRuntimeContractReporter } from "./runtime-contract";

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

interface Env {
  DB: D1Database;
  RESEND_API_KEY?: string;
  NEWSLETTER_BASE_URL?: string;
  NEWSLETTER_FROM?: string;
  NEWSLETTER_REPLY_TO?: string;
  NEWSLETTER_MAILING_ADDRESS?: string;
}

type DeliveryRow = {
  id: string;
  issue_id: string;
  subscriber_id: string;
  email: string;
  attempt_count: number;
};

type IssueRow = {
  id: string;
  slug: string;
  subject: string;
  title: string;
  summary: string | null;
  html: string | null;
  text: string | null;
};

type SubscriberRow = {
  id: string;
  email: string;
  status: string;
};

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  headers?: Record<string, string>;
  tags?: { name: string; value: string }[];
};

type SendEmailResult = {
  id: string | null;
  mocked: boolean;
};

interface EmailTransport {
  send(input: SendEmailInput): Promise<SendEmailResult>;
}

const DEFAULT_NEWSLETTER_FROM = "Ani Potts <news@anipotts.com>";
const DEFAULT_NEWSLETTER_REPLY_TO = "contact@anipotts.com";

// Log only: one runtime contract line per isolate. It never blocks, retries,
// skips or changes a send, and never changes a response.
const reportRuntimeContract = createRuntimeContractReporter();

const UNOBSERVED =
  "The newsletter-send queue and its dead-letter depth: this worker consumes the queue and holds no binding to read it. Whether Resend accepts the key shows only once a send is tried.";

// The event types sendConfirmation and sendIssueDelivery record for a real
// send. Mocked sends are not sends.
const SENT_EVENT_TYPES = ["confirm_email_sent", "issue_delivery_sent"];

type NewsletterFacts = {
  subscribers: { confirmed: number; total: number };
  last_sent_at: string | null;
  last_error_at: string | null;
};

function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new Error("count is not a count");
  return value;
}

function timeOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)))
    throw new Error("time is not a timestamp");
  return value;
}

/** Counts and two timestamps. Never an address, subject, token or payload. */
async function newsletterFacts(db: D1Database): Promise<NewsletterFacts> {
  const [subscribers, events] = await Promise.all([
    db
      .prepare(
        "SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END), 0) AS confirmed FROM newsletter_subscribers",
      )
      .first<{ total: unknown; confirmed: unknown }>(),
    db
      .prepare(
        `SELECT MAX(CASE WHEN type IN (${SENT_EVENT_TYPES.map(() => "?").join(", ")}) THEN created_at END) AS last_sent_at, MAX(CASE WHEN type = 'queue_error' THEN created_at END) AS last_error_at FROM newsletter_events`,
      )
      .bind(...SENT_EVENT_TYPES)
      .first<{ last_sent_at: unknown; last_error_at: unknown }>(),
  ]);
  return {
    subscribers: {
      confirmed: count(subscribers?.confirmed),
      total: count(subscribers?.total),
    },
    last_sent_at: timeOrNull(events?.last_sent_at),
    last_error_at: timeOrNull(events?.last_error_at),
  };
}

function configured(value: unknown): "configured" | "missing" {
  return typeof value === "string" && value.trim() !== ""
    ? "configured"
    : "missing";
}

/**
 * ok is false only for a fault this worker can see: unreadable tables, a
 * missing send secret, or a send error newer than the last send. dormant
 * says nothing has been sent and nobody is confirmed to send to.
 */
async function health(env: Env): Promise<Record<string, unknown>> {
  let facts: NewsletterFacts | null = null;
  try {
    facts = await newsletterFacts(env.DB);
  } catch {
    facts = null;
  }
  const resendKey = configured(env.RESEND_API_KEY);
  const mailingAddress = configured(env.NEWSLETTER_MAILING_ADDRESS);
  const lastSendFailed =
    facts?.last_error_at != null &&
    (facts.last_sent_at === null ||
      Date.parse(facts.last_error_at) > Date.parse(facts.last_sent_at));
  const dormant =
    facts === null
      ? null
      : facts.subscribers.confirmed === 0 && facts.last_sent_at === null;

  const notes: string[] = [];
  if (facts === null) notes.push("Couldn't read the newsletter tables.");
  if (resendKey === "missing")
    notes.push(
      "RESEND_API_KEY isn't set, so sends are recorded as mocked and nothing is delivered.",
    );
  if (mailingAddress === "missing")
    notes.push(
      "NEWSLETTER_MAILING_ADDRESS isn't set, so issue deliveries fail.",
    );
  if (lastSendFailed) notes.push("The last send attempt failed.");
  if (dormant)
    notes.push("Dormant: no confirmed subscriber and no send recorded.");

  return {
    app: "newsletter",
    ok:
      facts !== null &&
      resendKey === "configured" &&
      mailingAddress === "configured" &&
      !lastSendFailed,
    dormant,
    d1: facts ? "connected" : "error",
    subscribers: facts?.subscribers ?? null,
    last_sent_at: facts?.last_sent_at ?? null,
    last_error_at: facts?.last_error_at ?? null,
    resend_key: resendKey,
    mailing_address: mailingAddress,
    notes,
    unobserved: UNOBSERVED,
    ts: new Date().toISOString(),
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    reportRuntimeContract(env, "fetch");
    if (request.method !== "GET" && request.method !== "HEAD") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }
    return Response.json(await health(env));
  },

  async queue(
    batch: MessageBatch<NewsletterQueueMessage>,
    env: Env,
  ): Promise<void> {
    reportRuntimeContract(env, "queue");
    await Promise.all(
      batch.messages.map((message) =>
        handleQueuedMessage(message.body, env)
          .then(() => message.ack())
          .catch(async (error) => {
            console.error("newsletter queue error", error);
            await recordEvent(env.DB, {
              type: "queue_error",
              payload: {
                message: sanitizeQueueMessage(message.body),
                error: error instanceof Error ? error.message : String(error),
              },
            });
            message.retry({ delaySeconds: 60 });
          }),
      ),
    );
  },
};

async function handleQueuedMessage(
  message: NewsletterQueueMessage,
  env: Env,
): Promise<void> {
  if (message.type === "confirm") {
    await sendConfirmation(message, env);
    return;
  }

  await sendIssueDelivery(message, env);
}

async function sendConfirmation(
  message: Extract<NewsletterQueueMessage, { type: "confirm" }>,
  env: Env,
): Promise<void> {
  const confirmUrl = `${message.baseUrl}/api/newsletter/confirm?token=${encodeURIComponent(message.token)}`;
  const transport = createTransport(env);
  const result = await transport.send({
    to: message.email,
    subject: "confirm your anipotts newsletter subscription",
    html: `<p>confirm your subscription to ani's newsletter.</p><p><a href="${escapeHtml(confirmUrl)}">confirm subscription</a></p>`,
    text: `confirm your subscription: ${confirmUrl}`,
    tags: [
      { name: "type", value: "newsletter_confirm" },
      { name: "subscriber_id", value: message.subscriberId },
    ],
  });

  await recordEvent(env.DB, {
    type: result.mocked ? "confirm_email_mocked" : "confirm_email_sent",
    subscriberId: message.subscriberId,
    email: message.email,
    provider: "resend",
    providerEmailId: result.id,
    payload: { mocked: result.mocked },
  });
}

async function sendIssueDelivery(
  message: Extract<NewsletterQueueMessage, { type: "issue_delivery" }>,
  env: Env,
): Promise<void> {
  if (!env.NEWSLETTER_MAILING_ADDRESS) {
    throw new Error("NEWSLETTER_MAILING_ADDRESS missing");
  }

  const delivery = await env.DB.prepare(
    "SELECT id, issue_id, subscriber_id, email, attempt_count FROM newsletter_deliveries WHERE id = ?",
  )
    .bind(message.deliveryId)
    .first<DeliveryRow>();
  if (!delivery) throw new Error("delivery not found");

  const issue = await env.DB.prepare(
    "SELECT id, slug, subject, title, summary, html, text FROM newsletter_issues WHERE id = ?",
  )
    .bind(message.issueId)
    .first<IssueRow>();
  if (!issue) throw new Error("issue not found");

  const subscriber = await env.DB.prepare(
    "SELECT id, email, status FROM newsletter_subscribers WHERE id = ?",
  )
    .bind(message.subscriberId)
    .first<SubscriberRow>();
  if (!subscriber || subscriber.status !== "confirmed") {
    await markDeliverySkipped(env.DB, delivery, "subscriber not confirmed");
    return;
  }

  const suppressed = await env.DB.prepare(
    "SELECT email FROM newsletter_suppressions WHERE email = ?",
  )
    .bind(subscriber.email)
    .first<{ email: string }>();
  if (suppressed) {
    await markDeliverySkipped(env.DB, delivery, "subscriber suppressed");
    return;
  }

  const unsubscribeToken = await createToken(env.DB, {
    subscriberId: subscriber.id,
    email: subscriber.email,
    purpose: "unsubscribe",
    ttlMs: 1000 * 60 * 60 * 24 * 365 * 5,
  });
  const baseUrl = env.NEWSLETTER_BASE_URL ?? "https://news.anipotts.com";
  const unsubscribeUrl = `${baseUrl}/api/newsletter/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;
  const transport = createTransport(env);
  const text =
    issue.text ??
    `${issue.title}\n\n${issue.summary ?? ""}\n\nunsubscribe: ${unsubscribeUrl}`;
  const html = appendComplianceFooter(
    issue.html ?? `<h1>${escapeHtml(issue.title)}</h1>`,
    env.NEWSLETTER_MAILING_ADDRESS,
    unsubscribeUrl,
  );

  await env.DB.prepare(
    "UPDATE newsletter_deliveries SET attempt_count = attempt_count + 1, updated_at = ? WHERE id = ?",
  )
    .bind(nowIso(), delivery.id)
    .run();

  const result = await transport.send({
    to: subscriber.email,
    subject: issue.subject,
    html,
    text,
    headers: {
      "List-Unsubscribe": `<${unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
    tags: [
      { name: "type", value: "newsletter_issue" },
      { name: "issue_id", value: issue.id },
      { name: "delivery_id", value: delivery.id },
    ],
  });

  const sentAt = nowIso();
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE newsletter_deliveries SET status = ?, resend_email_id = ?, sent_at = ?, updated_at = ? WHERE id = ?",
    ).bind(
      result.mocked ? "mocked" : "sent",
      result.id,
      sentAt,
      sentAt,
      delivery.id,
    ),
    env.DB.prepare(
      "INSERT INTO newsletter_events (id, subscriber_id, issue_id, delivery_id, email, type, provider, provider_email_id, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, 'resend', ?, ?, ?)",
    ).bind(
      crypto.randomUUID(),
      subscriber.id,
      issue.id,
      delivery.id,
      subscriber.email,
      result.mocked ? "issue_delivery_mocked" : "issue_delivery_sent",
      result.id,
      JSON.stringify({ mocked: result.mocked }),
      sentAt,
    ),
  ]);
}

function createTransport(env: Env): EmailTransport {
  const from = env.NEWSLETTER_FROM ?? DEFAULT_NEWSLETTER_FROM;
  const replyTo = env.NEWSLETTER_REPLY_TO ?? DEFAULT_NEWSLETTER_REPLY_TO;

  if (!env.RESEND_API_KEY) {
    return {
      async send(input) {
        console.log("newsletter email mocked", {
          to: input.to,
          subject: input.subject,
          from,
          replyTo,
        });
        return { id: null, mocked: true };
      },
    };
  }

  return {
    async send(input) {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${env.RESEND_API_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from,
          reply_to: replyTo,
          to: [input.to],
          subject: input.subject,
          html: input.html,
          text: input.text,
          headers: input.headers,
          tags: input.tags,
        }),
      });

      const payload = (await response.json().catch(() => null)) as {
        id?: string;
        message?: string;
      } | null;

      if (!response.ok) {
        throw new Error(
          payload?.message ?? `resend failed: ${response.status}`,
        );
      }

      return { id: payload?.id ?? null, mocked: false };
    },
  };
}

async function markDeliverySkipped(
  db: D1Database,
  delivery: DeliveryRow,
  reason: string,
): Promise<void> {
  const ts = nowIso();
  await db.batch([
    db
      .prepare(
        "UPDATE newsletter_deliveries SET status = 'skipped', last_error = ?, updated_at = ? WHERE id = ?",
      )
      .bind(reason, ts, delivery.id),
    db
      .prepare(
        "INSERT INTO newsletter_events (id, subscriber_id, issue_id, delivery_id, email, type, payload, created_at) VALUES (?, ?, ?, ?, ?, 'issue_delivery_skipped', ?, ?)",
      )
      .bind(
        crypto.randomUUID(),
        delivery.subscriber_id,
        delivery.issue_id,
        delivery.id,
        delivery.email,
        JSON.stringify({ reason }),
        ts,
      ),
  ]);
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

async function recordEvent(
  db: D1Database,
  event: {
    type: string;
    subscriberId?: string | null;
    issueId?: string | null;
    deliveryId?: string | null;
    email?: string | null;
    provider?: string | null;
    providerEmailId?: string | null;
    payload?: unknown;
  },
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO newsletter_events (id, subscriber_id, issue_id, delivery_id, email, type, provider, provider_email_id, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      crypto.randomUUID(),
      event.subscriberId ?? null,
      event.issueId ?? null,
      event.deliveryId ?? null,
      event.email ?? null,
      event.type,
      event.provider ?? null,
      event.providerEmailId ?? null,
      JSON.stringify(event.payload ?? {}),
      nowIso(),
    )
    .run();
}

function appendComplianceFooter(
  html: string,
  mailingAddress: string,
  unsubscribeUrl: string,
): string {
  return `${html}
<hr>
<p style="font-size:12px;color:#666;line-height:1.5">
  ani potts<br>
  ${escapeHtml(mailingAddress)}<br>
  <a href="${escapeHtml(unsubscribeUrl)}">unsubscribe</a>
</p>`;
}

function sanitizeQueueMessage(message: NewsletterQueueMessage): unknown {
  if (message.type === "confirm") {
    return {
      type: message.type,
      subscriberId: message.subscriberId,
      email: message.email,
    };
  }

  return message;
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function nowIso(): string {
  return new Date().toISOString();
}
