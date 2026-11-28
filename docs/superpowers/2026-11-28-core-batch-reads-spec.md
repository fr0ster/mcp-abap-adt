# Spec: batch reads by envelope handle in the core and -ro binaries (#392)

This spec implements the goal, `docs/superpowers/2026-11-28-core-batch-reads-goal.md`. The goal's
invariants bind this spec. Where this spec and the goal differ, the goal wins.

Terms are the goal's:

- the **envelope** is the model's collection, named by its handle;
- an **ADT envelope** is one `multipart/mixed` request sent to SAP.

## 1. Where it is served

The envelope tools are served in the core set (`fullToolSet`: `mcp-abap-adt`, `-http`, `-sse`)
and the core read-only set (`fullReadOnlyToolSet`: `mcp-abap-adt-ro`, `-http-ro`, `-sse-ro`), on
every transport. They come in a new group, `EnvelopeHandlersGroup`
(`src/lib/handlers/groups/EnvelopeHandlersGroup.ts`), added to both sets' `groups` in
`src/lib/toolSet.ts`.

The compact sets get neither the group nor the `envelope_handle` argument.

## 2. The tools

The names follow the core set's noun-then-verb style (`SessionOpen`, `DebugBatchBegin`). Every
answer is compact JSON (`JSON.stringify`, no spacing) in one text content. Over Streamable HTTP
every tool also takes `state_handle`, which the host declares on every tool
(`stateHandleArgument.ts`); nothing here changes that.

### 2.1 Schemas, answers and descriptions

**`ReadEnvelopeCreate`** takes no arguments.

- Answer: `{"envelope_handle":"…"}`, plus `"state_handle":"…"` where the instance has one, as
  `HandlerBatch` `begin` answers it.
- Description: "Creates an envelope that collects read calls to send together. Answers its
  envelope_handle; a read called with that handle is recorded into the envelope under the next
  number, and every answer comes back when the envelope is executed."

**`ReadEnvelopeExecute`** takes `envelope_handle`, a required string of at least one character.

- Answer: the list of answers (§6.4).
- Description: "Sends every read recorded into the envelope and answers each one under its
  number, in recording order. Ends the envelope: its envelope_handle is invalid afterwards."

**`ReadEnvelopeDiscard`** takes `envelope_handle`, a required string of at least one character.

- Answer: `{"envelope_handle":"…","discarded":<recorded calls>}`.
- Description: "Ends the envelope without sending anything; answers how many recorded calls it
  held."

**`ReadEnvelopeList`** takes no arguments.

- Answer: `[{"envelope_handle":"…","recorded":<calls>}, …]` — the session's open envelopes, in
  creation order, or `[]` when there are none.
- Description: "Lists this session's open envelopes, each with its envelope_handle and how many
  calls it has recorded."

The parameter description of `envelope_handle` on execute and discard: "The handle
ReadEnvelopeCreate answered."

### 2.2 How the four tools behave

- Create, discard and list send nothing to SAP. Execute sends the envelope.
- None of the four is recorded, and none carries an envelope sentence.
- Each runs at once beside an open compact or debugger batch: `runsBesideBatch`
  (`batchTools.ts`) lists the four.
- The dispatch knows them by name (`ENVELOPE_TOOLS`, `batchTools.ts`). Their `envelope_handle`
  is their own argument and never routes them to recording (§5.2).

### 2.3 Refusals per tool

Every refusal is a `ServerRefusal`, and the dispatch answers it as it answers every server
refusal (`answerFailure`): `isError: true`, with the answer's `error` the code and its message
the code's words.

A schema refusal — `envelope_handle` missing, empty, `null` or not a string on execute or
discard — is the MCP SDK's input-validation answer (`isError: true`, "Input validation error:
Invalid arguments for tool <tool>: …"). It is sent before any handler runs.

| Refusal | Create | Execute | Discard | List | A read with `envelope_handle` |
|---|---|---|---|---|---|
| `envelopes_unavailable` | yes | yes | yes | yes | yes |
| `envelope_limit` | yes | — | — | — | — |
| `envelope_unavailable` | — | yes | yes | — | yes |
| `envelope_not_recordable` | — | — | — | — | yes |
| `batch_no_background` | — | — | — | — | yes |
| access refusals | — | — | — | — | yes |
| `envelope_node_structure` | — | — | — | — | yes (§5.4) |
| `batch_other_kind` | — | — | — | — | yes |
| the connection's failure (§6.1) | — | yes | — | — | yes |

### 2.4 The handle

The handle is 32 upper-case hex characters from `randomBytes(16)`, so 128 bits. It is generated
as the state handle is (`InstanceState.ts`, `newHandle`) and drawn again if it collides with an
open envelope's handle. It is never derived from `state_handle`, and `state_handle` is never
derived from it.

## 3. The owner

### 3.1 `InstanceEnvelopes`

A new class, `src/lib/batch/InstanceEnvelopes.ts`, owns one instance's envelopes. It implements
`StatePart`:

- `holdsState()` is true while any envelope is open.
- `pending()` is false and `failures()` is empty.
- `dispose()` drops every envelope: it aborts each one's signal, and with it every recorded
  call's own signal, so every recorded handler settles, nothing is sent, and the map empties.
- `observe()` behaves as in `InstanceBatch`.

It holds a `Map<handle, Envelope>`. Each envelope has:

- its handle and its session key (§4);
- its creation order;
- its own `AbortController`, the parent of one `AbortController` per recorded call. A call's
  signal aborts when the envelope's does, or alone (§6.3). The call's recorder races its waits
  against the call's own signal, not the envelope's;
- its counter (the last number taken);
- its recorded calls and their pending parts (§5.3);
- whether it already holds a node-structure request (§5.4).

The constructor takes `{ keepRawParts: boolean; openEnvelopes?: number | undefined }`. The class
is separate from `InstanceBatch`, so an envelope and a compact or debugger batch hold separate
state and can be open together.

Its operations:

- **`create(key)`.** Refused `envelope_limit` when the bound is set and the owner already
  holds that many open envelopes, counted over every key. Otherwise it answers a new envelope
  with its handle.
