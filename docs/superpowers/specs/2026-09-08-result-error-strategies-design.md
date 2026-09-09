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

## The library transforms nothing

adt-clients does not shape an answer on its own: **every transformation is a strategy's**,
and the strategies are ours to supply. The shipped sets are defaults we may take, not
behaviour the library imposes. That is why the parsing this repository does today moves
into strategies rather than being expected from the client, and why the client cannot be
asked to "return it differently".

## The adapter: what actually removes the repetition

Strategies produce both halves of `IAdtResponse`. They do not, by themselves, save a
handler from checking `ok`, calling `getResult()` or `getError()`, and turning either
into an MCP result — which is the repetition this design exists to remove. The piece
that removes it is a single adapter, and it is part of this work:

```ts
// src/lib/utils.ts
export function return_answer<T>(
  answer: IAdtResponse<T, IAdtError>,
  project: (value: T) => unknown,
  ctx: { tool: string; detail: 'terse' | 'full' | 'raw' },
): McpResult;
```

This adapter decides the public output of every handler, so its wire contract is part of
the design rather than a detail of the implementation.

**On success.** One `text` content item. What goes in it depends on what the projection
returned, and the rule is exactly three lines:

| projection returns | content text |
|---|---|
| a `string` | that string, verbatim — no quoting and no JSON wrapper, so source code and `detail: 'raw'` come back as themselves |
| anything else | `JSON.stringify(value, null, 2)` |
| `undefined` | **a failure**, not a success — see below |

**`undefined` is never `SUCCESS`.** An earlier draft had the adapter read it that way, so
that a terse write could return nothing. The adapter cannot tell that apart from a read
whose projection found nothing where something was expected, and turning the second into
`SUCCESS` is the masking defect this repository has spent three fixes removing.

So the terse write projection **says** it: it returns the string `'SUCCESS'`.

A projection that returns `undefined` has failed to read its own document. That is a
defect in this server, not an answer from SAP, and it **does not borrow an
`AdtFailureOrigin`**: `connection` means unreachable host, expired session or missing
authority, and a caller told that will go and reauthenticate over a parser bug. The
contract deliberately has no origin for "our reading broke", and inventing one by reuse
is the same class of lie as reporting a refusal as success.

It is therefore answered on a separate local path, with a payload that is visibly not an
ADT failure:

```jsonc
{
  "error": "projection_failed",
  "tool": "GetClass",
  "detail": "terse",
  "message": "the terse projection produced no value for GetClass"
}
```

`ctx.tool` and `ctx.detail` are what make that message possible, which is why the
adapter takes them.

**On failure.** `isError: true` and one `text` content item holding
`JSON.stringify(payload, null, 2)`. The payload is an **allowlist**, not the error
object — serialising `IAdtError` wholesale would carry `response`, which is an
`IAdtWireResponse` with headers, cookies, possibly a large body and possibly circular
references:

| field | from `IAdtError` | when |
|---|---|---|
| `message` | `message` | always — SAP's wording verbatim |
| `origin` | `origin` | always — `connection` or `refusal` |
| `code` | `code` | when present — the **strategy's** code, e.g. `AdtObjectErrorCodes.UNSUPPORTED_OPERATION` |
| `adt_type` | `adtType` | when present |
| `namespace` | `namespace` | when present |
| `request` | `request` | when present — `method` and `url` only |
| `messages` | our `IAdtMessageFailure` | when the form carries messages |

`response` is **never serialised** as an object: its headers and cookies are transport
state and have no business in a tool answer, and it may hold circular references.
Undefined optional fields are omitted rather than emitted as `null`.

**The body is still reachable on a failure, and has to be.** A result strategy runs only
on the success half, so without this the troubleshooting case — the one where the body
matters most — would have nothing.

**The adapter does this, not the error strategy.** The strategy stays independent of
`detail` and fills everything it can, including `error.response`. The adapter holds
`ctx.detail`, and it is the only place that decides what reaches the caller:

| field | when |
|---|---|
| `raw_body` | `ctx.detail === 'raw'` **and** `error.response.data` is a string — that string verbatim |

Anywhere else — any other `detail`, a body the transport had already parsed into an
object, or no response at all — `raw_body` is absent. It is never a serialisation of an
object: on the failure path there is no reading to fall back on, and inventing one would
put a shape in front of a reader who asked for the document. The response object itself
is still never serialised: no status, no headers, no cookies.

