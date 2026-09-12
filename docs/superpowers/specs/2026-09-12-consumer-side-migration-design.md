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

## `detail` shapes the success answer, and only that

`detail: 'terse' | 'full' | 'raw'` goes only on tools whose answer is JSON.
Where the promised form is text or XML the three levels coincide — the document
is the answer — and a parameter that cannot change anything is noise on the tool
surface. **This is the only change to the tool surface in this work.**

**A failure carries `raw_body` whatever `detail` says.** An earlier draft gated
it on `detail: 'raw'`, and that was wrong twice over. It made the claim above
false, because a text-answering tool with no `detail` could then never produce
the document SAP refused with. And it contradicted the asymmetry this design is
built on: on a failure the consumer wants everything, so putting the one field
that carries everything behind a parameter that shapes *successes* hid it on the
path where it is the whole point. `detail` is a parameter of the result
projection. The failure payload is not a projection.

## Three handler shapes, named

**One call** — `answer(ctx, () => client.getX().member(cfg, { analyse }), project)`.
The exception boundary is inside; `client_threw` and `adapter_threw` are named
apart and neither borrows an `AdtFailureOrigin`.

**Several calls, the last one is the answer** — the same `answer()`, wrapping
`sequence()`. A read-modify-write, a profiling run. Every step must be one the
run can simply stop at.

**Several calls, all of them are the answer** — the same `answer()`, wrapping
`pair()`. A tool that reports a document *and* its metadata needs both values,
not the last one. Capturing the first in a variable outside the run would hand
the ordering back to the handler one assignment at a time, which is the thing
these combinators exist to prevent.

**Calls around a held resource** — `withLock()`. A lock-update-unlock chain is
**not** a `sequence()`, and putting it in one would be a bug: `sequence` stops
at the first failure, so a refused update would skip the unlock and leave the
object locked in SAP. Thirteen update handlers already use `try/finally` for
exactly this reason. adt-clients' own `LockRegistry` calls itself "a safety net,
NOT the primary defense" and says preventing that is the caller's job.

These three combinators share one rule: each step carries its own `analyse`, and
the failing step's answer is handed back **untouched**. None composes an error of
its own. A sentence like "step 2 of 3 failed" would put a second account beside
the strategy's, and which step it was is already in the failure's `request`.

## What `withLock` does when the cleanup also fails

`withLock(acquire, body, release)` runs `release` after every successful
`acquire` — after a refusal from `body`, and after a throw from it. Six
outcomes, and the fourth is the one worth arguing about:

| acquire | body | release | the answer |
|---|---|---|---|
| fails | not run | not run | the acquire failure, untouched |
| ok | ok | ok | the body's value |
| ok | fails | ok | the body failure, untouched |
| ok | ok | fails | **a failure**, carrying the release failure, plus `operation: 'succeeded'` |
| ok | fails | fails | the body failure, untouched, plus `cleanup` |
| ok | **throws** | fails | the body's throw, **rethrown carrying `cleanup`** |

A throw is not an `IAdtResponse` and cannot become one: `answer()` names it
`client_threw` and that is the honest report of a defect in this process. But the
lock is a fact about SAP, not about the throw, and it must survive. So the throw
is rethrown with the release failure attached, and `answer()` renders `cleanup`
on the `client_threw` payload exactly as it does on a refusal. A `finally` that
simply let the original exception out would lose it — which is what the first
draft of the implementation did, and why the outcome is written here rather than
left to the code.

**The primary cause wins.** When both halves fail, the answer is the body's
failure: it is what the caller asked about, and losing it to a secondary fact
would be the worse trade. The secondary fact is not dropped — `cleanup` is a
new field on the failure payload, carrying the release failure's own `message`,
`origin` and `request`, so a caller learns the object is still locked.

**A write that succeeded under a lock that did not release is reported as a
failure.** The write happened and the answer says so, but a held lock is the
caller's next problem and an answer marked success is one an agent does not read
twice. This repository has removed three masking defects of exactly that shape.
`LockRegistry.unlockAll()` may still release it at session end, which makes this
recoverable, not silent — and the reason the answer names the lock rather than
just warning the log, which is all the current handlers do.

*This is the decision in this document most likely to be argued.* The other
reading — success with a warning — is defensible if a caller is expected to act
on warnings. The evidence here says they do not.

**`lock` and `unlock` take no `analyse`.** Measured on 19: `lock(config)` and
`unlock(config, lockHandle)` declare no options parameter at all, so the verdict
on both is adt-clients' own and cannot be injected. Everywhere else in this
design the verdict is ours; here it is not, and saying so is better than a rule
with a silent hole in it. It means `withLock`'s acquire and release failures are
whatever the library judged them to be — which is enough to know a lock was not
taken or not released, and not enough to know why in the vocabulary the rest of
the failures use. Raised against the library as part of issue #200.

**How many handlers need a combinator is not a number this document fixes.**
An earlier draft said thirteen — eight that called removed members and five
whose update is a read-modify-write — and that was the count of handlers whose
sequence adt-clients 19 *took away*, mistaken for the count of handlers that
have one. Measured on the tree instead:

| | handlers |
|---|---|
| exactly one client call site | 131 |
| more than one | 113 |
| of those, a dispatch over object families where one branch runs | 4 |
| of those, calling both `read` and `readMetadata` — the `pair` shape | 18 |

These are call *sites*, counted by the compiler's own file list, not calls per
run: a branch that only some arguments reach is counted here and may never
execute. The real audit is the migration itself, family by family, and the
invariant tests are what hold the result.

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
   `adt_type`, `namespace`, `request`, `messages`, `raw_body`, and `cleanup`
   where a `withLock` release failed. `cleanup` is rendered on the
   `client_threw` payload too, which is the only way it reaches a caller when
   the body threw. Every one of them
   whenever the failure carries it, at every `detail` — see above. `response` is
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
  362 enumerated tools, checked with `scripts/list-tools.ts` against the frozen
  snapshot in `tests/fixtures/tools/surface.json`.
- Whenever a failure carries a string body, `raw_body` reaches the caller — at
  every `detail`, on every tool. A connection failure, an empty answer and a
  body the transport already parsed have no string to hand over, and the field
  is then absent rather than invented.
- `npx tsc` is clean.
- No handler reads an envelope property off `IAdtSuccess`.
- No handler decides a refusal for itself, and every call that accepts an
  `analyse` is given one. `lock` and `unlock` accept none — the one place the
  verdict stays adt-clients'.
- Every XML-bodied update reads before it writes.
- Every acquired lock is released, on every path out of the handler, and a
  release that failed reaches the caller rather than only the log.

## Out of scope

The inventory's residual findings, the six un-migrated handlers the old plan
listed, and anything in issue #200 that is not needed to compile.
