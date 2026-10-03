/** Read-only smoke for the private LinkVault boundary. No payload is printed. */
export {};

const base = process.argv[2] ?? "http://localhost:8787";
const url = `${base.replace(/\/$/, "")}/api/links`;

const denied = await fetch(url);
if (denied.status !== 401 && denied.status !== 503) {
  throw new Error(`unauthenticated LinkVault read returned ${denied.status}`);
}
console.log(`unauthenticated read: ${denied.status}`);

const readKey = process.env.STATE_READ_KEY;
if (!readKey) {
  console.log("authorized read: skipped (STATE_READ_KEY unavailable)");
  process.exit(0);
}

const authorized = await fetch(url, {
  headers: { Authorization: `Bearer ${readKey}` },
});
if (authorized.status !== 200) {
  throw new Error(`authorized LinkVault read returned ${authorized.status}`);
}
const payload: unknown = await authorized.json();
if (
  !payload ||
  typeof payload !== "object" ||
  !("links" in payload) ||
  !Array.isArray(payload.links)
) {
  throw new Error("authorized LinkVault response shape is invalid");
}
console.log("authorized read: 200 with links array");
