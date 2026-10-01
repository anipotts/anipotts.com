import { workflowProviders } from "@anipotts/content/public";

// Reused public renderers need the same provider marks in private previews.
// Include just the registered marks, rather than shipping entire brand sets.
/** @type {Record<string, string[]>} */
export const previewIcons = { ph: ["*"] };
for (const { icon } of Object.values(workflowProviders)) {
  if (!icon) continue;
  const [set, name] = icon.split(":");
  (previewIcons[set] ??= []).push(name);
}
