import React, { useEffect, useState } from "react";
import { VStack } from "@astryxdesign/core/VStack";
import { Text } from "@astryxdesign/core/Text";
import { Heading } from "@astryxdesign/core/Heading";
import { List, ListItem } from "@astryxdesign/core/List";
import { Token } from "@astryxdesign/core/Token";
import { applyActivityPage, emptyActivity } from "../../lib/life-activity";
import type { LifeReader } from "../../lib/life-read-session";

/** Ephemeral bounded polling; no endpoint, persistence, or background service is created. */
export function LifeActivityView({ reader }: { reader: LifeReader }) {
  const [window, setWindow] = useState(emptyActivity);
  const [state, setState] = useState<
    "loading" | "catching_up" | "current" | "unavailable"
  >("loading");
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let current = emptyActivity();
    let failures = 0;
    setWindow(current);
    setState("loading");
    async function poll() {
      let delay = 1000;
      try {
        const result = await reader({
          method: "activity",
          after: current.cursor,
        });
        if (disposed) return;
        if (result.state !== "ready") throw new Error("Unavailable");
        const next = applyActivityPage(current, result.data);
        if (next.cursor !== current.cursor) setWindow(next);
        current = next;
        failures = 0;
        setState(next.catchingUp ? "catching_up" : "current");
        delay = next.catchingUp ? 100 : 1000;
      } catch {
        if (disposed) return;
        failures += 1;
        setState("unavailable");
        delay = Math.min(5000, 1000 * 2 ** Math.min(failures, 3));
      }
      if (!disposed) timer = setTimeout(() => void poll(), delay);
    }
    void poll();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [reader]);
  return (
    <VStack gap={3} as="section" aria-label="Ingestion activity">
      <Heading level={2}>Activity</Heading>
      <Text role="status">
        {state === "loading"
          ? "Reading activity…"
          : state === "catching_up"
            ? "Catching up with recorded activity…"
            : state === "unavailable"
              ? "Activity is unavailable. Earlier observations are retained while reconnecting."
              : "Connected to recorded activity."}
      </Text>
      <List
        hasDividers
        density="compact"
        header={<Text>Recent checkpoints</Text>}
      >
        {[...window.items].reverse().map((item) => (
          <ListItem
            key={item.change_id}
            label={item.stage.replaceAll("_", " ")}
            description={`${item.record_count} records · ${item.observed_at}`}
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
