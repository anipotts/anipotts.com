import { expect, it } from "vitest";
import {
  parseEditorialSource,
  validateEditorialSource,
} from "@anipotts/content/editorial/source";
import { newProjectSource } from "./project-draft";
it("creates a valid hidden project with a stable detail address and escaped title", () => {
  const record = { kind: "work", id: "fresh-project" } as const;
  const source = newProjectSource(record.id, 'A "project": idea');
  const data = parseEditorialSource(source).document.toJSON();
  expect(data).toMatchObject({
    title: 'A "project": idea',
    public_state: "hidden",
    homepage_placement: "none",
    detail_path: "/work/fresh-project",
    status: "wip",
    story: [],
  });
  expect(validateEditorialSource(record, source).success).toBe(true);
  expect(() => newProjectSource("../escape")).toThrow("invalid_project_id");
});
