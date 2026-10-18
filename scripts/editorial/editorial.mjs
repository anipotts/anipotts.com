#!/usr/bin/env node
import { readFile, writeFile, stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  createEditorialClient,
  recordIdentity,
  reviewDigest,
} from "./client.mjs";

const help = `Owner editorial CLI (Node 24). Private drafts by default.
Session: ANIPOTTS_EDITORIAL_ACCESS_TOKEN (existing human cloudflared token), or
ANIPOTTS_EDITORIAL_OWNER_COOKIE, exactly CF_Authorization=<owner session>.
Never pass credentials as command arguments.

node scripts/editorial/editorial.mjs <command> --kind <page|writing|work> --id <id>
  read                                      Print snapshot metadata only
  export --out <file>                        Export draft (or public base) source
  history --out <file> [--before <revision>]  Export one private history page
  save --source <file> --revision <n> --request-id <uuid>
  create --title <title> --request-id <uuid>  Create a private writing/work draft
  status [--operation-id <uuid>]             Read publication progress
  review --out <file>                        Create an immutable publication review

node scripts/editorial/editorial.mjs publish --review <file> --confirm <sha256> \\
  [--approval-ref <human discussion reference>]

Review/export files contain private source. New files use mode 0600 and never overwrite.
See docs/agent-editorial-workflow.md before any publication.`;

const allowed = {
  read: ["kind", "id"],
  export: ["kind", "id", "out"],
  history: ["kind", "id", "out", "before"],
  save: ["kind", "id", "source", "revision", "request-id"],
  create: ["kind", "id", "title", "request-id"],
  status: ["kind", "id", "operation-id"],
  review: ["kind", "id", "out"],
  publish: ["review", "confirm", "approval-ref"],
};

function argsOf(argv) {
  const [command, ...rest] = argv;
  if (!allowed[command]) throw new Error("unknown_command_use_help");
  const args = Object.create(null);
  for (let index = 0; index < rest.length; index += 2) {
    const name = rest[index]?.slice(2);
    const value = rest[index + 1];
    if (
      !rest[index]?.startsWith("--") ||
      !allowed[command].includes(name) ||
      Object.hasOwn(args, name) ||
      !value ||
      value.startsWith("--")
    )
      throw new Error("invalid_arguments_use_help");
    args[name] = value;
  }
  return { command, args };
}

function required(args, name) {
  if (!args[name]) throw new Error(`missing_${name.replaceAll("-", "_")}`);
  return args[name];
}

function integer(value) {
  if (
    !/^(?:0|[1-9][0-9]*)$/u.test(value ?? "") ||
    !Number.isSafeInteger(Number(value))
  )
    throw new Error("invalid_revision");
  return Number(value);
}

async function privateFile(path, value) {
  try {
    await writeFile(path, value, { encoding: "utf8", mode: 0o600, flag: "wx" });
  } catch {
    throw new Error("private_output_failed_choose_new_file");
  }
}

async function inputFile(path) {
  try {
    if ((await stat(path)).size > 8 * 1024 * 1024) throw new Error();
    const bytes = await readFile(path);
    if (bytes.length > 8 * 1024 * 1024) throw new Error();
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      bytes,
    );
  } catch {
    throw new Error("input_file_unavailable");
  }
}

function summary(snapshot) {
  return {
    revision: snapshot.draft?.revision ?? 0,
    updatedAt: snapshot.draft?.updatedAt ?? null,
    publicPublicationId: snapshot.base.publicationId ?? null,
    inventoryVersion: snapshot.base.inventoryVersion ?? null,
    publishing: snapshot.publishing,
    publication: snapshot.publication,
  };
}

export async function main(
  argv,
  { env = process.env, fetch, output = console.log } = {},
) {
  if (
    argv.length === 0 ||
    (argv.length === 1 && ["help", "--help"].includes(argv[0]))
  ) {
    output(help);
    return;
  }
  const { command, args } = argsOf(argv);
  const client = createEditorialClient({
    ownerSession: env.ANIPOTTS_EDITORIAL_OWNER_COOKIE,
    ownerToken: env.ANIPOTTS_EDITORIAL_ACCESS_TOKEN,
    fetch,
  });
  let result;
  if (command === "publish") {
    let review;
    try {
      review = JSON.parse(await inputFile(required(args, "review")));
    } catch {
      throw new Error("review_file_invalid");
    }
    result = await client.publish(
      review,
      required(args, "confirm"),
      args["approval-ref"],
    );
    if (args["approval-ref"] !== undefined)
      result = { ...result, approvalRef: args["approval-ref"] };
  } else {
    const record = recordIdentity(required(args, "kind"), required(args, "id"));
    switch (command) {
      case "read":
        result = summary(await client.read(record));
        break;
      case "export": {
        const out = required(args, "out");
        const snapshot = await client.read(record);
        await privateFile(out, snapshot.draft?.source ?? snapshot.base.source);
        result = { exported: true, ...summary(snapshot) };
        break;
      }
      case "history": {
        const out = required(args, "out");
        const page = await client.history(
          record,
          args.before === undefined ? undefined : integer(args.before),
        );
        await privateFile(out, JSON.stringify(page, null, 2) + "\n");
        result = {
          exported: true,
          nextBeforeRevision: page.nextBeforeRevision,
        };
        break;
      }
      case "save": {
        const expectedRevision = integer(required(args, "revision"));
        const requestId = required(args, "request-id");
        const saved = await client.save(
          record,
          await inputFile(required(args, "source")),
          expectedRevision,
          requestId,
        );
        result = {
          saved: true,
          revision: saved.draft.revision,
          valid: saved.valid,
          requestId,
        };
        break;
      }
      case "create": {
        const requestId = required(args, "request-id");
        const created = await client.create(
          record,
          required(args, "title"),
          requestId,
        );
        result = { created: true, revision: created.draft.revision, requestId };
        break;
      }
      case "status":
        result = await client.status(record, args["operation-id"]);
        break;
      case "review": {
        const out = required(args, "out");
        const review = await client.review(record);
        await privateFile(out, JSON.stringify(review, null, 2) + "\n");
        result = {
          reviewCreated: true,
          record,
          revision: review.expectedRevision,
          operationId: review.operationId,
          confirmation: reviewDigest(review),
        };
        break;
      }
    }
  }
  output(JSON.stringify(result, null, 2));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main(process.argv.slice(2)).catch((error) => {
    // Never print provider payloads, source, cookie values or arbitrary stack traces.
    const code = /^[a-z0-9_]+$/u.test(error.message ?? "")
      ? error.message
      : "editorial_command_failed";
    console.error(`Editorial command failed: ${code}`);
    process.exitCode = 1;
  });
}