This keeps what the single line `getError().message` threw away, and the two kinds are
not conflated: `adtType` and `namespace` are the **server's** classification of the
object it refused about, while `code` is the **strategy's** — a named condition like
`UNSUPPORTED_OPERATION` or `LOCK_FAILED` that a caller can branch on without parsing a
message. It does not reintroduce what issue #155 removed: no service prefix and no
double-wrapping.

A handler therefore reads: pick the strategy set for the requested `detail`, call the
member, hand the answer to `return_answer` with the projection for that level and the
context — its own tool name and the level asked for. There is no `if (!answer.ok)` in a
handler.

`return_response` and `return_error` stay for the paths that do not go through a client
member at all.

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

  **The guarantee is character-for-character, not byte-for-byte.** A strategy is handed
  `IAdtWireResponse`, whose body the transport has already decoded into a JavaScript
  string — so the encoding it arrived in, a BOM, and any invalid byte sequence were
  resolved before we see it. What `raw` promises is therefore exact: **the value of
  `answer.data`, unmodified by us** — no parse, no reserialisation, no reformatting.

  Where the transport has already turned the body into an object, even that is not
  available, and `raw` is a faithful serialisation of the object rather than the text
  that produced it.

  Byte-for-byte would require the connection layer to keep the undecoded body — a
  `Buffer` alongside the string — which is a change to that contract and out of scope
  here. If a case ever needs it, that is where it belongs.

Not every group has three distinct answers. For a **write**, `full` and `raw` are the
same document — there is no intermediate structure between `SUCCESS` and what the
endpoint sent, so both levels return it. For **source text**, all three coincide: the
source is the answer. Only the structured group uses all three.

## Errors

**The error strategy does not depend on `detail`.** It always returns everything the
contract offers — `origin`, `message`, `request`, the server's classification. Terse
applies to results; a failure is where a caller needs the most, not the least.

`detail` is applied once, in the adapter, and only to decide whether `raw_body` is
included. That is the single place in this design where a level touches a failure.

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

**Inputs are in the same table, and for the same reason.** Removing
`include_subpackages` and `max_depth` from the two package tools is a schema-breaking
change to the public surface, and it is not covered by a table about outputs. The row
therefore also carries **current inputs → new inputs → what happens to a call using the
old ones**.

The policy is **reject by name**, not silent translation. A call passing `max_depth: 5`
is answered with an error saying that the parameter is gone and `depth` replaces it. The
alternative — quietly mapping the old pair onto `depth` — would turn `max_depth: 5` into
a bound-limited traversal for anyone who omitted it, which is a behaviour change the
caller never sees. An explicit refusal is a one-line fix for them and no surprise for
anyone.

**A policy without a mechanism is not implementable, so the mechanism is part of it.**
Simply deleting the keys from the schema does not produce that error: depending on how
the validation layer treats unknown properties, the call is either rejected before a
handler runs — with a generic schema message that names neither the replacement nor the
reason — or the key is accepted and ignored, which is the silent behaviour change this
policy exists to prevent.

So the two keys **stay in the schema for one release**, marked deprecated in their
descriptions, and the handler refuses them:

```jsonc
{
  "error": "parameter_removed",
  "parameter": "max_depth",
  "replacement": "depth",
  "message": "max_depth was removed; use depth. depth: 5 is the old default."
}
```

They are deleted from the schema in the release after, by which time a caller has been
told by name. Which release that is belongs to the plan, not here.

The table is part of the spec's output and is reviewed before stage 3 begins. No tool
loses an input or an output field that is not in it.

## Package traversal stays in the handler

A strategy reads one answer. Recursion is a sequence of requests, so walking a package
tree belongs to the handler: the strategy parses a node, the handler decides where to go
next.

Omitting `depth` means **as deep as the tree goes within the mandatory safety bound**
— never "unlimited", which is not a thing this server can promise. A caller that needs one
level passes `depth: 1`. The default goes as deep as it may because a caller who receives
one level almost always asks for the next, and two round trips cost more than one answer;
the parameter exists because a caller who genuinely needs one level should not pay for the
rest in context.

### What `depth` replaces, and what it means

Three tools traverse today, and they do not traverse the same thing. Each gets its own
contract; conflating them is what made the first draft of this section wrong.

**`GetPackageTree`** and **`GetPackageContents`** both walk *packages*, and both already
carry `include_subpackages` and `max_depth` (**default 5**), with the recursion governed
by the pair. `depth` replaces both parameters in both tools.

**`GetObjectsList`** walks *ADT node ids* inside one object's structure, guarded by a
`visited` set. It has neither parameter today, and node depth is not package depth — a
level there is a node expansion, not a subpackage. It therefore keeps its own traversal
and does **not** take `depth`. What it gains from this work is the same honesty
requirement as the others: a bound, and a payload that says when the bound stopped it.

