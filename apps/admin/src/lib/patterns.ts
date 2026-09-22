/** Shared identity shapes. Each names exactly what it accepts. */

/** A 40-digit lowercase Git commit or blob id, also the release SHA. */
export const GIT_SHA = /^[a-f0-9]{40}$/;
/** 64 lowercase hex digits: a SHA-256 digest or a 32-byte random token. */
export const HEX64 = /^[a-f0-9]{64}$/;
/** A lowercase UUID, as `crypto.randomUUID()` returns it. */
export const OPERATION_ID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
/** A positive decimal integer without a sign or leading zero. */
export const POSITIVE_INTEGER = /^[1-9][0-9]*$/;