- **`find(handle, key)`.** The open envelope, or `envelope_unavailable` when the handle is
  unknown or the envelope's key does not match — the same refusal and the same words.
- **`claim(handle, key)`.** As `find`, and the envelope leaves the map in the same
  synchronous step, before any `await`. From then on every call naming the handle gets
  `envelope_unavailable`.
- **`discard(handle, key)`.** As `claim`, then it aborts the envelope's signal and sends
  nothing.
- **`list(key)`.** The open envelopes whose key matches, in creation order.

An instance's tool calls run one at a time on its main flow ("one session, one flow"), and every
handle-bearing call holds that flow. So two calls naming one handle never interleave, and the
synchronous claim makes "executed once" hold whatever order they come in.

### 3.2 Who creates it

The host creates the owner, one per instance and never shared, beside `new InstanceBatch(…)`:

- `server-runtime/src/http/StreamableHttpServer.ts`, where it builds an instance;
- `server-runtime/src/sse/SseServer.ts`, the same;
- `server-runtime/src/stdio/launcher.ts`, the same;
- an embedder, through a new `envelopes` option of `EmbeddableMcpServer`, documented as the
  `batch` option is.

`BaseMcpServer` takes a new option, `envelopes?: InstanceEnvelopes | undefined`, and attaches it
to the instance state (`this.state.attach`), as it does the batch owner. Without an owner, the
four tools and every read given an `envelope_handle` answer `envelopes_unavailable`.

### 3.3 The consumer's limit

The setting bounds the open envelopes of one owner:

- CLI `--batch-open-envelopes=<n>`;
- environment `MCP_BATCH_OPEN_ENVELOPES`;
- YAML `batch.openEnvelopes`;
- an embedder's `openEnvelopes`.

The value is a positive whole number. Anything else stops the start with
`openEnvelopesRefusal(name)`, a new function beside `partsPerEnvelopeRefusal`
(`authParameters.ts`) whose words are "Invalid <name>: must be a positive whole number of
envelopes". `<name>` is the setting as given: `--batch-open-envelopes`,
`MCP_BATCH_OPEN_ENVELOPES`, `batch.openEnvelopes` or `openEnvelopes`.

Without a value there is no bound; the server has no default. The setting is read where
`partsPerEnvelope` and `keepRawParts` are (`IServerConfig.ts`, `authParameters.ts`, the three
launchers) and handed to each `InstanceEnvelopes`.

### 3.4 Lifetime

An envelope is part of the instance's held state. These end it:

- `ReadEnvelopeExecute`, from its claim (§6.1);
- `ReadEnvelopeDiscard`;
- the instance's close: the client closing stdin, the SSE connection ending, the pool letting
  the instance go, `SessionClose`, the process's shutdown;
- the held state's idle bound, over Streamable HTTP and SSE.

Over Streamable HTTP an open envelope keeps the instance in the pool, as an open compact batch
does, and the model sends `state_handle` with every call of the envelope. The envelope has no
clock of its own.

**The backend.** An envelope holds no SAP session: recording sends nothing, and the reads go
stateless. So the backend ends an envelope only at its execution. Its answer to the ADT envelope
(a refusal, a credential refusal, a transport error) is the answer of the numbers it carried
(§6.3), and the execution has already ended the envelope.

A SAP session lost or replaced between recording and execution changes nothing in the envelope,
as long as the session key of §4 is unchanged. That covers `sessionLoss.ts`, and a new SAP
connection under the same connection context, a destination's own token refresh on stdio
included. Execute sends with the connection and the credentials in force at its call.

Over Streamable HTTP, a request whose credential headers differ (a new token, say) is another
session (§4), and the envelope is not available to it.

`SessionHolding` (`longSession.ts`) gains `envelopes: <open envelopes>`, so `SessionClose` names
what it ends.

## 4. The caller: the session that created the envelope

An envelope handle is valid only in the long session that created it. The caller is that
session with its SAP credentials. Nothing is read from SAP to establish it: the username is
never resolved, and `ReadEnvelopeCreate` sends nothing and acquires no connection.

### 4.1 The session key

`ReadEnvelopeCreate` records a session key on the envelope. It has three parts.

- **The instance.** The owner is the instance's own (§3.2), so a handle is only ever looked up
  in the instance that created it.
- **The destination and the connection.** The instance's `connectionContext`, compared by object
  identity: the destination and credential source the instance was given (`built`), or the
  host's connection itself (`injected`). An instance never changes it after
  `setConnectionContext`, so on stdio and SSE every call of the instance carries the same one.

  A SAP session spent and replaced under the same context (`getConnection`, `retire`) is still
  the same connection context. The envelope stays valid (§3.4).
- **Over Streamable HTTP, the request's `state_handle` and its SAP credentials.** The pooled
  instance's held connection takes each request's credential (`headerSource`,
  `CurrentCredential`). So the key also holds:
  - the instance state's handle the create call ran under (`context.state.handle`);
  - a SHA-256 digest of the request's destination and credential headers, as
    `credentialFromHeaders` reads them: `x-sap-url`, `x-sap-client`, `x-sap-jwt-token`,
    `x-sap-login` and `x-sap-password`, each name with its value, absent ones marked absent.

  The digest stays in memory only. It is never logged, never answered and never persisted.

### 4.2 The check

Every other envelope tool, and every read given an `envelope_handle`, builds the same key for
its own call. It passes the key to `find`, `claim`, `discard` or `list`. The call is the caller
when:

- its connection context is the same object;
- over Streamable HTTP, it ran under the same `state_handle`;
- over Streamable HTTP, its digest matches the recorded one in constant time
  (`crypto.timingSafeEqual`).

Any mismatch is `envelope_unavailable`, the same answer and words as an unknown handle.

`list` shows only the envelopes whose key matches. On stdio and SSE that is every open envelope
of the instance. Over Streamable HTTP a request with other credentials sees none of them.

Building the key reads only the instance and the request's headers. It sends nothing and calls
neither `getConnection` nor any system-parameter read. So no refusal comes from the caller
check except `envelope_unavailable`.

