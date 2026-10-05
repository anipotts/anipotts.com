/**
 * The private reader's client-safe constants, written once. The server's
 * credential route (lib/private-reader-credential.ts) issues with them and
 * the browser readers send with them, so neither side mirrors the other by
 * comment. This module imports nothing: the browser gets these values
 * without the signing code, and the server gets them without React.
 */

/** The tailnet reader on ap-mini (System PR #128 verifier): the origin every
 * private read goes to, and the audience of every credential admin issues. */
export const PRIVATE_READER_ORIGIN = "https://ap-mini.tail060490.ts.net";

/** Admin's issuance route for the Data credential. */
export const PRIVATE_READER_PATH = "/api/private-reader/credential";
/** Separate issuance for the Observability Status view. */
export const PRIVATE_READER_OPS_PATH = "/api/private-reader/ops-credential";
/** Separate issuance for the Data Health view. */
export const PRIVATE_READER_HEALTH_PATH =
  "/api/private-reader/health-credential";

/** Server selected. Client-requested scopes are ignored. */
export const PRIVATE_READER_SCOPES = ["data:read", "activity:read"] as const;
/** Ops credentials carry only this scope and never a Data scope. */
export const PRIVATE_READER_OPS_SCOPES = ["ops:read"] as const;
/** Health credentials carry only the daily health summary scope. */
export const PRIVATE_READER_HEALTH_SCOPES = ["health:read"] as const;
