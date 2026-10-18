// Shared by Astro and the no-build local-development checks. Keep this module
// independent of application packages so a fresh checkout can inspect entries.
export const adminDependencyDiscovery = {
  client: {
    entries: [
      "src/**/*.{astro,tsx}",
      "!src/**/*.test.*",
      "!src/**/*.spec.*",
      "!src/**/__tests__/**",
    ],
  },
  ssr: {
    entries: [
      "src/**/*.{ts,js,mjs,mts,jsx,tsx,vue,svelte,html,astro,mdx}",
      "!src/**/*.test.*",
      "!src/**/*.spec.*",
      "!src/**/__tests__/**",
    ],
  },
};