## 5. Recording

### 5.1 The argument and the sentence

Every admitted core read (§8) gains an optional `envelope_handle`: a string of at least one
character. It is added at registration, as `state_handle` is (`withStateHandle`), so no handler
file carries it. Its parameter description: "The handle of an open envelope: the call is recorded
into it and answered at its execution."

The tool's description gains one sentence:

- for a tool admitted for every call, `ENVELOPE_SENTENCE`: "With envelope_handle, the call is
  recorded into that envelope under the next number, and its answer comes back when the envelope
  is executed.";
- for a tool admitted only for some arguments, the same sentence after "When <arguments>,", the
  arguments rendered from its entries by `entryWords` (`sentence.ts`).

Core tools that are not admitted get no sentence. The core sets carry no batch sentence today,
and that stays so.

### 5.2 The interception point

The MCP SDK parses a call's arguments against the registered schema before the handler runs
(`McpServer.validateToolInput`, which is private), and a plain `z.object` drops a key it does not
declare. So the key has to reach the dispatch through the schema. The registration loop in
`BaseMcpServer` (where `withStateHandle` is applied) registers every core tool's schema in one of
three forms:

- **An admitted read:** the same shape as a loose object (`z.looseObject`), extended with the
  declared `envelope_handle` (§5.1). Undeclared keys — `background` above all, which a read like
  `GetClass` does not declare — reach `runCall` as the call gave them.
- **One of the four envelope tools:** its own schema, as declared.
- **Every other core tool:** the same shape as a loose object (`z.looseObject`). An undeclared key
  then reaches `runCall`. `runCall` refuses the call with `envelope_not_recordable` when the raw
  arguments hold `envelope_handle` with any value, `null` and `''` included.

For an admitted read and for every other core tool alike, `runCall` reads what it needs from the
undeclared keys — `envelope_handle`, and on the recording path `background` (check 5 below) —
then drops every undeclared key before any handler runs, the ordinary handler included. So a
handler gets the arguments it gets today, and a call without `envelope_handle` behaves as today.

The listed JSON Schema of the loose tools changes only in `additionalProperties`. A test pins
that, and the listing files are regenerated.

What the call carries decides the path:

- **No `envelope_handle`:** the call runs as it does today.
- **An admitted read with `envelope_handle` empty, `null` or not a string:** the schema refuses
  it (§2.3).
- **An admitted read with a well-formed handle:** the recording path below.

The recording path runs inside `runCall`, before the open-batch check, so a read with a handle
reaches its envelope even while a compact or debugger batch is open. A call of one of the four
envelope tools never takes it. Its checks run in this order; each refusal takes no number and
sends nothing.

Checks 1 and 2 run before the dispatch acquires a connection, so a call that names someone
else's envelope or an unknown one sends nothing, not even a logon:

1. The owner is present, else `envelopes_unavailable`.
2. The envelope is found for this call's session key (`find`, §4), else `envelope_unavailable`.

The dispatch then acquires the connection as for any call, and the remaining checks run:

3. The tool is admitted for the core set with these arguments over this connection kind
   (`eligible(tool, args, connection, 'core')`), else `envelope_not_recordable`.
4. The raw arguments do not state `background: true`, else `batch_no_background`. The check
   reads the key kept by the loose schema, so a read that does not declare `background` is
   refused just the same.
5. The call holds the flow and is no debugger tool, else `envelope_not_recordable`, as
   compact's `recordCall` checks.

   A listed long read (`tools/long-handlers.json`) never runs in the background on this path,
   whatever the host's background strategy. Without `background` it is recorded, as a long read
   is in compact batch mode; with `background: true` it was already refused by check 4.
6. The access restrictions admit it, else their own refusal, checked at the same point as in
   compact batch mode. A package-tree read the check makes goes out at once on the instance's
   connection and is not recorded.

The handle is then stripped from the arguments the handler receives.

### 5.3 The recorder

The handler runs at once on a recorder over the envelope, in the call's scopes and under the
envelope's signal. The call waits until the handler has recorded everything it sends
(`untilSent`), or has settled.

- **It recorded:** the call answers `{"envelope_handle":"…","number":<n>}`. The number is taken
  at its first request, and every later request of the call shares it. The handler stays
  waiting for its parts.
- **It settled without recording** (for example, it refused its arguments): the call answers its
  own answer and takes no number.

`createRecorder` (`recorder.ts`) is generalised over a small owner interface: the next number,
the held session kind, the signal, `keepRawParts`, and whether its batch is still open. Both
`InstanceBatch` and an envelope implement it, and compact's behaviour stays unchanged.

An envelope's recorder does not record into an `AdtBatchConnection`. It keeps each request as a
pending part of the envelope — the request options, the call's number, and an answer to settle —
as `runPhaseOutcome` records an item (`phases.ts`, `record`). That is what lets execution split
the parts into several ADT envelopes.

Every recorded request is stateless. A request of another session kind (`requestKind`) is
refused `batch_other_kind`, as compact refuses it.

### 5.4 One node structure per envelope

A node-structure request is a `POST` to `/sap/bc/adt/repository/nodestructure`. The recorder
refuses one with `envelope_node_structure` when the envelope already holds one, whichever tool
sent it.

The refusal follows compact's `batch_other_kind` rule:

- The refused request and every later request of the same call are not recorded.
- If the call recorded an earlier part, that part stays recorded under the call's number. It is
  sent at execution, and its number stays taken. The call's answer — now, and under its number at
  execution — is the refusal. Its words then name the number and say that the earlier part is
  sent at execution, as `batchOtherKindWords` words it.
- If the call had recorded nothing, it takes no number, and the refusal is its answer.

## 6. Execution

### 6.1 The order

`ReadEnvelopeExecute` holds the flow, and the dispatch takes the instance's connection for the
whole call, as for `HandlerBatch` `end`. The steps run in this order:

1. **The owner and the session key** (§4), before anything else: `envelopes_unavailable` or
   `envelope_unavailable`, through `find`. The dispatch runs this check for the four envelope
   tools ahead of connection acquisition (`ENVELOPE_TOOLS`), so a refused execute sends nothing,
   not even a logon. Create, discard and list need no connection at all and never acquire one.
