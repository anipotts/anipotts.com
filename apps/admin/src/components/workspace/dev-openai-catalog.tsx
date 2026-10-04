import React, { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Button } from "@openai/apps-sdk-ui/components/Button";
import { Input } from "@openai/apps-sdk-ui/components/Input";
import { Textarea } from "@openai/apps-sdk-ui/components/Textarea";
import { Markdown } from "@openai/apps-sdk-ui/components/Markdown";
import { Menu } from "@openai/apps-sdk-ui/components/Menu";
import { ChatKit, useChatKit } from "@openai/chatkit-react";
import { AdminUIProvider, AdminMenuContent } from "./AdminUI";
import { chatkitTheme } from "../../lib/openai-theme";
import { DataTable, DefinitionList, type Column } from "./Workspace";
import {
  createFixtureFetch,
  FIXTURE_API,
  FIXTURE_THREAD,
  fixtureReducer,
  initialFixture,
  scenarios,
  type FixtureArticle,
  type FixtureState,
  type Scenario,
} from "./dev-openai-fixture";
import "./dev-openai-catalog.css";

function Select({
  value,
  options,
  onChange,
  "aria-label": label,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (option: { value: string; label: string }) => void;
  "aria-label": string;
}) {
  return (
    <Menu>
      <Menu.Trigger>
        <Button
          pill={false}
          type="button"
          color="secondary"
          variant="outline"
          aria-label={label}
        >
          {options.find((o) => o.value === value)?.label ?? value}
        </Button>
      </Menu.Trigger>
      <AdminMenuContent>
        <Menu.RadioGroup
          value={value}
          onChange={(next) => onChange(options.find((o) => o.value === next)!)}
        >
          {options.map((option) => (
            <Menu.RadioItem key={option.value} value={option.value}>
              {option.label}
            </Menu.RadioItem>
          ))}
        </Menu.RadioGroup>
      </AdminMenuContent>
    </Menu>
  );
}

function SyntheticChat({
  state,
  mode,
}: {
  state: FixtureState;
  mode: "light" | "dark";
}) {
  const latest = useRef(state);
  latest.current = state;
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const transport = useMemo(() => createFixtureFetch(() => latest.current), []);
  const chat = useChatKit({
    api: {
      url: FIXTURE_API,
      domainKey: "domain_pk_localhost_dev",
      fetch: transport,
    },
    initialThread: FIXTURE_THREAD,
    theme: chatkitTheme(mode),
    header: { enabled: false },
    history: { enabled: false },
    onReady: () => {
      setReady(true);
      setError("");
    },
    onError: () =>
      setError(
        "ChatKit could not load. The hosted renderer requires a connection; fixture data stays synthetic.",
      ),
  });
  useEffect(() => {
    if (!document.querySelector("script[data-admin-fixture-chatkit]")) {
      const script = document.createElement("script");
      script.src =
        "https://cdn.platform.openai.com/deployments/chatkit/chatkit.js";
      script.async = true;
      script.dataset.adminFixtureChatkit = "";
      script.onerror = () =>
        setError(
          "ChatKit renderer unavailable. Check the connection and reload.",
        );
      document.head.append(script);
    }
  }, []);
  useEffect(() => {
    if (ready)
      void chat
        .fetchUpdates()
        .catch(() =>
          setError("Synthetic card refresh failed. Reload to retry."),
        );
  }, [state, ready, chat.fetchUpdates]);
  useEffect(() => {
    if (!ready) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible")
        void chat
          .fetchUpdates()
          .catch(() =>
            setError("Synthetic card refresh failed. Reload to retry."),
          );
    }, 2000);
    return () => window.clearInterval(interval);
  }, [ready, chat.fetchUpdates]);
  return (
    <>
      <p>
        Actual ChatKit. Its hosted renderer receives synthetic fixture data
        only. No model calls.
      </p>
      {error && <p role="alert">{error}</p>}
      <ChatKit control={chat.control} className="dev-openai-chat" />
    </>
  );
}

