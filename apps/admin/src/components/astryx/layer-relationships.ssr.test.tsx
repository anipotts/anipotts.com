import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PencilSimpleIcon } from "@phosphor-icons/react";
import { Button } from "@astryxdesign/core/Button";
import {
  DropdownMenu,
  DropdownMenuItem,
} from "@astryxdesign/core/DropdownMenu";
import { HoverCard } from "@astryxdesign/core/HoverCard";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Popover } from "@astryxdesign/core/Popover";
import { Selector } from "@astryxdesign/core/Selector";
import { Tooltip } from "@astryxdesign/core/Tooltip";
import { ContentLibrary } from "./ContentLibrary";
import { EditorialApp } from "./EditorialApp";
import { ObservabilityWorkspace } from "./ObservabilityWorkspace";
import opsSample from "../../fixtures/ops_v1.sample.json";

// Astryx layers mount their surface only after hydration. Server markup must
// not point assistive technology at ids that are not in the document yet.
const serverMarkup = (node: React.ReactElement) => renderToString(node);

// Lists `attribute=id` pairs whose referenced id is missing from the markup,
// and `attribute=(empty)` for relationship attributes with no ids at all.
function danglingRelationships(html: string): string[] {
  const ids = new Set(
    [...html.matchAll(/\sid="([^"]*)"/g)].map((match) => match[1]),
  );
  return [
    ...html.matchAll(
      /\s(aria-describedby|aria-controls|aria-labelledby|aria-owns)="([^"]*)"/g,
    ),
  ].flatMap(([, attribute, value]) => {
    const references = value!.split(/\s+/).filter(Boolean);
    if (references.length === 0) {
      return [`${attribute}=(empty)`];
    }
    return references
      .filter((id) => !ids.has(id))
      .map((id) => `${attribute}=${id}`);
  });
}

const records = [
  {
    title: "Post",
    href: "/content/writing/b",
    status: "published",
    changesPending: true,
  },
  {
    title: "Draft",
    href: "/content/writing/a",
    status: "draft",
    changesPending: false,
  },
];

describe("server-rendered Astryx relationship attributes", () => {
  it("detects references to ids that are missing from the markup", () => {
    expect(
      danglingRelationships(
        '<button aria-describedby="a b" aria-controls="c"></button><p id="a"></p>',
      ),
    ).toEqual(["aria-describedby=b", "aria-controls=c"]);
    expect(
      danglingRelationships('<i aria-labelledby="x" aria-owns="y"></i>'),
    ).toEqual(["aria-labelledby=x", "aria-owns=y"]);
    expect(
      danglingRelationships('<i aria-describedby="" aria-controls=" "></i>'),
    ).toEqual(["aria-describedby=(empty)", "aria-controls=(empty)"]);
  });

  it("keeps tooltip triggers free of dangling descriptions", () => {
    const html = serverMarkup(
      <>
        <IconButton
          label="Edit"
          tooltip="Edit record"
          variant="ghost"
          icon={<PencilSimpleIcon size={18} aria-hidden="true" />}
        />
        <Button label="Search" tooltip="Search (Ctrl+K)" variant="ghost" />
        <Tooltip content="Updated just now">
          <span>Updated</span>
        </Tooltip>
      </>,
    );
    expect(html).toContain('aria-label="Edit"');
    expect(danglingRelationships(html)).toEqual([]);
  });

  it("keeps popover, hover card, menu and listbox triggers free of dangling controls", () => {
    const html = serverMarkup(
      <>
        <Popover label="Switch workspace" content={<span>Workspaces</span>}>
          {(trigger) => (
            <button type="button" {...trigger}>
              Workspace
            </button>
          )}
        </Popover>
        <HoverCard content="Record details">
          <a href="/content/writing/a">Draft</a>
        </HoverCard>
        <DropdownMenu
          button={{ label: "Sort", tooltip: "Sort: Title", size: "sm" }}
        >
          <DropdownMenuItem label="Title" onClick={() => undefined} />
        </DropdownMenu>
        <Selector
          label="Type"
          value="article"
          options={[
            { value: "article", label: "Article" },
            { value: "note", label: "Note" },
          ]}
          onChange={() => undefined}
        />
      </>,
    );
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-haspopup="listbox"');
    expect(danglingRelationships(html)).toEqual([]);
  });

  it("renders the Content library without dangling references", () => {
    const html = serverMarkup(
      <ContentLibrary
        groups={[{ name: "writing", href: "/content?group=writing", records }]}
        selectedGroup="writing"
      />,
    );
    expect(html).toContain('aria-haspopup="menu"');
    expect(danglingRelationships(html)).toEqual([]);
  });

  it("renders the Operations workspace without dangling references", () => {
    const html = serverMarkup(
      <ObservabilityWorkspace enabled={false} fixture={opsSample} />,
    );
    expect(html).toContain('aria-label="Services by group"');
    expect(danglingRelationships(html)).toEqual([]);
  });

  it("renders the editorial workspace shell without dangling references", () => {
    const html = serverMarkup(
      <EditorialApp
        title="Content"
        area="content"
        localPreview
        siteUrl="https://anipotts.com/"
      />,
    );
    expect(html).toContain("admin-workspace-selector");
    expect(danglingRelationships(html)).toEqual([]);
  });
});
