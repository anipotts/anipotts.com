import { env as workerEnv } from "cloudflare:workers";

/** Worker bindings and vars for this request. Astro 7 and adapter 14 removed
 * `locals.runtime`; every read goes through here so tests mock one module.
 *
 * An owner preview in admin renders public components against a projected
 * env (see apps/admin/src/lib/editorial-preview-context.ts). The projection
 * is keyed by that request's locals and never touches the shared bindings. */
const projected = new WeakMap<object, CfEnv>();

export function runtimeEnv(locals?: object): CfEnv {
  return (locals && projected.get(locals)) ?? (workerEnv as CfEnv);
}

export function projectRuntimeEnv(
  locals: object,
  overrides: Partial<CfEnv>,
): void {
  projected.set(locals, { ...runtimeEnv(locals), ...overrides });
}

/** The request's ExecutionContext, which the adapter exposes as
 * `locals.cfContext`. Absent while prerendering. */
export function executionContext(locals: object): ExecutionContext | undefined {
  return (locals as { cfContext?: ExecutionContext }).cfContext;
}
