import { projectRuntimeEnv } from "../../../www/src/lib/runtime-env";

/** Public components inside an owner preview must see the same published
 * inventory as the website, while the selected candidate stays private. The
 * projection applies to this request's locals only. */
export function applyEditorialPreviewContext(locals: App.Locals) {
  projectRuntimeEnv(locals, { CONTENT_RUNTIME: "cms" });
}
