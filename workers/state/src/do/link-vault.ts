import { DurableObject } from "cloudflare:workers";
import type { Link, LinkVaultEvent, LinkVaultSummary } from "../types";

/** How many links are held and the newest parseable savedAt, kept on every
 * write outside the `link:` prefix so GET /health reads two keys instead of
 * listing the vault. */
export const HELD_KEY = "meta:held";
export const NEWEST_KEY = "meta:last_saved_at";

/** The newest parseable savedAt of some links, as an ISO string. */
function newestSaved(links: Iterable<Link>): string | null {
  let newest: number | null = null;
  for (const link of links) {
    const ms = Date.parse(link.savedAt);
    if (Number.isFinite(ms) && (newest === null || ms > newest)) newest = ms;
  }
  return newest === null ? null : new Date(newest).toISOString();
}

/**
 * LinkVault: stores user-saved links. Single named DO instance ("default")
 * holds the whole collection. Keys: `link:<sortableId>`. Hibernated
 * WebSockets fan out mutations to every connected client in real time.
 */
export class LinkVault extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
      return this.handleWebSocketUpgrade();
    }

    if (url.pathname === "/links" && request.method === "GET") {
      const links = await this.list();
      return Response.json({ links });
    }

    if (url.pathname === "/summary" && request.method === "GET") {
      return Response.json(await this.summary());
    }

    if (url.pathname === "/links" && request.method === "POST") {
      const payload = (await request.json()) as Partial<Link>;
      if (!payload.url || typeof payload.url !== "string") {
        return Response.json({ error: "url is required" }, { status: 400 });
      }
      const link = await this.add(payload as Pick<Link, "url"> & Partial<Link>);
      return Response.json({ link });
    }

    if (url.pathname.startsWith("/links/") && request.method === "DELETE") {
      const id = url.pathname.slice("/links/".length);
      await this.remove(id);
      return Response.json({ ok: true });
    }

    return new Response("not found", { status: 404 });
  }

  private async list(): Promise<Link[]> {
    const map = await this.ctx.storage.list<Link>({ prefix: "link:" });
    return Array.from(map.values()).sort((a, b) =>
      b.savedAt.localeCompare(a.savedAt),
    );
  }

  /** Feeds GET /health: a count and the newest parseable savedAt, nothing
   * else. Two key reads; the vault is listed once only, for links saved
   * before the counts were kept. */
  private async summary(): Promise<LinkVaultSummary> {
    const held = await this.ctx.storage.get<unknown>(HELD_KEY);
    if (typeof held !== "number") return this.recount();
    const newest = await this.ctx.storage.get<unknown>(NEWEST_KEY);
    return {
      held,
      last_saved_at: typeof newest === "string" ? newest : null,
    };
  }

  /** Counts the vault and keeps the result, from a listing already made or
   * a fresh one. */
  private async recount(map?: Map<string, Link>): Promise<LinkVaultSummary> {
    const links =
      map ?? (await this.ctx.storage.list<Link>({ prefix: "link:" }));
    const summary = {
      held: links.size,
      last_saved_at: newestSaved(links.values()),
    };
    await this.ctx.storage.put(HELD_KEY, summary.held);
    await this.ctx.storage.put(NEWEST_KEY, summary.last_saved_at);
    return summary;
  }

  private async add(input: Pick<Link, "url"> & Partial<Link>): Promise<Link> {
    const id = input.id ?? crypto.randomUUID();
    const link: Link = {
      id,
      url: input.url,
      title: input.title,
      tag: input.tag,
      note: input.note,
      source: input.source ?? "manual",
      savedAt: input.savedAt ?? new Date().toISOString(),
    };
    const key = `link:${link.savedAt}:${id}`;
    const existed = (await this.ctx.storage.get(key)) !== undefined;
    await this.ctx.storage.put(key, link);
    const held = await this.ctx.storage.get<unknown>(HELD_KEY);
    if (typeof held !== "number") await this.recount();
    else {
      if (!existed) await this.ctx.storage.put(HELD_KEY, held + 1);
      const newest = await this.ctx.storage.get<unknown>(NEWEST_KEY);
      const saved = Date.parse(link.savedAt);
      if (
        Number.isFinite(saved) &&
        !(typeof newest === "string" && Date.parse(newest) >= saved)
      )
        await this.ctx.storage.put(NEWEST_KEY, new Date(saved).toISOString());
    }
    this.broadcast({ type: "link.added", link });
    return link;
  }

  private async remove(id: string): Promise<void> {
    const map = await this.ctx.storage.list<Link>({ prefix: "link:" });
    for (const [key, link] of map) {
      if (link.id === id) {
        await this.ctx.storage.delete(key);
        map.delete(key);
        // The listing is in hand, so the counts come from it.
        await this.recount(map);
        break;
      }
    }
    this.broadcast({ type: "link.removed", id });
  }

  private async handleWebSocketUpgrade(): Promise<Response> {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);
    const links = await this.list();
    server.send(this.serialize({ type: "snapshot", links }));
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    // Client to server messages are not used yet. Echo for liveness check.
    if (typeof message === "string" && message === "ping") {
      ws.send("pong");
    }
  }

  webSocketClose(_ws: WebSocket, _code: number, _reason: string): void {
    // Hibernated WebSockets are cleaned up automatically by acceptWebSocket.
  }

  private broadcast(event: LinkVaultEvent): void {
    const data = this.serialize(event);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(data);
      } catch {
        // Closed sockets get cleaned up on the next storage tick.
      }
    }
  }

  private serialize(event: LinkVaultEvent): string {
    return JSON.stringify(event);
  }
}
