import { afterEach, expect, it, vi } from "vitest";
import {
  BrowserRecoveryVault,
  createBrowserRecoveryKeyFile,
  inspectBrowserRecoveryEnvelope,
  RECOVERY_ENVELOPE_BYTE_LIMIT,
  RECOVERY_PLAINTEXT_BYTE_LIMIT,
  type RecoveryEncryptionContext,
} from "./browser-recovery-encryption";

const identity: RecoveryEncryptionContext = {
  origin: "http://localhost:4311",
  ownerScope: "synthetic-owner@example.test",
  recordKind: "writing",
  recordId: "synthetic-recovery",
  logoutGeneration: null,
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function unlocked() {
  const file = await createBrowserRecoveryKeyFile();
  const vault = new BrowserRecoveryVault();
  await vault.unlock(file);
  return { file, vault };
}
function bytes(value: string) {
  return Uint8Array.from(
    atob(value.replaceAll("-", "+").replaceAll("_", "/")),
    (char) => char.charCodeAt(0),
  );
}
function base64(value: Uint8Array) {
  return btoa(String.fromCharCode(...value))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}
function changed(serialized: string, edit: (value: any) => void) {
  const value = JSON.parse(serialized);
  edit(value);
  return JSON.stringify(value);
}

it("creates a bounded random key file without unlocking, then imports a non-extractable AES key", async () => {
  const first = await createBrowserRecoveryKeyFile();
  const second = await createBrowserRecoveryKeyFile();
  expect(first).not.toBe(second);
  const file = JSON.parse(first);
  expect(bytes(file.key)).toHaveLength(32);
  expect(file.keyId).toMatch(/^[a-f0-9]{64}$/);
  expect(first.length).toBeLessThan(1024);
  const vault = new BrowserRecoveryVault();
  expect(vault.state).toEqual({ status: "locked", reason: "key-required" });
  // A spy forwards to the real native import, then inspects its actual result.
  const imported = vi.spyOn(crypto.subtle, "importKey");
  await expect(vault.unlock(first)).resolves.toEqual({ keyId: file.keyId });
  const key = await imported.mock.results[0]!.value;
  expect(key.extractable).toBe(false);
  expect(key.algorithm).toEqual({ name: "AES-GCM", length: 256 });
  expect(key.usages).toEqual(["encrypt", "decrypt"]);
  await expect(crypto.subtle.exportKey("raw", key)).rejects.toThrow();
  expect(JSON.stringify(vault)).toBe("{}");
  expect(vault.state).toEqual({ status: "unlocked", keyId: file.keyId });
});

it("round trips exact legacy/corrupt strings, Unicode, CRLF, tombstones and retry identities without plaintext in exports", async () => {
  const { file, vault } = await unlocked();
  const copies = [
    "{corrupt-old-json\r\n\uFEFF café 🌱\ud800",
    JSON.stringify({
      source: "---\r\ntitle: synthetic\r\n---\r\n秘密",
      saved: "prior\n",
      revision: 7,
      pending: {
        source: "same retry",
        expectedRevision: 7,
        requestId: "11111111-1111-4111-8111-111111111111",
      },
      legacyRaw: "{opaque-legacy",
      payload: null,
    }),
    "",
  ];
  for (const raw of copies) {
    const serialized = await vault.encrypt(raw, identity);
    const envelope = JSON.parse(serialized);
    expect(envelope.header.version).toBe(3);
    expect(bytes(envelope.iv)).toHaveLength(12);
    expect(bytes(envelope.ciphertext)).toHaveLength(
      new TextEncoder().encode(JSON.stringify(raw)).length + 16,
    );
    expect(serialized).not.toContain(JSON.parse(file).key);
    if (raw) expect(serialized).not.toContain(raw);
    const newDocument = new BrowserRecoveryVault();
    await newDocument.unlock(file);
    await expect(newDocument.decrypt(serialized, identity)).resolves.toBe(raw);
  }
});

it("requires a key and keeps lost-key recovery separate from destructive reset", async () => {
  const { vault } = await unlocked();
  const serialized = await vault.encrypt("opaque candidate", identity);
  vault.lock("key-lost");
  expect(vault.state).toEqual({ status: "locked", reason: "key-lost" });
  await expect(vault.decrypt(serialized, identity)).rejects.toMatchObject({
    problem: "key-lost",
  });
  await expect(vault.encrypt("new input", identity)).rejects.toMatchObject({
    problem: "key-lost",
  });
  const next = new BrowserRecoveryVault();
  const inspected = inspectBrowserRecoveryEnvelope(serialized);
  expect(inspected).toMatchObject({ ...identity, version: 3 });
  expect(Object.isFrozen(inspected)).toBe(true);
  await expect(next.decrypt(serialized, identity)).rejects.toMatchObject({
    problem: "key-required",
  });
  expect(JSON.parse(serialized).ciphertext).toBeTruthy();
});

it("refuses a different key ID and authenticates a wrong key even if the public header ID is replaced", async () => {
  const first = await unlocked();
  const second = await unlocked();
  const serialized = await first.vault.encrypt("retained input", identity);
  await expect(
    second.vault.decrypt(serialized, identity),
  ).rejects.toMatchObject({ problem: "key-id-mismatch" });
  const tampered = changed(serialized, (value) => {
    value.header.keyId = JSON.parse(second.file).keyId;
  });
  await expect(second.vault.decrypt(tampered, identity)).rejects.toMatchObject({
    problem: "authentication-failed",
  });
  await expect(first.vault.decrypt(serialized, identity)).resolves.toBe(
    "retained input",
  );
});

it.each([
  ["origin", "https://synthetic.example.test"],
  ["ownerScope", "other-owner@example.test"],
  ["recordKind", "project"],
  ["recordId", "another-record"],
  ["logoutGeneration", "11111111-1111-4111-8111-111111111111"],
] as const)(
  "binds %s both to the caller context and authenticated bytes",
  async (field, value) => {
    const { vault } = await unlocked();
    const serialized = await vault.encrypt("private synthetic input", identity);
    const other = { ...identity, [field]: value };
    await expect(vault.decrypt(serialized, other)).rejects.toMatchObject({
      problem: "context-mismatch",
    });
    const tampered = changed(serialized, (item) => {
      item.header[field] = value;
    });
    await expect(vault.decrypt(tampered, other)).rejects.toMatchObject({
      problem: "authentication-failed",
    });
  },
);

it.each(["iv", "ciphertext", "tag"] as const)(
  "rejects %s tampering with native GCM authentication",
  async (field) => {
    const { vault } = await unlocked();
    const serialized = await vault.encrypt("retained original", identity);
    const tampered = changed(serialized, (value) => {
      const key = field === "iv" ? "iv" : "ciphertext";
      const raw = bytes(value[key]);
      raw[field === "tag" ? raw.length - 1 : 0]! ^= 1;
      value[key] = base64(raw);
    });
    await expect(vault.decrypt(tampered, identity)).rejects.toMatchObject({
      problem: "authentication-failed",
    });
    await expect(vault.decrypt(serialized, identity)).resolves.toBe(
      "retained original",
    );
  },
);

it("uses fresh random nonces and refuses reuse across concurrent writes and same-key re-import", async () => {
  const { vault, file } = await unlocked();
  const normal = await Promise.all([
    vault.encrypt("one", identity),
    vault.encrypt("two", identity),
  ]);
  expect(JSON.parse(normal[0]!).iv).not.toBe(JSON.parse(normal[1]!).iv);
  // Control only entropy to force the failure path; encryption remains native.
  vi.spyOn(crypto, "getRandomValues").mockImplementation(
    <T extends ArrayBufferView | null>(array: T): T => {
      if (array)
        new Uint8Array(array.buffer, array.byteOffset, array.byteLength).fill(
          42,
        );
      return array;
    },
  );
  const first = vault.encrypt("reserved before await", identity);
  await expect(
    vault.encrypt("parallel duplicate", identity),
  ).rejects.toMatchObject({ problem: "nonce-reuse" });
  await first;
  vault.lock();
  await vault.unlock(file);
  await expect(
    vault.encrypt("same key re-import", identity),
  ).rejects.toMatchObject({ problem: "nonce-reuse" });
});

it("never releases async crypto results after lock or a later unlock attempt", async () => {
  const { vault, file } = await unlocked();
  const pendingEncryption = vault.encrypt("pending", identity);
  vault.lock();
  await expect(pendingEncryption).rejects.toMatchObject({ problem: "stale" });
  const pendingUnlock = vault.unlock(file);
  vault.lock("key-lost");
  await expect(pendingUnlock).rejects.toMatchObject({ problem: "stale" });
  expect(vault.state).toEqual({ status: "locked", reason: "key-lost" });
  await vault.unlock(file);
  const serialized = await vault.encrypt("pending decryption", identity);
  const pendingDecryption = vault.decrypt(serialized, identity);
  vault.lock();
  await expect(pendingDecryption).rejects.toMatchObject({ problem: "stale" });
  const older = vault.unlock(file);
  const newer = vault.unlock(file);
  await expect(older).rejects.toMatchObject({ problem: "stale" });
  await expect(newer).resolves.toHaveProperty("keyId");
});

it("bounds plaintext before encryption and envelope bytes before parsing", async () => {
  const { vault } = await unlocked();
  await expect(
    vault.encrypt("x".repeat(RECOVERY_PLAINTEXT_BYTE_LIMIT), identity),
  ).rejects.toMatchObject({ problem: "oversized" });
  await expect(
    vault.encrypt("🌱".repeat(RECOVERY_PLAINTEXT_BYTE_LIMIT / 4 + 1), identity),
  ).rejects.toMatchObject({ problem: "oversized" });
  await expect(
    vault.decrypt("x".repeat(RECOVERY_ENVELOPE_BYTE_LIMIT + 1), identity),
  ).rejects.toMatchObject({ problem: "oversized" });
  const boundary = "x".repeat(RECOVERY_PLAINTEXT_BYTE_LIMIT - 2);
  const serialized = await vault.encrypt(boundary, identity);
  expect(new TextEncoder().encode(serialized).length).toBeLessThanOrEqual(
    RECOVERY_ENVELOPE_BYTE_LIMIT,
  );
  await expect(vault.decrypt(serialized, identity)).resolves.toBe(boundary);
});

it("refuses malformed/unsupported envelopes and preserves the original opaque strings", async () => {
  const { vault } = await unlocked();
  const original = await vault.encrypt("safe original", identity);
  const unsupported = [
    "null",
    "[]",
    changed(original, (value) => {
      value.extra = true;
    }),
    changed(original, (value) => {
      value.header.version = 4;
    }),
    changed(original, (value) => {
      value.header.algorithm = "AES-CBC";
    }),
    changed(original, (value) => {
      value.header.recordKind = "unknown";
    }),
    JSON.stringify({
      format: "anipotts.browser-recovery",
      version: 2,
      payload: "old bytes",
    }),
  ];
  for (const raw of unsupported)
    await expect(vault.decrypt(raw, identity)).rejects.toMatchObject({
      problem: "unsupported",
    });
  const corrupt = [
    "{broken",
    original + "\n",
    original.replace('"header":', '"iv":"duplicate","header":'),
    changed(original, (value) => {
      value.iv = "short";
    }),
    changed(original, (value) => {
      value.iv += "=";
    }),
    changed(original, (value) => {
      value.ciphertext = "AAAA";
    }),
    changed(original, (value) => {
      value.header.keyId = "bad";
    }),
    changed(original, (value) => {
      value.header.ownerScope = null;
    }),
    changed(original, (value) => {
      value.header.origin = "http://external.example.test";
    }),
    changed(original, (value) => {
      value.header.logoutGeneration = "";
    }),
  ];
  for (const raw of corrupt)
    await expect(vault.decrypt(raw, identity)).rejects.toMatchObject({
      problem: "corrupt",
    });
  await expect(vault.decrypt(original, identity)).resolves.toBe(
    "safe original",
  );
});

it("validates native-authenticated plaintext framing rather than trusting a valid GCM tag alone", async () => {
  const { vault, file } = await unlocked();
  const template = JSON.parse(await vault.encrypt("template", identity));
  const key = await crypto.subtle.importKey(
    "raw",
    bytes(JSON.parse(file).key),
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  for (const payload of ["{broken", '{"unexpected":"object"}', "null"]) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
        tagLength: 128,
        additionalData: new TextEncoder().encode(
          JSON.stringify(template.header),
        ),
      },
      key,
      new TextEncoder().encode(payload),
    );
    const serialized = JSON.stringify({
      header: template.header,
      iv: base64(iv),
      ciphertext: base64(new Uint8Array(ciphertext)),
    });
    await expect(vault.decrypt(serialized, identity)).rejects.toMatchObject({
      problem: "corrupt",
    });
  }
});

