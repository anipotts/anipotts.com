import { expect, it } from "vitest";
import {
  parseEditorialSource,
  setEditorialField,
  validateEditorialSource,
} from "@anipotts/content/editorial/source";
import { newProjectSource } from "./project-draft";
import { editProjectMedia, projectMediaPreview } from "./project-media";
const src = `/images/editorial/${"a".repeat(64)}.png`;
const record = { kind: "work", id: "test-project" } as const;
const data = (source: string) =>
  parseEditorialSource(source).data as Record<string, any>;
it("applies completed uploads against current content without replacing concurrent fields", () => {
  let source = newProjectSource(record.id, "Original");
  source = setEditorialField(source, ["identity", "logo_tone"], "adaptive");
  source = setEditorialField(source, ["title"], "Edited during upload");
  source = editProjectMedia(source, { type: "upload", slot: "logo", src });
  source = editProjectMedia(source, {
    type: "logo-alt",
    value: "Project mark",
  });
  expect(data(source)).toMatchObject({
    title: "Edited during upload",
    identity: {
      logo_src: src,
      logo_tone: "adaptive",
      logo_alt: "Project mark",
    },
  });
  expect(validateEditorialSource(record, source).success).toBe(true);
});
it.each(["gif", "video"])(
  "preserves existing %s media while editing metadata",
  (kind) => {
    let source = setEditorialField(
      newProjectSource(record.id),
      ["preview_media"],
      {
        kind,
        src: `/images/existing.${kind === "gif" ? "gif" : "mp4"}`,
        alt: "Old alt",
        fit: "cover",
        caption: "Keep me",
      },
    );
    source = editProjectMedia(source, {
      type: "preview-alt",
      value: "New alt",
    });
    source = editProjectMedia(source, {
      type: "preview-fit",
      value: "contain",
    });
    expect(data(source).preview_media).toMatchObject({
      kind,
      alt: "New alt",
      fit: "contain",
      caption: "Keep me",
    });
    expect(validateEditorialSource(record, source).success).toBe(true);
    source = editProjectMedia(source, { type: "upload", slot: "preview", src });
    expect(data(source).preview_media).toEqual({
      kind: "image",
      src,
      alt: "New alt",
      fit: "contain",
      caption: "Keep me",
    });
    source = editProjectMedia(source, { type: "preview-caption", value: "" });
    expect(data(source).preview_media.caption).toBeUndefined();
  },
);
it("requires alt text on a new preview and rejects non-upload source mutations", () => {
  const source = editProjectMedia(newProjectSource(record.id), {
    type: "upload",
    slot: "preview",
    src,
  });
  expect(validateEditorialSource(record, source).success).toBe(false);
  expect(
    validateEditorialSource(
      record,
      editProjectMedia(source, { type: "preview-alt", value: "Screenshot" }),
    ).success,
  ).toBe(true);
  for (const unsafe of [
    "https://external.example/a.png",
    "//external.example/a.png",
    "/images/not-uploaded.png",
  ])
    expect(() =>
      editProjectMedia(source, {
        type: "upload",
        slot: "preview",
        src: unsafe,
      }),
    ).toThrow("invalid_uploaded_image");
});
it("uses private upload previews and validates local paths before resolving existing assets", () => {
  expect(projectMediaPreview(src, "https://anipotts.com")).toBe(
    `/api/editorial/media?id=${"a".repeat(64)}.png`,
  );
  expect(projectMediaPreview("/images/logo.svg", "https://anipotts.com")).toBe(
    "https://anipotts.com/images/logo.svg",
  );
  for (const unsafe of [
    "//evil.example/a.png",
    "https://evil.example/a.png",
    "javascript:alert(1)",
    undefined,
  ])
    expect(projectMediaPreview(unsafe, "https://anipotts.com")).toBeUndefined();
});

it("removes optional media references without changing unrelated content", () => {
  let source = newProjectSource(record.id, "Keep title");
  source = setEditorialField(source, ["identity", "logo_tone"], "adaptive");
  source = editProjectMedia(source, { type: "upload", slot: "logo", src });
  source = editProjectMedia(source, { type: "logo-alt", value: "Logo" });
  source = editProjectMedia(source, { type: "upload", slot: "preview", src });
  source = editProjectMedia(source, { type: "remove", slot: "logo" });
  expect(data(source).identity).toEqual({ logo_tone: "adaptive" });
  expect(data(source).preview_media.src).toBe(src);
  source = editProjectMedia(source, { type: "remove", slot: "preview" });
  expect(data(source).preview_media).toBeNull();
  expect(data(source).title).toBe("Keep title");
  expect(validateEditorialSource(record, source).success).toBe(true);
});

it("edits story media without changing its text or sibling sections and removes only the reference", () => {
  let source = setEditorialField(
    newProjectSource(record.id),
    ["story"],
    [
      { title: "First", paragraphs: ["Keep text"] },
      { title: "Second", paragraphs: ["Sibling"] },
    ],
  );
  const edit = (change: import("./project-media").ProjectBaseMediaEdit) => {
    source = editProjectMedia(source, {
      type: "story-media",
      index: 0,
      expectedSection: JSON.stringify(data(source).story[0]),
      edit: change,
    });
  };
  edit({ type: "upload", slot: "preview", src });
  edit({ type: "preview-alt", value: "Story screenshot" });
  edit({ type: "preview-caption", value: "Caption" });
  edit({ type: "preview-fit", value: "contain" });
  expect(data(source).story[0]).toEqual({
    title: "First",
    paragraphs: ["Keep text"],
    media: {
      kind: "image",
      src,
      alt: "Story screenshot",
      caption: "Caption",
      fit: "contain",
    },
  });
  expect(validateEditorialSource(record, source).success).toBe(true);
  edit({ type: "remove", slot: "preview" });
  expect(data(source).story).toEqual([
    { title: "First", paragraphs: ["Keep text"] },
    { title: "Second", paragraphs: ["Sibling"] },
  ]);
});
it("rejects late story uploads after the target changes, moves or disappears", () => {
  const sections = [
    { title: "First", paragraphs: ["One"] },
    { title: "Second", paragraphs: ["Two"] },
  ];
  const source = setEditorialField(
    newProjectSource(record.id),
    ["story"],
    sections,
  );
  const edit = {
    type: "story-media",
    index: 0,
    expectedSection: JSON.stringify(sections[0]),
    edit: { type: "upload", slot: "preview", src },
  } as const;
  for (const changed of [
    [],
    [sections[1], sections[0]],
    [{ ...sections[0], title: "Changed" }],
  ]) {
    const current = setEditorialField(source, ["story"], changed);
    expect(() => editProjectMedia(current, edit)).toThrow(
      "story_section_changed",
    );
  }
});
