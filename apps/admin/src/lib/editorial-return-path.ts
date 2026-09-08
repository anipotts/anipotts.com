/** Navigation stays on the current deployment; auth and API URLs are not destinations. */
export function editorialReturnPath(value: string | null): string {
  if (!value || !value.startsWith("/") || /[\\\u0000-\u0020]/.test(value)) {
    return "/content";
  }
  const origin = "https://editorial.invalid";
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin) return "/content";
    if (!/^\/(?:content|newsletter)(?:\/|$)/.test(url.pathname)) {
      return "/content";
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/content";
  }
}