2. **The connection.** Only then does the dispatch acquire it (`getConnection`). If that fails,
   the call answers that failure as any call does, before the claim. The envelope stays open,
   with its record unchanged, and a later execute can still send it.
3. **The claim** (`claim`, which repeats the session check; the main flow guarantees that
   nothing between steps 1 and 3 could have ended the envelope). Before it, nothing of the envelope has changed. After it, the
   envelope is ended, and every outcome below is answered under the numbers.
4. **An empty envelope** answers `[]`. Nothing is planned or sent.
5. **The plan.** The pending parts are planned by the consumer's `partsPerEnvelope`:
   - absent, one ADT envelope;
   - given, `packByParts` over the calls in recording order, each call's parts kept together,
     checked by `checkedEnvelopes`.

   If a call needs more parts than the bound allows, nothing is sent and every number answers the
   oversized words (`oversizedReadWords`).
6. **The sending** (§6.2).
7. **The answers** (§6.3, §6.4).

### 6.2 The shared sender

The part of `runPhaseOutcome` that sends planned envelopes is extracted into one function,
`sendPlanned` (`phases.ts`). The phases and the envelope both call it. Its contract:

- **It takes** the call's context and connection, the pending parts, the plan (runs of item
  indexes), `correction: boolean`, and `endsOn(outcome) => boolean | Promise<boolean>`.
- **For each run in order** it builds a fresh `AdtBatchConnection` (`endpoint: 'communication'`)
  under an `EnvelopeWatch`, records the run's parts on it, executes it, and settles each part
  (resolved with its response, or rejected with its error). Only with `correction` does it then
  send the run's `406`/`415` parts once more in a correction envelope (`correctPhaseParts`).
- **It classifies each run's outcome from the wire alone**, as `split` in `execute.ts` does:
  - `answered`;
  - `failed` with the envelope's error — SAP's answer to the envelope, a transport error, a
    credential refusal, `batch_unsplit`, `batch_parts_mismatch`, or the batch-availability
    absence;
  - `unauthorizedPart`, when some part SAP answered `401`.
- **What ends the sending.**
  - The sender itself ends it, whatever the caller says, on the conditions that end every phase
    today, all of which `runPhaseOutcome` checks ahead of `failuresEnd` (`phases.ts`, the loop
    around line 680):
    - an oversized correction envelope (`sent.oversized`);
    - the batch-availability absence verdict (`sent.absent`);
    - a refused second envelope request (`sent.refused`, `MORE_ENVELOPES_WORDS`). Nothing of
      that run is kept, and every item of it fails with those words;
    - a credential refusal on the wire;
    - when the caller hands the run's item settlements (the phases do), a settlement whose error
      `failureOf` recognises (`refusal`, `phases.ts:689`).
  - Every other outcome — a `failed` run, an `unauthorizedPart` run — ends the sending only when
    the caller's `endsOn(outcome)` answers `true`. After each run the sender calls `endsOn` and
    honours its answer.
  - Once the sending ends, the parts of every later run settle with the ending run's error and
    are marked unsent.
- **It answers** the outcome of every run, sent or not.

**What each caller passes:**

- **The phases** pass `correction: true` and an `endsOn` that is exactly today's policy:
  - it awaits the run's items' settlements;
  - it answers `true` for a failed envelope, a failed correction envelope or a `401` part only
    when `rules.failuresEnd` is not `false`;
  - it answers `true` when `rules.after` does.

  A phase with `failuresEnd: false` (`packageWalk.ts`) therefore keeps sending after a failed
  envelope, as it does today. `phases.test.ts`, the package-walk suites and every existing phase
  suite must pass unchanged, and §9.6 adds a case for `failuresEnd: false` through `sendPlanned`.
- **The envelope** passes `correction: false` and an `endsOn` that answers `true` for every
  `failed` and `unauthorizedPart` run, and awaits no handler. Its sending always stops at the
  first failure.

### 6.3 Answers by run outcome

When the sending ends, each number is answered by the outcome of the run it belongs to.

The answers are built in two steps, so that no failure cancels an answer that is owed:

1. **The answered runs first.** The calls of every answered run (an `unauthorizedPart` run
   included) resume and settle before anything is aborted.
2. **Then the rest.** Only after that does the execute abort the signals of the calls of the
   failed and unsent runs, call by call through each call's own `AbortController`, and never the
   envelope's shared signal.

So a failure in the second of three runs leaves the first run's handlers untouched.

- **An answered run** (an `unauthorizedPart` run included): the run's calls' handlers resume
  with their parts, all in parallel, and each builds its number's answer — its projection of a
  part's success, or of a part's non-2xx, as the tool answers it outside an envelope. A handler
  that would send another request after its parts is refused `batch_ended`, and that is its
  answer.
- **A failed run:** its numbers are answered by the execute itself, not by their handlers. Each
  one is the envelope's failure answer, as `failureAnswer` (`execute.ts`) builds it: SAP's outer
  status and body with `step: "execute"`, or the failure reader's answer for a credential refusal
  or a server refusal. Each of those calls' handlers is let go through its own signal, after the
  answered runs have settled. So no handler can catch, translate or drop that failure, and no
  answered run's handler is touched.
- **An unsent run:** its numbers are answered by the same failure answer as the run that ended
  the sending. For an `unauthorizedPart` run, that is the `401` part's credential refusal, read
  by the failure reader.

A number holding a node-structure refusal (§5.4) answers that refusal, whatever its run's
outcome.

A destination with no communication batch (the outer `404` verdict of `batchAvailability`) is a
failed run like any other. There is no sequential fallback, because that would resend the reads.

### 6.4 The answer

Execute answers the list, in recording order:

```json
[{"number":1,"content":[…]},{"number":2,"content":[…],"isError":true}]
```

Each entry is a `BatchAnswer` (`InstanceBatch.ts`):

- `number`;
- the answer's `content`;
- `isError`, when it is an error;
- `raw` with SAP's raw parts, when `batch.keepRawParts` is on and the number's parts came.

