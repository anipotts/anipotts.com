declare module "virtual:editorial-updates" {
  const updates: Record<string, { at: string; source: "git" | "local" }>;
  export default updates;
}
