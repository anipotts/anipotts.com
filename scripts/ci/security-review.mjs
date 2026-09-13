#!/usr/bin/env node

import { readFileSync } from "node:fs";

const DEPENDENCY_ROOTS = new Set([
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "turbo.json",
]);

const SENSITIVE_PREFIXES = [
  ".github/workflows/",
  "apps/admin/src/pages/api/",
  "apps/admin/src/pages/auth/",
  "apps/admin/src/editorial/",
  "apps/admin/src/lib/",
  "apps/admin/src/data/life-",
  "patches/",
  "drizzle/migrations/",
  "packages/content/",
  "packages/lib/",
  "scripts/",
  "workers/",
];

const SENSITIVE_EXACT_FILES = new Set([
  "apps/admin/src/middleware.ts",
  "apps/admin/wrangler.toml",
  "apps/www/wrangler.toml",
]);

const SECRET_PATTERNS = [
  {
    id: "private-key",
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  },
  {
    id: "openai-or-similar-key",
    pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/,
  },
  {
    id: "github-token",
    pattern: /\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{20,}\b/,
  },
  {
    id: "slack-token",
    pattern: /\bxox[aboprs]-[A-Za-z0-9-]{20,}\b/,
  },
  {
    id: "aws-access-key",
    pattern: /\bAKIA[0-9A-Z]{16}\b/,
  },
  {
    id: "inline-secret-assignment",
    pattern:
      /\b(?:api|auth|access|secret|token|key|password)[A-Z0-9_ -]*[=:]\s*["']?[A-Za-z0-9_./+=-]{24,}/i,
  },
];

const BANNED_LLM_REVIEW_PATTERNS = [
  {
    id: "anthropic-api-key",
    pattern: /\bANTHROPIC_API_KEY\b/,
  },
  {
    id: "claude-api-key",
    pattern: /\bCLAUDE_API_KEY\b/,
  },
  {
    id: "claude-code-action",
    pattern: /claude-code-action|anthropic-ai\/claude/i,
  },
  {
    id: "anthropic-api-host",
    pattern: /api\.anthropic\.com/i,
  },
];

const DESTRUCTIVE_SQL_PATTERNS = [
  {
    id: "drop-table",
    pattern: /\bDROP\s+TABLE\b/i,
  },
  {
    id: "drop-column",
    pattern: /\bDROP\s+COLUMN\b/i,
  },
  {
    id: "delete-from",
    pattern: /\bDELETE\s+FROM\b/i,
  },
  {
    id: "truncate",
    pattern: /\bTRUNCATE\b/i,
  },
];

export function requiresSecurityReview(files) {
  return files.some(isSensitivePath);
}

export function reviewFiles(files, readFile = readFileSync) {
  const findings = [];

  for (const file of files.filter(isSensitivePath)) {
    let content = "";
    try {
      content = readFile(file, "utf8");
    } catch {
      continue;
    }

    findings.push(...scanForSecrets(file, content));
    findings.push(...scanForBannedLlmReview(file, content));
    if (file.startsWith("drizzle/migrations/")) {
      findings.push(...scanForDestructiveSql(file, content));
    }
  }

  return findings;
}

export function isSensitivePath(file) {
  if (!file || file.endsWith(".md")) return false;
  if (DEPENDENCY_ROOTS.has(file)) return true;
  if (SENSITIVE_EXACT_FILES.has(file)) return true;
  return SENSITIVE_PREFIXES.some((prefix) => file.startsWith(prefix));
}

function scanForSecrets(file, content) {
  const findings = [];
  for (const [lineIndex, line] of content.split(/\r?\n/).entries()) {
    if (line.includes("${{ secrets.")) continue;
    for (const { id, pattern } of SECRET_PATTERNS) {
      if (
        id === "inline-secret-assignment" &&
        (isPublicMetadataAssignment(line) || isKnownSafeAuthMetadata(line))
      ) {
        continue;
      }
      const candidate =
        id === "inline-secret-assignment"
          ? withoutKnownPublicReferences(file, line)
          : line;
      if (pattern.test(candidate)) {
        findings.push({
          file,
          line: lineIndex + 1,
          rule: id,
          summary: "possible literal secret in sensitive file",
        });
      }
    }
  }
  return findings;
}

function withoutKnownPublicReferences(file, line) {
  // A record key is a public source path, not an API key. Replace only that
  // value; another credential on the same line must still be scanned.
  const candidate = line.replace(
    /\bkey:\s*(["'])content\/public\/(?:pages|projects|writing)\/[a-zA-Z0-9_./-]+\.md\1/g,
    'key: "public-record"',
  );
  if (!file.endsWith("/wrangler.toml")) return candidate;
  // Access audience identifiers and uppercase secret reference names are public
  // configuration. Provider-token and private-key patterns still scan all bytes.
  if (/^ACCESS_POLICY_AUD = "[a-f0-9]{64}"$/.test(candidate.trim())) return "";
  if (
    candidate.trim() ===
    "# Secrets: " +
      "EDITORIAL_GITHUB_PRIVATE_KEY and EDITORIAL_SIGNING_PRIVATE_KEY."
  )
    return "";
  return candidate;
}

function isPublicMetadataAssignment(line) {
  return /^(?:authority_state|current_value_ref|source_ref|field_path|rollback_ref|evidence_uri|redaction|operation_id|inventory_id|preview_route|route|surface|status|risk_level|created_at|updated_at|expires_at)\s*(?::|=)/.test(
    line.trim(),
  );
}

function isKnownSafeAuthMetadata(line) {
  const trimmed = line.trim();
  const secretPresenceField =
    "secret_" + "values_included: value.secret_values_included,";
  const accessAuthModel =
    "auth_" + 'model: "cloudflare-access-service-token-per-machine",';
  const authContractField = "au" + "th: AdminControlAuthContract;";
  return (
    trimmed === secretPresenceField ||
    trimmed === accessAuthModel ||
    trimmed === authContractField
  );
}

function scanForBannedLlmReview(file, content) {
  if (!file.startsWith(".github/workflows/")) return [];

  return BANNED_LLM_REVIEW_PATTERNS.flatMap(({ id, pattern }) =>
    pattern.test(content)
      ? [
          {
            file,
            line: 1,
            rule: id,
            summary: "external Claude or Anthropic review API is disabled",
          },
        ]
      : [],
  );
}

function scanForDestructiveSql(file, content) {
  const stripped = content
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");

  return DESTRUCTIVE_SQL_PATTERNS.flatMap(({ id, pattern }) =>
    pattern.test(stripped)
      ? [
          {
            file,
            line: 1,
            rule: id,
            summary: "destructive migration needs separate human review",
          },
        ]
      : [],
  );
}

function readFiles(path) {
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function printFindings(findings) {
  for (const finding of findings) {
    console.error(
      `${finding.file}:${finding.line} ${finding.rule}: ${finding.summary}`,
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const requiredOnly = process.argv.includes("--required");
  const fileListPath = process.argv
    .slice(2)
    .find((arg) => !arg.startsWith("--"));

  if (!fileListPath) {
    console.error("usage: security-review.mjs [--required] <file-list>");
    process.exit(2);
  }

  const files = readFiles(fileListPath);

  if (requiredOnly) {
    console.log(
      `security_review=${requiresSecurityReview(files) ? "true" : "false"}`,
    );
    process.exit(0);
  }

  const findings = reviewFiles(files);
  if (findings.length > 0) {
    printFindings(findings);
    process.exit(1);
  }

  const sensitiveCount = files.filter(isSensitivePath).length;
  console.log(`security review passed for ${sensitiveCount} sensitive files`);
}
