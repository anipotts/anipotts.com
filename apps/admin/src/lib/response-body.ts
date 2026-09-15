/**
 * Release a response body the caller will not read. An unread error body keeps
 * the request open until its abort timeout, which holds the connection and
 * delays everything waiting on the network to go quiet.
 */
export function discardBody(response: Response): void {
  if (response.bodyUsed) return;
  void response.body?.cancel().catch(() => undefined);
}
