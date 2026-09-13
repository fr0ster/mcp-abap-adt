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
a signal. `fetchNodeStructure` also accepts none, so the point is moot there —
but it is the one place where we would have declined anyway.

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

**Calls around a held resource** — `withLock()`, and only where the handler owns
the whole lifetime of the lock. Two boundaries on that, both measured:

*What actually locks.* In the corpus, an update is `lock`, `PUT`, `unlock`
(`update-source-success`, three exchanges). A create is a bare `POST`
(`create-class`, `create-domain`), an activation is a bare `POST`
(`activation-success-verdict`), and a deletion is a `POST` to
`/sap/bc/adt/deletion/delete` with the object in the body and no lock at all
(`delete-success`) — a held lock is what makes a deletion *refuse*, which is how
`refusal-delete-refused` was captured. So `withLock` belongs to the write that
goes through a `PUT`, and nowhere else.

*Where a lock deliberately outlives the handler.* Fifteen `low`-tier tools —
`LockClassLow`, `LockDomainLow`, `LockObject` and the rest — acquire a lock and
hand the handle back, because the caller's next MCP call is the update and the
one after that is the unlock. Releasing it before returning would destroy the
tool. **These are not `withLock` and must not be wrapped in it.** They are the
one shape where an unreleased lock is the correct outcome, and `withLock`'s
criterion does not apply to them.

A lock-update-unlock chain is **not** a `sequence()`, and putting it in one would
be a bug: `sequence` stops
at the first failure, so a refused update would skip the unlock and leave the
object locked in SAP. Thirteen update handlers already use `try/finally` for
exactly this reason. adt-clients' own `LockRegistry` calls itself "a safety net,
NOT the primary defense" and says preventing that is the caller's job.

These three combinators share one rule: **every step that accepts an `analyse`
is given one**, and the failing step's answer is handed back **untouched**. None
composes an error of its own. A sentence like "step 2 of 3 failed" would put a
second account beside the strategy's, and which step it was is already in the
failure's `request`.

`withLock` is where the qualifier earns its place: its `acquire` and `release`
call `lock` and `unlock`, and neither accepts an `analyse` on any class in 19, so
the verdict on both stays the library's. Their verdict stays adt-clients'. The
body in between takes one like any other call. See below.

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

## What `withLock` does when the cleanup also fails

`withLock(acquire, body, release)` runs `release` after every successful
`acquire` — after a refusal from `body`, and after a throw from it. Both halves
have **three** outcomes, not two, and collapsing the last two is where the first
two drafts of this section went wrong:

- **ok**
- **refused** — an `IAdtResponse` failure. A strategy judged it, and it carries
  an `AdtFailureOrigin`.
- **threw** — an exception. adt-clients throws from argument validation,
  unsupported-operation checks and its own invariants, and our code can throw
  too. `answer()` names this `client_threw`, and **it gets no origin**:
  `connection` and `refusal` are both claims about the server, and neither is
  true when the defect is in this process.

Three rules settle every combination.

1. **A throw stays a throw.** It is never turned into an `IAdtResponse` failure,
   because that would require inventing the origin it does not have. `answer()`
   is the one place that names throws.
2. **The body's outcome is the answer**, and the release's outcome rides along
   as `cleanup` when the body did not succeed.
3. **When the body succeeded and the release did not**, the release's outcome
   becomes the answer, marked `operation: 'succeeded'` — as a failure if it was
   refused, as a throw if it threw.

| body | release | the answer |
|---|---|---|
| ok | ok | the body's value |
| ok | refused | a failure carrying the release error, plus `operation: 'succeeded'` |
| ok | threw | **the release's throw**, rethrown, plus `operation: 'succeeded'` |
| refused | ok | the body failure, untouched |
| refused | refused | the body failure, untouched, plus `cleanup` with an origin |
| refused | threw | the body failure, untouched, plus `cleanup` marked `client_threw`, no origin |
| threw | ok | the body's throw, rethrown unchanged |
| threw | refused | the body's throw, rethrown, plus `cleanup` with an origin |
| threw | threw | the body's throw, rethrown, plus `cleanup` marked `client_threw`, no origin |

A failed `acquire` is answered untouched and neither `body` nor `release` runs;
an `acquire` that throws propagates for the same reason.

So `cleanup` has two shapes, and which one it is, is itself the information:
`{ message, origin, request }` when SAP refused the unlock, and
`{ error: 'client_threw', message }` when something in this process threw on the
way. A caller told `origin: 'connection'` over an argument-validation defect
would go looking at the network.

