export const featureFlags = {
  favoriteNumber: process.env.NEXT_PUBLIC_FEATURE_FAVORITE_NUMBER === 'true',
  fileBrowser: process.env.NEXT_PUBLIC_FEATURE_FILE_BROWSER === 'true',
  systemMonitor: process.env.NEXT_PUBLIC_FEATURE_SYSTEM_MONITOR === 'true',
} as const;
