// Historical schema reference. Deployment uses drizzle/migrations/manifest.json.
// The unused Drizzle CLI is not installed; retain this configuration as data.
export default {
  schema: "./packages/lib/src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
};