it("reports unavailable cryptography without falling back to a plaintext result", async () => {
  vi.stubGlobal("crypto", undefined);
  await expect(createBrowserRecoveryKeyFile()).rejects.toMatchObject({
    problem: "unavailable",
  });
  const vault = new BrowserRecoveryVault();
  expect(vault.state.status).toBe("locked");
  await expect(vault.encrypt("private input", identity)).rejects.toMatchObject({
    problem: "key-required",
  });
});

it("refuses altered key files, invalid lengths, duplicate fields and future schemas while locking an existing key", async () => {
  const { vault, file } = await unlocked();
  const invalid = [
    [
      changed(file, (value) => {
        value.keyId = "0".repeat(64);
      }),
      "key-id-mismatch",
    ],
    [
      changed(file, (value) => {
        value.key = "AA";
      }),
      "corrupt",
    ],
    [
      changed(file, (value) => {
        value.key = "A".repeat(44);
      }),
      "corrupt",
    ],
    [
      changed(file, (value) => {
        value.key += "=";
      }),
      "corrupt",
    ],
    [
      changed(file, (value) => {
        value.version = 2;
      }),
      "unsupported",
    ],
    [
      changed(file, (value) => {
        value.extra = true;
      }),
      "unsupported",
    ],
    [file.replace('"version":1', '"version":0,"version":1'), "corrupt"],
    ["x".repeat(1025), "oversized"],
  ];
  for (const [raw, problem] of invalid) {
    await vault.unlock(file);
    await expect(vault.unlock(raw!)).rejects.toMatchObject({ problem });
    expect(vault.state.status).toBe("locked");
  }
});
