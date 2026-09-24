import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { activeVersion } from "./worker-version.mjs";

const config = "apps/admin/wrangler.toml";
const providerFailure = "editorial provider verification failed";
const identityMismatch = "editorial release identity mismatch";
/** Waits between provider identity attempts: four attempts, 35s of waiting. */
const identityRetryDelays = [5_000, 10_000, 20_000];

function wrangler(args, exec = execFileSync) {
  try {
    return JSON.parse(
      exec(
        "pnpm",
        ["exec", "wrangler", ...args, "--config", config, "--json"],
        {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          maxBuffer: 2 * 1024 * 1024,
        },
      ),
    );
  } catch {
    // Provider stderr and output may contain account information, so neither
    // the exit error nor a parse error that quotes the output leaves here.
    throw new Error(providerFailure);
  }
}

/** The version message the deploy step writes: the release and the schema
 * version its build bakes in (PUBLIC_RELEASE_SCHEMA_VERSION), from the same
 * release job output. */
export function editorialVersionMessage(expectedSha, expectedSchema) {
  return `release:${expectedSha} schema:${expectedSchema}`;
}

/** A-33: the editorial path cannot read admin's /api/health behind Access, so
 * the active version's message carries the schema version, and a version
 * deployed for another release or another schema fails the release. */
export function verifyEditorialVersion(
  deployment,
  version,
  expectedSha,
  expectedSchema,
) {
  if (
    !/^[a-f0-9]{40}$/.test(expectedSha ?? "") ||
    !/^\d{4}$/.test(expectedSchema ?? "") ||
    activeVersion(deployment) !== version.id ||
    version.annotations?.["workers/message"] !==
      editorialVersionMessage(expectedSha, expectedSchema)
  )
    throw new Error(identityMismatch);
  return {
    version: version.id,
    release_sha: expectedSha,
    schema_version: expectedSchema,
  };
}

/** Provider metadata can lag an upload by a few seconds, and the Cloudflare API
 * occasionally fails transiently. Retry the read-only identity check a bounded
 * number of times; a mismatch that never resolves still fails the release.
 */
export async function verifyEditorialIdentity(
  expectedSha,
  expectedSchema,
  {
    exec = execFileSync,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  } = {},
) {
  if (
    !/^[a-f0-9]{40}$/.test(expectedSha ?? "") ||
    !/^\d{4}$/.test(expectedSchema ?? "")
  )
    throw new Error(identityMismatch);
  for (let attempt = 0; ; attempt += 1) {
    try {
      const deployment = wrangler(["deployments", "status"], exec);
      const version = wrangler(
        ["versions", "view", activeVersion(deployment)],
        exec,
      );
      return verifyEditorialVersion(
        deployment,
        version,
        expectedSha,
        expectedSchema,
      );
    } catch (error) {
      if (attempt >= identityRetryDelays.length) throw error;
      await sleep(identityRetryDelays[attempt]);
    }
  }
}

/** Access has one human owner, so a service-token smoke identity must not be
 * granted editor access. Verify deployment identity with provider metadata and
 * probe denial independently. Signed-in owner proof is recorded at activation.
 */
export async function verifyEditorialBoundary(fetchImpl = fetch) {
  const checks = [];
  for (const path of [
    "/content",
    "/content/home/home",
    "/api/editorial/record",
    "/preview/home?revision=1",
    "/inbox",
    "/proof",
    "/deploys",
    "/api/private-reader/credential",
  ]) {
    const response = await fetchImpl(`https://admin.anipotts.com${path}`, {
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    await response.body?.cancel();
    let allowed = [401, 403].includes(response.status);
    if ([302, 303].includes(response.status)) {
      const location = new URL(
        response.headers.get("Location") || "/",
        "https://admin.anipotts.com",
      );
      allowed =
        location.origin === "https://anipotts.cloudflareaccess.com" &&
        location.pathname.startsWith("/cdn-cgi/access/login/");
    }
    if (!allowed) throw new Error(`editorial owner boundary failed at ${path}`);
    checks.push({ path, status: response.status });
  }
  return checks;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const mode = process.argv[2];
    if (mode === "capture") {
      const deployment = wrangler(["deployments", "status"]);
      console.log(`previous_version=${activeVersion(deployment)}`);
    } else if (mode === "boundary") {
      console.log(JSON.stringify({ checks: await verifyEditorialBoundary() }));
    } else if (mode === "verify") {
      const identity = await verifyEditorialIdentity(
        process.argv[3],
        process.argv[4],
      );
      console.log(
        JSON.stringify({
          ...identity,
          checks: await verifyEditorialBoundary(),
        }),
      );
    } else
      throw new Error(
        "expected capture, boundary, or verify <release-sha> <schema-version>",
      );
  } catch (error) {
    // Provider stderr may contain account information; report a bounded failure.
    console.error(error?.status ? providerFailure : error.message);
    process.exitCode = 1;
  }
}
