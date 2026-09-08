# Result and error strategies on adt-clients 18 — design

**Status:** approved 2026-09-08. Supersedes the ad-hoc migration on
`chore/bump-current-stack`, which stays as a reference branch and is not merged.

## The problem

adt-clients 18 removed the 28 `IXxxState` envelopes. A member now answers
`IAdtResponse<TValue, TError>`, where **the two type parameters are the two injected
strategies**: `TValue` is what a result strategy produced, `TError` is what an error
strategy produced. A result is reachable only through `ok`, so a refusal cannot be
read as an empty success.

A direct migration was attempted first and abandoned deliberately. It reached 119
compile errors from 594, and the shape of the remaining work made the cost visible:
roughly a hundred handlers each grew the same four lines —

```ts
if (!answer.ok) {
  return return_error(answer.getError().message);
}
const value = answer.getResult().value;
```

— which is code written so that nothing changes, and which a strategy removes again.
Worse, `getError().message` throws away `origin`, `request` and the server's own
classification that the contract offers.

Meanwhile this repository already contains the readings a result strategy is made of:
`parseValidationResponse`, `parseCheckRunResponse`, `parseSqlQueryXml`,
`parseRuntimePayloadToJson`, `extractNamedItems`, `parseValidObjects`, `parseNodeIds`.
Several are near-duplicates of each other. **They are not thrown away — they move.**
What changes is where the reading lives and that it becomes injectable.

## Scope

In: the result and error strategies, the handlers' use of them, and the `detail`
parameter on the tool surface.

Out: the connection axis (connection 8 removed the factory; `src/lib/connectionFactory.ts`
is cherry-picked from the reference branch as infrastructure), and the tool inventory
itself — no tool is added or removed by this work.

## Base

A new branch from `main`. Not from the migration branch: stage 1 below reads the
handlers' original inputs, outputs and transformations, and on the migration branch
those are already half-rewritten, so the work would start by subtracting my own edits.
Each file is then touched once rather than twice.

Before merging, the reference branch's 28 commits are reviewed one by one and the
behavioural fixes among them re-applied deliberately: the three masking closures
(read, deletion, activation), the transport rewrite, the profiling contract, the
removed dead inputs. The churn is not.

## Grouping: by the shape of the exchange

Strategies are grouped by **what goes in and what comes out**, not by object family.
Object families have different members but the same handful of exchanges, which is why
the same transformation appears in a dozen tools today.

| group | in | out | levels |
|---|---|---|---|
| **Source text** | text | text | one. Source is source — there is nothing to summarise |
| **Write verdict** | XML | a verdict | terse: `SUCCESS`. full: the document as the endpoint sent it |
| **Structured document** | XML | a structure | terse: a projection. full: the whole structure. raw: the document as sent |

## One parse, two projections

For the structured group the document is parsed **once**, and `detail` chooses how much
of the parse to show. It does not choose a different parse.

The parse follows the precedent adt-clients set with `parseTransportTree`: **the
structure is named, the attributes are verbatim.** JSON gains only the level names —
`requests`, `containers`, `links`, `tasks` — while attributes keep the keys SAP sent,
`tm:number` and `adtcore:name`, unrenamed and unselected.

Two alternatives were rejected. A raw `fast-xml-parser` pass loses nothing but produces
a shape the consumer must renormalise on every read: `@_` prefixes, and a node that is
an object with one child and an array with two — which is exactly what the transport
parser broke on. Our current selective parsers are cheap for context but pick known
fields and discard the rest, so a field SAP adds is a field we never see.

Adding a field to the terse projection therefore never touches the parser.

## Verbosity

`detail` is a parameter on the tools, not a server setting: every tool already takes
parameters, and a restart is the wrong granularity for troubleshooting.

Levels, and what they mean per group:

- **terse** (default) — JSON. For a write, `SUCCESS` and nothing else. For a structured
  document, a projection carrying the fields a caller needs to act.
- **full** — JSON. The whole parsed structure.
- **raw** — the body as the transport delivered it. This is the troubleshooting level.

  **The guarantee is bounded, deliberately.** For a `text/*` or XML answer — which is
  every ADT document this server reads — `raw` is byte-for-byte what the endpoint sent.
  For an answer the transport has already turned into an object (JSON), it cannot be:
  the strategy is handed `IAdtWireResponse`, and re-serialising an object does not
  restore whitespace, key order or number formatting. There, `raw` means a faithful
  serialisation of what arrived, not the original bytes. Promising more would require
  changing the connection contract to keep the untouched body, which is out of scope
  here.

Not every group has three distinct answers. For a **write**, `full` and `raw` are the
same document — there is no intermediate structure between `SUCCESS` and what the
endpoint sent, so both levels return it. For **source text**, all three coincide: the
source is the answer. Only the structured group uses all three.

## Errors

**The error strategy does not depend on `detail`.** It always returns everything the
contract offers — `origin`, `message`, `request`, the server's classification. Terse
applies to results; a failure is where a caller needs the most, not the least.

Classification is read from the document, not from HTTP status. ADT answers `200` and
refuses in the body — that is the root of the three masking defects this repository has
carried.

### Both strategies read the same answer

This is the mechanism the rest of the section depends on. The two injected strategies
receive **the same endpoint response**:

```ts
type IResultStrategy<T> = (answer: IAdtWireResponse) => T;
type IAnalyse<E extends IAdtError> =
  (verdict: IAdtError | AdtNoFailure, answer?: IAdtWireResponse) => E | AdtNoFailure;
```

