import React from "react";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { safeReturnPath } from "../../lib/editorial-return-path";

/** Reload preserves expiry recovery. Changing account is deliberate: the
 * existing sign-out page confirms cleanup before the fixed Access logout. */
export function AuthReentry({ href, size }: { href: string; size?: "sm" }) {
  const safe = safeReturnPath(href);
  const destination =
    safe &&
    !/[\u0000-\u0020]/u.test(href) &&
    !/^\/(?:auth|api)(?:\/|$)/.test(safe.pathname)
      ? safe.pathname + safe.search + safe.hash
      : "/";
  return (
    <HStack gap={3}>
      <Button
        label="Sign in again"
        href={destination}
        size={size}
        onClick={(event) => event.stopPropagation()}
      />
      <Button
        label="Sign out to change account"
        href="/auth/logout"
        size={size}
        variant="secondary"
        onClick={(event) => event.stopPropagation()}
      />
    </HStack>
  );
}
