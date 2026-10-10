# Next website source batch

October 10, 2026. Current main: `511e6b4b9b6a4dc79b361175c21a48b139cec07f`.
This packet records approved source preparation. It authorizes no main merge,
Production approval, CMS write, deployment or protection change.

## Smallest source-only batch

1. #520 `d098096f9ef76433724b97e0c4df6a20ff501098`: includes current main.
   Required Build and Security Review, plus CodeQL, passed on this exact head.
   [Build evidence](https://github.com/anipotts/anipotts.com/actions/runs/38028513491/job/114144392087).
   Independent policy replay passed 5,115 entries across 409 classes, with zero
   differences; fail-closed and security tests passed.
2. #510: preserve `5ac3d0f493549167bb99c36505f93952f82af48b`, refresh current
   main and repair remaining guard gaps before naming a final approval head.
   Its existing checks passed, but strict current-main eligibility and review
   resolution remain required. Independent mutations on that head proved that
   swapped prose counts and incorrect unmodeled-table origins were still accepted.
   Those findings must not be marked resolved without an effective repair. Four
   subsequent findings also require source-input CI coverage, case-insensitive SQL
   detection, corrected workflow citations and consistent schema-authority comments.

The prospective policy after #520 classifies #510 as preflight-required with
all six deploy targets false, no D1 change, no remote migration and schema `0044`.
This differs from #510 alone under older main, which selects admin. Reconfirm
with the exact final combined tree and current live www identity before merge.

After any approved #520 merge, refresh #510 against the resulting main and wait
for its new required checks; pre-merge checks cannot substitute for strict
checks against the new base. Preserve review resolution and normal history.

## Separate runtime packets

#507 `529d1a7c15a65c1a0393715dae3b4517ef106884` belongs exclusively to the
React repair chat. Independent review confirms the admin importer alone changes:
React/react-dom and their types are aligned at 19.3, unrelated lock metadata is
preserved. It can proceed separately after explicit source/release approval. Its required Build and Security checks,
CodeQL, browser/CMS journeys, admin contracts and drift check all passed on
this exact head. With live www at `1ccc08da`, its plan selects
admin only; all four workers and D1 are false, schema `0044`. It does not depend
on #524. Including it in a feature/dependency batch needs fresh combined tests.

#523 `ee234053f70115d7d8a87ae03205502ce65d10e8` preserves all fourteen
Dependabot updates, merges current main, and documents wrapper and direct Jiti
theme commands. Both documented direct commands pass and all four generated
artifacts remain byte-identical. The two reviewed theme findings are resolved;
fresh GitHub checks are running. Its broader dependency diff can select all six
runtime targets and requires its own final release plan and target approval.

The draft #524 assembly is review context, not a replacement for these bounded
source packets. Its full validation predates later #512 and #510 fixes.

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
