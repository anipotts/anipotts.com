import { describe, expect, it } from "vitest";
import {
  dataKind,
  dataRecordHref,
  dataRecordsHref,
  knowledgeRedirect,
  lifeRedirect,
} from "./data-routes";

describe("Data routes", () => {
  it("keeps only the supported kind filter", () => {
    expect(dataKind("people")).toBe("people");
    expect(dataKind("person")).toBe("all");
    expect(dataKind("__proto__")).toBe("all");
    expect(dataKind(null)).toBe("all");
    expect(dataRecordsHref("places")).toBe("/data/records?kind=places");
    expect(dataRecordsHref()).toBe("/data/records");
  });

  it("names a record by its reader id and keeps the kind", () => {
    const id = "rec-0123456789abcdef0123456789abcdef";
    expect(dataRecordHref(id)).toBe(`/data/records/${id}`);
    expect(dataRecordHref(id, "projects")).toBe(
      `/data/records/${id}?kind=projects`,
    );
  });

  it.each([
    [undefined, "/data/records"],
    ["overview", "/data/records"],
    ["people", "/data/records?kind=people"],
    ["projects", "/data/records?kind=projects"],
    ["places", "/data/records?kind=places"],
    ["timeline", "/data/records"],
    ["preview", "/data/records"],
    ["sources", "/data/sources"],
    ["health", "/data/sources"],
    ["aesthetics", "/data/records"],
    ["anything-else", "/data/records"],
  ])("lands /life/%s on %s", (section, destination) => {
    expect(lifeRedirect(section)).toBe(destination);
  });

  it.each([
    [null, "/data/records"],
    ["all", "/data/records"],
    ["people", "/data/records?kind=people"],
    ["person", "/data/records?kind=people"],
    ["project", "/data/records?kind=projects"],
    ["place", "/data/records?kind=places"],
    ["decision", "/data/records"],
    ["system", "/data/records"],
  ])("lands /knowledge?kind=%s on %s", (kind, destination) => {
    expect(knowledgeRedirect(kind)).toBe(destination);
  });
});
