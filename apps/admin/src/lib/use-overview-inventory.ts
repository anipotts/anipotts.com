import { useEffect, useState } from "react";
import { provideSearchEntries } from "./admin-search-index";
import type { OverviewContentSnapshot } from "./overview-inventory";
import { protectedAdminJson } from "./protected-admin-json";

type Result = {
  url: string;
  attempt: number;
  snapshot?: OverviewContentSnapshot;
  failed: boolean;
};

export function useOverviewInventory(url?: string, fetcher?: typeof fetch) {
  const [attempt, setAttempt] = useState(0);
  const [completed, setCompleted] = useState<Result>();
  const previous = completed?.url === url ? completed : undefined;
  const snapshot = previous?.snapshot;
  const loading = Boolean(url && previous?.attempt !== attempt);
  const failed = previous?.failed ?? false;

  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(10_000),
    ]);
    void (async () => {
      try {
        const response = await protectedAdminJson(url, { signal }, fetcher);
        if (!response.ok) throw new Error("inventory_unavailable");
        const snapshot = (await response.json()) as OverviewContentSnapshot;
        if (!controller.signal.aborted)
          setCompleted({ url, attempt, snapshot, failed: false });
      } catch {
        if (!controller.signal.aborted)
          setCompleted((previous) => ({
            url,
            attempt,
            snapshot: previous?.url === url ? previous.snapshot : undefined,
            failed: true,
          }));
      }
    })();
    return () => controller.abort();
  }, [url, attempt, fetcher]);

  useEffect(
    () =>
      snapshot && !failed
        ? provideSearchEntries("content:overview", snapshot.searchEntries)
        : undefined,
    [snapshot, failed],
  );

  return {
    snapshot,
    loading,
    failed,
    retry: () => setAttempt((current) => current + 1),
  };
}
