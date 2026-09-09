import { GitHubFailure } from "./github";
import {
  PublicationJobs,
  type PublishJob,
  type PublishOutcome,
} from "./publication-jobs";

/** One bounded provider stage per alarm. Each stage must reconcile ambiguous
 * writes using the frozen operation ID before sending another provider write.
 */
export async function publicationAlarm(
  storage: DurableObjectStorage,
  jobs: PublicationJobs,
  advance: (job: PublishJob) => Promise<PublishOutcome>,
  clock: () => number = Date.now,
  onLive?: (job: PublishJob) => void,
): Promise<void> {
  const claim = jobs.claim(clock());
  if (!claim) {
    const next = jobs.nextWake(clock());
    if (next !== null) await storage.setAlarm(next);
    return;
  }
  // Persist recovery BEFORE external I/O. A crash after a successful provider
  // write must not depend on the browser or the platform's six automatic retries.
  await storage.setAlarm(claim.leaseUntil);
  let outcome: PublishOutcome;
  try {
    outcome = await advance(claim);
  } catch (error) {
    if (
      error instanceof GitHubFailure &&
      [
        "unauthorized",
        "rejected",
        "invalid_response",
        "unexpected_branch",
        "publication_base_changed",
      ].includes(error.code)
    ) {
      outcome = { blocked: error.code };
    } else {
      const backoff = Math.min(
        3_600_000,
        5000 * 2 ** Math.min(claim.attempts - 1, 10),
      );
      const providerDelay =
        error instanceof GitHubFailure ? error.retryAfterMs : 0;
      outcome = { retryAt: clock() + Math.max(backoff, providerDelay) };
    }
  }
  storage.transactionSync(() => {
    if (jobs.settle(claim, outcome, clock()) && outcome.next === "live")
      onLive?.(claim);
  });
  // Leave the pre-armed recovery alarm in place if a completion is stale; its
  // lease holder owns subsequent progress. Never delete another request's alarm.
  const next = jobs.nextWake(clock());
  if (next !== null) await storage.setAlarm(next);
}
