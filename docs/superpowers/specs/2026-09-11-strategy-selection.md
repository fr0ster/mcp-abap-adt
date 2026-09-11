# Which strategy each operation gets

**Status:** drafted 2026-09-11 from the corpus. Every row cites a fixture in
`tests/fixtures/adt/` or says plainly that it is unbacked.

This is the step between capturing the corpus and writing the adapter's failure
half. Without it the handler migration makes this choice 204 times, once per
file, and the same document ends up with three readings in three handlers.

## The two axes are not the same shape

They are injected differently, and a table that treats them alike will be wrong
about half of it.

**Result strategies are constructed, per object type.** `new AdtClient(conn,
…, { class: classDocuments, table: tableDocuments, … })` — a set per type, one
entry per member. So the choice is made once, at client construction, and every
handler for that type inherits it.

**`analyse` is passed per call.** `client.getClass().activate(cfg, { analyse })`
is an option on `IAdtOperationOptions`. So the choice is made at the call site,
which is the handler.

One consequence worth stating: **a result strategy cannot be chosen per tool.**
If `GetClass` wants the document and `ReadClass` wants the source text, they
cannot both be served by one client instance unless the strategy returns both
and the projection picks.

## The table

`detail` is the tool's parameter; the projection in `return_answer` uses it.
"analyse" names a reading from `src/lib/adtRefusal.ts`.

| operation | calls | result strategy | analyse | corpus |
|---|---:|---|---|---|
| `read` (source) | 106 | `verbatim` — the source IS the answer | `analyseException` | `read-class-source-text`, `read-function-module-source-text`, `refusal-object-not-found` |
| `readMetadata` | 18 | `verbatim` — the tools carry the XML through as a string | `analyseException` | `read-metadata-*`, 8 families |
| `create` | 30 | `statusOnly` — a class answers 200/empty, a domain 201/doc; the useful information in a failure is the refusal | `analyseException` | `create-class` 200/empty, `create-domain` and `create-dataelement` 201/doc |
| `lock` | 28 | the lock handle | `analyseException` | `lock-success`, `refusal-lock-held-by-other` (403) |
| `unlock` | 22 | `statusOnly` — 200, zero bytes | `analyseException` | `unlock-success` |
| `update` | 23 | `statusOnly` — 200, zero bytes | `analyseException` | `update-source-success`, `refusal-write-not-locked` (423) |
| `validate` | 23 | `structured` + `terseValidation` | **`analyseValidation`** (and the 400 families fall to the same enrichment) | `validation-*`, 8 cases |
| `activate` | 21 | `structured` + `terseActivation` | **`analyseActivation`** | `activation-success-verdict`, `refusal-activation-fails` |
| `check` | 17 | `structured` + `terseCheck` | **`analyseCheck`** | `check-success-verdict`, `refusal-syntax-check`, `refusal-check-nonexistent-object` |
| `delete` | 15 | `structured` + `terseDeletion` | **`analyseDeletion`** | `delete-success`, `refusal-delete-refused`, and the two check-step documents |
| unit test run | — | `structured` | **`analyseUnitTest`** | `unittest-run-passing`, `refusal-unittest-run-failing` |
| node walk | 8 | `structured` | **none possible** — see below | `read-object-tree-structure`, `read-package-contents-structure`, `read-empty-package-contents`, three missing-package cases |
| where-used | 2 | `structured` | `analyseException` | `read-where-used-list-structure` — one hit only |
| transport list | 1 | `structured` | `analyseException` | `read-transport-list-structure` — empty only |

## How few there turned out to be

Three readings — `verbatim`, `structured`, `statusOnly` — and five terse
projections cover **289 slots across 30 result sets**. The slot name does not
select a different reading; it selects a different projection, and most of the
time not even that.

Metadata is the case that looked hardest and is not. It answers eight media
types and seven root elements, which seemed to demand eight readings. It demands
none: the tools return JSON with the XML carried through as a string, and
`handleReadClass` has never parsed it. Those eight shapes would only start to
matter the day a tool promised named fields out of them — which is a change to
the tool surface, not to a strategy.

Seven `analyse` strategies, one per document form plus a dispatcher:
`analyseException`, `analyseActivation`, `analyseDeletion`, `analyseCheck`,
`analyseValidation`, `analyseUnitTest`, `analyseAny`.

`analyseAny` dispatches on the root element and can stand in wherever the
specific form is not worth naming. Prefer a named one where the form is known in
advance, because a dispatcher that meets an unexpected document answers `null`,
and `null` from an `analyse` means "not a failure".

## The walkers get no analyse, deliberately

A package that does not exist and a package that is empty answer the same
sha256: HTTP 200, no content-type, zero bytes. There is no signal to read, so
any `analyse` here would be inventing one. The existence question is a separate
round trip, which `GetPackageTree` already pays and the other two do not.

That is an open decision for the tool surface, not for the strategy.

## What this exposes about the adapter

The failure payload allowlist in the plan is
`{ message, origin, code, adt_type, namespace, request, messages, raw_body }`.
The readings produce a `messages[]` whose entries carry `type`, `text`, `code`,
`t100`, `line`, `uri`.

**`t100` was added to the allowlist** (decided 2026-09-11). It is the message
class and number with the substituted placeholders — `SADT_RESOURCE` `026` with
`CLASS`, the object name, the bad lock handle — and the only thing in the whole
corpus a caller can match on without reading English.

It travels on the message it belongs to, not beside the failure, and `no` stays
the zero-padded string SAP sent: `SADT_RESOURCE/26` is a key no system knows.
Messages are rebuilt field by field on the way out, the same as `request`, so a
strategy that attaches something else does not have it forwarded.

## Rows that are thin

- `where-used` has only ever answered one hit; no empty result, no refusal.
- `transport list` has only ever answered empty.
- `readMetadata` has been read only in the active version, never inactive and
  never for an absent object.
- A refused `create` — a name already taken, reaching the create endpoint rather
  than validation — is unrecorded for every family.
- `check` has no captured message carrying `chkrun:t100Key`, which adt-clients'
  parser reads, so that variant exists somewhere and is not here. Issue #200.
