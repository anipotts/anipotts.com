import React from "react";
import { useOverviewInventory } from "../../lib/use-overview-inventory";
import { Button } from "@astryxdesign/core/Button";
import { ContentActivity } from "./ContentActivity";
import { StateNotice, WorkspacePage } from "../workspace/Workspace";
import "./overview.css";

export function DevActivityCatalog({ now }: { now: number }) {
  const { snapshot, loading, failed, retry } = useOverviewInventory(
    "/api/editorial/inventory",
  );
  return (
    <WorkspacePage title="Content activity">
      {failed && (
        <StateNotice
          kind="error"
          title="Content inventory couldn’t be loaded"
          action={<Button label="Retry" onClick={retry} />}
        />
      )}
      <ContentActivity
        records={snapshot?.contentActivity ?? []}
        now={now}
        loading={loading}
        incomplete={
          failed ||
          snapshot?.activityTruncated ||
          snapshot?.contentInventory.published === "unavailable" ||
          (snapshot !== undefined &&
            snapshot.contentInventory.drafts !== "ready")
        }
      />
    </WorkspacePage>
  );
}
