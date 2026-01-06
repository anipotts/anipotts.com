import { PostHog } from "posthog-node";

let posthogClient: PostHog | null = null;

export function getPostHogClient(): PostHog {
  if (!posthogClient) {
    posthogClient = new PostHog(
      process.env.NEXT_PUBLIC_POSTHOG_KEY || "",
      { host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com" }
    );
  }
  return posthogClient;
}