**`cleanup` is rebuilt field by field, and its `request` is the same two fields
by name.** It is not an object that travels through. The top-level `request`
already carries this rule — the contract types it as `{ method?, url? }`, but a
type is not a filter, and TypeScript accepts a wider object structurally, so a
strategy that put its transport config there would send headers, an
Authorization bearer and cookies straight to the model. `cleanup` arrives from
the same place and through an error that may have crossed a `throw`, so it gets
the same treatment and the same code: `method` and `url`, copied by name, and
nothing else. A cleanup built from a throw carries no `origin` even if one is
present on the object, because that shape's whole point is that it has none.

**Why the body wins.** It is what the caller asked about, and losing the cause
to a secondary fact is the worse trade. The secondary fact is not dropped:
`cleanup` is a new field on the failure payload, and on the `client_threw`
payload too, so a caller learns the object is still locked either way.

**A write that succeeded under a lock that did not release is reported as a
failure or a throw, by which of the two happened.** The write happened and the answer says so, but a held lock is the
caller's next problem and an answer marked success is one an agent does not read
twice. This repository has removed three masking defects of exactly that shape.
`LockRegistry.unlockAll()` may still release it at session end, which makes this
recoverable, not silent — and the reason the answer names the lock rather than
just warning the log, which is all the current handlers do.

*This is the decision in this document most likely to be argued.* The other
reading — success with a warning — is defensible if a caller is expected to act
on warnings. The evidence here says they do not.

## Who decides a refusal, when the member will not take a strategy

**Whether a call accepts an `analyse` is a property of the (class, member) pair,
and no reading of member names can answer it.** Three drafts of this section tried to
answer it by reading declarations, and each was wrong in a different way:

- *"the member has an `options` parameter"* — `fetchNodeStructure(parentType,
  parentName, options?: IGetNodeContentsOptions)` has one, for `nodeId` and
  `withShortDescriptions`, and accepts no strategy.
- *"the member declares `<E extends IAdtError>`"* — `AdtPackageLegacy` declares
  `readMetadata<E extends IAdtError = IAdtError>()`, with no parameters at all,
  so there is nowhere to put one.
- *"the member's name"* — `readMetadata` accepts a strategy on 30 classes and
  not on `AdtPackageLegacy`; `update`, `create`, `delete`, `validate` and
  `updateMetadata` differ the same way between a class and its `Legacy` twin.
  A name-keyed measurement collapses exactly the difference that matters.

**The legacy twins are not hypothetical.** `createAdtClient` returns
`AdtClientLegacy` whenever the system context says so, so the same handler runs
against both shapes. A rule that holds for `AdtPackage` and not for
`AdtPackageLegacy` is a rule that breaks on a legacy system only — see *Legacy
is in scope, and here is why*.

So this document states the rule and refuses to enumerate the members:

> Every call whose resolved signature accepts an `analyse` is given one.

"Resolved" is the operative word — the check belongs to `tsc`, which knows the
type of the options parameter at each call site, and not to a grep, a list of
names, or a table in a design document that ages the moment adt-clients ships a
version.

**But `tsc` sees only one of the two contracts, and saying it saw both was
wrong.** `createAdtClient` is declared to return `AdtClient` and returns
`AdtClientLegacy` when the context says legacy, so a call site is always checked
against the modern shape. That is a section of its own — *Legacy is in scope,
and here is why* — because the answer is not a footnote about the compiler.

Within one shape, passing an `analyse` where it is not accepted is a compile
error, so that half enforces itself. The half that needs a test is the omission:
a call that *could* take a strategy and does not, which compiles cleanly and
silently takes the library's verdict.

**What that actually costs is narrower than the list looks.** With no `analyse`,
`answering()` falls back to `recogniseFailure`, which reports a failure when the
request threw — a transport error, a non-2xx. So for a read, a search, a listing
or a walk the library's default is adequate: a 404 is a 404 and arrives as one.
The default is only wrong where **ADT answers 200 with a refusal inside the
body**, which is the whole reason `analyse` exists.

Cross those two facts and the gap is one member. Of the 19 that take no
`analyse`, this repository calls ten, and only `activateObjectsGroup` — used by
`handleActivateObject` — is in the class that hides a refusal under a 200. Group
activation is one of the two masking families this project has already fixed
once. The remaining nine are reads and listings that the transport-level default
serves.

So: `handleActivateObject` is the one place where the design's rule and the
library's surface genuinely collide, and it is called out as such rather than
generalised into a claim about every walk and listing. The options are to call
the per-object `activate`, which does take an `analyse`, or to get the group
member the `<E extends IAdtError>` shape the other twelve have. Raised as part
of issue #200.

