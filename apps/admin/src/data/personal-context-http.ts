import { readBoundedBytes } from "../lib/bounded-body";
import { discardBody } from "../lib/response-body";

/** A trusted transport outcome, never a provider error body or private URL. */
export class PersonalContextHttpError extends Error {
  constructor(readonly status: number) {
    super("Private reader request failed");
    this.name = "PersonalContextHttpError";
  }
}

/** Used by an approved HTTP transport; this does not establish or grant access. */
export async function readPersonalContextResponse(
  response: Response,
): Promise<unknown> {
  if (!response.ok) {
    discardBody(response);
    throw new PersonalContextHttpError(response.status);
  }
  if (
    !response.headers
      .get("content-type")
      ?.toLowerCase()
      .includes("application/json") ||
    !response.body
  ) {
    discardBody(response);
    throw new Error("Unsupported reader response");
  }
  const bytes = await readBoundedBytes(response.body, 1024 * 1024);
  if (!bytes) throw new Error("Reader response exceeds limit");
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}
