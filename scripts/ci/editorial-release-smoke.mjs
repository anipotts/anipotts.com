import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { activeVersion } from "./worker-version.mjs";

const config = "apps/admin/wrangler.toml";
function wrangler(args) {
  return JSON.parse(
    execFileSync(
      "pnpm",
      ["exec", "wrangler", ...args, "--config", config, "--json"],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: 2 * 1024 * 1024,
      },
    ),
  );
}

export function verifyEditorialVersion(deployment, version, expectedSha) {
  if (
    !/^[a-f0-9]{40}$/.test(expectedSha) ||
    activeVersion(deployment) !== version.id ||
    version.annotations?.["workers/message"] !== `release:${expectedSha}`
  )
    throw new Error("editorial release identity mismatch");
  return { version: version.id, release_sha: expectedSha };
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
      const deployment = wrangler(["deployments", "status"]);
      const version = wrangler(["versions", "view", activeVersion(deployment)]);
      const identity = verifyEditorialVersion(
        deployment,
        version,
        process.argv[3],
      );
      console.log(
        JSON.stringify({
          ...identity,
          checks: await verifyEditorialBoundary(),
        }),
      );
    } else
      throw new Error("expected capture, boundary, or verify <release-sha>");
  } catch (error) {
    // Provider stderr may contain account information; report a bounded failure.
    console.error(
      error?.status ? "editorial provider verification failed" : error.message,
    );
    process.exitCode = 1;
  }
}
