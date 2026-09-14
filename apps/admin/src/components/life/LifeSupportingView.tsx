import React from "react";
import { Layout, LayoutContent, LayoutHeader } from "@astryxdesign/core/Layout";
import { HStack } from "@astryxdesign/core/HStack";
import { Banner } from "@astryxdesign/core/Banner";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Token } from "@astryxdesign/core/Token";
import {
  HeartIcon,
  PaletteIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import "./life-workspace.css";
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
  available = true,
}: {
  section: "health" | "aesthetics";
  summaries?: HealthSummary[];
  available?: boolean;
}) {
  return (
    <Layout
      height="auto"
      className="life-workspace"
      padding={0}
      header={
        <LayoutHeader className="life-page-header">
          <HStack
            gap={3}
            vAlign="center"
            wrap="wrap"
            className="life-page-title"
          >
            <Heading level={1}>
              {section === "health" ? "Health" : "Aesthetics"}
            </Heading>
            <Token size="sm" label="Read only" />
          </HStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent className="life-page-content">
          {section === "aesthetics" ? (
            <Banner
              status="info"
              container="section"
              title="Style references are not connected yet."
              description="An authorized source connection is needed before style references can be read here."
              icon={<PaletteIcon weight="regular" />}
            />
          ) : !available ? (
            <Banner
              status="warning"
              container="section"
              title="Health summaries could not be loaded."
              description="The summary source is unavailable. This does not mean that no health summaries exist."
              icon={<WarningCircleIcon weight="regular" />}
            />
          ) : summaries.length === 0 ? (
            <EmptyState
              headingLevel={2}
              isCompact
              title="No health summaries available."
              description="The source returned no matching summaries for this view."
              icon={<HeartIcon weight="regular" />}
            />
          ) : (
            <VStack gap={4}>
              <Text color="secondary">Source summaries</Text>
              <List className="life-summary-list" density="compact">
                {summaries.map((item, index) => (
                  <ListItem
                    key={`${item.source_locator}-${index}`}
                    label={item.title}
                    startContent={
                      <HeartIcon
                        weight="regular"
                        size="var(--spacing-5)"
                        aria-hidden="true"
                      />
                    }
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