Execute itself answers `isError: false` whenever it got past the claim. Its own error answers
come before the claim (§6.1).

## 7. Refusals

`ServerRefusal` (`src/lib/auth/serverRefusal.ts`) gains these codes:

| Code | Words |
|---|---|
| `envelopes_unavailable` | "this server instance keeps no envelopes" |
| `envelope_unavailable` | "envelope is not available" |
| `envelope_limit` | `envelopeLimitWords(n)`: "<n> envelopes are open, the bound set by --batch-open-envelopes / openEnvelopes; execute or discard one first" |
| `envelope_not_recordable` | `envelopeNotRecordableWords(tool)`: "<tool> is not recorded into an envelope with these arguments; call it without envelope_handle" |
| `envelope_node_structure` | `envelopeNodeStructureWords(number?)`: "this envelope already holds a node structure read; record this one into another envelope", followed, when the call recorded an earlier part, by "(the part recorded before it is sent at execution, under number <n>)" |

These existing codes are reused with their words: `batch_no_background`, `batch_other_kind`,
`batch_ended`, `batch_parts_mismatch` and `batch_unsplit`.

## 8. `tools/batch-handlers.json`

### 8.1 Set-aware entries

`BatchEntry.set` becomes `'compact' | 'core'`, and the loader accepts both.
`eligible(tool, args, connection, set)` reads only the entries of the set it is given: compact
batch mode passes `'compact'`, the envelope passes `'core'`.

`batchSentence` stays compact's and reads compact entries only. A new `envelopeSentence` reads
the core entries. The 48 compact entries are unchanged.

`ABSENT_READS_AS` gains `GetFunctionModule: { part: 'source' }`, the handler's own default
(`readPartOf`). The table page in `BATCH_MODE.md` is rendered per set, and its test checks both
tables.

### 8.2 The core entries

There are 45 rows: 19 in group A and 26 in group B. Every row here is justified by the handler's code, cited, and is proved again by its own
`oneRequestPerEntry.test.ts` case. The case runs the call held open, answered, and answered
`404`, and expects exactly the requests listed. Every row has `"set": "core"` and no
`connection`, since every request is a stateless `GET` over HTTP and RFC alike.

Each row's `handler` is `src/handlers/<path>#handle<Tool>`, the file named.

| Tool | Handler file | `when` | Sends | Ground in the code | Test arguments → expected requests |
|---|---|---|---|---|---|
| `GetClass` | `class/high/handleGetClass.ts` | none | one request: `GET` the class source, or with `part: metadata` its metadata document, at the version asked | "One request per call: the part asked for, and only it" (`part` metadata → `readClassMetadata`; else `obj.read`) | `{class_name}` → 1 source `GET`; `{class_name, part: metadata}` → 1 metadata `GET`; `{…, version: inactive}` → 1 `GET` at that version |
| `GetInterface` | `interface/high/handleGetInterface.ts` | none | as `GetClass`, for the interface | the same comment and branches | as `GetClass` |
| `GetProgram` | `program/high/handleGetProgram.ts` | none | as `GetClass`, for the program | the same | as `GetClass` |
| `GetInclude` | `include/readonly/handleGetInclude.ts` | none | as `GetClass`, for the include | "The one request a call sends: the source or the metadata document" | as `GetClass` |
| `GetFunctionInclude` | `function_include/readonly/handleGetFunctionInclude.ts` | none | as `GetClass`, for the function group's include | "One request per call" | as `GetClass` |
| `GetTable` | `table/high/handleGetTable.ts` | none | as `GetClass`, for the table | the same | as `GetClass` |
| `GetStructure` | `structure/high/handleGetStructure.ts` | none | as `GetClass`, for the structure | the same | as `GetClass` |
| `GetDdl` | `ddl/high/handleGetDdl.ts` | none | as `GetClass`, for the DDL source | the same | as `GetClass` |
| `GetServiceDefinition` | `service_definition/high/handleGetServiceDefinition.ts` | none | as `GetClass`, for the service definition | the same | as `GetClass` |
| `GetServiceBinding` | `service_binding/high/handleGetServiceBinding.ts` | none | one request: `GET` the active binding, or with `part: metadata` its metadata document | the same; no `version` argument, always active | `{…}` and `{…, part: metadata}` → 1 `GET` each |
| `GetBehaviorDefinition` | `behavior_definition/high/handleGetBehaviorDefinition.ts` | none | as `GetClass`, for the behavior definition | the same | as `GetClass` |
| `GetBehaviorImplementation` | `behavior_implementation/high/handleGetBehaviorImplementation.ts` | none | as `GetClass`, for the behavior pool | the same (`obj.readMetadata` / `obj.read`) | as `GetClass` |
| `GetMetadataExtension` | `metadata_extension/high/handleGetMetadataExtension.ts` | none | as `GetClass`, for the metadata extension | the same | as `GetClass` |
| `GetFunctionModule` | `function_module/high/handleGetFunctionModule.ts` | `part` equals `metadata` | one request: `GET` the module's metadata document at the group given | the metadata branch is one read (`readFunctionModuleMetadata`), checked against the group locally (`inGroupStated`) | `{function_module_name, function_group_name, part: metadata}` → 1 `GET` |
| `GetDomain` | `domain/high/handleGetDomain.ts` | none | one request: `GET` the domain's metadata document at the version asked | "One call, at the version asked" (`readDomainMetadata`) | `{domain_name}` → 1 `GET` |
| `GetDataElement` | `data_element/high/handleGetDataElement.ts` | none | as `GetDomain`, for the data element | "One call, at the version asked" | as `GetDomain` |
| `GetPackage` | `package/high/handleGetPackage.ts` | none | as `GetDomain`, for the package | "One call" (`readPackageMetadata`) | as `GetDomain` |
| `GetFunctionGroup` | `function_group/high/handleGetFunctionGroup.ts` | none | as `GetDomain`, for the function group | "One call" (`readFunctionGroupMetadata`) | as `GetDomain` |
| `GetTableType` | `table_type/high/handleGetTableType.ts` | none | as `GetDomain`, for the table type | its one `readTableTypeMetadata` | as `GetDomain` |