**For the package walkers this is not a gap at all**, and the reason is worth
keeping separate from the signature: a missing package and an empty one answer
the same sha256, so an `analyse` there would be inventing a signal rather than
reading one. They would decline the parameter if it were offered. Everywhere
else on that surface, we would take it.

## Legacy is in scope, and here is why

**What it is.** `SAP_SYSTEM_TYPE=legacy` tells this server the system is BASIS
below 7.50, and `createAdtClient` then builds `AdtClientLegacy` instead of
`AdtClient`. It is set by whoever runs the server and holds for the life of that
deployment; the two clients never coexist in one process.

**Why it is not a separate product.** Legacy is a **subset of the same tools**,
not a fork. 144 of the 326 tools declare `legacy` in `available_in`, and they are
served by **the same handler files** — there is no legacy handler directory and
no legacy code path inside a handler. So this migration rewrites the legacy
tools whether or not it says it does. An earlier draft of this document put
legacy out of scope on the grounds that the operator chose it. That was a
sentence, not a mechanism: declaring a deployment out of scope does not stop the
code under it from changing, and the choice being explicit does not make an
unannounced behaviour change acceptable. **A migration cannot decline to migrate
the code it is rewriting.**

**Why `available_in` does not cover it.** `available_in` decides which tools a
system is offered. It hides the tools that cannot run on legacy at all — the
fourteen factories `AdtClientLegacy` declares as `never`, so `GetDomain`,
`ReadTable`, the service-binding tools and the rest. It says nothing about the
144 tools that **do** run there, which is exactly the set at risk.

**What actually differs.** `AdtClientLegacy` overrides ten factories with
`Legacy` classes. Six of them — program, class, interface, function group,
function module, ddl — parameterise every member, so their handlers need nothing
special. Four do not:

| `Legacy` class | members that take no strategy |
|---|---|
| `AdtPackageLegacy` | `create`, `read`, `readMetadata`, `updateMetadata`, `delete`, `validate` |
| `AdtUnitTestLegacy` | `run`, `getStatus`, `getResult` |
| `AdtRequestLegacy` | `delete`, `updateMetadata`, `list` |
| `AdtUtilsLegacy` | `activateObjectsGroup`, `getTableContents`, `getTableColumns`, `getSqlQuery` |

Twenty-three legacy-declaring tools reach those four factories: the package
tools, the unit-test tools, three listing tools and `handleActivateObject`.

**What it costs, precisely.** Passing a strategy to a member with no parameter
for it is harmless — JavaScript drops the argument. What is lost is the verdict:
`recogniseFailure` still reports a thrown request, so a 404 or a transport error
surfaces as it should, and only a refusal **encoded inside a 200** stays
unread. On those twenty-three tools, on a legacy system, that class of refusal
is adt-clients' to judge.

**What is done about it.** For those twenty-three: call a member that accepts a
strategy where one exists; where none does, pin the `(Legacy class, member)`
pair in a committed list a test checks, so the set cannot grow unnoticed and the
release notes can name it. Seventeen members, generated from the declarations —
this is a pin, not a per-handler ledger.

**Two things deliberately not done.** Narrowing `createAdtClient` to
`AdtClient | AdtClientLegacy` would make the compiler honest and would also
force every handler to confront the fourteen `never` factories; that is a
different project, and `available_in` already keeps those tools away. And
dropping legacy support is not on the table: it is a supported subset, and
ending it would be a product decision, not a migration detail.

**The real fix is not ours.** One contract across a class and its `Legacy` twin,
so a consumer writes the call once. Raised as part of issue #200.

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
- No handler decides a refusal for itself, and **every call whose resolved
  signature accepts an `analyse` is given one** — resolved per (class, member)
  by the compiler on the modern contract, and by a pinned list of seventeen
  members on the `Legacy` one, which `createAdtClient`'s declared return type
  hides from the compiler. Neither the presence of an `options` parameter nor a
  `<E extends IAdtError>` type parameter is a reliable proxy. Where the
  library's default verdict is not enough — `activateObjectsGroup` alone, among
  the members this repository calls — `handleActivateObject` says so in a
  comment rather than reading the document itself.
- Every XML-bodied update reads before it writes.
- In a handler that owns a lock's whole lifetime, after every successful
  `acquire`, `release` is attempted exactly once, on every path out — a refusal, a throw, a success. Whether SAP then lets go of
  the lock is SAP's answer, not something this code can promise; what it
  promises is that the attempt happens and that a refused or thrown release
  reaches the caller rather than only the log. The fifteen `low`-tier lock tools
  are outside this: handing the handle back with the lock still held is what
  they are for.

## Out of scope

The inventory's residual findings, the six un-migrated handlers the old plan
listed, and anything in issue #200 that is not needed to compile.
