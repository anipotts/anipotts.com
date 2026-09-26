import { env as workerEnv } from "cloudflare:workers";

/** Worker bindings and vars. Astro 7 and adapter 14 removed
 * `locals.runtime`; every admin read goes through here so tests mock one
 * module. Public components rendered inside an owner preview read theirs
 * through apps/www/src/lib/runtime-env.ts instead. */
export function runtimeEnv(): AdminEnv {
  return (workerEnv ?? {}) as AdminEnv;
}
