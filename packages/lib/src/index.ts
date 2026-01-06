// Supabase
export {
  supabase,
  isSupabaseConfigured,
  createServerClient,
  createClient,
} from "./supabase";
export type { SupabaseClient } from "./supabase";

// PostHog
export { getPostHogClient, shutdownPostHog, PostHog } from "./posthog";

// Utilities
export {
  cn,
  formatDate,
  formatRelativeTime,
  truncate,
  slugify,
} from "./utils";

// Feature flags
export {
  featureFlags,
  isFeatureEnabled,
} from "./feature-flags";
export type { FeatureFlags, FeatureFlagKey } from "./feature-flags";
