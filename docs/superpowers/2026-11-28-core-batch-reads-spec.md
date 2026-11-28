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

| Tool | Arguments | Answer |
|---|---|---|
| `ReadEnvelopeCreate` | none | `{"envelope_handle":"…"}`, plus `"state_handle":"…"` where the instance has one (as `HandlerBatch` `begin` answers it) |
| `ReadEnvelopeExecute` | `envelope_handle` (string, required) | the list of answers (§6.3) |
| `ReadEnvelopeDiscard` | `envelope_handle` (string, required) | `{"envelope_handle":"…","discarded":<recorded calls>}` |
| `ReadEnvelopeList` | none | `[{"envelope_handle":"…","recorded":<calls>}, …]`: the caller's open envelopes, in creation order; `[]` when there are none |

Three of the tools send nothing to SAP: create, discard and list. Execute sends the envelope.
None of the four is recorded, and none carries an envelope sentence. Each runs beside an open
compact or debugger batch, at once: `runsBesideBatch` (`batchTools.ts`) lists the four.

**The descriptions** follow the repository's rules (functional, no literals, no negations).
For example, the create tool: "Creates an envelope that collects read calls to send together;
answers its envelope_handle."

**The handle** is 32 upper-case hex characters from `randomBytes(16)` (128 bits), generated as
the state handle is (`InstanceState.ts`, `newHandle`) and drawn again on a collision with an
open envelope's handle. It is never derived from `state_handle`, and `state_handle` is never
derived from it.

## 3. The owner

### 3.1 `InstanceEnvelopes`

A new class, `src/lib/batch/InstanceEnvelopes.ts`, owns one instance's envelopes. It implements
`StatePart`:

- `holdsState()` is true while any envelope is open.
- `pending()` is false and `failures()` is empty.
- `dispose()` drops every envelope. It aborts each envelope's signal so that every recorded
  handler settles, sends nothing, and empties the map.
- `observe()` behaves as it does in `InstanceBatch`.

It holds a `Map<handle, Envelope>`. Each envelope has:

- its handle and its caller (§4);
- its creation order;
- its own `AbortController`;
- its counter (the last number taken);
- its recorded calls (`RecordedCall`, as compact defines it) and their pending parts (§6.1);
- whether it already holds a node-structure request (§5.4).

The constructor takes `{ keepRawParts: boolean; openEnvelopes?: number | undefined }`. It is a
separate class from `InstanceBatch`. The two hold separate state, so an envelope and a compact
or debugger batch can be open together.

Its operations:

- `create(caller)`: refused `envelope_limit` (§7) when the bound is set and the caller already
  holds that many open envelopes; otherwise a new envelope, returned with its handle.
- `find(handle, caller)`: the open envelope, or `envelope_unavailable` when it is unknown or
  another caller's. Both cases give the same refusal and the same words.
- `claim(handle, caller)`: as `find`, and the envelope leaves the map in the same synchronous
  step, before any `await`. From then on every call naming the handle gets
  `envelope_unavailable`.
- `discard(handle, caller)`: as `claim`, then aborts its signal; nothing is sent.
- `list(caller)`: the caller's open envelopes, in creation order.

### 3.2 Who creates it

The host creates the owner, one per instance, never shared, beside `new InstanceBatch(…)`:

- `server-runtime/src/http/StreamableHttpServer.ts`, when it builds an instance;
- `server-runtime/src/sse/SseServer.ts`, the same;
- `server-runtime/src/stdio/launcher.ts`, the same;
- an embedder, through a new `envelopes` option of `EmbeddableMcpServer` (documented as the
  `batch` option is).

`BaseMcpServer` takes a new option, `envelopes?: InstanceEnvelopes | undefined`, and attaches it
to the instance state (`this.state.attach`), as it attaches the batch owner. Without an owner,
the four tools and every read given an `envelope_handle` answer `envelopes_unavailable`.

### 3.3 The consumer's limit

The new setting bounds the open envelopes per owner:

- CLI `--batch-open-envelopes=<n>`;
- environment `MCP_BATCH_OPEN_ENVELOPES`;
- YAML `batch.openEnvelopes`;
- an embedder's `openEnvelopes`.

It is a positive whole number, checked as `partsPerEnvelopeOf` checks its value (`phases.ts`).
An invalid value stops the start with its words. Absent, there is no bound. The server has no
default.

