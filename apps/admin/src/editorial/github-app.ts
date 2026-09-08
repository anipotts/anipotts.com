import { createPrivateKey } from "node:crypto";
import { importPKCS8, SignJWT } from "jose";
import { GitHubFailure } from "./github";

// Server configuration only. Never accept these fields from an editorial request.
export type PublisherApp = {
  issuer: string;
  installationId: number;
  repositoryId: number;
  privateKey: string;
};
const permissions = {
  contents: "write",
  pull_requests: "write",
  checks: "read",
  statuses: "read",
  deployments: "read",
  actions: "read",
  administration: "read",
  metadata: "read",
} as const;

/** Mint only inside an authorized server job. No token is persisted or logged.
 * Accept GitHub's RSA PEM as well as PKCS8; nodejs_compat is required.
 */
export async function publisherInstallationToken(
  app: PublisherApp,
  transport: typeof fetch = fetch,
  now = Date.now(),
): Promise<string> {
  if (
    !/^[A-Za-z0-9_.-]{1,100}$/.test(app.issuer) ||
    !Number.isSafeInteger(app.installationId) ||
    app.installationId <= 0 ||
    !Number.isSafeInteger(app.repositoryId) ||
    app.repositoryId <= 0 ||
    !Number.isFinite(now)
  )
    throw new GitHubFailure("unauthorized");
  let jwt: string;
  try {
    const pem = createPrivateKey(app.privateKey).export({
      type: "pkcs8",
      format: "pem",
    });
    const key = await importPKCS8(String(pem), "RS256");
    const seconds = Math.floor(now / 1000);
    jwt = await new SignJWT({})
      .setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .setIssuer(app.issuer)
      .setIssuedAt(seconds - 60)
      .setExpirationTime(seconds + 540)
      .sign(key);
  } catch {
    throw new GitHubFailure("unauthorized");
  }
  let response: Response;
  try {
    response = await transport(
      `https://api.github.com/app/installations/${app.installationId}/access_tokens`,
      {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
        headers: {
          Authorization: `Bearer ${jwt}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "anipotts-editorial",
        },
        body: JSON.stringify({
          repository_ids: [app.repositoryId],
          permissions,
        }),
      },
    );
  } catch {
    throw new GitHubFailure("unavailable");
  }
  if (
    response.status === 429 ||
    (response.status === 403 &&
      (response.headers.has("Retry-After") ||
        response.headers.get("X-RateLimit-Remaining") === "0"))
  ) {
    const seconds = Number(response.headers.get("Retry-After"));
    const reset =
      Number(response.headers.get("X-RateLimit-Reset")) * 1000 - now;
    throw new GitHubFailure(
      "rate_limited",
      Math.min(
        3_600_000,
        Math.max(
          1000,
          seconds > 0 ? seconds * 1000 : reset > 0 ? reset : 60_000,
        ),
      ),
    );
  }
  if (response.status === 401 || response.status === 403)
    throw new GitHubFailure("unauthorized");
  if (response.status >= 500) throw new GitHubFailure("unavailable");
  if (response.status !== 201) throw new GitHubFailure("rejected");
  // Bound provider JSON even if Content-Length is absent or misleading.
  let value: unknown;
  try {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let text = "",
      size = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > 65_536) {
          await reader.cancel();
          throw new Error();
        }
        text += decoder.decode(part.value, { stream: true });
      }
      value = JSON.parse(text + decoder.decode());
    } finally {
      reader.releaseLock();
    }
  } catch {
    throw new GitHubFailure("invalid_response");
  }
  const record = (v: unknown): Record<string, unknown> =>
    v !== null && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : {};
  const data = record(value);
  const expires =
    typeof data.expires_at === "string" ? Date.parse(data.expires_at) : NaN;
  const repos = data.repositories;
  const granted = record(data.permissions);
  if (
    typeof data.token !== "string" ||
    !/^[A-Za-z0-9_.-]{20,16384}$/.test(data.token) ||
    !Number.isFinite(expires) ||
    expires <= now + 60_000 ||
    expires > now + 3_660_000 ||
    !Array.isArray(repos) ||
    repos.length !== 1 ||
    record(repos[0]).id !== app.repositoryId ||
    record(repos[0]).full_name !== "anipotts/anipotts.com" ||
    Object.entries(permissions).some(
      ([name, level]) => granted[name] !== level,
    ) ||
    Object.keys(granted).some((name) => !Object.hasOwn(permissions, name))
  )
    throw new GitHubFailure("invalid_response");
  return data.token;
}
