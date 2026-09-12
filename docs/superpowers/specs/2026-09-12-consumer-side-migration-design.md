# Migrating onto adt-clients 19 — design

**Status:** drafted 2026-09-12. Replaces `2026-09-08-result-error-strategies-design.md`,
which was written against adt-clients 18 and is wrong about who does what.

## What changed under us

adt-clients 19 stopped deciding things, on two rules of its own:

- **The verdict on a response belongs to the consumer.** It removed
  `activationRefusal`, `validationRefusal`, `deletionRefusal`,
  `parseDeletionCheck`, `assertDeletable` and `waitForCleanCheckRun`.
- **One member, one endpoint call.** It removed every member that issued
  several: the package walks, the object walks, the where-used sequence, the
  runtime profiling runs, `updateTestClasses`, `updateClassWithCheck`, and the
  read-modify-write inside each XML-bodied `update`.

Both were things we had asked for, in mcp-abap-adt-clients#141 and #200.

At the same time the readings we had written here were published as
`@mcp-abap-adt/adt-strategies`, LGPL-3.0-only. We take them from there.

## The boundary

**adt-clients speaks ADT endpoints. This repository speaks MCP.** Everything
below follows from that line, and where a question was hard it was hard because
the line had been crossed.

| | theirs | ours |
|---|---|---|
| issuing one ADT call | yes | no |
| deciding a refusal | no — injected | the `analyse` we pass |
| shaping an answer for a caller | no — one strategy, `asItCame` | every projection |
| ordering several calls | no — removed in 19 | the handler |
| merging a change into a document | no — removed in 19 | the handler |

## Strategies are keyed on two things, and neither is the operation

**A result strategy is keyed on the transformation** — what the response has to
become for the handler to return it. Three exist:

| | strategy | when |
|---|---|---|
| hand the body through | `verbatim` | the tool answers the document as text. Source, and **metadata**: it is XML and the tools return JSON, but they carry the XML in a JSON field as a string, and `handleReadClass` has never parsed it. |
| parse into named structure | `structured` | only where a tool promises named fields out of the document |
| there is no body | `statusOnly` | a class create answers 200 with zero bytes; so does a successful write |

**An error strategy is keyed on how the refusal is encoded.** Six principles,
cutting across operations — a deletion and its pre-check encode alike, a class
create and a class read encode alike, an activation and a deletion do not. All
seven implementations come from the package: `analyseException`,
`analyseActivation`, `analyseDeletion`, `analyseCheck`, `analyseValidation`,
`analyseUnitTest`, `analyseAny`.

One case gets no `analyse` deliberately: the package walkers. A missing package
and an empty one answer the same sha256, so any reading there would be inventing
a signal.

## What the consumer needs differs by direction

| | the result they want | what they want when it fails |
|---|---|---|
| **reading** | the payload, in the form the tool promised | that it failed, and why |
| **writing** | a short confirmation — `SUCCESS`, nothing else | **everything.** What went wrong is the valuable half |

So a write pairs the thinnest result projection with the fullest error strategy.
`terseWrite` answers the string `'SUCCESS'` and never `undefined`, because the
adapter cannot tell a write with nothing to add from a read that found nothing.

## `detail` is added selectively

`detail: 'terse' | 'full' | 'raw'` goes only on tools whose answer is JSON.
Where the promised form is text or XML the three levels coincide — the document
is the answer — and a parameter that cannot change anything is noise on the tool
surface. **This is the only change to the tool surface in this work.**

## Two handler shapes, named

**One call** — `answer(ctx, () => client.getX().member(cfg, { analyse }), project)`.
The exception boundary is inside; `client_threw` and `adapter_threw` are named
apart and neither borrows an `AdtFailureOrigin`.

**Several calls** — the same `answer()`, wrapping `sequence()`. Each step
carries its own `analyse`, and `sequence` hands back the failing step's answer
untouched. It never composes an error of its own: a sentence like "step 2 of 3
failed" would put a second account beside the strategy's, and which step it was
is already in the failure's `request`.

Thirteen handlers need the second shape today: eight that called removed members
and five whose update is a read-modify-write.

## The read-modify-write

Five families take a whole document on 19 — `domain`, `dataElement`,
`functionGroup`, `package`, `tabletype` — and `update` replaces rather than
merges. So an update is read, patch, write, and the read must be `verbatim`:
the bytes it returns are the bytes that go back to SAP.

The patch edits the document text rather than rebuilding it, because the
document carries fields nobody here knows about — `abapLanguageVersion`, links,
SAP-managed state — and a document built from the fields a caller named would
drop every one of them.

Every patch fails loudly when it cannot find its target. ADT answers a read of a
not-yet-ready object with **200 and an empty body**, so a silent `String.replace`
turns a slow read into a malformed write that the server blames on the caller.

## Error handling, end to end

1. The member answers `IAdtResponse`. The injected `analyse` decided whether it
   is a failure, reading the document.
2. `sequence`, if there is one, returns the first failure as it came.
3. `answer()` renders it through an allowlist: `message`, `origin`, `code`,
   `adt_type`, `namespace`, `request`, `messages`, `raw_body`. `response` is
   never serialised; `request` is rebuilt from `method` and `url` by name.
4. `messages` carries the normalised `{ type, text }` every form reduces to,
   plus `t100` where the carrier kept it — the message class, its number and the
   substituted values, the only thing a caller can match on without reading
   English.

## Testing

Offline, against `tests/fixtures/adt/` — 48 cases, 61 exchanges, 27 endpoints.
The corpus stays here because what it verifies stays here: the projections, the
promised form, the walk, the patch, and the join between a real document and the
MCP adapter. The readings themselves are verified in their own package.

Every behavioural claim in this repository cites a fixture or a test that runs,
or says plainly that it is unverified. Notes in adt-clients are not evidence:
its strategies are injected, so its notes describe what it ships.

## Success criteria

- The tool surface is unchanged except for `detail` on JSON-answering tools.
  362 enumerated tools, checked with `scripts/list-tools.ts` against the
  inventory.
- `npx tsc` is clean.
- No handler reads an envelope property off `IAdtSuccess`.
- No handler decides a refusal for itself.
- Every XML-bodied update reads before it writes.

## Out of scope

The inventory's residual findings, the six un-migrated handlers the old plan
listed, and anything in issue #200 that is not needed to compile.
