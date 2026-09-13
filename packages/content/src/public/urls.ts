// These predicates deliberately reject, rather than normalize, authored URLs.
// Browsers normalize backslashes and controls before navigation. Check both raw
// and percent-encoded forms before parsing, including mailto header values.
function hasUnsafeCharacters(value: string): boolean {
  return (
    !value ||
    /[\u0000-\u0020\u007f\s\\<>"']/u.test(value) ||
    /%(?:0[\da-f]|1[\da-f]|7f|5c)/iu.test(value)
  );
}

export function safeHttpsUrl(value: string): boolean {
  if (hasUnsafeCharacters(value) || !/^https:\/\//iu.test(value)) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export function safeLocalAssetUrl(value: string): boolean {
  return (
    !hasUnsafeCharacters(value) &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !/^\/(?:%2f)/iu.test(value)
  );
}

/** Inline images can reference HTTPS assets; structured project media is local. */
export function safeAssetUrl(value: string): boolean {
  return safeLocalAssetUrl(value) || safeHttpsUrl(value);
}

export function safeContentLinkUrl(value: string): boolean {
  return (
    safeAssetUrl(value) ||
    (!hasUnsafeCharacters(value) && /^#[\w-]+$/u.test(value))
  );
}

/** Contact-bearing copy may link to one mailbox, with optional subject/body. */
export function safeContactLinkUrl(value: string): boolean {
  if (safeContentLinkUrl(value)) return true;
  if (hasUnsafeCharacters(value) || !value.startsWith("mailto:")) return false;
  try {
    const url = new URL(value);
    // Mail handlers interpret the decoded recipient. Validate that mailbox,
    // rather than allowing encoded commas or extra @ signs through the URL form.
    const recipient = decodeURIComponent(url.pathname);
    return (
      url.protocol === "mailto:" &&
      !url.hash &&
      !hasUnsafeCharacters(recipient) &&
      /^[\w.!#$%&*+/=?^`{|}~-]+@[\w-]+(?:\.[\w-]+)+$/u.test(recipient) &&
      [...url.searchParams.keys()].every((key) =>
        ["subject", "body"].includes(key),
      )
    );
  } catch {
    return false;
  }
}

export function safeHomepageAssetUrl(value: string): boolean {
  if (!safeLocalAssetUrl(value) || !value.startsWith("/images/")) return false;
  // Keep the existing local-images-only contract, including encoded traversal.
  return !value.replace(/%2e/giu, ".").includes("..");
}
