import { createHash } from "node:crypto";
import { createServer } from "node:net";
import { basename, join } from "node:path";

// Local dev servers listen on loopback ports only. Each worktree gets a stable
// www/admin pair derived from its path, so several worktrees run side by side
// and a restart keeps its URLs. Ports other local tools own are never used.

export const DEV_HOST = "127.0.0.1";
export const PORT_RANGE_START = 4400;
export const PORT_PAIRS = 300;
/** 1355 was the retired proxy, 4311 the managed Admin preview, 8787 wrangler
 * dev's default and 8871 the local owner production preview. */
export const RESERVED_PORTS = new Set([1355, 4311, 8787, 8871]);

export function isReservedPort(port) {
  return RESERVED_PORTS.has(port);
}

/** Validates an explicit port override from the environment. */
export function parsePortOverride(name, value) {
  if (value === undefined || value === "") return null;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error(`${name} must be a port from 1024 to 65535`);
  }
  if (isReservedPort(port)) {
    throw new Error(`${name} ${port} is reserved for another local tool`);
  }
  return port;
}

/** The pair at a given offset from this worktree's preferred slot. */
export function portPair(worktreeRoot, offset = 0) {
  const digest = createHash("sha256").update(worktreeRoot).digest();
  const slot = (digest.readUInt32BE(0) + offset) % PORT_PAIRS;
  const www = PORT_RANGE_START + slot * 2;
  return { www, admin: www + 1 };
}

export function isPortFree(port, host = DEV_HOST) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen({ port, host, exclusive: true }, () => {
      server.close(() => resolve(true));
    });
  });
}

/** The first pair whose ports are both free, starting at the preferred slot. */
export async function freePortPair(worktreeRoot, isFree = isPortFree) {
  for (let offset = 0; offset < PORT_PAIRS; offset += 1) {
    const pair = portPair(worktreeRoot, offset);
    if (isReservedPort(pair.www) || isReservedPort(pair.admin)) continue;
    if ((await isFree(pair.www)) && (await isFree(pair.admin))) return pair;
  }
  throw new Error("no free local dev port pair between 4400 and 4999");
}

export function devUrl(port) {
  return `http://${DEV_HOST}:${port}`;
}

/** The exact argv used by the manager's selected-worktree child. */
export function managedChildArgs(worktree, port) {
  return [
    join(worktree, "scripts/dev/dev-servers-child.mjs"),
    "--port",
    String(port),
  ];
}

/** Shared by the manager, worker-slot accounting and the idle reaper. */
export function isManagedProcessCommand(command, port, worktree) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) return false;
  const firstSpace = command.indexOf(" ");
  if (firstSpace < 0) return false;
  const executable = basename(command.slice(0, firstSpace));
  const args = command.slice(firstSpace + 1).trimStart();
  const isNode = /^(?:node|nodejs)(?:\.exe)?$/.test(executable);
  const childPath = worktree && managedChildArgs(worktree, port)[0];
  const current = isNode && childPath && args.startsWith(`${childPath} `);
  // Retain only real foreground CLI forms emitted by earlier manager versions.
  const legacy =
    (isNode &&
      /^(?:\S*\/)?(?:pnpm(?:\.c?js)?)\s+exec\s+astro\s+dev(?:\s|$)/.test(
        args,
      )) ||
    (isNode && /^(?:\S*\/)?astro(?:\.mjs)?\s+dev(?:\s|$)/.test(args)) ||
    (/^pnpm(?:\.c?js)?$/.test(executable) &&
      /^exec\s+astro\s+dev(?:\s|$)/.test(args)) ||
    (executable === "astro" && /^dev(?:\s|$)/.test(args));
  if (!current && !legacy) return false;
  const ports = [...args.matchAll(/(?:^|\s)--port(?:=|\s+)(\d+)(?=\s|$)/g)];
  return ports.length === 1 && Number(ports[0][1]) === port;
}
