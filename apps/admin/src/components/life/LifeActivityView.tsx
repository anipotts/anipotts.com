import React, { useEffect, useRef, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { Text } from "@astryxdesign/core/Text";
import { Heading } from "@astryxdesign/core/Heading";
import { List, ListItem } from "@astryxdesign/core/List";
import { Token } from "@astryxdesign/core/Token";
import { applyActivityPage, emptyActivity } from "../../lib/life-activity";
import type { LifeReader } from "../../lib/life-read-session";

/** Ephemeral bounded polling while the page is visible; no endpoint,
 * persistence, or background service is created. A denied read stops polling. */
export function LifeActivityView({ reader }: { reader: LifeReader }) {
  const refresh = useRef<() => void>(() => {});
  const [busy, setBusy] = useState(false);
  const [window, setWindow] = useState(emptyActivity);
  const [state, setState] = useState<
    | "loading"
    | "catching_up"
    | "current"
    | "unavailable"
    | "denied"
    | "disconnected"
  >("loading");
  useEffect(() => {
    let disposed = false;
    let stopped = false;
    let polling = false;
    let inFlight: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let current = emptyActivity();
    let failures = 0;
    let delay = 0;
    setWindow(current);
    setState("loading");
    const schedule = () => {
      clearTimeout(timer);
      timer = undefined;
      if (!disposed && !stopped && !polling && !document.hidden)
        timer = setTimeout(() => void poll(), delay);
    };
    async function poll() {
      timer = undefined;
      polling = true;
      setBusy(true);
      const controller = new AbortController();
      inFlight = controller;
      try {
        const result = await reader(
          {
            method: "activity",
            after: current.cursor,
          },
          controller.signal,
        );
        if (disposed) return;
        if (controller.signal.aborted) throw new Error("Cancelled");
        if (result.state === "denied" || result.state === "disconnected") {
          current = emptyActivity();
          setWindow(current);
          stopped = true;
          setState(result.state);
          return;
        }
        if (result.state !== "ready") throw new Error("Unavailable");
        const next = applyActivityPage(current, result.data);
        if (next.cursor !== current.cursor) setWindow(next);
        current = next;
        failures = 0;
        setState(next.catchingUp ? "catching_up" : "current");
        delay = next.catchingUp ? 1000 : 60_000;
      } catch {
        if (disposed) return;
        if (!controller.signal.aborted) {
          failures += 1;
          setState("unavailable");
          delay = Math.min(300_000, 60_000 * 2 ** Math.min(failures - 1, 3));
        }
      } finally {
        if (inFlight === controller) inFlight = undefined;
        polling = false;
        if (!disposed) setBusy(false);
      }
      schedule();
    }
    // Hidden pages read nothing. Returning to the page resumes with the delay
    // the last read chose, so a long absence does not burst requests.
    const visibilityChanged = () => {
      if (document.hidden) {
        inFlight?.abort();
        clearTimeout(timer);
        timer = undefined;
      } else if (timer === undefined) schedule();
    };
    refresh.current = () => {
      if (disposed || stopped || polling || document.hidden) return;
      clearTimeout(timer);
      void poll();
    };
    document.addEventListener("visibilitychange", visibilityChanged);
    schedule();
    return () => {
      disposed = true;
      refresh.current = () => {};
      inFlight?.abort();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, [reader]);
  return (
    <VStack gap={3} as="section" aria-label="Ingestion activity">
      <HStack gap={2} wrap="wrap" vAlign="center">
        <Heading level={2}>Activity</Heading>
        {state !== "denied" && state !== "disconnected" && (
          <Button
            label={busy ? "Refreshing activity…" : "Refresh activity"}
            size="sm"
            variant="ghost"
            isDisabled={busy}
            onClick={() => refresh.current()}
          />
        )}
      </HStack>
      <Text role="status">
        {state === "loading"
          ? "Reading activity…"
          : state === "catching_up"
            ? "Catching up with recorded activity…"
            : state === "unavailable"
              ? "Activity is unavailable. Earlier observations are retained while reconnecting."
              : state === "disconnected"
                ? "Activity is not connected."
                : state === "denied"
                  ? "This connection does not permit reading activity."
                  : "Connected to recorded activity."}
      </Text>
      <List density="compact" header={<Text>Recent checkpoints</Text>}>
        {[...window.items].reverse().map((item) => (
          <ListItem
            key={item.change_id}
            label={item.stage.replaceAll("_", " ")}
            description={`${item.record_count} ${item.record_count === 1 ? "record" : "records"}, ${item.observed_at}`}
            endContent={<Token label={item.state} size="sm" />}
          />
        ))}
      </List>
      {state === "current" && window.items.length === 0 && (
        <Text>No checkpoints have been recorded.</Text>
      )}
    </VStack>
  );
}
