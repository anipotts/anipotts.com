# Next website source batch

October 10, 2026. Current main: `8a197427f13417e7b38875fe96cb914b68b29e3a`.
This packet records source preparation. It authorizes no additional main merge,
Production approval, CMS write, deployment or protection change.

## Completed source-only batch

#520 `d098096f9ef76433724b97e0c4df6a20ff501098` and #510
`0a900ecb85ba442604caee07181235c70ea4a9b0` passed required Build,
Security Review and CodeQL checks, with independent review and all ten #510
threads resolved. The guard now rejects swapped prose counts and wrong origins,
finds case-insensitive SQL through the existing TypeScript parser, excludes
comments/values/prose, and runs on every ready PR. Citations and the remaining
schema-authority comment are corrected. Policy replay: 5,115 entries / 409
classes / zero differences.

Another owner merged both PRs through #510's preserved #520 ancestry as
`8a197427`. This chat performed no main merge. The exact prospective planner
selected every runtime target false, no D1 change or remote migration, unchanged
fingerprint and schema `0044`. With live www at `1ccc08da`, it reported no public
diff / no deployment required. [Deploy 38029505907](https://github.com/anipotts/anipotts.com/actions/runs/38029505907)
subsequently completed successfully with Production and all six deploy jobs
skipped. These PRs need no duplicate merge approval.

## Separate runtime packets

#507 `5abafb4b4d8c3d8207a3cb863c5e3a580c45b4ba` belongs exclusively to the
React repair chat. It normally refreshed main `8a197427`; required checks on prior
`529d1a7c` passed, and fresh Build is running with Security already green.
[Fresh CI](https://github.com/anipotts/anipotts.com/actions/runs/38029620380).
Independent review confirms the admin importer alone changes: React/react-dom
and their types align at 19.3, unrelated lock metadata is preserved.
With live www at `1ccc08da`, its plan selects admin only; all four workers and
D1 are false, schema `0044`. No prerequisite on #524. Fresh checks and explicit
source/release approval remain required. Do not advance main during this check
window if #507 is the intended next approval target.

#515 `bcf2724604a88aeca93b88072eb59cff763aa9ee` compiles its contract pins
through the actual package typecheck; Turbo tracks its compiler configuration.
A deliberate mismatch failed with TS2344, restored source and 13 contract tests
passed. It normally includes new main; prior `9e43f734` required checks passed,
while [fresh CI](https://github.com/anipotts/anipotts.com/actions/runs/38029721644)
is running. Keep it before #518. Its final plan requires www/admin review.

#523 `c8de4a1034a8fa05394485e94e60cd5fcf5fca19` preserves all fourteen
Dependabot updates and normally includes new main. Wrapper and direct Jiti theme
commands reproduce all four generated files unchanged. Both addressed theme
threads are resolved. Prior `ee234053` required checks passed;
[fresh CI](https://github.com/anipotts/anipotts.com/actions/runs/38029728917)
is running. Four worker manifests are among its changes, so all six runtime
targets can be selected. It needs a separate final target/release approval packet.

Draft #524 combines the broader software work but does not replace bounded PR
approval. Fresh full validation passed on `1322cf58c29c213141c7e6db8ac32e80fff4ab3d`,
tree `b3cfbfc16e2771c23666478b5f6402c9beab6100`. Incorporating new main as
`f87d9a5ae82a3e6ee844ed7f5a14ee34ddda8f67` preserved that exact tree.
Six builds, four lint tasks, fourteen typecheck tasks and fourteen test tasks
passed, including 2,279 admin unit, 79 Astro, 98 editorial and 202 content tests.
The candidate excludes #507 and uses React 19.2.8. Adding React 19.3 requires new
combined-graph validation; do not transfer this evidence across that change.

## Completed release and acceptance

#521 [run 38025022414](https://github.com/anipotts/anipotts.com/actions/runs/38025022414)
succeeded at `1ccc08da95b7cddd0f766bf86f436c56341eb5fc`: www and admin,
no separate workers, no D1 or CMS writes, schema `0044`. Live visible-card
GET/HEAD returns 200 PNG; two absent cards return 404 with `no-store`.
Signed-in page listing, unchanged editor, preview revision 105, history and
public article rendering passed without writes. Ani need not repeat those reads.
The replacement tooling [run 38027502965](https://github.com/anipotts/anipotts.com/actions/runs/38027502965)
completed with Production and every deploy job skipped.

A write-acceptance grant must identify a disposable or intended record and say
which actions are allowed: draft save only, or reviewed publication and subsequent
unpublish. Preserve every existing published record and its wording. Content
intent and presentation acceptance remain Ani's decisions.
