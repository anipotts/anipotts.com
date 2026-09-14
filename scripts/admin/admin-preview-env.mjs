// The managed localhost:4311 preview is shared review infrastructure. It is
// never a local owner build, even when the calling shell exported
// ADMIN_LOCAL_OWNER=1: astro.config.mjs reads that variable once and compiles
// the synthetic owner into every page. portless-preview.mjs strips it the
// same way before it starts a default Admin route.
export function adminPreviewChildEnv(parent) {
  const env = { ...parent, FORCE_COLOR: "0" };
  delete env.ADMIN_LOCAL_OWNER;
  return env;
}
