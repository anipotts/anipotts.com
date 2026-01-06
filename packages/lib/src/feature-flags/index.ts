export const featureFlags = {
  favoriteNumber: process.env.NEXT_PUBLIC_FEATURE_FAVORITE_NUMBER === "true",
  fileBrowser: process.env.NEXT_PUBLIC_FEATURE_FILE_BROWSER === "true",
  systemMonitor: process.env.NEXT_PUBLIC_FEATURE_SYSTEM_MONITOR === "true",
} as const;

export type FeatureFlags = typeof featureFlags;
export type FeatureFlagKey = keyof FeatureFlags;

/**
 * Check if a feature flag is enabled
 */
export function isFeatureEnabled(flag: FeatureFlagKey): boolean {
  return featureFlags[flag];
}