export function DevOpenAICatalog() {
  const [state, dispatch] = useReducer(
    fixtureReducer,
    undefined,
    initialFixture,
  );
  const [mode, setMode] = useState<"light" | "dark">("light");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<{ key: string; direction: "asc" | "desc" }>({
    key: "title",
    direction: "asc",
  });
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const article = state.records.find((r) => r.id === state.selectedId)!;
  const [title, setTitle] = useState(article.title);
  const [body, setBody] = useState(article.body);
  const pending = useRef<{
    id: string;
    revision: number;
    title: string;
    body: string;
  } | null>(null);
  useEffect(() => {
    setTitle(article.title);
    setBody(article.body);
  }, [article]);
  const filtered = state.records
    .filter(
      (r) =>
        r.title.toLowerCase().includes(search.toLowerCase()) &&
        (filter === "all" || r.status === filter),
    )
    .sort(
      (a, b) =>
        a.title.localeCompare(b.title, undefined, { numeric: true }) *
        (sort.direction === "asc" ? 1 : -1),
    );
  const columns: Column<FixtureArticle>[] = [
    {
      key: "title",
      header: "Article",
      sortable: true,
      render: (r) => (
        <button
          type="button"
          className="dev-openai-record"
          onClick={() => dispatch({ type: "select", id: r.id })}
        >
          {r.title}
          <small>
            {r.status}, revision {r.revision}
          </small>
        </button>
      ),
    },
    {
      key: "revision",
      header: "Revision",
      width: 100,
      render: (r) => r.revision,
    },
    {
      key: "status",
      header: "Publication",
      width: 120,
      render: (r) => r.status,
    },
  ];
  const beginSave = () => {
    if (!title.trim()) return;
    pending.current = {
      id: article.id,
      revision: article.revision,
      title,
      body,
    };
    dispatch({ type: "scenario", scenario: "updating" });
  };
  const dirty = title !== article.title || body !== article.body;
  const notices: Record<Scenario, string> = {
    ready: `Acknowledged revision ${article.revision}, saved to synthetic memory only`,
    loading: "Simulated loading. Records are temporarily hidden.",
    empty: "Simulated empty library.",
    updating: "Simulated saving. Acknowledge to complete the current revision.",
    failed: "Simulated save failed. Draft text is preserved; retry when ready.",
    stale:
      "Simulated stale observation. Last acknowledged revision remains visible.",
    disconnected:
      "Simulated connection lost. No reconnect claim is made without transport evidence.",
    conflict:
      "Simulated revision conflict. Draft preserved; retry against the current revision.",
  };
  return (
    <AdminUIProvider enabled mode={mode}>
      <main className="dev-openai-catalog">
        <header className="dev-openai-header">
          <h1>Admin components</h1>
          <p>
            Synthetic records, development only, no production storage, no paid
            model calls
          </p>
          <div className="dev-openai-controls">
            <Select
              aria-label="Color scheme"
              value={mode}
              options={[
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
              ]}
              onChange={(o) => setMode(o.value as "light" | "dark")}
            />
            <Select
              aria-label="Simulated scenario"
              value={state.scenario}
              options={scenarios.map((value) => ({ value, label: value }))}
              onChange={(o) =>
                dispatch({ type: "scenario", scenario: o.value as Scenario })
              }
            />
            <Button
              pill={false}
              color="secondary"
              type="button"
              variant="outline"
              onClick={() => dispatch({ type: "scenario", scenario: "ready" })}
            >
              Reset scenario
            </Button>
          </div>
          <p role="status" aria-live="polite">
            {state.scenario === "ready" && dirty
              ? "Unsaved draft, changes have not been acknowledged"
              : notices[state.scenario]}
          </p>
        </header>
        <section aria-labelledby="fixture-library">
          <h2 id="fixture-library">Record library</h2>
          <div className="dev-openai-controls">
            <Input
              aria-label="Search synthetic articles"
              placeholder="Search articles"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
            />
            <Select
              aria-label="Publication filter"
              value={filter}
              options={["all", "draft", "review"].map((value) => ({
                value,
                label: value,
              }))}
              onChange={(o) => {
                setFilter(o.value);
                setPage(0);
              }}
            />
          </div>
          {state.scenario === "loading" ? (
            <p aria-busy="true">Loading synthetic records…</p>
          ) : (
            <DataTable
              tableId="catalog-synthetic-articles"
              totalCount={state.scenario === "empty" ? 0 : state.records.length}
              filteredCount={state.scenario === "empty" ? 0 : filtered.length}
              searchActive={Boolean(search || filter !== "all")}
              groupBy={(row) => row.status}
              rows={
                state.scenario === "empty"
                  ? []
                  : filtered.slice(page * 5, page * 5 + 5)
              }
              columns={columns}
              rowKey="id"
              label="Synthetic articles"
              noun={["article", "articles"]}
              sort={sort}
              onSortChange={setSort}
              selectedKeys={selected}
              onSelectionChange={setSelected}
              pagination={{
                page,
                pageSize: 5,
                total: state.scenario === "empty" ? 0 : filtered.length,
                onPageChange: setPage,
              }}
            />
          )}
        </section>
        <div className="dev-openai-grid">
          <section aria-labelledby="fixture-detail">
            <h2 id="fixture-detail">Record detail</h2>
            <h3>{article.title}</h3>
            <DefinitionList
              items={[
                ["Record", article.id],
                ["Revision", article.revision],
                ["Publication", article.status],
                ["Destination", "synthetic memory only"],
              ]}
            />
            <Markdown>{article.body}</Markdown>
          </section>
          <section aria-labelledby="fixture-edit">
            <h2 id="fixture-edit">Editable form</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                beginSave();
              }}
            >
              <label htmlFor="fixture-title">Title</label>
              <Input
                id="fixture-title"
                disabled={state.scenario === "updating"}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
              <label htmlFor="fixture-body">Markdown</label>
              <Textarea
                id="fixture-body"
                disabled={state.scenario === "updating"}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={9}
              />
              <div className="dev-openai-controls">
                <Button
                  pill={false}
                  color="secondary"
                  type="button"
                  onClick={beginSave}
                  disabled={state.scenario === "updating"}
                >
                  Simulate save / retry
                </Button>
                <Button
                  pill={false}
                  color="secondary"
                  type="button"
                  variant="outline"
                  disabled={state.scenario !== "updating" || !pending.current}
                  onClick={() => {
                    if (pending.current)
                      dispatch({ type: "acknowledge", ...pending.current });
                    pending.current = null;
                  }}
                >
                  Acknowledge save
                </Button>
              </div>
            </form>
          </section>
        </div>
        <section aria-labelledby="fixture-chat">
          <h2 id="fixture-chat">Conversation card</h2>
          <SyntheticChat state={state} mode={mode} />
        </section>
      </main>
    </AdminUIProvider>
  );
}
