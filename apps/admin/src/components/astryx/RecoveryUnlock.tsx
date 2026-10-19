import React, {
  useRef,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { VStack } from "@astryxdesign/core/VStack";
import { Heading } from "@astryxdesign/core/Heading";
import { Button, Banner } from "./WritingControls";
import { recoverySession } from "../../lib/browser-recovery-session";
import {
  createBrowserRecoveryKeyFile,
  RecoveryEncryptionError,
} from "../../lib/browser-recovery-encryption";
import { recoveryV3Prefix } from "../../lib/encrypted-browser-recovery";
import { protectedSessionIsLocked } from "../../lib/protected-admin-json";
import { downloadBrowserRecovery } from "./BrowserRecoveryNotice";

const serverState = { status: "locked" as const, keyId: null, lost: false };
function inventory(scope: string) {
  const keys = new Set<string>();
  let legacy = false;
  try {
    for (const key of Object.keys(localStorage)) {
      const prefix = [
        "editorial-recovery:v1:",
        "editorial-recovery:v2:",
        recoveryV3Prefix,
      ].find((value) => key.startsWith(value));
      if (!prefix) continue;
      try {
        const parts = JSON.parse(
          key.slice(prefix.length).replace(/:archive:[a-f\d-]{36}$/i, ""),
        );
        if (parts[0] !== scope) continue;
        if (prefix === recoveryV3Prefix && typeof parts[3] === "string")
          keys.add(parts[3]);
        else legacy = true;
      } catch {
        /* Unknown bytes stay untouched. */
      }
    }
  } catch {
    /* Admission independently handles unavailable storage. */
  }
  return { keys, legacy };
}
export function RecoveryUnlock({
  scope,
  children,
}: {
  scope?: string;
  children: ReactNode;
}) {
  const [session] = useState(() =>
    typeof window === "undefined" ? null : recoverySession(),
  );
  const state = useSyncExternalStore(
    session?.subscribe ?? (() => () => {}),
    session?.snapshot ?? (() => serverState),
    () => serverState,
  );
  const input = useRef<HTMLInputElement>(null);
  const mounted = useRef(false);
  const operation = useRef(0);
  const running = useRef(false);
  const objectUrl = useRef<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const revoke = () => {
    if (objectUrl.current) {
      URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = null;
    }
  };
  useEffect(() => {
    mounted.current = true;
    setHydrated(true);
    return () => {
      mounted.current = false;
      operation.current++;
      if (running.current) session?.lock();
      revoke();
    };
  }, []);
  useEffect(() => {
    if (state.status === "unlocked") revoke();
  }, [state.status]);
  const [expected, setExpected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const stored =
    hydrated && scope
      ? inventory(scope)
      : { keys: new Set<string>(), legacy: false };
  const admitted = () =>
    Boolean(mounted.current && scope && session && !protectedSessionIsLocked());
  async function create() {
    if (!admitted() || running.current) return;
    const current = ++operation.current;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      const text = await createBrowserRecoveryKeyFile();
      if (!admitted() || current !== operation.current) return;
      const id = (JSON.parse(text) as { keyId: string }).keyId;
      revoke();
      const url = URL.createObjectURL(
        new Blob([text], { type: "application/json" }),
      );
      objectUrl.current = url;
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `browser-recovery-key-${id.slice(0, 12)}.json`;
      anchor.click();
      setTimeout(() => {
        if (objectUrl.current === url) revoke();
      }, 1000);
      setExpected(id);
    } catch {
      if (admitted() && current === operation.current)
        setError("Couldn’t prepare a recovery key. Try again.");
    } finally {
      if (mounted.current && current === operation.current) {
        running.current = false;
        setBusy(false);
      }
    }
  }
  async function open(file?: File) {
    if (input.current) input.current.value = "";
    if (!file || !admitted()) return;
    const current = ++operation.current;
    session!.lock();
    running.current = true;
    setBusy(true);
    setError("");
    try {
      if (file.size > 1024) throw new RecoveryEncryptionError("oversized");
      const raw = await file.text();
      if (!admitted() || current !== operation.current) return;
      const id: unknown = JSON.parse(raw).keyId;
      if (
        !expected &&
        stored.keys.size &&
        (typeof id !== "string" || !stored.keys.has(id))
      )
        throw new RecoveryEncryptionError("key-id-mismatch");
      await session!.unlock(raw, scope!, expected ?? undefined);
      if (!admitted() || current !== operation.current) return;
      setExpected(null);
    } catch (cause) {
      if (admitted() && current === operation.current)
        setError(
          cause instanceof RecoveryEncryptionError &&
            cause.problem === "key-id-mismatch"
            ? "This key does not match. Choose the saved recovery key, or explicitly create a new key for future edits."
            : "Couldn’t unlock recovery with this file. Existing copies have been kept.",
        );
    } finally {
      if (mounted.current && current === operation.current) {
        running.current = false;
        setBusy(false);
      }
    }
  }
  if (state.status === "unlocked")
    return (
      <>
        {stored.legacy && (
          <Banner
            status="warning"
            title="Older browser copies remain plaintext"
            description="New recovery writes and recovery downloads are encrypted. Older copies are preserved for comparison and included in encrypted downloads."
          />
        )}
        {[...stored.keys].some((id) => id !== state.keyId) && (
          <Banner
            status="warning"
            title="Some copies may need an older key"
            description="Other key identities are preserved. Keep the earlier key files to recover those copies."
          />
        )}
        {children}
      </>
    );
  if (state.status === "closing")
    return <p role="status">Locking browser recovery…</p>;
  return (
    <VStack gap={4}>
      <Heading level={1}>Unlock browser recovery</Heading>
      <p>
        Choose your recovery key file to edit. The key stays in this document’s
        memory. Reloading or session expiry requires the file again.
      </p>
      {expected && (
        <Banner
          status="info"
          title="Choose the key file you just saved"
          description="Re-import verifies the saved file before authoring opens. Keep it separately from recovery downloads."
        />
      )}
      {state.lost && (
        <Banner
          status="warning"
          title="Earlier encrypted copies are preserved"
          description="They still require their original key. Creating a new key starts a separate recovery identity and cannot recover older unsaved input."
        />
      )}
      {!scope && (
        <Banner
          status="warning"
          title="Owner scope is unavailable"
          description="Reload after signing in to continue."
        />
      )}
      <label>
        Recovery key file
        <input
          ref={input}
          type="file"
          accept="application/json,.json"
          disabled={!hydrated || busy || !scope}
          onChange={(event) => void open(event.currentTarget.files?.[0])}
        />
      </label>
      <Button
        label={
          expected
            ? "Prepare another recovery key"
            : "Create a new recovery key"
        }
        clickAction={() => void create()}
        isDisabled={!hydrated || busy || !scope}
      />
      {!expected && (
        <Button
          label="I no longer have the key"
          variant="secondary"
          clickAction={() => session?.lock(true)}
          isDisabled={!hydrated || busy}
        />
      )}
      {stored.keys.size > 0 && (
        <Button
          label="Download opaque recovery copies"
          variant="secondary"
          isDisabled={!hydrated || busy}
          clickAction={() => {
            if (!admitted()) return;
            try {
              const entries: Record<string, string> = {};
              for (const key of Object.keys(localStorage)) {
                if (!key.startsWith(recoveryV3Prefix)) continue;
                try {
                  const parts = JSON.parse(
                    key
                      .slice(recoveryV3Prefix.length)
                      .replace(/:archive:[a-f\d-]{36}$/i, ""),
                  );
                  if (parts[0] !== scope) continue;
                } catch {
                  continue;
                }
                const raw = localStorage.getItem(key);
                if (raw !== null) entries[key] = raw;
              }
              if (!admitted()) return;
              downloadBrowserRecovery(
                JSON.stringify({
                  format: "anipotts.browser-recovery-opaque-export",
                  version: 3,
                  entries,
                }),
                "opaque-browser-recovery.json",
              );
            } catch {
              setError(
                "Couldn’t read the stored copies. They have not been changed.",
              );
            }
          }}
        />
      )}
      {stored.keys.size > 0 && (
        <p>
          Opaque export copies encrypted-recovery entries unchanged, including
          unreadable bytes. It excludes older plaintext entries and adds no key
          or current input. Original keys are still required.
        </p>
      )}
      <p>
        Without the original key, unsaved encrypted input cannot be recovered.
        Server-saved drafts remain available after setup with a new key. Signing
        out clears browser recovery.
      </p>
      {error && <p role="alert">{error}</p>}
    </VStack>
  );
}
