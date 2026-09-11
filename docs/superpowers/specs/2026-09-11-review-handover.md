# What is on `feat/answer-adapter`, and what to review

34 commits, 158 files, +11131 / −62. Most of that count is the corpus.

**Nothing is wired yet.** No handler calls the adapter. That is deliberate: the
adapter and the readings land first, reviewable on their own, and the handlers
move in a later pass.

## The invariant, and how it was checked

The tool surface must not change. It has not:

| | |
|---|---|
| tools enumerated now, on adt-clients 18 | **362** |
| tools recorded in the inventory, taken before the bump | **362** |
| added | 0 |
| removed | 0 |
| handler files changed on this branch | **0** |
| `TOOL_DEFINITION` changed | **0** |

Reproduce with `npx tsx scripts/list-tools.ts` and compare against
`docs/superpowers/specs/2026-09-09-tool-inventory-rows.md`.

## What to review, in the order it is worth reading

**1. `src/lib/adtRefusal.ts` — six readings, ~470 lines.** The substance. Each
reading names the fixture it was written from. Review it against
`tests/fixtures/adt/README.md`, which explains the forms; the two were written
together and either one being wrong shows as a disagreement with the other.

The questions worth asking: is the reduction to *a severity and a sentence*
right? Are the two forms that have a severity *supplied* rather than read
(`exc:exception`, a check that never ran) doing the right thing? Is refusing to
give the package walkers an `analyse` correct, given a missing package and an
empty one answer the same sha256?

**2. `src/lib/answer.ts` — the adapter, ~200 lines.** Three exported things:
`return_answer` (success and failure), `answer` (the exception boundary),
and the types. The payload is an allowlist; `response` is never serialised and
`request` is rebuilt from `method` and `url` by name.

The question worth asking: is `t100` earning its place? It was added by decision
this session, on the grounds that the message class, number and placeholders are
the only thing in the corpus a caller can match on without reading English.

**3. `docs/superpowers/specs/2026-09-11-strategy-selection.md`.** Which strategy
each of 14 operations gets, ordered by how often the handlers call them. This is
the input to the handler migration, so an error here multiplies by 204.

**4. `tests/fixtures/adt/` — 48 cases, 61 exchanges.** Not code. Worth a skim of
the README, which is also the documentation the readings will ship with when
they move to their own package.

**5. `scripts/capture-adt-corpus.ts`.** How the corpus was produced. Review it
if you doubt a fixture; skip it otherwise.

## Tests

554 unit tests, 32 suites, all offline. The ones that carry the argument:

- `adtRefusalReadings.test.ts` — every refusal recognised, **every success left
  alone**. A reading that cannot be fooled into calling a refusal a success is
  half a contract; one that calls a success a refusal breaks more.
- `answerFromCorpus.test.ts` — the two halves joined against real documents,
  with a credential deliberately attached the way a careless strategy might.
- `adtMetadataShapes.test.ts` — asserts that metadata diverges by family, so
  nobody writes one reading for all of them.
- `packageEntryPoints.test.ts` — `exports` and `typesVersions` must agree.

## What is deliberately not done

- **No handler migrated.** 627 compile errors stand, 540 of them the one
  mechanical shape `return_answer` removes. The tree does not typecheck and is
  not meant to until the handlers move.
- **No result strategy sets written.** The selection table names them; the sets
  themselves are per object type and belong with the migration.
- **`generatedInfoResult`** — two compile errors, no fixture. The only gap left
  in the corpus by weight.

## Known and recorded elsewhere

- Issue #200: every place this repository takes adt-clients' word for behaviour
  rather than measuring it. One entry is already discharged by measurement.
- Three adt-clients 18 contract changes the migration will meet at every call
  site: `update` takes `sourceCode` in options, `lock` answers an
  `IAdtResponse`, a delete is one request. All three are in the capture script's
  comments where they were found.
