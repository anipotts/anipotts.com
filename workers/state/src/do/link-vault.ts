import { DurableObject } from "cloudflare:workers";
import type { Link, LinkVaultEvent, LinkVaultSummary } from "../types";

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

  /** Feeds GET /health: a count and the newest parseable savedAt, nothing else. */
  private async summary(): Promise<LinkVaultSummary> {
    const map = await this.ctx.storage.list<Link>({ prefix: "link:" });
    let newest: number | null = null;
    for (const link of map.values()) {
      const ms = Date.parse(link.savedAt);
      if (Number.isFinite(ms) && (newest === null || ms > newest)) newest = ms;
    }
    return {
      held: map.size,
      last_saved_at: newest === null ? null : new Date(newest).toISOString(),
    };
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
    await this.ctx.storage.put(`link:${link.savedAt}:${id}`, link);
    this.broadcast({ type: "link.added", link });
    return link;
  }

  private async remove(id: string): Promise<void> {
    const map = await this.ctx.storage.list<Link>({ prefix: "link:" });
    for (const [key, link] of map) {
      if (link.id === id) {
        await this.ctx.storage.delete(key);
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