It is read where `partsPerEnvelope` and `keepRawParts` are read (`IServerConfig.ts`,
`authParameters.ts`, the three launchers), and handed to each `InstanceEnvelopes`.

### 3.4 Lifetime

An envelope is part of the instance's held state. It ends in these cases:

- `ReadEnvelopeExecute` or `ReadEnvelopeDiscard`;
- the instance's close, which covers the client closing stdin, the SSE connection ending, the
  pool letting the instance go, `SessionClose`, and the process's shutdown;
- the held state's idle bound, over Streamable HTTP and SSE.

Over Streamable HTTP an open envelope keeps the instance in the pool, as an open compact batch
does. The model sends `state_handle` with every call of the envelope. The envelope has no clock
of its own.

`SessionHolding` (`longSession.ts`) gains `envelopes: <open envelopes>`, so `SessionClose` names
what it ends.

## 4. The caller

The caller of a call is the identity `backgroundCaller()` builds for background runs
(`BaseMcpServer.ts`, `BackgroundRunCaller`):

- the system key;
- the client;
- the backend user, upper case.

That identity is the instance's destination plus its SAP user. It is factored into one
accessor that both background runs and envelopes use.

- `ReadEnvelopeCreate` records the caller on the envelope.
- Every other envelope tool, and every read given an `envelope_handle`, computes the caller of
  its own call and passes it to `find` / `claim` / `discard` / `list`.
- A call whose caller cannot be determined is refused `system_user_unknown`, as a background
  run is.

**The user may cost a request.** When the destination's system parameters are not known yet,
determining the user reads them once. That read belongs to the destination, not to the
envelope: it is cached and is the same read a background run makes. Its answer is never
recorded.

## 5. Recording

### 5.1 The argument

Every admitted core read (§8) gains an optional `envelope_handle` (string) in its schema. It is
added at registration, as the batch sentence and `state_handle` are, so no handler file carries
it. Its parameter description reads: "The handle of an open envelope: the call is recorded into
it and answered at its execution."

The tool's description gains one sentence:

- for a tool admitted for every call, `ENVELOPE_SENTENCE`: "With envelope_handle, the call is
  recorded into that envelope under the next number, and its answer comes back when the envelope
  is executed."
- for a tool admitted only for some arguments, the same sentence opened with "When <arguments>,"
  — the arguments rendered from the entries by `entryWords` (`sentence.ts`).

Core tools that are not admitted get no sentence; the core sets carry no batch sentence today,
and that stays so.

### 5.2 The dispatch

The dispatch reads `envelope_handle` from the raw arguments of every call, before the tool's
schema, as the HTTP host reads `state_handle`. A call that names one takes this path before the
open-batch check, so it reaches its envelope even while a compact or debugger batch is open. The
checks run in this order, and each refusal takes no number and sends nothing:

1. The owner is present, else `envelopes_unavailable`.
2. The caller is determined (§4), else `system_user_unknown`.
3. The envelope is found (`find`), else `envelope_unavailable`.
4. The tool is admitted for the core set with these arguments over this connection kind
   (`eligible(tool, args, connection, 'core')`), else `envelope_not_recordable`, naming the tool.
   This also refuses a tool that does not declare `envelope_handle`, so the handle is never
   dropped by a schema and the call never runs now.
5. The call does not state `background: true`, else `batch_no_background`.
6. The call holds the flow, does not run in the background, and is no debugger tool, else
   `envelope_not_recordable`. This matches compact's `recordCall`.
7. The access restrictions admit the call, else their own refusal. The check runs at the same
   point as in compact batch mode. A package-tree read it makes goes out at once on the
   instance's connection and is not recorded.

The handle is then stripped from the arguments the handler receives.

### 5.3 The recorder

The handler runs at once, on a recorder over the envelope, in the call's scopes and under the
envelope's signal. The call waits until it has recorded everything it sends (`untilSent`), or
until it has settled.

- **It recorded.** It answers `{"envelope_handle":"…","number":<n>}`. The number is taken at its
  first request, and every later request of the call shares it. The handler stays waiting for
  its parts.
- **It settled without recording.** A handler that refused its arguments, for example, answers
  its own answer and takes no number.

`createRecorder` (`recorder.ts`) is generalised over a small owner interface: next number, the
held session kind, the signal, `keepRawParts`, and whether its batch is still open. Both
`InstanceBatch` and an envelope implement it. Compact's behaviour stays unchanged.

