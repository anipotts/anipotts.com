import React from "react";
import { Layout, LayoutContent, LayoutHeader } from "@astryxdesign/core/Layout";
import { VStack } from "@astryxdesign/core/VStack";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { List, ListItem } from "@astryxdesign/core/List";
import { Collapsible } from "@astryxdesign/core/Collapsible";

export type HealthSummary = {
  title: string;
  summary: string;
  freshness_state: string;
  reveal_policy: string;
  source_locator: string;
};

export function LifeSupportingView({
  section,
  summaries = [],
}: {
  section: "health" | "aesthetics";
  summaries?: HealthSummary[];
}) {
  return (
    <Layout
      height="auto"
      contentWidth={960}
      padding={4}
      header={
        <LayoutHeader>
          <Heading level={1}>
            {section === "health" ? "Health" : "Aesthetics"}
          </Heading>
        </LayoutHeader>
      }
      content={
        <LayoutContent>
          {section === "aesthetics" ? (
            <Text color="secondary">No style references yet.</Text>
          ) : summaries.length === 0 ? (
            <Text color="secondary">No health summaries available.</Text>
          ) : (
            <VStack gap={4}>
              <Text color="secondary">Source summaries</Text>
              <List hasDividers density="compact">
                {summaries.map((item, index) => (
                  <ListItem
                    key={`${item.source_locator}-${index}`}
                    label={item.title}
                    description={
                      <VStack gap={2}>
                        <Text>{item.summary}</Text>
                        <Collapsible
                          trigger={<Text>Source details</Text>}
                          defaultIsOpen={false}
                        >
                          <VStack gap={2}>
                            <Text>Freshness: {item.freshness_state}</Text>
                            <Text>Visibility: {item.reveal_policy}</Text>
                            <Text wordBreak="break-word">
                              {item.source_locator}
                            </Text>
                          </VStack>
                        </Collapsible>
                      </VStack>
                    }
                  />
                ))}
              </List>
            </VStack>
          )}
        </LayoutContent>
      }
    />
  );
}
