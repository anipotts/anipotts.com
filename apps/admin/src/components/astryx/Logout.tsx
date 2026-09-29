import {
  lockProtectedSession,
  protectedAdminJson,
} from "../../lib/protected-admin-json";
import React, { useEffect, useRef, useState } from "react";
import { Heading } from "@astryxdesign/core/Heading";
import { VStack } from "@astryxdesign/core/VStack";
import { HStack } from "@astryxdesign/core/HStack";
import { Button } from "@astryxdesign/core/Button";
import { Banner } from "@astryxdesign/core/Banner";
import {
  clearEditorialRecovery,
  recoveryLogoutKey,
} from "../../lib/draft-recovery";
import { AdminWordmark } from "./AdminWordmark";

/** Sign out always ends the Cloudflare Access session. */
function allowedDestination(value: unknown): value is string {
  return value === "/cdn-cgi/access/logout";
}

/** Cancel returns to the admin page that opened sign out, or the overview. */
function returnFromSignOut(event: React.MouseEvent) {
  try {
    const from = document.referrer ? new URL(document.referrer) : null;
    if (from?.origin === location.origin && history.length > 1) {
      event.preventDefault();
      history.back();
    }
  } catch {
    /* The link's own href is the fallback. */
  }
}

export function Logout({
  navigate = (destination: string) => window.location.assign(destination),
}: {
  navigate?: (destination: string) => void;
}) {
  const pending = useRef(false);
  const active = useRef(true);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      controller.current?.abort();
    };
  }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function signOut() {
    if (pending.current) return;
    pending.current = true;
    controller.current = new AbortController();
    setBusy(true);
    setError("");
    // Revoke local custody before any potentially expired provider request.
    window.dispatchEvent(new Event(recoveryLogoutKey));
    lockProtectedSession("logout");
    try {
      let complete = false;
      try {
        complete = await clearEditorialRecovery(window.localStorage);
      } catch {
        /* Storage access failure is incomplete cleanup. */
      }
      if (!active.current) return;
      if (!complete) throw new Error("cleanup incomplete");
      const timer = setTimeout(() => controller.current?.abort(), 5000);
      try {
        const options = { signal: controller.current.signal };
        const tokenResponse = await protectedAdminJson(
          "/api/admin/logout",
          options,
          fetch,
          { allowLocked: true },
        );
        if (!tokenResponse.ok) throw new Error("request failed");
        const token = await tokenResponse.json();
        if (!active.current) return;
        if (
          typeof token.csrf !== "string" ||
          !token.csrf ||
          !allowedDestination(token.destination)
        )
          throw new Error("invalid response");
        await protectedAdminJson(
          "/api/admin/logout",
          {
            ...options,
            method: "POST",
            headers: { "x-admin-csrf": token.csrf },
          },
          fetch,
          { allowLocked: true },
        );
      } catch {
        /* App cookie cleanup is best effort; Access logout is the next navigation. */
      } finally {
        clearTimeout(timer);
      }
      if (active.current) navigate("/cdn-cgi/access/logout");
    } catch {
      if (!active.current) return;
      setError(
        "Browser cleanup did not finish. Sign out is incomplete. Try again",
      );
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <VStack gap={8} hAlign="start" className="admin-logout">
      <AdminWordmark />
      <Heading level={1} className="sr-only">
        Sign out
      </Heading>
      {error && <Banner status="error" title={error} />}
      <HStack gap={3}>
        <Button
          variant="primary"
          onClick={() => void signOut()}
          isDisabled={busy}
          label={busy ? "Signing out…" : "Sign out"}
        />
        <Button
          href="/"
          variant="secondary"
          isDisabled={busy}
          label="Cancel"
          onClick={returnFromSignOut}
        />
      </HStack>
    </VStack>
  );
}
