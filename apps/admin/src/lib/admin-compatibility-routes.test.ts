import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readControlPlane,
  submitControlPlaneProof,
} from "../data/control-plane";
import { requireAdminMutation, type AdminPrincipal } from "./admin-auth";
import {
  publishEditorDraft,
  saveEditorDraft,
  statusError as editorStatusError,
} from "./content-editor";
import { saveDraftOperation } from "./content-draft-operation";
import {
  GET as controlPlaneGet,
  POST as controlPlanePost,
} from "../pages/api/admin/control-plane";
import { POST as editorPost } from "../pages/api/admin/content/editor";
import { POST as draftOperationPost } from "../pages/api/admin/content/draft-operation";

vi.mock("./admin-auth", async (load) => ({
  ...(await load<typeof import("./admin-auth")>()),
  requireAdminMutation: vi.fn(),
}));
vi.mock("../data/control-plane", async (load) => ({
  ...(await load<typeof import("../data/control-plane")>()),
  readControlPlane: vi.fn(),
  submitControlPlaneProof: vi.fn(),
}));
vi.mock("./content-editor", async (load) => ({
  ...(await load<typeof import("./content-editor")>()),
  saveEditorDraft: vi.fn(),
  publishEditorDraft: vi.fn(),
}));
vi.mock("./content-draft-operation", async (load) => ({
  ...(await load<typeof import("./content-draft-operation")>()),
  saveDraftOperation: vi.fn(),
}));

const requireMutation = vi.mocked(requireAdminMutation);
const readRelay = vi.mocked(readControlPlane);
const submitRelay = vi.mocked(submitControlPlaneProof);
const saveDraft = vi.mocked(saveEditorDraft);
const publishDraft = vi.mocked(publishEditorDraft);
const saveOperation = vi.mocked(saveDraftOperation);

const ORIGIN = "https://admin.test";
const LEAK = "D1_ERROR: provider detail from ap-mini relay";
const principal: AdminPrincipal = {
  userId: "user-1",
  role: "owner",
  sessionId: "session-1",
  authMethod: "passkey",
  stepUpAt: "2026-09-14T00:00:00.000Z",
  restriction: null,
  displayName: "Ani",
  credentialId: "credential-12345678",
};

type Body = string | ReadableStream<Uint8Array>;

function streamOf(text: string): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream({
    start(controller) {
      for (let offset = 0; offset < bytes.length; offset += 1024) {
        controller.enqueue(bytes.slice(offset, offset + 1024));
      }
      controller.close();
    },
  });
}

function post(path: string, body: Body, headers: HeadersInit = {}) {
  const request = new Request(`${ORIGIN}${path}`, {
    method: "POST",
    body,
    duplex: "half",
    headers: { "content-type": "application/json", ...headers },
  } as RequestInit);
  return {
    request,
    url: new URL(request.url),
    cookies: { get: () => undefined },
    locals: {
      adminPrincipal: principal,
      runtime: { env: { DB: {}, COMMAND_RELAY: {} } },
    },
  } as never;
}

function get(path: string) {
  const request = new Request(`${ORIGIN}${path}`);
  return {
    request,
    url: new URL(request.url),
    cookies: { get: () => undefined },
    locals: {
      adminPrincipal: principal,
      runtime: { env: { COMMAND_RELAY: {} } },
    },
  } as never;
}

function oversized(bytes: number): string {
  return JSON.stringify({ padding: "x".repeat(bytes) });
}

async function expectBoundedError(
  response: Response,
  status: number,
  error: string,
) {
  expect(response.status).toBe(status);
  const text = await response.text();
  expect(text).not.toContain("D1_ERROR");
  expect(text).not.toContain("provider detail");
  expect(text).not.toMatch(
    /Unexpected|Expected|position|SyntaxError|Cannot read/u,
  );
  expect(JSON.parse(text)).toMatchObject({ ok: false, error });
}

beforeEach(() => {
  vi.stubEnv("DEV", false);
  requireMutation.mockReset().mockResolvedValue(principal);
  readRelay.mockReset();
  submitRelay.mockReset();
  saveDraft.mockReset();
  publishDraft.mockReset();
  saveOperation.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/admin/control-plane", () => {
  it("keeps the relay read state and status unchanged", async () => {
    const state = {
      available: true,
      error: null,
      snapshot: { device_id: "ap-mini", commands: [] },
    } as never;
    readRelay.mockResolvedValue(state);
    const response = await controlPlaneGet(get("/api/admin/control-plane"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(state);
  });

  it("answers an unexpected read failure with a fixed code", async () => {
    readRelay.mockRejectedValue(new Error(LEAK));
    const response = await controlPlaneGet(get("/api/admin/control-plane"));
    await expectBoundedError(response, 503, "control_plane_read_failed");
  });
});

describe("POST /api/admin/control-plane (live control)", () => {
  const path = "/api/admin/control-plane";
  const command = JSON.stringify({
    idempotency_key: "request-1",
    reason: "verify the round trip",
  });

  it("submits the same command and returns the relay record unchanged", async () => {
    const record = { command_id: "command-1", state: "queued" } as never;
    submitRelay.mockResolvedValue(record);
    const response = await controlPlanePost(post(path, command));
    expect(response.status).toBe(202);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(record);
    expect(requireMutation).toHaveBeenCalledWith(
      expect.anything(),
      "control:execute",
    );
    expect(submitRelay).toHaveBeenCalledWith(
      {},
      {
        actorId: "user-1",
        idempotencyKey: "request-1",
        reason: "verify the round trip",
      },
    );
  });

  it("keeps code-owned relay codes", async () => {
    submitRelay.mockRejectedValue(new Error("relay_binding_missing"));
    const response = await controlPlanePost(post(path, command));
    await expectBoundedError(response, 400, "relay_binding_missing");
  });

  it("never returns relay exception text", async () => {
    submitRelay.mockRejectedValue(new Error(LEAK));
    const response = await controlPlanePost(post(path, command));
    await expectBoundedError(response, 400, "control_command_failed");
  });

  it("bounds a streamed body that has no Content-Length", async () => {
    const response = await controlPlanePost(
      post(path, streamOf(oversized(4_096))),
    );
    await expectBoundedError(response, 413, "control_command_too_large");
    expect(submitRelay).not.toHaveBeenCalled();
  });

  it("bounds a body whose Content-Length understates it", async () => {
    const response = await controlPlanePost(
      post(path, streamOf(oversized(4_096)), { "content-length": "64" }),
    );
    await expectBoundedError(response, 413, "control_command_too_large");
    expect(submitRelay).not.toHaveBeenCalled();
  });

  it("rejects malformed and non-object JSON with fixed codes", async () => {
    await expectBoundedError(
      await controlPlanePost(post(path, "{not json")),
      400,
      "invalid_json",
    );
    await expectBoundedError(
      await controlPlanePost(post(path, "null")),
      400,
      "invalid_control_command_request",
    );
    expect(submitRelay).not.toHaveBeenCalled();
  });

  it("passes guard responses through untouched", async () => {
    requireMutation.mockRejectedValue(
      Response.json({ error: "fresh_passkey_required" }, { status: 403 }),
    );
    const response = await controlPlanePost(post(path, command));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "fresh_passkey_required" });
  });
});