Its continuation cannot be by name, and needs its own contract. The traversal always
starts at node `000000`, so repeating the call repeats the same walk and stops in the
same place. So when the bound stops it, the payload carries **the frontier**: the node
ids it reached but did not expand.

```jsonc
{
  "objects": [ … ],
  "stopped_at_bound": true,
  "frontier": ["000123", "000456"]
}
```

The tool gains an optional `start_node_ids` input. Given it, the traversal starts from
those nodes instead of `000000` — so a caller continues exactly where the previous answer
stopped, by handing back what it was given. No state is kept between calls: a node id is
an address on the server, and the `visited` set is rebuilt from the nodes reached in that
call.

For the two package tools, `depth` means:

| value | meaning |
|---|---|
| `1` | the named package only — equivalent to `include_subpackages: false` today |
| `n > 1` | the package and `n − 1` levels of subpackages below it |
| omitted | as deep as the tree goes, **up to the safety bound below** |

`omitted` means "do not stop at a level I chose". The bound still applies, and it is
mandatory — there is no value of `depth`, and no way to omit it, that removes the bound.
A caller who receives a bounded answer knows it, because the payload says so.

In both package tools `include_subpackages: false` becomes `depth: 1` and `max_depth: 5`
becomes `depth: 5`. Both old parameters are removed rather than kept alongside, because
two knobs governing one traversal is how the current pair became ambiguous. `depth: 0` is refused by name — an
argument that asks for nothing is a caller's mistake, not a shape to invent an answer for.

**The two package tools do not have the same default today, and the change is bigger for
one of them.** The spec named only the tree's, which understated it:

| tool | traversal today when nothing is passed | after |
|---|---|---|
| `GetPackageTree` | `include_subpackages` true, `max_depth` 5 — five levels | as deep as the bound allows |
| `GetPackageContents` | `include_subpackages` **false** — the package only, one level | as deep as the bound allows |

For `GetPackageContents` that is not a deeper limit, it is recursion where there was
none: a caller that passed nothing got one package and will now get a subtree. The cost
in round trips and in answer size is the larger of the two changes, and it gets its own
row in the compatibility table rather than hiding behind the tree's.

`depth` keeps one meaning across both tools, because two tools answering the same
question with opposite defaults is the defect that made the old pair ambiguous in the
first place. A caller who wants the old `GetPackageContents` behaviour passes
`depth: 1`, and the table says so.

**A behavioural change with a real cost**: a root package can be hundreds of subpackages
and as many round trips. Silent truncation is not an option — it is the masking problem
applied to data — so the
traversal is bounded and **says so in the answer**: when a bound stops it, the payload
carries what stopped it and where. Stage 1 fixes the bound for all three tools; it is a
number, not a principle, and belongs with the inventory that shows how large real
packages are.

**Resuming after the bound: by name, not by cursor.** When the traversal stops, the
payload lists the packages it did not expand. A caller continues by calling the same tool
on one of those names — an address it already holds, valid for as long as the package
exists. No cursor or resume token is introduced: a token would need server-side or
session state to mean anything, both of which outlive the request they belong to and
neither of which this server keeps. Naming what was skipped costs nothing and cannot go
stale.

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
- On success, `detail: 'raw'` returns the value of `answer.data`
  character-for-character, unmodified — and a faithful serialisation where the transport
  had already parsed the body into an object.
- On failure, `detail: 'raw'` puts the wire body in `raw_body` when it is a string, and
  omits the field otherwise. The troubleshooting level is not lost where it is needed,
  and nothing is serialised in its place.
- A projection that produces `undefined` is answered as a failure on the local path —
  `error: "projection_failed"`, with no `origin` — so a defect in our reading is never
  reported as a connection or a refusal. Nothing in the adapter turns an absent value
  into SUCCESS.
- Every field dropped from a tool's default output, and every input parameter removed,
  appears in the compatibility table with its justification. Neither is dropped without a
  row. A call passing a removed parameter is refused by name, never silently
  reinterpreted.
- A traversal stopped by its bound says so in the payload and carries what it did not
  expand — package names for the two package tools, frontier node ids for
  GetObjectsList — so every bounded answer can be continued. No answer is silently
  partial.
- A failure payload never contains the response object: no status, no headers, no
  cookies. The body appears only as `raw_body`, only at `detail: 'raw'`, and only when it
  is a string.
