import { DurableObject } from "cloudflare:workers";
import type { CodeStatsEvent, CodeStatsSummary, Commit } from "../types";

const MAX_COMMITS = 500;

/**
 * When a producer last reached this object with at least one well-formed
 * commit, new or already held. Kept outside the `commit:` prefix so the
 * window and trim never see it.
 */
export const RECEIVED_KEY = "meta:last_received_at";

/**
 * CodeStats: stores recent git commits across Ani's local repos. Single
 * named instance ("default") holds the rolling window. Keys:
 * `commit:<ts>:<sha>` so storage.list returns newest-first when reversed.
 * Hibernated WebSockets fan out new commits to every connected client.
 */
export class CodeStats extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
      return this.handleWebSocketUpgrade();
    }

    if (url.pathname === "/commits" && request.method === "GET") {
      const limit = Number(url.searchParams.get("limit") ?? "100");
      const commits = await this.list(limit);
      return Response.json({ commits });
    }

    if (url.pathname === "/summary" && request.method === "GET") {
      return Response.json(await this.summary());
    }

    if (url.pathname === "/commits" && request.method === "POST") {
      const payload = (await request.json()) as
        Partial<Commit> | { commits: Partial<Commit>[] };

      const incoming: Partial<Commit>[] = Array.isArray(
        (payload as { commits?: unknown }).commits,
      )
        ? (payload as { commits: Partial<Commit>[] }).commits
        : [payload as Partial<Commit>];

      const accepted: Commit[] = [];
      let wellFormed = 0;
      for (const raw of incoming) {
        if (!raw.sha || !raw.repo || !raw.ts) continue;
        wellFormed += 1;
        const commit: Commit = {
          sha: raw.sha,
          repo: raw.repo,
          subject: raw.subject ?? "",
          author: raw.author ?? "",
          ts: raw.ts,
          branch: raw.branch,
          parentCount: raw.parentCount,
        };
        const key = `commit:${commit.ts}:${commit.sha}`;
        const existing = await this.ctx.storage.get<Commit>(key);
        if (existing) continue;
        await this.ctx.storage.put(key, commit);
        accepted.push(commit);
        this.broadcast({ type: "commit.added", commit });
      }

      await this.trimToMax();
      if (wellFormed > 0) {
        await this.ctx.storage.put(RECEIVED_KEY, new Date().toISOString());
      }
      return Response.json({ accepted: accepted.length });
    }

    return new Response("not found", { status: 404 });
  }

  private async list(limit: number): Promise<Commit[]> {
    const map = await this.ctx.storage.list<Commit>({
      prefix: "commit:",
      reverse: true,
      limit,
    });
    return Array.from(map.values());
  }

  /** Feeds GET /health: a count and the last receipt, nothing else. */
  private async summary(): Promise<CodeStatsSummary> {
    const held = await this.ctx.storage.list({ prefix: "commit:" });
    const last = await this.ctx.storage.get<string>(RECEIVED_KEY);
    return {
      held: held.size,
      last_received_at: typeof last === "string" ? last : null,
    };
  }

  private async trimToMax(): Promise<void> {
    const map = await this.ctx.storage.list<Commit>({ prefix: "commit:" });
    if (map.size <= MAX_COMMITS) return;
    const overflow = map.size - MAX_COMMITS;
    const keysToDelete: string[] = [];
    for (const key of map.keys()) {
      if (keysToDelete.length >= overflow) break;
      keysToDelete.push(key);
    }
    if (keysToDelete.length > 0) {
      await this.ctx.storage.delete(keysToDelete);
    }
  }

  private async handleWebSocketUpgrade(): Promise<Response> {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);
    const commits = await this.list(100);
    server.send(this.serialize({ type: "snapshot", commits }));
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    if (typeof message === "string" && message === "ping") {
      ws.send("pong");
    }
  }

  webSocketClose(_ws: WebSocket, _code: number, _reason: string): void {
    // Hibernated WebSockets clean up automatically.
  }

  private broadcast(event: CodeStatsEvent): void {
    const data = this.serialize(event);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(data);
      } catch {
        // Closed sockets get cleaned up on the next storage tick.
      }
    }
  }

  private serialize(event: CodeStatsEvent): string {
    return JSON.stringify(event);
  }
}
