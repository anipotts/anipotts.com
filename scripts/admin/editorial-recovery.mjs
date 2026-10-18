import {
  createHash,
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

// Offline supplied-snapshot adapter only. No filesystem, provider, fetch, alarms,
// operational configuration or production restore capability belongs here.
export const RECOVERY_LIMITS = Object.freeze({
  bytes: 64 * 1024 * 1024,
  entries: 20_000,
  sourceBytes: 512 * 1024,
  mediaBytes: 10 * 1024 * 1024,
  chunkBytes: 64 * 1024,
});
export const RECOVERY_SCHEMA = "anipotts.editorial-offline.v1";
const hex = /^[a-f0-9]{64}$/u;
const operationId = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const requestId = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/iu;
function timestamp(value) {
  if (typeof value !== "string" || value.length > 64) return false;
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-](\d{2}):?(\d{2}))$/u.exec(
      value,
    );
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  if (
    Number(match[4]) > 23 ||
    Number(match[5]) > 59 ||
    Number(match[6] ?? 0) > 59 ||
    Number(match[7] ?? 0) > 23 ||
    Number(match[8] ?? 0) > 59
  )
    return false;
  const year = Number(match[1]),
    month = Number(match[2]),
    day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
}
const mediaId = /^[a-f0-9]{64}\.(?:jpg|png|webp)$/u;
const types = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };
const text = "text",
  integer = "integer",
  nullableText = "text?",
  nullableInteger = "integer?";
const draftColumns = {
  key: text,
  source: text,
  baseCommit: text,
  baseFileHash: nullableText,
  revision: integer,
  updatedAt: integer,
  discardedAt: nullableInteger,
};
/** Exact named columns, including legacy receipt fields. Unknown columns/tables
 * require a new adapter schema, never omission or a best-effort restore. */
function immutable(value) {
  for (const child of Object.values(value))
    if (child && typeof child === "object") immutable(child);
  return Object.freeze(value);
}
export const RECOVERY_TABLES = immutable({
  editorial: {
    direct_published_bases: {
      key: text,
      publicationId: text,
      inventoryVersion: integer,
    },
    drafts: draftColumns,
    revisions: { key: text, revision: integer, snapshot: text },
    conflicts: {
      id: text,
      key: text,
      source: text,
      expectedRevision: integer,
      createdAt: integer,
    },
    save_requests: { id: text, key: text, payloadHash: text, result: text },
    save_request_identities: {
      id: text,
      key: text,
      payloadHash: text,
      clientHash: nullableText,
      outcome: text,
      revision: nullableInteger,
      legacyResult: nullableText,
    },
    direct_publication_intents: {
      id: text,
      key: text,
      intent: text,
      phase: text,
      version: integer,
      attempts: integer,
      failures: integer,
      dueAt: integer,
      lease: nullableText,
      leaseUntil: integer,
      blocked: nullableText,
      inventoryVersion: nullableInteger,
      publishedAt: nullableText,
      activatedAt: nullableInteger,
      verifiedAt: nullableInteger,
      retryStartedAt: integer,
      superseded: integer,
    },
    direct_publication_diagnostics: { id: text, issues: text },
  },
  content: {
    editorial_published_inventory: { singleton: integer, version: integer },
    editorial_published_revisions: {
      publication_id: text,
      record_kind: text,
      record_id: text,
      source: text,
      revision: integer,
      source_sha256: text,
      published_at: text,
      expected_publication_id: nullableText,
      expected_inventory_version: integer,
      content_schema_version: integer,
    },
    editorial_published_active: {
      record_kind: text,
      record_id: text,
      publication_id: text,
    },
  },
});
const fail = (code) => {
  throw new Error(`offline_recovery_${code}`);
};
export const recoveryHash = (value) =>
  createHash("sha256").update(value).digest("hex");
