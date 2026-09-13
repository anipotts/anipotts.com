import type { APIRoute } from "astro";
import {
  KnowledgeUnavailableError,
  readAdminKnowledge,
  readAdminKnowledgeCard,
} from "../../../data/knowledge";
import type { KnowledgeDomain } from "@anipotts/lib/admin-control";

const DOMAINS = new Set<KnowledgeDomain>([
  "work",
  "content",
  "life",
  "fleet",
  "system",
]);

export const GET: APIRoute = async (context) => {
  const cardId = context.url.searchParams.get("card_id");
  if (cardId) {
    try {
      const card = await readAdminKnowledgeCard(
        context.locals.runtime?.env.DB,
        cardId,
      );
      if (!card)
        return Response.json(
          { error: "knowledge_card_not_found" },
          { status: 404, headers: { "cache-control": "private, no-store" } },
        );
      return Response.json(card, {
        headers: { "cache-control": "private, no-store" },
      });
    } catch (error) {
      if (!(error instanceof KnowledgeUnavailableError)) throw error;
      return Response.json(
        { error: "knowledge_unavailable", available: false },
        { status: 503, headers: { "cache-control": "private, no-store" } },
      );
    }
  }

  const query = context.url.searchParams.get("q") ?? "";
  const domainParam = context.url.searchParams.get("domain");
  const domain =
    domainParam && DOMAINS.has(domainParam as KnowledgeDomain)
      ? (domainParam as KnowledgeDomain)
      : null;
  const limit = parseBoundedInteger(
    context.url.searchParams.get("limit"),
    1,
    20,
  );
  const contextBudget = parseBoundedInteger(
    context.url.searchParams.get("context_budget_tokens"),
    100,
    4_000,
  );
  const knowledge = await readAdminKnowledge(
    context.locals.runtime?.env.DB,
    query,
    {
      domain,
      limit: limit ?? undefined,
      context_budget_tokens: contextBudget ?? undefined,
    },
  );

  return Response.json(knowledge, {
    status: knowledge.available ? 200 : 503,
    headers: { "cache-control": "no-store" },
  });
};

function parseBoundedInteger(
  value: string | null,
  minimum: number,
  maximum: number,
): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(minimum, Math.min(maximum, parsed));
}
