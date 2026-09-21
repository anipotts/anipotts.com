import { parseEditorialSource } from "@anipotts/content/editorial/source";
import { projectSchema } from "@anipotts/content/public/schema";
import {
  editorialMediaId,
  editorialMediaPrefix,
  editorialImagePreview,
} from "./editorial-media";

/** Existing public renderer assets, not arbitrary icon names. */
export const projectIconOptions = [
  { value: "", label: "No fallback icon" },
  { value: "briefcase", label: "Briefcase" },
  { value: "chart-line-up", label: "Chart" },
  { value: "desktop-tower", label: "Computer" },
  { value: "hard-drives", label: "Storage" },
  { value: "book-open-text", label: "Book" },
  { value: "waveform", label: "Waveform" },
  { value: "activity", label: "Activity" },
] as const;

export type ProjectMediaEdit =
  | {
      type: "story-media";
      index: number;
      expectedSection: string;
      edit: ProjectBaseMediaEdit;
    }
  | ProjectBaseMediaEdit;

export type ProjectBaseMediaEdit =
  | { type: "remove"; slot: "logo" | "preview" }
  | { type: "upload"; slot: "logo" | "preview"; src: string }
  | { type: "logo-alt"; value: string }
  | { type: "icon"; value: string }
  | { type: "logo-tone"; value: "default" | "light" | "adaptive" }
  | { type: "preview-alt" | "preview-caption"; value: string }
  | { type: "preview-fit"; value: "cover" | "contain" };

/** Resolve only schema-approved local paths. Private uploads use the owner API. */
export function projectMediaPreview(
  src: unknown,
  siteUrl: string,
): string | undefined {
  if (
    typeof src !== "string" ||
    !projectSchema.shape.identity.shape.logo_src.safeParse(src).success
  )
    return undefined;
  const preview = editorialImagePreview(src);
  return preview !== src ? preview : new URL(src, siteUrl).href;
}

/** Apply against the current editor source, including after an asynchronous upload. */
export function editProjectMedia(
  source: string,
  edit: ProjectMediaEdit,
): string {
  const parsed = parseEditorialSource(source);
  const data = parsed.data as Record<string, unknown>;
  if (edit.type === "story-media") {
    const story = data.story;
    if (
      !Array.isArray(story) ||
      !Number.isSafeInteger(edit.index) ||
      edit.index < 0 ||
      !story[edit.index] ||
      JSON.stringify(story[edit.index]) !== edit.expectedSection
    )
      throw new Error("story_section_changed");
    if (
      ("slot" in edit.edit && edit.edit.slot !== "preview") ||
      edit.edit.type === "logo-alt" ||
      edit.edit.type === "logo-tone" ||
      edit.edit.type === "icon"
    )
      throw new Error("invalid_story_media_edit");
    const section = story[edit.index] as Record<string, unknown>;
    // Reuse the same validated media mutation without serializing unrelated fields.
    const temporary = `---\npreview_media: ${JSON.stringify(section.media ?? null)}\n---\n`;
    const updated = parseEditorialSource(editProjectMedia(temporary, edit.edit))
      .data as Record<string, unknown>;
    if (updated.preview_media === null)
      parsed.document.deleteIn(["story", edit.index, "media"]);
    else
      parsed.document.setIn(
        ["story", edit.index, "media"],
        parsed.document.createNode(updated.preview_media),
      );
    return `${parsed.opening}${parsed.document.toString({ lineWidth: 0 }).replace(/\r?\n/gu, parsed.newline)}${parsed.closing}${parsed.body}`;
  }
  const preview = data.preview_media;
  if (edit.type === "remove") {
    if (edit.slot === "logo") {
      parsed.document.deleteIn(["identity", "logo_src"]);
      parsed.document.deleteIn(["identity", "logo_alt"]);
    } else parsed.document.set("preview_media", null);
  } else if (edit.type === "upload") {
    if (
      !edit.src.startsWith(editorialMediaPrefix) ||
      !editorialMediaId.test(edit.src.slice(editorialMediaPrefix.length))
    )
      throw new Error("invalid_uploaded_image");
    if (edit.slot === "logo") {
      parsed.document.setIn(["identity", "logo_src"], edit.src);
    } else {
      if (!preview || typeof preview !== "object") {
        parsed.document.set(
          "preview_media",
          parsed.document.createNode({
            kind: "image",
            src: edit.src,
            alt: "",
            fit: "cover",
          }),
        );
      } else {
        parsed.document.setIn(["preview_media", "kind"], "image");
        parsed.document.setIn(["preview_media", "src"], edit.src);
      }
    }
  } else if (edit.type === "icon") {
    if (!projectIconOptions.some((option) => option.value === edit.value))
      throw new Error("invalid_project_icon");
    if (edit.value) parsed.document.setIn(["identity", "icon"], edit.value);
    else parsed.document.deleteIn(["identity", "icon"]);
  } else if (edit.type === "logo-tone") {
    if (
      !projectSchema.shape.identity.shape.logo_tone.safeParse(edit.value)
        .success
    )
      throw new Error("invalid_logo_tone");
    parsed.document.setIn(["identity", "logo_tone"], edit.value);
  } else if (edit.type === "logo-alt") {
    if (!edit.value.trim()) parsed.document.deleteIn(["identity", "logo_alt"]);
    else parsed.document.setIn(["identity", "logo_alt"], edit.value);
  } else {
    if (!preview || typeof preview !== "object") return source;
    const field =
      edit.type === "preview-alt"
        ? "alt"
        : edit.type === "preview-caption"
          ? "caption"
          : "fit";
    if (
      field === "fit" &&
      !projectSchema.shape.preview_media
        .removeDefault()
        .unwrap()
        .shape.fit.safeParse(edit.value).success
    )
      throw new Error("invalid_media_fit");
    if (field === "caption" && !edit.value.trim())
      parsed.document.deleteIn(["preview_media", "caption"]);
    else parsed.document.setIn(["preview_media", field], edit.value);
  }
  return `${parsed.opening}${parsed.document.toString({ lineWidth: 0 }).replace(/\r?\n/gu, parsed.newline)}${parsed.closing}${parsed.body}`;
}
