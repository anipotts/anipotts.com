import { lifeReadPath, type LifeRead } from "../data/personal-context";

export const lifeSections = {
  overview: "Life",
  people: "People",
  projects: "Projects",
  places: "Places",
  timeline: "Timeline",
  sources: "Sources",
  preview: "Context preview",
} as const;
export type LifeSection = keyof typeof lifeSections;
export function isLifeSection(section: string): section is LifeSection {
  return Object.hasOwn(lifeSections, section);
}
/** Also used by server routes: validate before invoking any read capability. */
export function lifeSectionRead(
  section: string,
  options: { query?: string; offset?: number } = {},
): LifeRead {
  if (!isLifeSection(section)) throw new Error("Unknown Life section");
  const q = options.query ?? "";
  const offset = options.offset ?? 0;
  let request: LifeRead;
  switch (section) {
    case "overview":
      request = { method: "status" };
      break;
    case "sources":
      request = { method: "sources" };
      break;
    case "preview":
      request = { method: "preview", q };
      break;
    case "timeline":
      request = { method: "timeline", offset };
      break;
    default:
      request = {
        method: "search",
        q,
        offset,
        kind:
          section === "people"
            ? "person"
            : section === "projects"
              ? "project"
              : "place",
      };
  }
  lifeReadPath(request);
  return request;
}
