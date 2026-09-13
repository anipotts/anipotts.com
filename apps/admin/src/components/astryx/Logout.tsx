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

function allowedDestination(value: unknown): value is string {
  return value === "/auth" || value === "/cdn-cgi/access/logout";
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
    try {
      const options = {
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
        signal: controller.current.signal,
      } as const;
      const tokenResponse = await fetch("/api/admin/logout", options);
      if (!tokenResponse.ok) throw new Error("request failed");
      const token = await tokenResponse.json();
      if (!active.current) return;
      if (
        typeof token.csrf !== "string" ||
        !token.csrf ||
        !allowedDestination(token.destination)
      )
        throw new Error("invalid response");
      const response = await fetch("/api/admin/logout", {
        ...options,
        method: "POST",
        headers: { "x-admin-csrf": token.csrf },
      });
      if (!response.ok) throw new Error("request failed");
      const result = await response.json();
      if (!active.current) return;
      if (result.ok !== true || !allowedDestination(result.destination))
        throw new Error("invalid response");
      try {
        clearEditorialRecovery(window.localStorage);
      } catch {
        // Storage denial must not prevent completing server-side sign out.
        window.dispatchEvent(new Event(recoveryLogoutKey));
      }
      navigate(result.destination);
    } catch {
      if (!active.current) return;
      setError("Could not finish signing out. Try again.");
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <VStack gap={6}>
      <Heading level={1}>Sign out</Heading>
      {error && <Banner status="error" title={error} />}
      <HStack gap={3}>
        <Button
          onClick={() => void signOut()}
          isDisabled={busy}
          label={busy ? "Signing out…" : "Sign out"}
        />
        <Button
          href="/content"
          variant="secondary"
          isDisabled={busy}
          label="Cancel"
        />
      </HStack>
    </VStack>
  );
}
