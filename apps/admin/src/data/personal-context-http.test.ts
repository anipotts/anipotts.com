import { expect, it } from "vitest";
import { readPersonalContext } from "./personal-context";
import { readPersonalContextResponse } from "./personal-context-http";

it.each([
  [401, "denied"],
  [403, "denied"],
  [404, "not_found"],
  [400, "invalid"],
  [503, "unavailable"],
] as const)(
  "maps HTTP %s without returning provider content",
  async (status, state) => {
    const result = await readPersonalContext(
      { method: "get", id: "synthetic" },
      {
        scope: "owner",
        protocol: "personal_context_data_v1",
        read: async () =>
          readPersonalContextResponse(
            new Response("private provider detail", { status }),
          ),
      },
    );
    expect(result.state).toBe(state);
    expect(JSON.stringify(result)).not.toContain("private provider detail");
  },
);
it("does not mistake a missing endpoint for a missing record", async () => {
  const result = await readPersonalContext(
    { method: "status" },
    {
      scope: "owner",
      protocol: "personal_context_data_v1",
      read: async () =>
        readPersonalContextResponse(new Response(null, { status: 404 })),
    },
  );
  expect(result.state).toBe("unavailable");
});
it("caps successful bodies before parsing, without trusting content length", async () => {
  const response = new Response('"' + "x".repeat(1024 * 1024) + '"', {
    headers: { "content-type": "application/json", "content-length": "2" },
  });
  await expect(readPersonalContextResponse(response)).rejects.toThrow(
    "exceeds limit",
  );
});
it("accepts JSON and rejects login HTML", async () => {
  await expect(
    readPersonalContextResponse(Response.json({ data: null })),
  ).resolves.toEqual({ data: null });
  await expect(
    readPersonalContextResponse(
      new Response("login", { headers: { "content-type": "text/html" } }),
    ),
  ).rejects.toThrow("Unsupported reader response");
});
