import React, { useState } from "react";
import { ProjectSettings } from "../astryx/ProjectSettings";
import {
  ProjectFieldControls,
  ProjectSections,
} from "../astryx/ProjectSections";
import { ProjectMedia } from "../astryx/ProjectMedia";
import { newProjectSource } from "../../lib/project-draft";
import { editProjectSections } from "../../lib/project-sections";
import {
  parseEditorialSource,
  setEditorialField,
} from "@anipotts/content/editorial/source";
import { Button, TextInput } from "./WorkspaceControls";
import { DefinitionList } from "./Workspace";

/** Development-only, memory-only project using the real property/section/media
 * components. Uploads stay disabled: this catalog never calls editorial APIs. */
function initialProject() {
  let source = newProjectSource("synthetic-kit-project", "Synthetic project");
  source = setEditorialField(
    source,
    ["story"],
    [
      { title: "First section", paragraphs: ["Synthetic project context."] },
      {
        title: "Second section",
        paragraphs: ["Synthetic implementation notes."],
      },
    ],
  );
  return setEditorialField(
    source,
    ["roadmap"],
    [{ text: "Review the synthetic project", status: "planned" }],
  );
}
export function DevProjectWorkspace() {
  const [source, setSource] = useState(initialProject);
  const [saved, setSaved] = useState(initialProject);
  const [pending, setPending] = useState<string | null>(null);
  const [revision, setRevision] = useState(1);
  const [error, setError] = useState(false);
  const data = parseEditorialSource(source).data as Record<string, unknown>;
  const acknowledged = parseEditorialSource(saved).data as Record<
    string,
    unknown
  >;
  const stories = data.story as { title: string }[];
  const disabled = pending !== null;
  return (
    <section aria-labelledby="fixture-project">
      <h2 id="fixture-project">Project authoring</h2>
      <p>
        Actual project controls with synthetic source in memory. Uploads are
        disabled; publication is unavailable.
      </p>
      <p role="status">
        {pending !== null
          ? "Simulated project save awaits acknowledgment"
          : source !== saved
            ? "Project edits are not acknowledged"
            : `Synthetic project acknowledged at revision ${revision}`}
      </p>
      {error && <p role="alert">Simulated project save failed. Edits kept.</p>}
      <DefinitionList
        items={[
          ["Saved title", String(acknowledged.title)],
          ["Saved visibility", String(acknowledged.public_state)],
          ["Saved homepage section", String(acknowledged.homepage_placement)],
        ]}
      />
      <div className="dev-openai-grid">
        <ProjectSettings
          source={source}
          errors={new Map()}
          disabled={disabled}
          onChange={setSource}
        />
        <div>
          {stories.map((story, index) => (
            <React.Fragment key={index}>
              <ProjectFieldControls
                data={data}
                path={["story", String(index), "title"]}
                position="before"
                disabled={disabled}
                onEdit={(edit) =>
                  setSource((current) => editProjectSections(current, edit))
                }
              />
              <TextInput
                label={`Story ${index + 1} title`}
                value={story.title}
                isDisabled={disabled}
                onChange={(value) =>
                  setSource((current) =>
                    setEditorialField(
                      current,
                      ["story", String(index), "title"],
                      value,
                    ),
                  )
                }
              />
            </React.Fragment>
          ))}
          <ProjectSections
            source={source}
            disabled={disabled}
            onEdit={(edit) =>
              setSource((current) => editProjectSections(current, edit))
            }
          />
        </div>
      </div>
      <ProjectMedia
        source={source}
        errors={new Map()}
        disabled
        siteUrl="https://example.com"
        onEdit={() => {}}
        onPendingChange={() => {}}
      />
      <div className="dev-openai-controls">
        <Button
          label="Simulate project save"
          isDisabled={disabled || source === saved}
          onClick={() => {
            setPending(source);
            setError(false);
          }}
        />
        <Button
          label="Acknowledge project save"
          isDisabled={!disabled}
          onClick={() => {
            if (pending !== null) {
              setSaved(pending);
              setRevision((value) => value + 1);
              setPending(null);
            }
          }}
        />
        <Button
          label="Fail project save"
          isDisabled={!disabled}
          onClick={() => {
            setPending(null);
            setError(true);
          }}
        />
      </div>
    </section>
  );
}
