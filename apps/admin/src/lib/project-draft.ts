import { editorialRecordSchema } from "@anipotts/content/editorial/source";

/** Private project bootstrap; publication remains an explicit separate action. */
export function newProjectSource(
  id: string,
  title = "Untitled project",
): string {
  if (!validProjectId(id)) throw new Error("invalid_project_id");
  return `---\ntitle: ${JSON.stringify(title.trim() || "Untitled project")}\ndescription: ""\nyear: ""\ncategory: other\nrole: ""\nduration: ""\nstatus: wip\nkind: project\npublic_state: hidden\nhomepage_placement: none\ncatalog_group: active\ncard_copy: ${JSON.stringify((title.trim() || "Untitled project").slice(0, 180))}\ndetail_path: /work/${id}\nidentity: {}\npreview_media: null\nstory: []\ntags: []\n---\n\n`;
}

export function validProjectId(id: string): boolean {
  return editorialRecordSchema.safeParse({ kind: "work", id }).success;
}
