import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { fileURLToPath } from "node:url";
export const states = [
  "implementing",
  "locally-integrated",
  "awaiting-review",
  "approved",
  "deployed",
];
const sha = /^[a-f0-9]{40}$/;
const fail = (message) => {
  throw new Error(message);
};
const file = fileURLToPath(
  new URL("../../docs/integration-queue.json", import.meta.url),
);
export function validateQueue(queue) {
  if (queue.version !== 1 || !Array.isArray(queue.items))
    fail("Unsupported queue schema");
  const ids = new Set();
  for (const item of queue.items) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(item.id) || ids.has(item.id))
      fail("Invalid or duplicate id");
    ids.add(item.id);
    if (
      !["code", "content"].includes(item.lane) ||
      !states.includes(item.state) ||
      !item.title
    )
      fail("Invalid item");
    if (item.revision !== null && !sha.test(item.revision))
      fail("Revision must be a full SHA");
    for (const [scope, approval] of Object.entries(item.approvals ?? {})) {
      if (
        !["code", "content", "production"].includes(scope) ||
        !sha.test(approval.revision) ||
        approval.revision !== item.revision ||
        !approval.by ||
        !approval.at ||
        !approval.evidence
      )
        fail(
          "Approval requires current exact revision, authority and evidence",
        );
    }
    if (item.state === "approved" && !item.approvals?.[item.lane])
      fail("Lane approval required");
    if (
      item.state === "deployed" &&
      (!item.deployment?.evidence ||
        !item.deployment?.target ||
        !sha.test(item.deployment.revision) ||
        item.deployment.revision !== item.revision)
    )
      fail(
        "Deployment requires matching release revision, target and evidence",
      );
  }
  return queue;
}
export function updateItem(queue, args, now = new Date().toISOString()) {
  validateQueue(queue);
  const next = structuredClone(queue);
  const item = next.items.find((entry) => entry.id === args.id);
  if (!item) fail("Unknown id");
  if (args.revision) {
    if (!sha.test(args.revision)) fail("Use a full revision");
    if (args.revision !== item.revision) {
      item.revision = args.revision;
      item.approvals = {};
      delete item.deployment;
      item.state = "implementing";
    }
  }
  if (args.approval) {
    if (!["code", "content", "production"].includes(args.approval))
      fail("Unknown approval scope");
    if (!args.revision || !args.by || !args.evidence)
      fail("Approval requires --revision, --by and --evidence");
    item.approvals ??= {};
    item.approvals[args.approval] = {
      revision: args.revision,
      by: args.by,
      evidence: args.evidence,
      at: now,
    };
  }
  if (args.state) {
    if (!states.includes(args.state)) fail("Unknown state");
    if (args.state === "deployed") {
      if (!item.approvals?.[item.lane] || !item.approvals?.production)
        fail("Deployment requires separate lane and production approvals");
      if (!args.revision || !args.target || !args.evidence)
        fail("Deployment requires revision, target and provider/live evidence");
      item.deployment = {
        revision: args.revision,
        target: args.target,
        evidence: args.evidence,
        at: now,
      };
    }
    item.state = args.state;
  }
  if (args.note) item.note = args.note;
  item.updatedAt = now;
  return validateQueue(next);
}
export function parseArgs(argv) {
  const [command = "list", ...rest] = argv;
  if (!["list", "update"].includes(command))
    fail("Usage: integration-queue.mjs list | update --id ID --state STATE");
  const args = { command };
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i]?.replace(/^--/, "");
    if (
      !rest[i]?.startsWith("--") ||
      ![
        "id",
        "state",
        "revision",
        "approval",
        "by",
        "evidence",
        "target",
        "note",
      ].includes(key) ||
      !rest[i + 1] ||
      rest[i + 1].startsWith("--") ||
      args[key]
    )
      fail("Unknown, repeated or missing argument");
    args[key] = rest[i + 1];
  }
  if (command === "list" && rest.length) fail("list takes no arguments");
  if (
    command === "update" &&
    (!args.id ||
      !["state", "revision", "approval", "note"].some((key) => args[key]))
  )
    fail("update requires --id and a change");
  return args;
}
export function listQueue(queue) {
  return validateQueue(queue)
    .items.map(
      (item) =>
        `${item.id} | ${item.lane} | ${item.state} | ${item.revision?.slice(0, 12) ?? "revision pending"} | ${item.title}\n  ${item.note ?? ""}`,
    )
    .join("\n");
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const queue = validateQueue(JSON.parse(readFileSync(file, "utf8")));
    if (args.command === "list") console.log(listQueue(queue));
    else {
      const next = updateItem(queue, args);
      const tmp = `${file}.${process.pid}.tmp`;
      writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`);
      renameSync(tmp, file);
      console.log(listQueue(next));
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
