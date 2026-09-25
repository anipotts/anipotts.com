/** Node stand-in for the `cloudflare:workers` module in the built www Worker.
 * In workerd the module `env` and the `env` handed to `fetch` are the same
 * bindings. `withWorkerEnv` gives each test request that pairing, and the
 * async context keeps concurrent requests with different envs apart. */
import { AsyncLocalStorage } from "node:async_hooks";
import { registerHooks } from "node:module";

const requests = new AsyncLocalStorage();
const current = () => requests.getStore() ?? {};

export const env = new Proxy(
  {},
  {
    get: (_, key) => current()[key],
    has: (_, key) => key in current(),
    ownKeys: () => Reflect.ownKeys(current()),
    getOwnPropertyDescriptor(_, key) {
      const descriptor = Object.getOwnPropertyDescriptor(current(), key);
      return descriptor && { ...descriptor, configurable: true };
    },
  },
);

export function withWorkerEnv(worker) {
  return {
    ...worker,
    fetch: (request, bindings, context) =>
      requests.run(bindings, () => worker.fetch(request, bindings, context)),
  };
}

const shim = import.meta.url;
registerHooks({
  resolve(specifier, context, next) {
    return specifier === "cloudflare:workers"
      ? { url: shim, shortCircuit: true }
      : next(specifier, context);
  },
});
globalThis.caches ??= {};
