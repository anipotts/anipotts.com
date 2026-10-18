import { createHash, randomUUID } from "node:crypto";

export const ORIGIN = "https://admin.anipotts.com";
const MAX_SOURCE = 512 * 1024;
// A record includes a draft and baseline; JSON escaping can expand both by 6x.
const MAX_RESPONSE = 8 * 1024 * 1024;
const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/iu;
const HASH = /^[a-f0-9]{64}$/u;
const csrfName = "__Host-editorial-csrf";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const fail = (code) => {
  throw new Error(code);
};

export function recordIdentity(kind, id) {
  if (
    !["page", "work", "writing"].includes(kind) ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(id ?? "") ||
    id.length > 120 ||
    (kind === "page" &&
      !["home", "work", "writing", "systems", "newsletter"].includes(id))
  )
    fail("invalid_record");
  return { kind, id };
}

function source(value) {
  if (typeof value !== "string" || Buffer.byteLength(value) > MAX_SOURCE)
    fail("invalid_source");
  return value;
}

function revision(value, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) fail("invalid_revision");
  return value;
}

function operation(value) {
  if (!UUID.test(value ?? "")) fail("invalid_request_identity");
  return value;
}

/** Human Access session only. Never accept service tokens or credentials in URLs. */
function ownerCookie(value) {
  if (
    typeof value !== "string" ||
    value.length > 16384 ||
    !/^CF_Authorization=[A-Za-z0-9._~-]+$/u.test(value)
  )
    fail("owner_session_required");
  return value;
}

function ownerCredentials(ownerSession, ownerToken) {
  if (ownerSession !== undefined && ownerToken !== undefined)
    fail("choose_one_owner_session");
  if (ownerToken !== undefined) {
    if (
      typeof ownerToken !== "string" ||
      ownerToken.length > 16384 ||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(ownerToken)
    )
      fail("owner_session_required");
    return { "Cf-Access-Token": ownerToken };
  }
  return { Cookie: ownerCookie(ownerSession) };
}

async function jsonBody(response) {
  if (
    !response.headers
      .get("content-type")
      ?.split(";")[0]
      .trim()
      .match(/^application\/json$/iu)
  )
    fail("non_json_response");
  const chunks = [];
  let size = 0;
  if (!response.body) fail("invalid_response");
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE) fail("response_too_large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)),
    );
  } catch {
    fail("invalid_response");
  }
}

function checkedSnapshot(snapshot) {
  const draft = snapshot?.draft;
  const base = snapshot?.base;
  if (
    !base ||
    (base.publicationId !== undefined &&
      base.publicationId !== null &&
      typeof base.publicationId !== "string")
  )
    fail("invalid_snapshot");
  source(base.source);
  if (draft) {
    source(draft.source);
    revision(draft.revision, 1);
    if (draft.discardedAt !== null) fail("discarded_draft");
  }
  return snapshot;
}

export function reviewDigest(review) {
  return hash(JSON.stringify(review));
}

export function validateReview(review) {
  if (
    !review ||
    review.format !== "anipotts.editorial-review" ||
    review.version !== 1 ||
    review.origin !== ORIGIN ||
    review.action !== "publish"
  )
    fail("invalid_review");
  const record = recordIdentity(review.record?.kind, review.record?.id);
  source(review.source);
  source(review.baselineSource);
  revision(review.expectedRevision, 1);
  operation(review.operationId);
  if (
    !HASH.test(review.reviewedSourceSha256 ?? "") ||
    !HASH.test(review.expectedBaselineSha256 ?? "") ||
    review.reviewedSourceSha256 !== hash(review.source) ||
    review.expectedBaselineSha256 !== hash(review.baselineSource) ||
    (review.expectedPublicationId !== null &&
      typeof review.expectedPublicationId !== "string")
  )
    fail("invalid_review");
  return record;
}

