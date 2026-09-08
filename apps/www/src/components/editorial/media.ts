/** Editorial assets are author-selected files or HTTPS sources. */
export function mediaHref(value: string): string {
  if (/^\/(?!\/)[^\s\\]*$/.test(value)) return value;
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("Editorial media needs a local path or an HTTPS URL.");
  }
  return url.href;
}

export function demoHref(value: string, allowedOrigin?: string): string {
  // Opaque-origin sandboxed demos live in this deliberately separate directory.
  if (/^\/demos\/[a-zA-Z0-9/_-]+(?:\.html)?$/.test(value)) return value;
  const url = new URL(mediaHref(value));
  if (!allowedOrigin || url.origin !== new URL(allowedOrigin).origin) {
    throw new Error("Remote demos require their exact approved HTTPS origin.");
  }
  return url.href;
}