A source range (`SOURCE_RANGE_SHAPE`) is cut from the one answer locally (`answerSourceRead`),
so it adds no request. Each case checks one range call too.

**Group B: the other single-call reads.** Each row is traced from its handler through the
adt-clients member it calls; each member is one endpoint. Every row has no `when` unless one is
given.

| Tool | Handler file | Sends | Ground in the code |
|---|---|---|---|
| `GetObjectStructure` | `system/readonly/handleGetObjectStructure.ts` | `GET /sap/bc/adt/repository/objectstructure` | one `getUtils(…).getObjectStructure` |
| `GetObjectVersions` | `common/readonly/handleGetObjectVersions.ts` | `GET` the object's version feed | one `resolved.getVersions` (`readVersions`, `resolveVersionedObject.ts:192`) |
| `GetObjectVersionSource` | `common/readonly/handleGetObjectVersionSource.ts` | `GET` the `content_uri` given | one `resolved.getVersionSource` (`readVersionSource`, `resolveVersionedObject.ts:203`) |
| `GetObjectVersionDiff` | `common/readonly/handleGetObjectVersionDiff.ts` | two independent `GET`s, the two `content_uri`s, under one number | `both` (`sequence.ts:193`) sends both before reading either |
| `GetObjectDraft` | `common/readonly/handleGetObjectDraft.ts` | for each part of the object, its three version reads, all at once, under one number | `readDraftEtags` (`readDraftEtags.ts:238`), `Promise.all` over the parts and versions; the compact draft read is the same set |
| `GetObjectOutline` | `system/readonly/handleGetObjectOutline.ts` | `GET` the object's outline at the version asked | one `getObjectOutline` |
| `GetInactiveObjects` | `system/readonly/handleGetInactiveObjects.ts` | `GET /sap/bc/adt/activation/inactiveobjects` | one `getInactiveObjects` |
| `GetAdtTypes` | `system/readonly/handleGetAllTypes.ts` | `GET` the object type list | one `getAllTypes` |
| `GetTransaction` | `system/readonly/handleGetTransaction.ts` | `GET` the transaction's object properties | one `getObjectProperties` |
| `GetMessageClass` | `message_class/high/handleGetMessageClass.ts` | `GET` the message class's metadata document | one `readMessageClassMetadata` |
| `GetMessageClassMessage` | `message_class/high/handleGetMessageClassMessage.ts` | `GET` the message class document, the message read from it locally | one `getMessageClassMessage(…).read` |
| `GetTableSettings` | `table/readonly/handleGetTableSettings.ts` | `GET` the table's technical settings document | one `readMetadata`, on either variant |
| `GetMainPrograms` | `include/readonly/handleGetMainPrograms.ts` | `GET` the include's main programs | one `readMainPrograms` |
| `SearchObject` | `search/readonly/handleSearchObject.ts` | `GET /sap/bc/adt/repository/informationsystem/search?operation=quickSearch…` | one `search` (`searchOn`, either variant) |
| `GetObjectsByType` | `search/readonly/handleGetObjectsByType.ts` | `POST /sap/bc/adt/repository/nodestructure` for the one node; at most one per envelope (§5.4) | one `fetchNodeStructure` |
| `GetATCFindings` | `atc/high/handleGetATCFindings.ts` | `GET /sap/bc/adt/atc/worklists/{id}` | one `getFindings` |
| `GetATCResult` | `atc/high/handleGetATCResult.ts` | `GET /sap/bc/adt/atc/results/{displayId}` | one `getResult` |
| `ListATCResults` | `atc/high/handleListATCResults.ts` | `GET /sap/bc/adt/atc/results?createdBy=…` | one `listResults`, `created_by` from the arguments |
| `RuntimeGetDumpById` | `system/readonly/handleRuntimeGetDumpById.ts` | `GET /sap/bc/adt/runtime/dump/{id}` in the view asked | one `getById` |
| `RuntimeListSystemMessages` | `system/readonly/handleRuntimeListSystemMessages.ts` | `GET /sap/bc/adt/runtime/systemmessages` | one `systemMessages` |
| `RuntimeGetGatewayErrorLog` | `system/readonly/handleRuntimeGetGatewayErrorLog.ts` | `GET /sap/bc/adt/gw/errorlog`, or one entry's detail | one `gatewayErrors`, or one `gatewayErrorDetail` |
| `RuntimeListProfilerTraceFiles` | `system/readonly/handleRuntimeListProfilerTraceFiles.ts` | `GET /sap/bc/adt/runtime/traces/abaptraces` | one `profiler.list` |
| `RuntimeGetProfilerTraceData` | `system/readonly/handleRuntimeGetProfilerTraceData.ts` | `GET` the trace's view asked (hit list, statements or DB accesses) | one `profiler.read` per view branch |
| `ListServiceBindingTypes` | `service_binding/high/handleListServiceBindingTypes.ts` | `GET /sap/bc/adt/businessservices/bindings/bindingtypes` | one `getServiceBindingTypes`; served by the core set only |
| `GetSqlQuery` | `system/readonly/handleGetSqlQuery.ts` | `POST /sap/bc/adt/datapreview/freestyle` with the query | one `getSqlQuery` |
| `GetTableContents` | `table/readonly/handleGetTableContents.ts` | `POST /sap/bc/adt/datapreview/freestyle` with `SELECT * FROM` the table | one `getSqlQuery` |

**The data tools.** `GetSqlQuery` and `GetTableContents` are registered only with
`--enable-data-tools` (`DataHandlersGroup`). Their rows admit them only where they are served:
without the setting the tools do not exist, and a call naming them is the SDK's unknown-tool
answer, as today. A test proves both: with data tools on, each is recorded; with them off,
neither is listed.

**Several of these are listed long reads:** `SearchObject`, `GetSqlQuery`, `GetTableContents`,
`GetATCFindings`, `GetATCResult`, `ListATCResults` and `RuntimeGetProfilerTraceData`. With a
handle they are recorded and never run in the background (§5.2, check 5).

**Excluded variants, and why:**

