import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Bindings } from "./types";
import { verifyDeviceHandshake } from "./control-plane-auth";
import { createRuntimeContractReporter } from "./runtime-contract";

export { LinkVault } from "./do/link-vault";
export { CodeStats } from "./do/code-stats";
export { CommandRelay } from "./do/command-relay";

const app = new Hono<{ Bindings: Bindings }>();

// Log only: one runtime contract line per isolate. It never blocks a request
// or changes a response, and the Durable Objects keep their own entries.
const reportRuntimeContract = createRuntimeContractReporter();

app.use("*", async (c, next) => {
  reportRuntimeContract(c.env, "fetch");
  await next();
});

app.use("*", async (c, next) => {
  const allowedOrigins = (c.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim());
  return cors({
    origin: (origin) => (allowedOrigins.includes(origin) ? origin : null),
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })(c, next);
});

app.get("/", (c) =>
  c.json({
    service: "anipotts-state",
    durableObjects: ["LinkVault", "CodeStats", "CommandRelay"],
    endpoints: {
      links: {
        list: "GET /api/links",
        add: "POST /api/links",
        remove: "DELETE /api/links/:id",
        subscribe: "GET /api/links/ws",
      },
      commits: {
        list: "GET /api/commits",
        publish: "POST /api/commits (bearer auth)",
        subscribe: "GET /api/commits/ws",
      },
      control: {
        connect: "GET /api/control/devices/ap-mini/connect (signed websocket)",
        commands: "internal Durable Object RPC only",
      },
    },
  }),
);

app.get("/health", (c) => c.json({ ok: true, ts: new Date().toISOString() }));

function linkVaultStub(env: Bindings): DurableObjectStub {
  const id = env.LINK_VAULT.idFromName("default");
  return env.LINK_VAULT.get(id);
}

function codeStatsStub(env: Bindings): DurableObjectStub {
  const id = env.CODE_STATS.idFromName("default");
  return env.CODE_STATS.get(id);
}

type CommandRelayStub = DurableObjectStub & {
  consumeHandshakeNonce(nonce: string, deviceId: string): Promise<boolean>;
};

function commandRelayStub(env: Bindings, deviceId: string): CommandRelayStub {
  return env.COMMAND_RELAY.getByName(deviceId) as CommandRelayStub;
}

function requirePublishKey(c: {
  env: Bindings;
  req: { header: (name: string) => string | undefined };
}): Response | null {
  const expected = c.env.STATE_PUBLISH_KEY;
  if (!expected) {
    return Response.json(
      { error: "STATE_PUBLISH_KEY not configured" },
      { status: 503 },
    );
  }
  const header = c.req.header("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (provided !== expected) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

app.get("/api/links", async (c) => {
  const stub = linkVaultStub(c.env);
  const res = await stub.fetch("https://internal/links");
  return new Response(res.body, res);
});

app.post("/api/links", async (c) => {
  const denied = requirePublishKey(c);
  if (denied) return denied;
  const body = await c.req.json();
  const stub = linkVaultStub(c.env);
  const res = await stub.fetch("https://internal/links", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return new Response(res.body, res);
});

app.delete("/api/links/:id", async (c) => {
  const denied = requirePublishKey(c);
  if (denied) return denied;
  const id = c.req.param("id");
  const stub = linkVaultStub(c.env);
  const res = await stub.fetch(
    `https://internal/links/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
    },
  );
  return new Response(res.body, res);
});

app.get("/api/links/ws", async (c) => {
  if (c.req.header("upgrade")?.toLowerCase() !== "websocket") {
    return c.text("expected websocket upgrade", 426);
  }
  const stub = linkVaultStub(c.env);
  return stub.fetch(c.req.raw);
});

app.get("/api/commits", async (c) => {
  const limit = c.req.query("limit") ?? "100";
  const stub = codeStatsStub(c.env);
  const res = await stub.fetch(
    `https://internal/commits?limit=${encodeURIComponent(limit)}`,
  );
  return new Response(res.body, res);
});

app.post("/api/commits", async (c) => {
  const denied = requirePublishKey(c);
  if (denied) return denied;
  const body = await c.req.json();
  const stub = codeStatsStub(c.env);
  const res = await stub.fetch("https://internal/commits", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return new Response(res.body, res);
});

app.get("/api/commits/ws", async (c) => {
  if (c.req.header("upgrade")?.toLowerCase() !== "websocket") {
    return c.text("expected websocket upgrade", 426);
  }
  const stub = codeStatsStub(c.env);
  return stub.fetch(c.req.raw);
});

app.get("/api/control/devices/:deviceId/connect", async (c) => {
  if (c.req.header("upgrade")?.toLowerCase() !== "websocket") {
    return c.text("expected websocket upgrade", 426);
  }
  const deviceId = c.req.param("deviceId");
  const handshake = await verifyDeviceHandshake(
    c.req.raw,
    deviceId,
    c.env.CONTROL_PLANE_DEVICE_PUBLIC_JWK,
  );
  if (!handshake) return c.json({ error: "unauthorized_device" }, 401);

  const stub = commandRelayStub(c.env, deviceId);
  const fresh = await stub.consumeHandshakeNonce(
    handshake.nonce,
    handshake.deviceId,
  );
  if (!fresh) return c.json({ error: "replayed_device_handshake" }, 409);

  const headers = new Headers(c.req.raw.headers);
  headers.set("x-control-device-verified", handshake.deviceId);
  return stub.fetch(new Request(c.req.raw, { headers }));
});

export default app;
