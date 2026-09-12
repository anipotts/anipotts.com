import { expect, it } from "vitest";
import { contentDecision, decisionHref } from "./content-decision";
const record = {
  title: "Post",
  href: "/content/writing/post",
  status: "published",
};
it("keeps unchanged public content quiet and offers review only for actual edits", () => {
  expect(contentDecision(record)).toEqual({ label: "Up to date", priority: 4 });
  expect(contentDecision({ ...record, changesPending: true })).toMatchObject({
    label: "Unpublished edits",
    action: "Review changes",
    view: "review",
  });
});
it("distinguishes private drafts and visibility changes without implying readiness", () => {
  expect(
    contentDecision({ ...record, status: "draft", changesPending: true }),
  ).toMatchObject({ label: "Unpublished draft", action: "Continue draft" });
  expect(
    contentDecision({
      ...record,
      changesPending: true,
      intendedVisibility: "draft",
    }),
  ).toMatchObject({
    label: "Visibility change",
    detail: "Public → Hidden",
    view: "review",
  });
  expect(
    contentDecision({
      ...record,
      status: "draft",
      changesPending: true,
      intendedVisibility: "published",
    }),
  ).toMatchObject({ detail: "Hidden → Public", view: "review" });
  expect(
    contentDecision({ ...record, intendedVisibility: "draft" }).action,
  ).toBeUndefined();
});
it("preserves restricted and newsletter capabilities", () => {
  expect(
    contentDecision({
      ...record,
      changesPending: true,
      capabilities: { editable: false, previewable: true, reviewOnly: false },
    }).action,
  ).toBeUndefined();
  expect(
    contentDecision({
      ...record,
      href: "/newsletter/issue",
      changesPending: true,
    }).action,
  ).toBeUndefined();
});
it("opens exact record review without publishing and retains library return filters", () => {
  expect(
    decisionHref(
      "/content/writing/post?returnTo=%2Fcontent%3Fq%3Dpost",
      "review",
    ),
  ).toBe("/content/writing/post?returnTo=%2Fcontent%3Fq%3Dpost&view=review");
  expect(decisionHref("/newsletter/issue", "review")).toBe("/newsletter/issue");
});

it("does not call unchecked private state up to date during an inventory failure", () => {
  expect(contentDecision(record, false)).toEqual({
    label: "Draft status unavailable",
    priority: 3,
  });
  expect(
    contentDecision(
      { ...record, privateRevision: 2, changesPending: true },
      false,
    ).action,
  ).toBe("Review changes");
});
