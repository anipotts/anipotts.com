import { parseEditorialSource } from "@anipotts/content/editorial/source";
import { projectSchema } from "@anipotts/content/public/schema";
import {
  editorialMediaId,
  editorialMediaPrefix,
  editorialImagePreview,
} from "./editorial-media";

export type ProjectMediaEdit =
  | { type: "remove"; slot: "logo" | "preview" }
  | { type: "upload"; slot: "logo" | "preview"; src: string }
  | { type: "logo-alt"; value: string }
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
  } else if (edit.type === "logo-alt") {
    parsed.document.setIn(["identity", "logo_alt"], edit.value);
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
