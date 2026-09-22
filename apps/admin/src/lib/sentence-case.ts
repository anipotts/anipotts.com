/** A stored key as interface text: underscores become spaces and the first
 * letter is capitalized. `hidden_from_site` reads "Hidden from site". */
export function sentenceCase(value: string): string {
  const text = value.replaceAll("_", " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}
