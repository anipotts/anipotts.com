#!/usr/bin/env node

import { execFileSync } from "node:child_process";

export const REQUIRED_CHECKS = [
  "Build, lint, typecheck, test",
  "Security Review",
];

export function protectionPayload() {
  return {
    required_status_checks: {
      strict: true,
      contexts: REQUIRED_CHECKS,
    },
    enforce_admins: true,
    required_pull_request_reviews: {
      required_approving_review_count: 0,
      dismiss_stale_reviews: false,
      require_code_owner_reviews: false,
      require_last_push_approval: false,
      bypass_pull_request_allowances: { users: [], teams: [], apps: [] },
    },
    restrictions: null,
    required_conversation_resolution: true,
    allow_force_pushes: false,
    allow_deletions: false,
    block_creations: false,
    required_linear_history: false,
    allow_fork_syncing: true,
    lock_branch: false,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const payload = protectionPayload();
  if (process.argv.includes("--apply")) {
    execFileSync(
      "gh",
      [
        "api",
        "--method",
        "PUT",
        "repos/anipotts/anipotts.com/branches/main/protection",
        "--input",
        "-",
      ],
      { input: JSON.stringify(payload), stdio: ["pipe", "inherit", "inherit"] },
    );
    console.log("main branch protection updated");
  } else {
    console.log(JSON.stringify(payload, null, 2));
  }
}
