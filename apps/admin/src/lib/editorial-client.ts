/** Browser side of the editorial boundary: the same-origin CSRF token that
 * every owner write and credential issuance carries. */
export async function readEditorialCsrf(): Promise<string> {
  const response = await fetch("/api/editorial/csrf", {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) throw new Error("CSRF unavailable");
  const body = (await response.json()) as { csrf?: unknown };
  if (typeof body.csrf !== "string") throw new Error("CSRF unavailable");
  return body.csrf;
}
