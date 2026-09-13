import { describe, expect, it } from "vitest";
import {
  readRecordWorkspaceState,
  recordWorkspaceUrl,
  type RecordWorkspaceState,
} from "./record-workspace-state";
const path = "/content/writing/a-post";
function search(href: string) {
  return new URL(href, "https://admin.test").search;
}
describe("record workspace URLs", () => {
  it("reads independent document and exclusive inspector states", () => {
    expect(readRecordWorkspaceState("?view=review&panel=history")).toEqual({
      view: "review",
      panel: "history",
    });
    expect(
      readRecordWorkspaceState("?view=source&panel=properties&panel=history"),
    ).toEqual({ view: "source", panel: "properties" });
    expect(readRecordWorkspaceState("?view=publish&panel=admin")).toEqual({
      view: "edit",
      panel: null,
    });
  });
  it("preserves only allowlisted context and omits default edit", () => {
    const href = recordWorkspaceUrl(
      path,
      "?theme=dark&returnTo=%2Fcontent%3Fgroup%3Dwriting%26q%3Dlean&token=secret&view=source",
      { view: "edit", panel: null },
    );
    const params = new URLSearchParams(search(href));
    expect(params.get("theme")).toBe("dark");
    expect(params.get("returnTo")).toBe("/content?group=writing&q=lean");
    expect(params.has("view")).toBe(false);
    expect(params.has("token")).toBe(false);
    expect(new URL(href, "https://admin.test").pathname).toBe(path);
  });
  it("normalizes malicious and invalid parameters without creating redirect destinations", () => {
    for (const destination of [
      "https://evil.test/content",
      "//evil.test/content",
      "/auth/logout",
      "/content/../auth",
      "/content\\bad",
      "javascript:alert(1)",
    ]) {
      const href = recordWorkspaceUrl(
        path,
        new URLSearchParams({
          returnTo: destination,
          theme: "evil",
          view: "https://evil.test",
          panel: "<script>",
        }).toString(),
        readRecordWorkspaceState("?view=evil&panel=evil"),
      );
      expect(new URLSearchParams(search(href)).get("returnTo")).toBe(
        "/content",
      );
      expect(new URLSearchParams(search(href)).has("theme")).toBe(false);
      expect(readRecordWorkspaceState(search(href))).toEqual({
        view: "edit",
        panel: null,
      });
    }
    for (const pathname of [
      "//evil.test/content/writing/a",
      "https://evil.test/content/writing/a",
      "/content/writing/../auth",
      "/auth/logout",
      "/content/writing/a?next=evil",
    ]) {
      expect(
        recordWorkspaceUrl(pathname, "", { view: "edit", panel: null }),
      ).toBe("/content");
    }
  });
  it("round-trips stored Back/Forward entries without mutation or dropping library context", () => {
    const transitions: RecordWorkspaceState[] = [
      { view: "edit", panel: null },
      { view: "preview", panel: null },
      { view: "review", panel: "history" },
      { view: "edit", panel: "properties" },
    ];
    let previous =
      "?theme=system&returnTo=%2Fcontent%3Fgroup%3Dwork%26status%3Dchanges";
    const entries = transitions.map((state) => {
      const href = recordWorkspaceUrl(path, previous, state);
      previous = search(href);
      return href;
    });
    expect(
      entries.map((href) => readRecordWorkspaceState(search(href))),
    ).toEqual(transitions);
    expect(
      [...entries]
        .reverse()
        .map((href) => readRecordWorkspaceState(search(href))),
    ).toEqual([...transitions].reverse());
    for (const href of entries) {
      const params = new URLSearchParams(search(href));
      expect(params.get("returnTo")).toBe("/content?group=work&status=changes");
      expect(params.get("theme")).toBe("system");
      expect(
        recordWorkspaceUrl(
          path,
          search(href),
          readRecordWorkspaceState(search(href)),
        ),
      ).toBe(href);
    }
  });
});
