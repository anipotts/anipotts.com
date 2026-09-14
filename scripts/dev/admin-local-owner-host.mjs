// A local owner build grants the synthetic owner from request headers alone:
// middleware never sees the peer address. That is safe only while the dev
// server listens on loopback, so a flag build refuses to start on any other
// host. `astro dev --host` (true), `--host 0.0.0.0`, `::`, a LAN address or a
// vite.server.host override all fail before the server listens.

export const LOCAL_OWNER_LOOPBACK_GUARD = "anipotts:local-owner-loopback";

const IPV4_LOOPBACK =
  /^127\.(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){2}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

/**
 * True only for a host Vite binds to a loopback interface. undefined and
 * false are Vite's own `localhost` default; true, "" and null listen on every
 * interface; any other name is refused rather than resolved.
 */
export function isLoopbackDevHost(host) {
  if (host === undefined || host === false) return true;
  if (typeof host !== "string") return false;
  let value = host.trim().toLowerCase();
  const bracketed = /^\[([^\]]+)\]$/.exec(value);
  if (bracketed) value = bracketed[1];
  if (value === "localhost" || value === "::1") return true;
  if (value.startsWith("::ffff:")) value = value.slice("::ffff:".length);
  return IPV4_LOOPBACK.test(value);
}

function assertLoopback(host, source) {
  if (isLoopbackDevHost(host)) return;
  const error = new Error(
    `ADMIN_LOCAL_OWNER=1 serves a synthetic owner and must listen on loopback, but ${source} is ${JSON.stringify(host)}. Remove --host or pass --host 127.0.0.1, or unset ADMIN_LOCAL_OWNER.`,
  );
  error.name = "LocalOwnerHostError";
  error.hint =
    "Owner mode trusts request headers, so a LAN client sending Host: localhost would become the owner.";
  throw error;
}

export function localOwnerLoopbackGuard({ enabled }) {
  if (typeof enabled !== "boolean") {
    throw new Error("localOwnerLoopbackGuard enabled must be a boolean");
  }
  return {
    name: LOCAL_OWNER_LOOPBACK_GUARD,
    hooks: {
      // CLI flags are already merged into config here; build and sync never listen.
      "astro:config:setup": ({ command, config }) => {
        if (!enabled || (command !== "dev" && command !== "preview")) return;
        assertLoopback(config.server?.host, "server.host");
      },
      // Vite's resolved value, after vite.server.host and plugin config hooks.
      "astro:server:setup": ({ server }) => {
        if (!enabled) return;
        assertLoopback(server.config.server.host, "the Vite dev server host");
      },
    },
  };
}