The error strategy also receives the library's own preliminary verdict, and `E` extends
`IAdtError` with whatever we add.

That matters because `IAdtResponse` is a disjoint union: a failure has no
`getResult()`. So "every message in the result **and** an `E` raises a failure" cannot
be satisfied by the result alone. It is satisfied because both strategies read the same
document:

```ts
interface IAdtMessageFailure extends IAdtError {
  readonly messages: ReadonlyArray<{ type: 'E' | 'W' | 'I'; text: string; ... }>;
}
```

Two rules, and they do not conflict:

1. **Every message reaches the caller** — `W`, `I` and `E` alike. On success they are in
   the result; on failure they are in `getError().messages`, put there by the error
   strategy from the same document. Neither path loses them.
2. **An `E` raises the failure**, and the tool answers `isError: true` with those
   messages in its payload.

The conclusion is uniform. What differs per document form is only **where the signal
lives**, which is why there is one error strategy per form rather than one per family:

| form | refusal signal |
|---|---|
| validation report | `message` of type `E` |
| deletion check | `isDeletable="false"`, or a message of type `E` |
| deletion response | `isDeleted="false"` with `del:message` |
| activation | the activation document's own error messages — note adt-clients found `activationExecuted="false"` is *not* one |
| check run | `chkrun` messages of type `E` |
| no document | connection level: unreachable host, expired session, no authority |

## What the default answer may stop containing

`terse` becomes the default, and for a write it is `SUCCESS`. Today's handlers return
more than that — the created object's name, the transport, activation and check
messages — so this **removes fields from tool outputs that callers may depend on**. It
is an intended reduction, not an oversight, but it must be visible rather than
discovered.

Stage 1 therefore produces a table with a row per tool: **current default output → new
terse projection → fields dropped**. A dropped field is either justified in that row or
kept. The rule for judging: a field the caller needs to make the next call — an object
name it did not already have, a transport number it must quote — stays in `terse`; a
field that only describes what just happened goes to `full`.

The table is part of the spec's output and is reviewed before stage 3 begins. No tool
loses a field that is not in it.

## Package traversal stays in the handler

A strategy reads one answer. Recursion is a sequence of requests, so walking a package
tree belongs to the handler: the strategy parses a node, the handler decides where to go
next.

`depth` defaults to the whole tree. A caller that needs one level passes `depth: 1`. The
default is full because a caller who receives one level almost always asks for the next,
and two round trips cost more than one answer; the parameter exists because a caller who
genuinely needs one level should not pay for the whole tree in context.

### What `depth` replaces, and what it means

Two tools traverse today, and both already have parameters for it:
`GetPackageTree` and `GetObjectsList`. `GetPackageTree` takes `max_depth` (**default 5**)
and `include_subpackages`, and the recursion is governed by both.

`depth` replaces both:

| value | meaning |
|---|---|
| `1` | the named package only — equivalent to `include_subpackages: false` today |
| `n > 1` | the package and `n − 1` levels of subpackages below it |
| omitted | the whole tree |

`include_subpackages: false` becomes `depth: 1`; `max_depth: 5` becomes `depth: 5`. Both
old parameters are removed rather than kept alongside, because two knobs governing one
traversal is how the current pair became ambiguous. `depth: 0` is refused by name — an
argument that asks for nothing is a caller's mistake, not a shape to invent an answer for.

**The default changes from 5 to unlimited, which is a behavioural change with a real
cost**: a root package can be hundreds of subpackages and as many round trips. Silent
truncation is not an option — it is the masking problem applied to data — so the
traversal is bounded and **says so in the answer**: when a bound stops it, the payload
carries what stopped it and where. Stage 1 fixes the bound; it is a number, not a
principle, and belongs with the inventory that shows how large real packages are.

## Stages

1. **Inventory.** Every tool: what it accepts, what it returns, how it transforms the
   answer today, how it decides an error today. Read from `main`. Produces the
   compatibility table above — current default output, new terse projection, fields
   dropped — and the traversal bound.
2. **Method mapping.** For each tool, the adt-clients 18 member it uses. Expected to be
   the same operation with a different call shape; the exceptions are the eight
   own-document types (`readMetadata`/`updateMetadata`, no `read`/`update`) and the
   members whose options were removed.
3. **Strategy catalogue.** The result and error strategies the inventory demands, as
   stubs. Grouped per the table above; this is where duplication collapses.
4. **Implementations.** Fill the stubs, taking an adt-clients implementation where one
   fits and lifting our existing parser where it does not.

Stages 3 and 4 parallelise across groups: strategies share no state.

## The six handlers left un-migrated

`handleGetObjectsList`, `handleGetObjectsByType`, `handleGetAllTypes`,
`handleGetObjectInfo`, `handleGetObjectStructure`, `handleGetEnhancements` each parse
XML themselves and were deliberately left broken on the reference branch rather than
migrated twice. They are the first candidates for stage 4.

## Success criteria

- `tsc` clean on both configs; the non-integration suite green.
- No handler contains a document parse.
- A refusal reaches the caller with `origin`, `message` and the server's wording. A call
  whose document carries messages delivers **all** of them — through the result when it
  succeeded, through `getError().messages` when an `E` made it a failure — and answers
  `isError: true` in the second case.
- `detail: 'raw'` returns byte-for-byte what the endpoint sent for text and XML answers,
  and a faithful serialisation where the transport had already parsed the body.
- Every field dropped from a tool's default output appears in the compatibility table,
  with its justification. A field not in the table is not dropped.
- A traversal stopped by its bound says so in the payload; no answer is silently partial.
