# synthetic editorial regression inputs

Import `editorialFixtures` from `editorial-fixtures.ts` in browser, component or
publication tests. Stable `qa-*` ids make screenshots and failures comparable.
These are test inputs, not CMS records, and contain no owner content.

| fixture               | use                                                                   |
| --------------------- | --------------------------------------------------------------------- |
| `longTitle`           | wrapping, title-field height, command-row clipping                    |
| `compactCopy`         | full versus compact presentation, metadata ordering                   |
| `formattedLinks`      | formatted text, explicit link target, inline brand image              |
| `saveRecovery`        | deterministic 503 save failure and reload recovery                    |
| `publicationRecovery` | stable operation identity and distinct acknowledged/private revisions |

`publicationRecoverySources()` returns two parseable writing sources with equal
frontmatter and different bodies. Feed the acknowledged source to the publisher
and retain the newer private source in the editor to verify that acknowledgement
cannot clear newer edits. Use fresh operation ids when running concurrent
integration scenarios; the fixed fixture id is for isolated deterministic tests.

The existing `test/e2e/admin-editor.local.e2e.ts` consumes the save-recovery
fixture and intercepts saves before storage writes. It runs only with the
existing loopback local-owner harness. Production credentials and production
records are unnecessary.

Run fixture/parser/rendering validation:

```sh
pnpm --filter @anipotts/admin exec vitest run src/lib/editorial-regression-fixtures.test.ts
```

This unit check establishes usable inputs, not responsive visual acceptance or
end-to-end publication recovery. Those require the existing browser and
`test/editorial/direct-publisher.test.ts` suites. Do not turn fixture names into
claims that a live workflow passed.