An envelope's recorder does not record into an `AdtBatchConnection`. It keeps each request as a
pending part of the envelope (request options, the call's number, an answer to settle), the way
`runPhaseOutcome` records an item (`phases.ts`, `record`). This is what lets execution split the
parts into several ADT envelopes.

Every recorded request is stateless. A request of another session kind (`requestKind`) is
refused `batch_other_kind`, as compact refuses it.

### 5.4 One node structure per envelope

The recorder refuses a request that is a node structure — `POST` to
`/sap/bc/adt/repository/nodestructure` — when the envelope already holds one. It refuses
`envelope_node_structure` before recording, whichever tool sent it. Once one part of a call is
refused, every later part of that call is refused too, and the refusal is the call's answer, as
with `batch_other_kind`.

## 6. Execution

### 6.1 The claim and the plan

`ReadEnvelopeExecute` holds the flow and takes the instance's connection for the whole call, as
`HandlerBatch` `end` does. It runs these steps:

1. `claim(handle, caller)`. The envelope leaves the map before anything is awaited.
2. **Plan.** The pending parts are planned by the consumer's `partsPerEnvelope`:
   - absent, one ADT envelope;
   - given, `packByParts` over the calls in recording order, keeping each call's parts together,
     checked by `checkedEnvelopes`.

   When a call needs more parts than the bound allows, nothing is sent, and every number answers
   the oversized words (`oversizedReadWords`).
3. **Send.** The ADT envelopes go one after another on the call's connection, each a fresh
   `AdtBatchConnection` (`endpoint: 'communication'`). Each part's answer settles its pending
   part.

Steps 2 and 3 are the part of `runPhaseOutcome` that plans and sends. They are extracted into
one function that the phases and the envelope both call, with the format correction a parameter:
on for the phases, as today, and off for the envelope (goal invariant 15). The phases'
behaviour stays unchanged.

### 6.2 Failures

These follow goal invariant 18 and the phases' rules.

- **A part's non-2xx** is that number's answer, through its handler.
- **A failed ADT envelope** answers every number it carried with the failure, as it came. That
  covers:
  - SAP's answer to the envelope, its status and body with `step: "execute"`;
  - the transport's error;
  - a credential refusal;
  - `batch_parts_mismatch`;
  - `batch_unsplit`.
- **The run ends there.** No later ADT envelope is sent. The numbers of the envelopes already
  answered keep their answers, and every number not sent answers that same failure.
- **A destination with no communication batch** (the outer `404` verdict of `batchAvailability`)
  is an ADT envelope failure like any other. There is no sequential fallback, because that would
  resend the reads.

### 6.3 The answer

Once the run ends, every recorded call's handler resumes with its parts, all in parallel, and
builds its answer. Execute answers the list, in recording order:

```json
[{"number":1,"content":[…]},{"number":2,"content":[…],"isError":true}]
```

- Each entry is a `BatchAnswer` (`InstanceBatch.ts`): `number`, the tool's `content`, `isError`
  when the tool answered an error, and `raw` with SAP's raw parts when `batch.keepRawParts` is
  on.
- A handler that would send another request after its parts is refused `batch_ended`, and that
  refusal is its answer.
- An empty envelope's execution answers `[]` and sends nothing.

Execute itself answers `isError: false` whenever it got as far as the claim. Its own refusals
come before the claim: `envelopes_unavailable`, `system_user_unknown` and `envelope_unavailable`.

## 7. Refusals

`ServerRefusal` (`src/lib/auth/serverRefusal.ts`) gains these codes, each with fixed words:

| Code | When | Words |
|---|---|---|
| `envelopes_unavailable` | the host gave no owner | "this server instance keeps no envelopes" |
| `envelope_unavailable` | the handle is unknown, another caller's, executed, discarded or ended | "envelope is not available" |
| `envelope_limit` | the consumer's bound is reached | "<n> envelopes are open, the bound set by --batch-open-envelopes / openEnvelopes; execute or discard one first" |
| `envelope_not_recordable` | the tool or its arguments are not admitted | "<tool> is not recorded into an envelope with these arguments; call it without envelope_handle" |
| `envelope_node_structure` | a second node-structure request in one envelope | "this envelope already holds a node structure read; record this one into another envelope" |

These existing codes are reused with their words: `batch_no_background`, `batch_other_kind`,
`batch_ended`, `system_user_unknown`, `batch_parts_mismatch` and `batch_unsplit`.

## 8. `tools/batch-handlers.json`

### 8.1 Set-aware entries

`BatchEntry.set` becomes `'compact' | 'core'`, and the loader accepts both. `eligible(tool,
args, connection, set)` reads only the entries of the given set: compact batch mode passes
`'compact'` and the envelope passes `'core'`.

`batchSentence` stays compact's, reading compact entries only. A new `envelopeSentence` reads
the core entries. The 48 compact entries are unchanged.

The table page in `BATCH_MODE.md` is rendered per set, and its test checks both tables.

### 8.2 The core entries

All core entries have `"set": "core"`. Each one's `handler` is its `path#function`, and its
`sends` is in words, as the compact entries' are.

**Group A: the object reads, one request per call.** One entry each, no `when`:

- with `part` source or metadata, and any version: `GetClass`, `GetInterface`, `GetProgram`,
  `GetInclude`, `GetFunctionInclude`, `GetFunctionModule`, `GetTable`, `GetStructure`, `GetDdl`,
  `GetServiceDefinition`, `GetServiceBinding`, `GetBehaviorDefinition`,
  `GetBehaviorImplementation`, `GetMetadataExtension`;
- the metadata document: `GetDomain`, `GetDataElement`, `GetPackage`, `GetFunctionGroup`,
  `GetTableType`.

Each sends "one request: GET the part asked (source or metadata) at the version asked", the
same request as the compact `HandlerGet` entry that names the full set's `Get<Type>`.

**Group B: the other single-call reads, admitted only if proved.** Each candidate gets an entry
only if its own `oneRequestPerEntry.test.ts` case passes. A candidate that fails stays out, and
the PR names it with the request that kept it out. An entry narrows its arguments with `when`
where only some calls are one request, as compact does for `HandlerSystem` `where_used`.

- **Object and system reads:** `GetObjectStructure`, `GetObjectVersions`,
  `GetObjectVersionSource`, `GetObjectVersionDiff`, `GetObjectDraft`, `GetInactiveObjects`,
  `GetAdtTypes`, `GetTypeInfo`, `GetMessageClass`, `GetMessageClassMessage`, `GetTextElements`,
  `GetTableSettings`, `GetMainPrograms`, `GetTransaction`, `GetObjectOutline`.
- **Searches and listings:** `SearchObject`, `GetObjectsByType`, `GetWhereUsed` (narrowed as
  compact's `where_used` entry), `GetIncludesList`, `GetStructuresList`, `ListFunctionModules`,
  `ListFunctionGroupIncludes`.
- **Unit tests:** `GetUnitTestResult`.
- **ATC:** `GetATCFindings`, `GetATCResult`, `ListATCResults`.
- **Runtime:** `RuntimeGetDumpById`, `RuntimeListFeeds`, `RuntimeListSystemMessages`,
  `RuntimeGetGatewayErrorLog`, `RuntimeListProfilerTraceFiles`, `RuntimeGetProfilerTraceData`.
- **Core set only:** `ListServiceBindingTypes`.
- **Data tools**, served only with `--enable-data-tools`: `GetSqlQuery`, `GetTableContents`.

**Never admitted:**

- the transport reads: `GetTransport`, `ListTransports`, `ReadTransportActionLog`,
  `ReadTransportObjects`;
- the reads that send many requests inside one call: `GetObjectsList`, `GetPackageContents`,
  `GetObjectInfo`, `SearchSource`, `GetPackageTree`, `DescribeByList`;
- `GetEnhancements`, because its include read waits for a metadata read;
- every tool that changes the system or runs code, `RunATC` included.

A test pins this list (§9).

## 9. Tests

All tests are unit tests on `node:test`. Nothing here runs live, except the integration case at
the end of this section.

**Handle and owner** — new file `src/__tests__/unit/batch/envelopes.test.ts`:

- The handle is 32 hex characters; across 10 000 creates no two collide, and it differs from
  `state_handle`.
- An unknown handle and another caller's handle get the same refusal, word for word.
- `ReadEnvelopeList` shows only the caller's envelopes, in creation order.
- The limit refuses `envelope_limit` at the bound and evicts nothing. Without the setting, 1 000
  envelopes open.
- The fake clock (`mock.timers`) advanced by days ends nothing on stdio.
- Over Streamable HTTP the idle bound ends the envelope with its instance.
- `dispose()` sends nothing, settles every recorded handler, and empties the list.
- Two envelopes keep separate numbering.
- An envelope opens and records beside an open debugger batch, and the debugger batch's answers
  are unchanged.

**Recording** — new file `envelopeRecording.test.ts`:

- A read with a handle is recorded and answers its number; a read without one sends as before.
- Creating an envelope records nothing else.
- A non-admitted tool given `envelope_handle`, one whose schema does not declare it included,
  is refused and sends nothing.
- `background: true` is refused `batch_no_background`.
- An access-restricted call is refused before it takes a number, and its package-tree read
  goes out at once.
- A second node structure is refused `envelope_node_structure`, also when another tool sends it.
- A call with several independent requests shares one number.

**Execution** — new file `envelopeExecute.test.ts`, at a counting connection:

- One ADT envelope by default, and `packByParts` envelopes under a bound, in recording order.
- A part's `404` answers that number only.
- An ADT envelope failure of each kind (SAP's refusal, transport error, credential refusal,
  parts mismatch, unsplit) answers every number it carried. With a bound, a failure in the
  second of three envelopes keeps the first one's answers and sends no third, and the unsent
  numbers answer that failure.
- No `406`/`415` correction is resent.
- `keepRawParts` adds `raw`.
- An empty envelope answers `[]` and sends nothing.
- A second execute, a discard after execute, and a record after execute each answer
  `envelope_unavailable`, and the connection counts no second send.
- Each number's answer equals the tool's answer outside an envelope for the same SAP answer,
  checked for every group A tool.

**Eligibility:**

- `oneRequestPerEntry.test.ts` and `batchEntryCases.ts` gain a case for every core entry.
- `eligibility.test.ts` covers the set-aware lookup: a compact entry admits no core call, and
  a core entry admits no compact call.
- A new pinning test asserts the never-admitted list of §8.2, and that no core entry's `sends`
  names `/cts/` or `nodestructure`.

**Surface** — `surface.test.ts`, extended:

- The four tools are served in core and core-ro, on stdio, Streamable HTTP and SSE, and in no
  compact set.
- Every admitted read declares `envelope_handle` and ends with its sentence; no other core tool
  does.
- The compact descriptions are unchanged.
- The descriptions pass `toolDescriptionsCarryNoLiterals.test.ts`.

**Regression:**

- The existing compact batch, phases and debugger batch suites pass unchanged.
- `phases.test.ts` proves the extracted planner still corrects `406`/`415` for the phases.

**Configuration:**

- `--batch-open-envelopes` is parsed from the CLI, the environment and YAML, a non-positive or
  fractional value refuses the start, and the embedder option is honoured.
- `binSmoke` / `installMatrix` need no change: no new binary.

**Integration**, the live case the release needs:

- one case per transport in the soft and hard modes;
- one envelope with a group A read of each shared object;
- executed with and without a bound;
- each answer compared with the same read made without an envelope.

## 10. Docs to change

- **`docs/user-guide/BATCH_MODE.md`.** A new section, "Envelopes in the core binaries": the
  four tools, `envelope_handle`, numbering, execution, answers, failures, the bound, the node
  structure rule, the lifetime per transport and the caller check. The intro table and the
  sentence "the full binaries serve no batch mode" change. The eligibility table is rendered
  per set.
- **`docs/user-guide/CLI_OPTIONS.md`** and **`docs/configuration/YAML_CONFIG.md`**:
  `--batch-open-envelopes` / `MCP_BATCH_OPEN_ENVELOPES` / `batch.openEnvelopes`.
- **`docs/user-guide/HANDLERS_MANAGEMENT.md`**: the new group in the core and core-ro sets.
- **`docs/user-guide/AVAILABLE_TOOLS*.md`**, the generated tool listings and the tool-search
  index: regenerated by their writers.
- **`docs/user-guide/TERMINOLOGY.md`**: envelope against ADT envelope.
- **`SECURITY.md`**: an envelope handle is checked against its caller, unlike `state_handle`.
- **`docs/architecture/HANDLER_EXPORTER.md`** and the embedder docs: the `envelopes` and
  `openEnvelopes` options.
- **`README.md`**: the feature line.
- **`CHANGELOG.md`**: the 24.3.0 entry, dated.
- **`tests/test-config.yaml.template`**: the integration case's switch, if it needs one.

## 11. What is left out

The goal's out of scope stands. In addition, this task leaves the compact sets' `HandlerGet`
`TRANSPORT` and `node_structure` entries as they are: the compact sets are out of scope.