- `GetFunctionModule` with `part` `source` (or absent): `inCheckedGroupOn` reads the metadata
  first and sends the source read only when the group holds the module. The second request
  depends on the first.

### 8.3 Not admitted in this task

- **The transport reads:** `GetTransport`, `ListTransports`, `ReadTransportActionLog`,
  `ReadTransportObjects` (goal, out of scope).
- **The reads that send many requests inside one call:** `GetObjectsList`,
  `GetPackageContents`, `GetObjectInfo`, `SearchSource` (goal, out of scope), and
  `GetPackageTree`, `DescribeByList`, `GetIncludesList`, `GetStructuresList`, `GetWhereUsed`,
  `RuntimeListFeeds` (each runs its own phases, `runPhase`).
- **`GetEnhancements` and `GetTypeInfo`:** a request waits for another's answer (a metadata read
  first; a `404` fallback).
- **`GetTextElements`:** it reads the parts one after another and stops at the first failure
  (`text_elements/readonly/handleGetTextElements.ts:182`). Each part's read waits for the one
  before it.
- **`ListFunctionModules` and `ListFunctionGroupIncludes`:** the node-structure read follows the
  metadata read in a `sequence`
  (`function_include/readonly/handleListFunctionModules.ts:102`,
  `handleListFunctionGroupIncludes.ts:97`).
- **`GetUnitTestResult`:** it reads the run's status first and the result only after it
  (`readGivenRun`, `unit_test/high/handleGetUnitTestResult.ts:84`).
- **Every tool that changes the system or runs code**, `RunATC` included.

A pinning test asserts:

- no tool of this section has a core entry;
- no core entry's `sends` names `/cts/`;
- `GetObjectsByType` is the only core entry whose `sends` names `nodestructure`.

## 9. Tests

All of these are unit tests on `node:test`, except the integration case in §9.9. Handle-bearing
behaviour is tested through real MCP dispatch, an SDK `Client` over `InMemoryTransport` as
`surface.test.ts` does, not by calling a handler directly.

### 9.1 Handle and owner

New file: `src/__tests__/unit/batch/envelopes.test.ts`.

- **The handle.** It is 32 hex characters. Across 10 000 creates no two collide, and none equals
  the `state_handle`.
- **The limit counts the owner.**
  - With a bound of 2, over Streamable HTTP, two requests with different credentials each
    create one envelope on the same pooled instance, and a third create by either is refused
    `envelope_limit`; nothing is evicted.
  - Without the setting, 1 000 envelopes open.
- **The owner.**
  - Two instances get distinct owners, and one instance's handle is not available on the other.
  - An instance without an owner answers `envelopes_unavailable` on all four tools and on a read
    with a handle.
- **Independence.**
  - Two envelopes keep separate numbering.
  - Executing or discarding one leaves the other's record and numbers intact.
  - An envelope opens, records and executes beside an open debugger batch. The debugger batch's
    record and answers are unchanged, and so are compact's in a compact harness.
- **Lifetime.**
  - The fake clock (`mock.timers`) advanced by days ends nothing on stdio.
  - Over Streamable HTTP the idle bound ends the envelope with the instance.
  - Over SSE, the idle bound and a disconnect each end it.
  - `SessionClose` and the host's shutdown end it.
  - `dispose()` sends nothing, settles every recorded handler, and empties the list.
- **The backend.** A SAP session lost, and a destination's token refreshed on stdio, between
  recording and execution: the execute sends on the connection in force then, and the record is
  unchanged.

### 9.2 The session check, per handle-bearing operation

For each of record, execute, discard and list:

- an unknown handle and another session's handle get the same complete MCP response, byte for
  byte;
- the record is unchanged, nothing is recorded, and nothing is sent.

The other session differs in one way at a time, each its own case:

- another instance, on every transport;
- over Streamable HTTP, another `state_handle`, and no `state_handle`;
- over Streamable HTTP, the same `state_handle` with another `x-sap-password`, another
  `x-sap-login`, another `x-sap-jwt-token`, another `x-sap-url`, and another `x-sap-client`;
- an injected connection context replaced by another object.

A list by another session does not show the envelope.

**Within the same session the handle works:** a SAP session spent and replaced between create
and execute, on the same connection context, leaves the envelope valid.

**Create sends nothing.** On a cold instance — no connection built, no system parameters known —
`ReadEnvelopeCreate`, `ReadEnvelopeList` and `ReadEnvelopeDiscard` make no request and no logon.
The connection factory is never called, and neither the system-parameter read
(`requireSystem`, `callerUserOf`) nor `getConnection` runs.

**The digest.** It never appears in a log line, an answer or `SessionClose`'s answer.

### 9.3 Interception and recording

New file: `envelopeRecording.test.ts`.

- **With and without a handle.**
  - An admitted read with a handle is recorded and answers its number.
  - The same read without a handle sends as before, also while an envelope is open.
  - Creating an envelope records nothing else.
- **Refused before recording**, each sending nothing:
  - A non-admitted core tool given `envelope_handle` is refused `envelope_not_recordable`, for
    the values `"x"`, `""`, `null` and `42`.
  - An admitted read given `""`, `null` or `42` gets the schema refusal.
  - The four envelope tools are never routed to recording.
  - `background: true` is refused `batch_no_background` on a read that declares `background` and
    on one that does not (`GetClass`). Without a handle, an undeclared `background` is dropped
    before the handler, as today.
  - An access-restricted call is refused before it takes a number, and its package-tree read
    goes out at once.
- **The listed schemas.** Every non-admitted core tool's listed JSON Schema equals today's apart
  from `additionalProperties`, and the undeclared keys it receives are dropped before its
  handler, as today.
- **Node structures.**
  - A second node-structure request is refused `envelope_node_structure`, also when another tool
    sends it.
  - A call that records a part and then meets the refusal keeps its number. Its earlier part is
    sent at execution, and its answer under that number is the refusal.
- **Several requests.** A call with several independent requests shares one number.

### 9.4 Execution

New file: `envelopeExecute.test.ts`, at a counting connection.