function canonical(value, depth = 0) {
  if (depth > 24) fail("depth");
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value))
    return JSON.stringify(value);
  if (Array.isArray(value))
    return `[${value.map((item) => canonical(item, depth + 1)).join(",")}]`;
  if (value && Object.getPrototypeOf(value) === Object.prototype)
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) => `${JSON.stringify(key)}:${canonical(value[key], depth + 1)}`,
      )
      .join(",")}}`;
  fail("non_json");
}
function shape(value, fields) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.keys(value).sort().join("\0") !== [...fields].sort().join("\0")
  )
    fail("schema");
}
function array(value) {
  if (!Array.isArray(value) || value.length > RECOVERY_LIMITS.entries)
    fail("entry_limit");
  return value;
}
function columns(row, definition) {
  shape(row, Object.keys(definition));
  for (const [key, type] of Object.entries(definition)) {
    const value = row[key];
    if (value === null && type.endsWith("?")) continue;
    if (
      type.startsWith("text")
        ? typeof value !== "string"
        : !Number.isSafeInteger(value)
    )
      fail("column");
  }
}
function source(value) {
  if (
    typeof value !== "string" ||
    Buffer.byteLength(value) > RECOVERY_LIMITS.sourceBytes
  )
    fail("source_limit");
  return value;
}
function record(kind, id) {
  if (
    !["page", "work", "writing"].includes(kind) ||
    typeof id !== "string" ||
    id.length > 120 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(id) ||
    (kind === "page" &&
      !["home", "work", "writing", "systems", "newsletter"].includes(id))
  )
    fail("record");
  // Version-one portable format pin, like the named SQL columns above. The
  // offline adapter must not require a newer production helper on older bases.
  const directory = { page: "pages", work: "projects", writing: "writing" }[
    kind
  ];
  return `content/public/${directory}/${id}.md`;
}
function recordKey(key) {
  const match =
    /^content\/public\/(pages|projects|writing)\/([^/]+)\.md$/u.exec(key);
  if (
    !match ||
    record(
      { pages: "page", projects: "work", writing: "writing" }[match[1]],
      match[2],
    ) !== key
  )
    fail("record");
  return key;
}
function unique(rows, key) {
  const map = new Map();
  for (const row of rows) {
    const id = key(row);
    if (map.has(id)) fail("duplicate");
    map.set(id, row);
  }
  return map;
}
function json(value) {
  try {
    return JSON.parse(value);
  } catch {
    fail("json");
  }
}
function ref(map, id) {
  if (!map.has(id)) fail("missing_reference");
  return map.get(id);
}
const revisionKey = (key, revision) => JSON.stringify([key, revision]);
function mediaReferences(value) {
  return [
    ...new Set(
      source(value).match(
        /\/images\/editorial\/[a-f0-9]{64}\.(?:jpg|png|webp)/gu,
      ) ?? [],
    ),
  ].map((path) => path.slice("/images/editorial/".length));
}
function bytes(value) {
  if (
    typeof value !== "string" ||
    value.length > Math.ceil(RECOVERY_LIMITS.mediaBytes / 3) * 4 ||
    value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/u.test(value)
  )
    fail("binary");
  const decoded = Buffer.from(value, "base64");
  if (decoded.toString("base64") !== value) fail("binary");
  return decoded;
}
function checkAsset(id, value, type) {
  if (
    !mediaId.test(id) ||
    types[id.split(".")[1]] !== type ||
    value.length < 1 ||
    value.length > RECOVERY_LIMITS.mediaBytes ||
    recoveryHash(value) !== id.split(".")[0]
  )
    fail("media_hash");
}

/** Validate every supplied plane before returning any usable restore state.
 * Hashes establish internal integrity, not authenticity, capture atomicity,
 * external custody, encryption or actual inventory completeness. */
export function validateRecoverySnapshot(snapshot) {
  if (Buffer.byteLength(canonical(snapshot)) > RECOVERY_LIMITS.bytes)
    fail("byte_limit");
  shape(snapshot, [
    "schema",
    "applicationRevision",
    "contentSchemaVersion",
    "editorial",
    "content",
    "publicMedia",
  ]);
  if (
    snapshot.schema !== RECOVERY_SCHEMA ||
    snapshot.contentSchemaVersion !== 1 ||
    typeof snapshot.applicationRevision !== "string" ||
    !/^[a-f0-9]{40}$/u.test(snapshot.applicationRevision)
  )
    fail("unsupported_schema");
  shape(snapshot.editorial, ["tables", "kv", "alarmAt"]);
  if (
    snapshot.editorial.alarmAt !== null &&
    (!Number.isSafeInteger(snapshot.editorial.alarmAt) ||
      snapshot.editorial.alarmAt < 0)
  )
    fail("alarm");
  shape(snapshot.content, ["tables"]);
  let count = 0;
  for (const [store, definitions] of Object.entries(RECOVERY_TABLES)) {
    shape(snapshot[store].tables, Object.keys(definitions));
    for (const [table, definition] of Object.entries(definitions)) {
      for (const row of array(snapshot[store].tables[table])) {
        columns(row, definition);
        count++;
      }
    }
  }
  const e = snapshot.editorial.tables,
    p = snapshot.content.tables;
  const history = unique(e.revisions, (row) =>
    revisionKey(recordKey(row.key), row.revision),
  );
  const draft = unique(e.drafts, (row) => recordKey(row.key));
  const conflict = unique(e.conflicts, (row) => row.id);
  const identity = unique(e.save_request_identities, (row) => row.id);
  const cached = unique(e.save_requests, (row) => row.id);
  const publication = unique(
    p.editorial_published_revisions,
    (row) => row.publication_id,
  );
  const active = unique(p.editorial_published_active, (row) =>
    record(row.record_kind, row.record_id),
  );
  const intent = unique(e.direct_publication_intents, (row) => row.id);
  const publicBase = unique(e.direct_published_bases, (row) =>
    recordKey(row.key),
  );
  const diagnostics = unique(e.direct_publication_diagnostics, (row) => row.id);
  const inventory = p.editorial_published_inventory;
  if (
    inventory.length !== 1 ||
    inventory[0].singleton !== 1 ||
    inventory[0].version < 0
  )
    fail("inventory");
  const privateMedia = new Map(),
    publishedMedia = new Map(),
    relations = [];
  const kv = unique(array(snapshot.editorial.kv), (entry) => entry.key);
  count += kv.size + array(snapshot.publicMedia).length;
  if (count > RECOVERY_LIMITS.entries) fail("entry_limit");
  for (const entry of kv.values()) {
    shape(entry, ["key", "encoding", "value"]);
    if (typeof entry.key !== "string") fail("kv_key");
    if (/^media:[a-f0-9]{64}\.(?:jpg|png|webp)$/u.test(entry.key)) {
      if (entry.encoding !== "json") fail("kv_schema");
      const metadata = entry.value;
      shape(metadata, ["id", "type", "size"]);
      if (
        metadata.id !== entry.key.slice(6) ||
        !Number.isSafeInteger(metadata.size) ||
        metadata.size < 1 ||
        metadata.size > RECOVERY_LIMITS.mediaBytes
      )
        fail("media_metadata");
      const chunks = [];
      for (
        let offset = 0;
        offset < metadata.size;
        offset += RECOVERY_LIMITS.chunkBytes
      ) {
        const chunk = ref(
          kv,
          `${entry.key}:${offset / RECOVERY_LIMITS.chunkBytes}`,
        );
        shape(chunk, ["key", "encoding", "value"]);
        if (chunk.encoding !== "base64") fail("kv_schema");
        const value = bytes(chunk.value);
        if (
          value.length !==
          Math.min(RECOVERY_LIMITS.chunkBytes, metadata.size - offset)
        )
          fail("media_chunk");
        chunks.push(value);
      }
      const value = Buffer.concat(chunks);
      checkAsset(metadata.id, value, metadata.type);
      privateMedia.set(metadata.id, value);
    } else if (/^media:[a-f0-9]{64}\.(?:jpg|png|webp):\d+$/u.test(entry.key)) {
      const parent = entry.key.slice(0, entry.key.lastIndexOf(":"));
      const metadata = ref(kv, parent).value;
      const index = Number(entry.key.slice(entry.key.lastIndexOf(":") + 1));
      if (
        !Number.isSafeInteger(index) ||
        entry.key !== `${parent}:${index}` ||
        index >= Math.ceil(metadata.size / RECOVERY_LIMITS.chunkBytes)
      )
        fail("media_chunk");
    } else if (entry.key.startsWith("media-relation:")) {
      relations.push(entry);
    } else {
      // Future relation/configuration keys cannot be silently dropped.
      fail("unsupported_kv_schema");
    }
  }
  for (const object of snapshot.publicMedia) {
    shape(object, ["key", "type", "base64"]);
    if (publishedMedia.has(object.key)) fail("duplicate");
    const value = bytes(object.base64);
    checkAsset(object.key, value, object.type);
    publishedMedia.set(object.key, value);
  }
  const privateReferences = new Set(),
    publicReferences = new Set();
  const legacyMissingHistory = new Set(),
    reconciliationRequired = [];
  function dimensions(value) {
    shape(value, ["width", "height"]);
    if (
      !Number.isSafeInteger(value.width) ||
      !Number.isSafeInteger(value.height) ||
      value.width < 1 ||
      value.height < 1 ||
      value.width > 2560 ||
      value.height > 2560 ||
      value.width * value.height > 1_000_000
    )
      fail("relation_dimensions");
  }
  for (const entry of relations) {
    if (entry.encoding !== "json") fail("unsupported_kv_schema");
    const value = entry.value;
    shape(value, [
      "version",
      "originalId",
      "parentId",
      "derivativeId",
      "source",
      "output",
      "crop",
      "orientation",
      "codec",
      "id",
    ]);
    if (
      value.version !== 1 ||
      value.orientation !== "decoded-display" ||
      value.codec !== "jsquash-jpeg-1.6.0/png-3.1.1/webp-1.5.0:rgba8-png-v1"
    )
      fail("unsupported_kv_schema");
    dimensions(value.source);
    dimensions(value.output);
    if (value.crop !== null) {
      shape(value.crop, ["x", "y", "width", "height"]);
      const c = value.crop;
      if (
        ![c.x, c.y, c.width, c.height].every(Number.isSafeInteger) ||
        c.x < 0 ||
        c.y < 0 ||
        c.width < 1 ||
        c.height < 1 ||
        c.x + c.width > value.source.width ||
        c.y + c.height > value.source.height ||
        c.width !== value.output.width ||
        c.height !== value.output.height
      )
        fail("relation_crop");
    } else if (
      value.source.width !== value.output.width ||
      value.source.height !== value.output.height
    )
      fail("relation_crop");
    // Peer-owned v1 hash uses this fixed insertion order, not sorted JSON keys.
    const fields = {
      version: value.version,
      originalId: value.originalId,
      parentId: value.parentId,
      derivativeId: value.derivativeId,
      source: { width: value.source.width, height: value.source.height },
      output: { width: value.output.width, height: value.output.height },
      crop:
        value.crop === null
          ? null
          : {
              x: value.crop.x,
              y: value.crop.y,
              width: value.crop.width,
              height: value.crop.height,
            },
      orientation: value.orientation,
      codec: value.codec,
    };
    if (
      value.id !== recoveryHash(JSON.stringify(fields)) ||
      entry.key !== `media-relation:${value.derivativeId}:${value.id}`
    )
      fail("relation_hash");
    for (const id of [value.originalId, value.parentId, value.derivativeId]) {
      if (
        !mediaId.test(id) ||
        (!privateMedia.has(id) && !publishedMedia.has(id))
      )
        fail("missing_media");
      if (privateMedia.has(id)) privateReferences.add(id);
      if (publishedMedia.has(id)) publicReferences.add(id);
    }
  }
  function authored(value) {
    for (const id of mediaReferences(value)) {
      if (!privateMedia.has(id) && !publishedMedia.has(id))
        fail("missing_media");
      if (privateMedia.has(id)) privateReferences.add(id);
      if (publishedMedia.has(id)) publicReferences.add(id);
    }
  }
  function draftSnapshot(value) {
    columns(value, draftColumns);
    recordKey(value.key);
    source(value.source);
    if (
      value.revision < 1 ||
      value.updatedAt < 0 ||
      (value.discardedAt !== null && value.discardedAt < 0) ||
      !/^[a-f0-9]{40}$/u.test(value.baseCommit) ||
      (value.baseFileHash !== null &&
        !/^[a-f0-9]{40}$/u.test(value.baseFileHash))
    )
      fail("draft");
    authored(value.source);
    return value;
  }
  for (const row of history.values()) {
    const value = draftSnapshot(json(row.snapshot));
    if (value.key !== row.key || value.revision !== row.revision)
      fail("history_identity");
  }
  function historyReference(value) {
    const original = draftSnapshot(
      json(ref(history, revisionKey(value.key, value.revision)).snapshot),
    );
    // Publication acknowledgment adjusts only the active baseFileHash; exact
    // authored source/history and the receipt's own base remain preserved.
    for (const key of [
      "key",
      "source",
      "baseCommit",
      "revision",
      "updatedAt",
      "discardedAt",
    ])
      if (value[key] !== original[key]) fail("history_reference");
  }
  for (const row of draft.values()) {
    draftSnapshot(row);
    historyReference(row);
  }
  for (const row of conflict.values()) {
    recordKey(row.key);
    authored(row.source);
    if (!requestId.test(row.id)) fail("retry_identity");
    if (row.expectedRevision < 0 || row.createdAt < 0) fail("conflict");
  }
  function receipt(raw, key, legacy = false) {
    function retainedHistory(value) {
      if (history.has(revisionKey(value.key, value.revision)))
        historyReference(value);
      else if (legacy)
        legacyMissingHistory.add(revisionKey(value.key, value.revision));
      else fail("missing_reference");
    }
    const value = json(raw);
    if (value.ok === true) {
      shape(value, ["ok", "draft"]);
      draftSnapshot(value.draft);
      retainedHistory(value.draft);
      if (value.draft.key !== key) fail("receipt_reference");
      return { outcome: "saved", revision: value.draft.revision };
    }
    shape(value, ["ok", "code", "current", "conflictId"]);
    if (
      value.ok !== false ||
      value.code !== "revision_conflict" ||
      ref(conflict, value.conflictId).key !== key
    )
      fail("receipt_reference");
    if (value.current !== null) {
      draftSnapshot(value.current);
      retainedHistory(value.current);
      if (value.current.key !== key) fail("receipt_reference");
    }
    return {
      outcome: "conflict",
      revision: value.current?.revision ?? null,
      conflictId: value.conflictId,
    };
  }
  for (const row of identity.values()) {
    recordKey(row.key);
    if (
      !requestId.test(row.id) ||
      !hex.test(row.payloadHash) ||
      (row.clientHash !== null && !hex.test(row.clientHash)) ||
      !["saved", "conflict"].includes(row.outcome)
    )
      fail("retry_identity");
    if (row.revision !== null && row.revision < 1) fail("retry_identity");
    if (row.outcome === "saved") {
      if (!Number.isSafeInteger(row.revision) || row.revision < 1)
        fail("retry_identity");
      if (
        !history.has(revisionKey(row.key, row.revision)) &&
        row.legacyResult === null
      )
        fail("missing_reference");
    } else if (ref(conflict, row.id).key !== row.key) fail("retry_identity");
    if (row.legacyResult !== null) {
      const result = receipt(row.legacyResult, row.key, true);
      if (
        result.outcome !== row.outcome ||
        result.revision !== row.revision ||
        (result.outcome === "conflict" && result.conflictId !== row.id)
      )
        fail("retry_identity");
    } else if (row.outcome === "conflict" && !cached.has(row.id))
      reconciliationRequired.push(row.id);
  }
  for (const row of cached.values()) {
    const original = ref(identity, row.id);
    const legacy =
      original.legacyResult !== null &&
      canonical(json(original.legacyResult)) === canonical(json(row.result));
    const result = receipt(row.result, recordKey(row.key), legacy);
    if (
      row.key !== original.key ||
      row.payloadHash !== original.payloadHash ||
      result.outcome !== original.outcome ||
      result.revision !== original.revision ||
      (result.outcome === "conflict" && result.conflictId !== row.id)
    )
      fail("receipt_reference");
  }
  for (const row of publication.values()) {
    const key = record(row.record_kind, row.record_id);
    if (row.content_schema_version !== snapshot.contentSchemaVersion)
      fail("unsupported_schema");
    if (
      !operationId.test(row.publication_id) ||
      row.source_sha256 !== recoveryHash(source(row.source)) ||
      row.revision < 1 ||
      row.expected_inventory_version < 0 ||
      row.expected_inventory_version >= inventory[0].version ||
      !timestamp(row.published_at)
    )
      fail("publication");
    if (row.expected_publication_id !== null) {
      const parent = ref(publication, row.expected_publication_id);
      if (
        record(parent.record_kind, parent.record_id) !== key ||
        parent.expected_inventory_version >= row.expected_inventory_version
      )
        fail("publication_reference");
    }
    for (const id of mediaReferences(row.source)) {
      ref(publishedMedia, id);
      publicReferences.add(id);
    }
  }
  for (const [key, row] of active) {
    const value = ref(publication, row.publication_id);
    if (record(value.record_kind, value.record_id) !== key)
      fail("active_reference");
  }
  for (const row of publicBase.values()) {
    const value = ref(publication, row.publicationId);
    if (
      record(value.record_kind, value.record_id) !== row.key ||
      row.inventoryVersion !== value.expected_inventory_version + 1 ||
      row.inventoryVersion > inventory[0].version
    )
      fail("base_reference");
  }
  for (const row of intent.values()) {
    recordKey(row.key);
    if (
      !operationId.test(row.id) ||
      ![
        row.version,
        row.attempts,
        row.failures,
        row.dueAt,
        row.leaseUntil,
        row.retryStartedAt,
      ].every((n) => n >= 0) ||
      row.version < 1 ||
      ![0, 1].includes(row.superseded) ||
      [row.inventoryVersion, row.activatedAt, row.verifiedAt].some(
        (n) => n !== null && n < 0,
      ) ||
      (row.publishedAt !== null && !timestamp(row.publishedAt))
    )
      fail("intent");
    const value = json(row.intent);
    const fields = [
      "record",
      "operationId",
      "expectedRevision",
      "reviewedSourceSha256",
      "expectedPublicationId",
      "expectedBaselineSha256",
      "source",
      "createdAt",
    ];
    if (Object.hasOwn(value, "action")) fields.push("action");
    shape(value, fields);
    shape(value.record, ["kind", "id"]);
    if (
      record(value.record.kind, value.record.id) !== row.key ||
      value.operationId !== row.id ||
      !Number.isSafeInteger(value.expectedRevision) ||
      value.expectedRevision < 1 ||
      !Number.isSafeInteger(value.createdAt) ||
      value.createdAt < 0 ||
      !["validate", "commit", "verify", "live", "cancelled"].includes(
        row.phase,
      ) ||
      (value.action !== undefined &&
        !["publish", "unpublish"].includes(value.action)) ||
      value.reviewedSourceSha256 !== recoveryHash(source(value.source)) ||
      !hex.test(value.expectedBaselineSha256)
    )
      fail("intent");
    ref(history, revisionKey(row.key, value.expectedRevision));
    authored(value.source);
    if (value.expectedPublicationId !== null) {
      const parent = ref(publication, value.expectedPublicationId);
      if (
        record(parent.record_kind, parent.record_id) !== row.key ||
        parent.source_sha256 !== value.expectedBaselineSha256
      )
        fail("intent_reference");
    }
    if (
      row.activatedAt !== null ||
      row.phase === "live" ||
      publication.has(row.id)
    ) {
      const activated = ref(publication, row.id);
      if (
        record(activated.record_kind, activated.record_id) !== row.key ||
        activated.source !== value.source ||
        activated.revision !== value.expectedRevision ||
        activated.expected_publication_id !== value.expectedPublicationId ||
        ((row.activatedAt !== null || row.phase === "live") &&
          (row.inventoryVersion !== activated.expected_inventory_version + 1 ||
            row.publishedAt !== activated.published_at))
      )
        fail("intent_reference");
    }
  }
  for (const row of diagnostics.values()) {
    ref(intent, row.id);
    if (!Array.isArray(json(row.issues))) fail("diagnostics");
  }
  return {
    legacyMissingHistory: [...legacyMissingHistory].sort(),
    reconciliationRequired: reconciliationRequired.sort(),
    rows: count,
    inventoryVersion: inventory[0].version,
    privateMedia: privateMedia.size,
    publicMedia: publishedMedia.size,
    mediaRelations: relations.length,
    // Orphans are retained and reported, never deleted.
    unreferencedPrivateMedia: [...privateMedia.keys()]
      .filter((id) => !privateReferences.has(id))
      .sort(),
    unreferencedPublicMedia: [...publishedMedia.keys()]
      .filter((id) => !publicReferences.has(id))
      .sort(),
  };
}

export function exportOfflineRecovery(snapshot) {
  const serialized = canonical(snapshot);
  if (Buffer.byteLength(serialized) > RECOVERY_LIMITS.bytes) fail("byte_limit");
  const copy = JSON.parse(serialized);
  validateRecoverySnapshot(copy);
  const bundle = canonical({
    format: "anipotts.offline-editorial-recovery",
    version: 1,
    snapshot: copy,
    sha256: recoveryHash(serialized),
  });
  if (Buffer.byteLength(bundle) > RECOVERY_LIMITS.bytes) fail("byte_limit");
  return bundle;
}
export function validateOfflineRecovery(serialized) {
  if (
    typeof serialized !== "string" ||
    Buffer.byteLength(serialized) > RECOVERY_LIMITS.bytes
  )
    fail("byte_limit");
  const bundle = json(serialized);
  shape(bundle, ["format", "version", "snapshot", "sha256"]);
  if (
    bundle.format !== "anipotts.offline-editorial-recovery" ||
    bundle.version !== 1
  )
    fail("unsupported_schema");
  if (
    !hex.test(bundle.sha256) ||
    recoveryHash(canonical(bundle.snapshot)) !== bundle.sha256
  )
    fail("checksum");
  return {
    snapshot: bundle.snapshot,
    report: validateRecoverySnapshot(bundle.snapshot),
  };
}

/** The only restore target is isolated memory, with no live provider capability.
 * No restored alarm, lease or due intent is scheduled or executed. Snapshot bytes
 * are retained as evidence; an operational adapter needs its own gated design. */
export class OfflineRecoveryTarget {
  #snapshot = null;
  get mode() {
    return "isolated-suspended";
  }
  get isEmpty() {
    return this.#snapshot === null;
  }
  read() {
    return this.#snapshot === null
      ? null
      : JSON.parse(canonical(this.#snapshot));
  }
  static restore(serialized, target) {
    if (Object.getPrototypeOf(target) !== OfflineRecoveryTarget.prototype)
      fail("unsupported_target");
    const { snapshot, report } = validateOfflineRecovery(serialized);
    if (target.#snapshot !== null) fail("target_not_empty");
    target.#snapshot = JSON.parse(canonical(snapshot));
    return { ...report, mode: "isolated-suspended" };
  }
}
export function restoreOfflineRecovery(serialized, target) {
  if (!target || typeof target !== "object") fail("unsupported_target");
  return OfflineRecoveryTarget.restore(serialized, target);
}

// Caller-supplied key only. These pure envelopes do not establish custody or a
// production capture pipeline; IV randomness is never key generation.
const encryptedFormat = "anipotts.offline-editorial-recovery.aes256gcm";
function encryptionKey(key) {
  if (!(key instanceof Uint8Array) || key.byteLength !== 32)
    fail("encryption_key");
  return Buffer.from(key);
}
export function encryptOfflineRecovery(serialized, key) {
  const { snapshot } = validateOfflineRecovery(serialized);
  const header = {
    format: encryptedFormat,
    version: 1,
    schema: snapshot.schema,
    applicationRevision: snapshot.applicationRevision,
    contentSchemaVersion: snapshot.contentSchemaVersion,
  };
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(key), iv);
  cipher.setAAD(Buffer.from(canonical(header)));
  const ciphertext = Buffer.concat([
    cipher.update(serialized, "utf8"),
    cipher.final(),
  ]);
  return canonical({
    ...header,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  });
}
export function decryptOfflineRecovery(serialized, key) {
  const material = encryptionKey(key);
  if (
    typeof serialized !== "string" ||
    Buffer.byteLength(serialized) > RECOVERY_LIMITS.bytes * 2
  )
    fail("byte_limit");
  const envelope = json(serialized);
  shape(envelope, [
    "format",
    "version",
    "schema",
    "applicationRevision",
    "contentSchemaVersion",
    "iv",
    "tag",
    "ciphertext",
  ]);
  const { iv, tag, ciphertext, ...header } = envelope;
  if (
    header.format !== encryptedFormat ||
    header.version !== 1 ||
    header.schema !== RECOVERY_SCHEMA ||
    header.contentSchemaVersion !== 1 ||
    !/^[a-f0-9]{40}$/u.test(header.applicationRevision)
  )
    fail("unsupported_schema");
  function binary(value, maximum) {
    if (typeof value !== "string" || value.length > (maximum * 4) / 3 + 4)
      fail("binary");
    const decoded = Buffer.from(value, "base64");
    if (decoded.toString("base64") !== value || decoded.length > maximum)
      fail("binary");
    return decoded;
  }
  const nonce = binary(iv, 12),
    auth = binary(tag, 16),
    encrypted = binary(ciphertext, RECOVERY_LIMITS.bytes);
  if (nonce.length !== 12 || auth.length !== 16) fail("binary");
  let plaintext;
  try {
    const decipher = createDecipheriv("aes-256-gcm", material, nonce);
    decipher.setAAD(Buffer.from(canonical(header)));
    decipher.setAuthTag(auth);
    plaintext = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    fail("authentication");
  }
  const { snapshot } = validateOfflineRecovery(plaintext);
  if (
    snapshot.schema !== header.schema ||
    snapshot.applicationRevision !== header.applicationRevision ||
    snapshot.contentSchemaVersion !== header.contentSchemaVersion
  )
    fail("identity");
  return plaintext;
}
