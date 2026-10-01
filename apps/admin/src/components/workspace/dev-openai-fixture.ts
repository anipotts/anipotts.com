/** Synthetic, memory-only catalog state. No storage, provider, or API imports. */
export const FIXTURE_THREAD = "admin-openai-synthetic-article";
export const FIXTURE_API = "/__dev__/synthetic-chatkit";
export const scenarios = [
  "ready",
  "loading",
  "empty",
  "updating",
  "failed",
  "stale",
  "disconnected",
  "conflict",
] as const;
export type Scenario = (typeof scenarios)[number];
export type FixtureArticle = {
  id: string;
  title: string;
  body: string;
  revision: number;
  status: string;
};
export type FixtureState = {
  records: FixtureArticle[];
  scenario: Scenario;
  selectedId: string;
};
export function initialFixture(): FixtureState {
  return {
    scenario: "ready",
    selectedId: "synthetic-1",
    records: Array.from({ length: 12 }, (_, i) => ({
      id: `synthetic-${i + 1}`,
      title:
        i === 0
          ? "A quieter writing workspace"
          : `Synthetic writing note ${i + 1}`,
      body: "## A small observation\n\nA **synthetic article** for comparing records, editing, and conversations.\n\n```ts\nconst saved = true;\n```\n\n[Example reference](https://example.com)",
      revision: 1,
      status: i % 3 === 0 ? "draft" : "review",
    })),
  };
}
export type FixtureAction =
  | { type: "scenario"; scenario: Scenario }
  | { type: "select"; id: string }
  | {
      type: "acknowledge";
      id: string;
      revision: number;
      title: string;
      body: string;
    };
export function fixtureReducer(
  state: FixtureState,
  action: FixtureAction,
): FixtureState {
  if (action.type === "scenario")
    return { ...state, scenario: action.scenario };
  if (action.type === "select")
    return state.records.some((r) => r.id === action.id)
      ? { ...state, selectedId: action.id }
      : state;
  if (state.scenario !== "updating") return state;
  const record = state.records.find((r) => r.id === action.id);
  if (!record || record.revision !== action.revision)
    return { ...state, scenario: "conflict" };
  return {
    ...state,
    scenario: "ready",
    records: state.records.map((r) =>
      r.id === action.id
        ? {
            ...r,
            title: action.title,
            body: action.body,
            revision: r.revision + 1,
          }
        : r,
    ),
  };
}
export function fixtureThread(state: FixtureState) {
  const record = state.records.find((r) => r.id === state.selectedId)!;
  const created_at = "2026-09-29T12:00:00Z";
  return {
    id: FIXTURE_THREAD,
    title: "Synthetic record preview",
    created_at,
    metadata: { synthetic: true },
    status: {
      type: "locked",
      reason: "Synthetic read-only preview. Edit the form to update this card.",
    },
    items: {
      data: [
        {
          id: "synthetic-card",
          thread_id: FIXTURE_THREAD,
          type: "widget",
          created_at,
          widget: {
            type: "Card",
            size: "full",
            children: [
              { type: "Caption", value: "SYNTHETIC RECORD, MEMORY ONLY" },
              { type: "Title", value: record.title, size: "md" },
              { type: "Markdown", value: record.body },
              {
                type: "Caption",
                value: `Revision ${record.revision}, ${record.status}, ${state.scenario}`,
              },
            ],
          },
          copy_text: record.title,
        },
      ],
      has_more: false,
    },
  };
}
/** This function never delegates to global fetch, including unsupported calls. */
export function createFixtureFetch(read: () => FixtureState): typeof fetch {
  return async (input, init) => {
    const raw =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const url = new URL(raw, "http://localhost");
    if (
      url.pathname !== FIXTURE_API ||
      !["localhost", "127.0.0.1"].includes(url.hostname)
    )
      return Response.json(
        { detail: "fixture endpoint only" },
        { status: 403 },
      );
    try {
      const body = JSON.parse(
        typeof init?.body === "string"
          ? init.body
          : input instanceof Request
            ? await input.text()
            : "{}",
      );
      const thread = fixtureThread(read());
      if (body.type === "threads.list")
        return Response.json({ data: [thread], has_more: false });
      if (body.params?.thread_id !== FIXTURE_THREAD)
        return Response.json(
          { detail: "unknown synthetic thread" },
          { status: 404 },
        );
      if (body.type === "threads.get_by_id") return Response.json(thread);
      if (body.type === "items.list") return Response.json(thread.items);
      return Response.json(
        { detail: "read-only fixture; model calls unavailable" },
        { status: 405 },
      );
    } catch {
      return Response.json(
        { detail: "invalid fixture request" },
        { status: 400 },
      );
    }
  };
}