export function createEditorialClient({
  ownerSession,
  ownerToken,
  fetch: fetcher = globalThis.fetch,
}) {
  const credentials = ownerCredentials(ownerSession, ownerToken);

  async function request(action, record, body, parameters = {}) {
    const url = new URL(`/api/editorial/${action}`, ORIGIN);
    if (record) {
      recordIdentity(record.kind, record.id);
      url.searchParams.set("kind", record.kind);
      url.searchParams.set("id", record.id);
    }
    for (const [key, value] of Object.entries(parameters))
      url.searchParams.set(key, String(value));
    const headers = new Headers({
      ...credentials,
      Accept: "application/json",
      "X-Requested-With": "XMLHttpRequest",
    });
    if (body !== undefined) {
      const issued = await request("csrf");
      const token = issued.body?.csrf;
      const cookies = issued.response.headers.getSetCookie();
      const matches = cookies.filter((cookie) =>
        cookie.startsWith(`${csrfName}=`),
      );
      if (
        !HASH.test(token ?? "") ||
        matches.length !== 1 ||
        matches[0].split(";")[0] !== `${csrfName}=${token}`
      )
        fail("csrf_unavailable");
      headers.set(
        "Cookie",
        credentials.Cookie
          ? `${credentials.Cookie}; ${csrfName}=${token}`
          : `${csrfName}=${token}`,
      );
      headers.set("Origin", ORIGIN);
      headers.set("Sec-Fetch-Site", "same-origin");
      headers.set("Content-Type", "application/json");
      headers.set("X-Editorial-CSRF", token);
    }
    let response;
    try {
      response = await fetcher(url.href, {
        method: body === undefined ? "GET" : "POST",
        headers,
        redirect: "manual",
        cache: "no-store",
        signal: AbortSignal.timeout(30000),
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      fail("request_interrupted_check_status_before_retry");
    }
    if (
      response.redirected ||
      (response.status >= 300 && response.status < 400) ||
      (response.url && response.url !== url.href)
    ) {
      await response.body?.cancel().catch(() => {});
      fail("owner_session_reentry_required");
    }
    const result = await jsonBody(response);
    if (!response.ok) {
      const code =
        typeof result?.error === "string" ? result.error : result?.code;
      fail(
        /^[a-z0-9_]{1,100}$/u.test(code ?? "")
          ? `server_${code}`
          : `http_${response.status}`,
      );
    }
    return { body: result, response };
  }

  const read = async (record) =>
    checkedSnapshot((await request("record", record)).body);
  return {
    read,
    async history(record, beforeRevision) {
      const parameters =
        beforeRevision === undefined
          ? { limit: 1 }
          : { limit: 1, beforeRevision: revision(beforeRevision, 1) };
      return (await request("history", record, undefined, parameters)).body;
    },
    async status(record, operationId) {
      if (operationId) operation(operationId);
      return (
        await request(
          "publication",
          record,
          undefined,
          operationId ? { operationId } : {},
        )
      ).body;
    },
    async save(record, text, expectedRevision, requestId) {
      const result = (
        await request("save", record, {
          source: source(text),
          expectedRevision: revision(expectedRevision),
          requestId: operation(requestId),
        })
      ).body;
      if (!result?.ok) fail("save_not_acknowledged");
      return result;
    },
    async create(record, title, requestId) {
      if (
        !["work", "writing"].includes(record.kind) ||
        typeof title !== "string" ||
        !title.trim() ||
        title.length > 300
      )
        fail("invalid_creation");
      const result = (
        await request("create", record, {
          title,
          expectedRevision: 0,
          requestId: operation(requestId),
        })
      ).body;
      if (!result?.ok) fail("create_not_acknowledged");
      return result;
    },
    async review(record) {
      const snapshot = await read(record);
      if (!snapshot.draft) fail("saved_draft_required");
      if (
        snapshot.publishing !== "ready" ||
        snapshot.publicationMode !== "direct"
      )
        fail("publisher_not_ready");
      return {
        format: "anipotts.editorial-review",
        version: 1,
        origin: ORIGIN,
        action: "publish",
        record,
        operationId: randomUUID(),
        expectedRevision: snapshot.draft.revision,
        expectedPublicationId: snapshot.base.publicationId ?? null,
        reviewedSourceSha256: hash(snapshot.draft.source),
        expectedBaselineSha256: hash(snapshot.base.source),
        source: snapshot.draft.source,
        baselineSource: snapshot.base.source,
      };
    },
    async publish(review, confirmation, approvalRef) {
      const record = validateReview(review);
      if (
        confirmation !== reviewDigest(review) ||
        (approvalRef !== undefined &&
          (typeof approvalRef !== "string" ||
            !approvalRef.trim() ||
            approvalRef.length > 500 ||
            /[\r\n]/u.test(approvalRef)))
      )
        fail("explicit_review_confirmation_required");
      const snapshot = await read(record);
      if (
        !snapshot.draft ||
        snapshot.publishing !== "ready" ||
        snapshot.publicationMode !== "direct" ||
        snapshot.draft.revision !== review.expectedRevision ||
        hash(snapshot.draft.source) !== review.reviewedSourceSha256 ||
        hash(snapshot.base.source) !== review.expectedBaselineSha256 ||
        (snapshot.base.publicationId ?? null) !== review.expectedPublicationId
      )
        fail("review_stale");
      const result = (
        await request("publish", record, {
          expectedRevision: review.expectedRevision,
          operationId: review.operationId,
          discloseSource: true,
          reviewedSourceSha256: review.reviewedSourceSha256,
          expectedBaselineSha256: review.expectedBaselineSha256,
          expectedPublicationId: review.expectedPublicationId,
        })
      ).body;
      if (!result.publication || result.publication.id !== review.operationId)
        fail("publication_not_acknowledged_check_status");
      return result;
    },
  };
}
