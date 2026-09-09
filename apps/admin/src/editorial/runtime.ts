/// <reference types="astro/client" />
import type { EditorialRecord } from "@anipotts/content/editorial/source";
import { EditorialGitHub } from "./github";
import { publisherInstallationToken } from "./github-app";
import { signPublication } from "./publication-signature";
import { releaseReadiness, verifyPublishedContent } from "./release";

/** Parse deployment-owned bindings. Browser input cannot select identities,
 * repositories, keys, release origins or an enabled publisher.
 */
export function editorialRuntime(
  env: unknown,
  transport: typeof fetch = fetch,
  adminRelease = import.meta.env.PUBLIC_RELEASE_SHA || "dev",
) {
  if (!env || typeof env !== "object") return null;
  const values = env as Record<string, unknown>;
  const string = (name: string) =>
    typeof values[name] === "string" ? (values[name] as string) : "";
  if (string("EDITORIAL_ENABLED") !== "true") return null;
  const app = {
    issuer: string("EDITORIAL_GITHUB_APP_ID"),
    installationId: Number(string("EDITORIAL_GITHUB_INSTALLATION_ID")),
    repositoryId: 1107959197,
    privateKey: string("EDITORIAL_GITHUB_PRIVATE_KEY"),
  };
  if (
    !app.issuer ||
    !Number.isSafeInteger(app.installationId) ||
    app.installationId <= 0 ||
    !app.privateKey
  )
    return null;
  // Cache only within this request/alarm instance, never across Workers requests.
  let token: Promise<string> | undefined;
  const signingKey = string("EDITORIAL_SIGNING_PRIVATE_KEY");
  const git = new EditorialGitHub(
    () => (token ??= publisherInstallationToken(app, transport)),
    transport,
    signingKey
      ? (publication, head) => signPublication(publication, head, signingKey)
      : undefined,
  );
  return {
    git,
    publishing:
      string("EDITORIAL_PUBLISH_ENABLED") === "true" &&
      Boolean(signingKey) &&
      /^[a-f0-9]{40}$/.test(adminRelease),
    ready: releaseReadiness(git, adminRelease, transport),
    verify: (
      publication: Parameters<typeof verifyPublishedContent>[0],
      merge: string,
    ) => verifyPublishedContent(publication, merge, git, transport),
    async readBase(record: EditorialRecord) {
      const base = await git.readBase(record);
      if (!base.file) throw new Error("record_not_found");
      return {
        baseCommit: base.head,
        baseFileHash: base.file.sha,
        source: await git.readContentSource({
          record,
          path: base.file.path,
          sha: base.file.sha,
        }),
      };
    },
  };
}
