/// <reference types="astro/client" />

type CfEnv = {
  DB: D1Database;
  /** Must be exactly "cms"; anything else fails content routes closed. */
  CONTENT_RUNTIME?: "cms";
  CONTENT_DB?: D1Database;
  CONTENT_MEDIA?: R2Bucket;
  ASSETS: Fetcher;
  RESEND_API_KEY?: string;
  RESEND_WEBHOOK_SECRET?: string;
  NEWSLETTER_QUEUE?: Queue<{
    type: "confirm" | "issue_delivery";
    subscriberId?: string;
    email?: string;
    token?: string;
    baseUrl?: string;
    deliveryId?: string;
    issueId?: string;
  }>;
  NEWSLETTER_BASE_URL?: string;
  NEWSLETTER_FROM?: string;
  NEWSLETTER_REPLY_TO?: string;
  NEWSLETTER_MAILING_ADDRESS?: string;
};

type Runtime = import("@astrojs/cloudflare").Runtime<CfEnv>;

declare namespace App {
  interface Locals extends Runtime {}
}
