/** Read-only capability check. An empty publication bucket is healthy. */
export interface PublicationReadinessBindings {
  CONTENT_DB?: {
    prepare(sql: string): { first<T>(): Promise<T | null> };
  };
  CONTENT_MEDIA?: { head(key: string): Promise<unknown> };
}

export async function publicationReadiness(
  env: PublicationReadinessBindings | undefined,
): Promise<{ content_runtime: 0 | 1; content_media: 0 | 1 }> {
  const unavailable = { content_runtime: 0, content_media: 0 } as const;
  if (!env?.CONTENT_DB || !env.CONTENT_MEDIA) return unavailable;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const checks = Promise.all([
      env.CONTENT_DB.prepare(
        "SELECT i.version FROM editorial_published_inventory i LEFT JOIN editorial_published_active a ON 0 LEFT JOIN editorial_published_revisions r ON r.publication_id = a.publication_id WHERE i.singleton = 1 LIMIT 1",
      ).first<{ version: number }>(),
      // No object is created or disclosed. null proves a successful lookup in
      // an empty bucket; a missing or inaccessible binding rejects the check.
      env.CONTENT_MEDIA.head("__readiness__/publication-media"),
    ]).then(([inventory]) => ({
      content_runtime:
        Number.isSafeInteger(inventory?.version) && inventory!.version >= 0
          ? (1 as const)
          : (0 as const),
      content_media: 1 as const,
    }));
    return await Promise.race([
      checks,
      new Promise<typeof unavailable>((resolve) => {
        timeout = setTimeout(() => resolve(unavailable), 3000);
      }),
    ]);
  } catch {
    return unavailable;
  } finally {
    clearTimeout(timeout);
  }
}