describe("POST /api/admin/content/editor (publish write)", () => {
  const path = "/api/admin/content/editor";
  const saveBody = { action: "save_draft", title: "Draft", body: "Text" };
  const publishBody = { action: "publish", operation_id: "operation-1" };

  it("saves a draft with the same capability, actor and response", async () => {
    const result = { ok: true, operation_id: "operation-1" } as never;
    saveDraft.mockResolvedValue(result);
    const response = await editorPost(post(path, JSON.stringify(saveBody)));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(result);
    expect(requireMutation).toHaveBeenCalledWith(
      expect.anything(),
      "draft:save",
    );
    expect(saveDraft).toHaveBeenCalledWith({}, saveBody, {
      id: "user-1",
      display_name: "Ani",
      credential_id_hint: "12345678",
    });
  });

  it("publishes with the same capability and response", async () => {
    const result = { ok: true, status: "published" } as never;
    publishDraft.mockResolvedValue(result);
    const response = await editorPost(post(path, JSON.stringify(publishBody)));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(result);
    expect(requireMutation).toHaveBeenCalledWith(
      expect.anything(),
      "content:publish",
    );
  });

  it("keeps code-owned editor responses", async () => {
    publishDraft.mockRejectedValue(
      editorStatusError(409, "duplicate_public_slug"),
    );
    await expectBoundedError(
      await editorPost(post(path, JSON.stringify(publishBody))),
      409,
      "duplicate_public_slug",
    );
  });

  it("never returns storage exception text", async () => {
    publishDraft.mockRejectedValue(new Error(LEAK));
    await expectBoundedError(
      await editorPost(post(path, JSON.stringify(publishBody))),
      400,
      "content_editor_failed",
    );
  });

  it("bounds a streamed body before parsing", async () => {
    const huge = JSON.stringify({ ...saveBody, body: "x".repeat(1_048_576) });
    await expectBoundedError(
      await editorPost(post(path, streamOf(huge))),
      413,
      "request_too_large",
    );
    await expectBoundedError(
      await editorPost(post(path, streamOf(huge), { "content-length": "128" })),
      413,
      "request_too_large",
    );
    expect(saveDraft).not.toHaveBeenCalled();
  });

  it("rejects malformed and non-object JSON with fixed codes", async () => {
    await expectBoundedError(
      await editorPost(post(path, "{not json")),
      400,
      "invalid_json",
    );
    await expectBoundedError(
      await editorPost(post(path, "null")),
      400,
      "unknown_editor_action",
    );
    expect(saveDraft).not.toHaveBeenCalled();
    expect(publishDraft).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/content/draft-operation", () => {
  const path = "/api/admin/content/draft-operation";
  const operation = {
    page_key: "home",
    field_path: "hero.title",
    proposed_value: "Hello",
  };

  it("saves the same operation and returns the result unchanged", async () => {
    const result = {
      ok: true,
      operation_id: "operation-1",
      status: "draft",
      next_safe_action: "review",
    } as never;
    saveOperation.mockResolvedValue(result);
    const response = await draftOperationPost(
      post(path, JSON.stringify(operation)),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(result);
    expect(requireMutation).toHaveBeenCalledWith(
      expect.anything(),
      "draft:save",
    );
    expect(saveOperation).toHaveBeenCalledWith({}, operation);
  });

  it("never returns storage exception text", async () => {
    saveOperation.mockRejectedValue(new Error(LEAK));
    await expectBoundedError(
      await draftOperationPost(post(path, JSON.stringify(operation))),
      400,
      "draft_save_failed",
    );
  });

  it("bounds a streamed body before parsing", async () => {
    const huge = JSON.stringify({
      ...operation,
      proposed_value: "x".repeat(262_144),
    });
    await expectBoundedError(
      await draftOperationPost(post(path, streamOf(huge))),
      413,
      "request_too_large",
    );
    await expectBoundedError(
      await draftOperationPost(
        post(path, streamOf(huge), { "content-length": "16" }),
      ),
      413,
      "request_too_large",
    );
    expect(saveOperation).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON with a fixed code", async () => {
    await expectBoundedError(
      await draftOperationPost(post(path, "{not json")),
      400,
      "invalid_json",
    );
    expect(saveOperation).not.toHaveBeenCalled();
  });
});
