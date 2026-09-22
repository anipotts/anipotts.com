import { publisherMode } from "./runtime-contract";

/** Public components inside an owner preview must see the same published
 * inventory as the website, while the selected candidate stays private. */
export function applyEditorialPreviewContext(locals: App.Locals) {
  const env = locals.runtime?.env;
  const mode = env ? publisherMode(env) : null;
  if (mode !== "direct" && mode !== "maintenance") return;
  const projectedEnv = { ...locals.runtime.env, CONTENT_RUNTIME: "cms" };
  locals.runtime = { ...locals.runtime, env: projectedEnv };
}