- **The plan.**
  - One ADT envelope by default.
  - Under a bound, `packByParts` envelopes in recording order.
  - A single call needing more parts than the bound sends nothing, and every number answers the
    oversized words.
- **Failures.**
  - A part's `404` answers that number only.
  - A failed run of each kind answers every number it carried with the failure answer itself,
    even when the handler of that number would catch the error: SAP's refusal, a transport
    error, a credential refusal, a parts mismatch, unsplit, and the absence verdict.
  - With a bound, a failure in the second of three runs keeps the first run's answers and sends
    no third. The unsent numbers answer that failure. The first run's handlers are never
    aborted: their projections are built, including one whose handler awaits its part slowly.
  - A `401` part ends the sending in the same way.
- **What it does not do.**
  - No `406`/`415` correction is resent.
  - Execution while the instance's connection is stateful (a lock held) still sends the envelope
    stateless.
- **The answer.**
  - `keepRawParts` adds `raw`.
  - An empty envelope answers `[]` and sends nothing.
- **Before the claim.**
  - A connection acquisition that fails leaves the envelope open with its record, and a later
    execute sends it once.
  - An execute naming an unknown or foreign handle on a cold instance makes no request and no
    logon; the connection factory is never called.
  - The same holds for a read with a foreign handle.
- **Once only.**
  - A second execute, a discard after execute, and a record after execute each answer
    `envelope_unavailable`, and the connection counts one send.
  - The same holds when execute, record and discard are sent at once over one transport.
- **Projection.** Each number's answer equals the tool's answer outside an envelope for the same
  SAP answer, for every §8.2 row: success, `404`, and a non-2xx with a body.

### 9.5 Eligibility

- `oneRequestPerEntry.test.ts` and `batchEntryCases.ts` gain a case for every §8.2 row, with
  §8.2's arguments and expected requests.
- `eligibility.test.ts`:
  - set-aware lookup: a compact entry admits no core call, and a core entry admits no compact
    call;
  - `GetFunctionModule` is admitted with `part: metadata` and refused with `source` and with no
    `part`.
- The pinning test of §8.3.

### 9.6 The shared sender

- `phases.test.ts`, the package-walk suites and every existing phase suite pass unchanged.
- A refused second envelope request (`sent.refused`) ends a phase with `failuresEnd: false`, every
  item of that run failing with `MORE_ENVELOPES_WORDS`, as today.
- An item settlement whose error `failureOf` recognises ends a phase with `failuresEnd: false`,
  as today.
- A phase with `failuresEnd: false` keeps sending after a failed envelope through `sendPlanned`,
  as today, and one with the default stops.
- An envelope stops at its first failed run.
- One new case: the phases still send the `406`/`415` correction envelope through `sendPlanned`.

### 9.7 Surface

`surface.test.ts`, extended:

- The four tools are served in core and core-ro, on stdio, Streamable HTTP and SSE, and in no
  compact set.
- Every §8.2 tool declares `envelope_handle` and ends with its sentence; no other core tool does.
- The compact descriptions are unchanged.
- `toolDescriptionsCarryNoLiterals.test.ts` passes.

### 9.8 Configuration

- `--batch-open-envelopes`, `MCP_BATCH_OPEN_ENVELOPES` and `batch.openEnvelopes` are each read.
- `0`, `-1`, `1.5` and `x` each stop the start with `openEnvelopesRefusal`'s words, naming the
  setting as given.
- The embedder's `openEnvelopes` is honoured.

### 9.9 Integration

One live case for the release, in soft and hard mode:

- one envelope holding a §8.2 read of each shared object;
- executed without a bound and with a bound of 2;
- each answer compared with the same read made without an envelope.

## 10. Docs to change

**User guide:**

- **`docs/user-guide/BATCH_MODE.md`.**
  - A new section, "Envelopes in the core binaries": the four tools, `envelope_handle`,
    numbering, execution, answers, failures, the bound, the node-structure rule, the lifetime per
    transport, and the session check.
  - The intro table and the sentence "the full binaries serve no batch mode" change.
  - The eligibility table is rendered per set.
- **`docs/user-guide/README.md`** and **`docs/README.md`**: batch mode is no longer described as
  compact-only.
- **`docs/user-guide/CLI_OPTIONS.md`** and **`docs/configuration/YAML_CONFIG.md`**:
  `--batch-open-envelopes`, `MCP_BATCH_OPEN_ENVELOPES`, `batch.openEnvelopes`.
- **`docs/user-guide/HANDLERS_MANAGEMENT.md`**: the new group in core and core-ro.
- **`docs/user-guide/ACCESS_RESTRICTIONS.md`**: restrictions apply when a read is recorded into
  an envelope.
- **`docs/user-guide/TERMINOLOGY.md`**: envelope against ADT envelope.
- **`docs/user-guide/AVAILABLE_TOOLS*.md`**, the generated tool listings and the tool-search
  index: regenerated by their writers.

**Architecture:**

- **`docs/architecture/ARCHITECTURE.md`**: the envelope owner and the dispatch path.
- **`docs/architecture/STATEFUL_SESSION_GUIDE.md`**: envelopes as held state and their disposal.
- **`docs/architecture/REQUEST_HEADERS.md`**: recorded envelope requests get no `406`/`415`
  correction; the phases still do.
- **`docs/architecture/HANDLER_EXPORTER.md`** and the embedder docs: the `envelopes` and
  `openEnvelopes` options.

**The rest:**

- **`http/README.md`**: an envelope as held state, routing by `state_handle`, and
  `SessionClose`'s new `envelopes` count.
- **`SECURITY.md`**: an envelope handle is valid only in the session that created it (instance,
  connection context, and over HTTP the `state_handle` and the credential headers), unlike
  `state_handle`.
- **`README.md`**: the feature line.
- **`CHANGELOG.md`**: the 24.3.0 entry, dated.
- **`tests/test-config.yaml.template`**: the integration case's switch, if it needs one.

## 11. What is left out

The goal's out of scope stands. In addition, this task leaves as they are:

- the compact sets' `HandlerGet` `TRANSPORT` and `node_structure` entries, because the compact
  sets are out of scope.
