import React, { useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { SplitPanel, SplitView, useSplitView } from "./SplitView";

/** Development only (/content/dev-catalog?fixture=split): a long synthetic
 * list and a long open panel, to check that the sidebar, the list and the
 * panel each scroll on their own and that the panel header stays pinned. */
const ROWS = Array.from(
  { length: 60 },
  (_, index) => `Sample row ${index + 1}`,
);

function PanelTitle({ title }: { title: string }) {
  const split = useSplitView();
  return <Heading level={split ? 2 : 1}>{title}</Heading>;
}

export function DevSplitCatalog() {
  const [open, setOpen] = useState<string | null>(ROWS[2]!);
  return (
    <SplitView
      list={
        <VStack gap={1}>
          {ROWS.map((row) => (
            <Button
              key={row}
              label={row}
              variant={row === open ? "secondary" : "ghost"}
              onClick={() => setOpen(row === open ? null : row)}
            />
          ))}
        </VStack>
      }
      panel={
        open && (
          <SplitPanel header={<PanelTitle title={open} />} aria-label={open}>
            <VStack gap={3}>
              {Array.from({ length: 40 }, (_, index) => (
                <Text key={index}>Synthetic panel line {index + 1}.</Text>
              ))}
            </VStack>
          </SplitPanel>
        )
      }
    />
  );
}
