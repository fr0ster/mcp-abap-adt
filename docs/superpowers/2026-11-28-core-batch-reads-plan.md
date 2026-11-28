# Plan: batch reads by envelope handle in the core and -ro binaries (#392)

This plan implements the spec, `docs/superpowers/2026-11-28-core-batch-reads-spec.md`, and through
it the goal, `docs/superpowers/2026-11-28-core-batch-reads-goal.md`. Both bind it. Section numbers
(§) are the spec's.

## How every task runs

- **Tests come first.** Each task writes the tests it names, watches them fail for the right
  reason, then makes them pass. Each test that protects a rule is proved load-bearing: break the
  rule, watch the test go red, revert.
- **One commit per task, or more when a task holds separate logical changes.** Every commit ends
  with the session's attribution lines and is pushed to #402.
- **The gate before each commit:**
  - `npm run lint:check`;
  - `npm run test:check`;
  - the task's unit files, together with the existing suites it names, through
    `npm run test:build` and `node tools/run-tests.mjs <compiled files>`.

  No integration suite runs without the owner's go: `npm test` reaches live systems in this
  checkout.
- **CI** is checked after every push.
- **No step changes compact `HandlerBatch` or the debugger batch.** Their suites are in the gate
  of every task that touches `src/lib/batch/`.

## Task 1. The shared sender, extracted with no change in behaviour (§6.2)

**Files.**

- `src/lib/batch/phases.ts`: the planning and sending loop of `runPhaseOutcome` moves into
  `sendPlanned`;
- `src/__tests__/unit/batch/phases.test.ts`.

**Interface.** `sendPlanned`, exported from `phases.ts`, takes:

- the context and connection;
- the pending parts;
- the plan (runs of item indexes);
- `correction: boolean`;
- `endsOn(outcome)`;
- optionally, the run's item settlements.

It answers one outcome per run: `answered`, `failed` with its error, `unauthorizedPart`, or
`unsent`. It always stops on the mandatory stops: `sent.oversized`, `sent.absent`,
`sent.refused`, a credential refusal, and a `failureOf` settlement when settlements are handed.
`runPhaseOutcome` keeps its signature and calls `sendPlanned` with `correction: true` and an
`endsOn` that is today's `failuresEnd` / `rules.after` policy.

**Tests first**, in `phases.test.ts`, each passing before the move and after it:

- a phase with `failuresEnd: false` keeps sending after a failed envelope; with the default it
  stops;
- `sent.refused` ends a phase with `failuresEnd: false`, every item of that run failing with
  `MORE_ENVELOPES_WORDS`;
- a `failureOf` settlement ends a phase with `failuresEnd: false`;
- the `406`/`415` correction envelope is still sent.

**Gate.** Every existing suite under `src/__tests__/unit/batch/` passes unchanged, the
package-walk, search-source and object-list suites included.

**Commit.** "refactor(batch): sendPlanned, the phases' sender, extracted; behaviour unchanged".

## Task 2. The recorder over an owner interface (§5.3)

**Files.**

- `src/lib/batch/recorder.ts`;
- `src/lib/batch/InstanceBatch.ts`.

**Interface.** `RecordingOwner`, in `recorder.ts`:

- the next number;
- the held session kind, and a recorded kind;
- the signal the recorder races against;
- `keepRawParts`;
- whether its batch is still open.

`InstanceBatch` implements it as it behaves today, and `createRecorder` takes it in place of
`InstanceBatch`. A second recording mode records into a pending-part sink instead of an
`AdtBatchConnection`: the request options, the number, and an answer to settle.

**Tests first.** A recorder over a fake owner and a pending-part sink takes one number for a call
with several requests, races the call's own signal, and refuses `batch_other_kind`.

**Gate.** `recording.test.ts`, `batchEnd.test.ts`, `batchAnswers.test.ts`, `instanceBatch.test.ts`
and the debugger batch suites pass unchanged.

**Commit.** "refactor(batch): the recorder over a RecordingOwner; compact unchanged".

## Task 3. Set-aware eligibility (§8.1)

**Files.**

- `src/lib/batch/eligibility.ts`: `set: 'compact' | 'core'`, `eligible(tool, args, connection,
  set)`, and `ABSENT_READS_AS.GetFunctionModule`;
- `src/lib/batch/sentence.ts`: `batchSentence` reads compact entries only; a new
  `envelopeSentence` and `ENVELOPE_SENTENCE`;
- the compact batch mode's call site in `BaseMcpServer.recordCall`, which passes `'compact'`;
- the renderer and test of the `BATCH_MODE.md` table, rendered per set;
- every existing consumer of `eligible` and of the entry shape, migrated in the same commit so
  that the gate stays green:
  - `src/__tests__/unit/batch/eligibility.test.ts`, `oneRequestPerEntry.test.ts`,
    `whereUsedAndFeeds.test.ts` and `recording.test.ts`, each passing `'compact'`;
  - `src/__tests__/unit/sources/batchHandlers.test.ts`, whose "every entry is compact" assertion
    becomes "every entry is `compact` or `core`, and each set's entries name tools of that set".

**Tests first**, in `eligibility.test.ts`:

- a compact entry admits no core call, and a core entry (a test row) admits no compact call;
- the loader accepts `core` and refuses any other set.

In `sentence` tests:

- the compact sentences are unchanged;
- `envelopeSentence` renders the always form and the "When …" form.

**Gate.** Every file above, `sentence` and the `BATCH_MODE.md` table test, the compact surface
test (`surface.test.ts`, compact descriptions unchanged).

**Commit.** "feat(batch): eligibility by set; the envelope sentence", with the consumer migrations
in the same commit.

## Task 4. The refusal codes (§7)

**Files.**

- `src/lib/auth/serverRefusal.ts`: `envelopes_unavailable`, `envelope_unavailable`,
  `envelope_limit`, `envelope_not_recordable` and `envelope_node_structure`;
- `envelopeLimitWords`, `envelopeNotRecordableWords` and `envelopeNodeStructureWords`.

**Tests first.** Each code answers its words, and the worded ones name their numbers and tool.
The answer form is the dispatch's `answerFailure`.

**Commit.** "feat(refusals): the envelope refusals".

## Task 5. The consumer's limit setting (§3.3)

**Files.**

- `src/lib/config/authParameters.ts` (`openEnvelopesRefusal`);
- `src/lib/config/IServerConfig.ts`;
- the three launchers: `server-runtime/src/http/launcher.ts`, `server-runtime/src/sse/launcher.ts`
  and `server-runtime/src/stdio/launcher.ts`;
- the YAML reading, where `partsPerEnvelope` is read.

**Tests first.**

- `--batch-open-envelopes`, `MCP_BATCH_OPEN_ENVELOPES` and `batch.openEnvelopes` are each read.
- `0`, `-1`, `1.5` and `x` stop the start with the words, naming the setting as given.
- With nothing given there is no bound.

**Commit.** "feat(config): --batch-open-envelopes".

## Task 6. The owner, `InstanceEnvelopes` (§3.1, §3.4)

**Files.**

- `src/lib/batch/InstanceEnvelopes.ts`, new;
- `src/__tests__/unit/batch/envelopes.test.ts`, new.

**Interface.**

- `SessionKey`: the connection context, plus an optional state handle and digest.
- `create(key)`, `find(handle, key)`, `claim(handle, key)`, `discard(handle, key)` and
  `list(key)`.
- `StatePart`: `holdsState`, `pending`, `failures`, `dispose` and `observe`.
- Each envelope holds its handle, its key, its creation order, its counter, its pending parts,
  its node-structure flag, its own `AbortController`, and one child `AbortController` per
  recorded call.
- It implements `RecordingOwner` (task 2) per envelope.

**Tests first**, at owner level:

- the handle: 32 hex characters, and no collision across 10 000 creates;
- the limit counts every key, refuses `envelope_limit` and evicts nothing;
- no bound without the setting;
- unknown and foreign handles get the same refusal from `find`, `claim` and `discard`;
- `list` shows only the matching key's envelopes;
- the claim is synchronous;
- two envelopes keep separate numbering and survive each other's execution or discard;
- `dispose()` aborts every call's signal and empties the map;
- the fake clock ends nothing.

**Commit.** "feat(batch): InstanceEnvelopes, the envelope owner".

## Task 7. The session key (§4)

**Files.**

- `src/embeddable/BaseMcpServer.ts`: a private `envelopeKey()`. It reads `connectionContext`
  and, over Streamable HTTP, the call's `state_handle` and the request headers from the request
  context, and computes the SHA-256 digest of `x-sap-url`, `x-sap-client`, `x-sap-jwt-token`,
  `x-sap-login` and `x-sap-password`. Matches are compared with `timingSafeEqual`.

**Tests first.**

- A cold instance builds a key with no request, no logon, no `getConnection`, no
  `requireSystem` and no `callerUserOf`.
- Over HTTP, each credential header changed alone gives another key, and so does another or a
  missing `state_handle`.
- The digest appears in no log line or answer.

**Commit.** "feat(envelopes): the session key, built without a request".

## Task 8. The owner's wiring (§3.2, §3.4)

**Files.**

- `src/embeddable/BaseMcpServer.ts`: the `envelopes` option, attached to the state;
- `src/embeddable/EmbeddableMcpServer.ts`: the `envelopes` and `openEnvelopes` options;
- `server-runtime/src/http/StreamableHttpServer.ts`, `server-runtime/src/sse/SseServer.ts` and
  `server-runtime/src/stdio/launcher.ts`: a new `InstanceEnvelopes` per instance, beside
  `InstanceBatch`;
- `src/lib/state/longSession.ts`: `SessionHolding.envelopes`.

**Tests first** — owner attachment and lifecycle only. No public envelope tool exists yet, so
each test opens an envelope at owner level, on the owner the host handed the instance:

- Two instances get distinct owners, each attached to its own state.
- An instance built without an owner has none attached; the public `envelopes_unavailable`
  answers are tested in tasks 9 and 10.
- The embedder's `openEnvelopes`:
  - a valid value is handed to the owner;
  - `0`, `-1`, `1.5` and `x` refuse with `openEnvelopesRefusal("openEnvelopes")`;
  - omitted, there is no bound.
- Over HTTP an open envelope keeps the instance in the pool, and the idle bound ends it.
- Over SSE the disconnect and the idle bound end it.
- `SessionClose` names the count and ends it.
- The host's shutdown disposes it.
- stdio has no idle bound: the fake clock advanced by days leaves it open.

**Commit.** "feat(envelopes): the hosts create the owner".

## Task 9. The four tools and execution (§2, §6)

**Files.**

- `src/lib/handlers/groups/EnvelopeHandlersGroup.ts`, new: the four tool definitions with their
  schemas and descriptions (§2.1);
- `src/lib/batch/envelopeTools.ts`, new: create, execute, discard and list. Execute follows
  §6.1 steps 3 to 7: the claim, the empty envelope, the plan by `packByParts` /
  `checkedEnvelopes`, `sendPlanned` with `correction: false` and an `endsOn` that stops on
  `failed` / `unauthorizedPart`, then the two-step answers of §6.3 and the list of §6.4;
- `src/lib/batch/batchTools.ts`: `ENVELOPE_TOOLS`, and `runsBesideBatch` extended;
- `src/lib/toolSet.ts`: the group added to `fullToolSet` and `fullReadOnlyToolSet`;
- `src/embeddable/BaseMcpServer.ts`: the owner and session check of the four tools runs before
  connection acquisition (§6.1 step 1).

**Tests first** — `envelopeExecute.test.ts`, new, recording through the task 2 recorder over an
envelope directly, since the dispatch comes in task 10:

- one ADT envelope by default, and `packByParts` envelopes under a bound, in recording order;
- a single call over the bound sends nothing;
- a part's `404` answers that number only;
- each failed-run kind answers its numbers with the failure answer itself, even when the
  handler would catch it;
- a failure in the second of three runs: the first run's handlers are not aborted, no third run
  is sent, and the unsent numbers answer the failure;
- a `401` part ends the sending;
- no `406`/`415` resend;
- `keepRawParts` adds `raw`;
- the empty envelope answers `[]`;
- every number of a call over the bound answers the oversized words, not only that call's;
- a resumed handler that tries another request after its parts answers `batch_ended` under its
  number;
- execute answers `isError: false` after the claim, also when every number is an error;
- a failure in the second of three runs, with a first-run handler that settles slowly: that
  handler's projection is built and kept before any failed-run signal is aborted;
- a second execute, a discard after execute and a record after execute each answer
  `envelope_unavailable`, with one send;
- execution while a lock is held still goes stateless.

**Tool tests**, through a real SDK `Client` over `InMemoryTransport`:

- An instance without an owner answers `envelopes_unavailable` on each of the four tools.
- On a cold instance, create, list and discard make no request, call no connection factory and
  call no `getConnection`. An execute with a foreign or unknown handle does the same.
- A connection acquisition that fails before the claim leaves the envelope open with its record.
  The next execute, with the connection back, sends it once and answers every number.
- Over Streamable HTTP, two requests with different credential headers on the same pooled
  instance each create an envelope. A third create by either is refused `envelope_limit`, and
  nothing is evicted.
- For execute, discard and list, an unknown handle and another session's handle get
  byte-identical answers. The other session differs in one way at a time: instance,
  `state_handle`, each credential header, and the connection context.

**Surface tests**, in `surface.test.ts`:

- the four tools are in core and core-ro on all three transports, and in no compact set;
- their descriptions;
- `toolDescriptionsCarryNoLiterals`.

**Commits.** Two, each buildable on its own:

1. "feat(envelopes): create, discard and list". It holds the group, `ENVELOPE_TOOLS`, the
   pre-acquisition check, the surface tests, and the tool tests that need no execution.
2. "feat(envelopes): execution". It holds execute, `envelopeExecute.test.ts`, and the execute
   tool tests.

## Task 10. The dispatch and the interception point (§5.2, §5.3, §5.4)

**Files.**

- `src/embeddable/BaseMcpServer.ts`, in the registration loop:
  - every core tool's schema in its form — an admitted read loose plus the declared
    `envelope_handle`, an envelope tool as declared, any other core tool loose;
  - the parameter description and the sentence appended at registration, both built by one
    exported builder, `envelopeSurfaceOf(tool, schema, description)` (`src/lib/batch/sentence.ts`).
    It answers the served schema and description of a core tool, and registration calls it.
    Task 14's generator calls the same builder, so the docs and the served tools cannot drift.
- `src/embeddable/BaseMcpServer.ts`, in `runCall`:
  - the undeclared keys are read and then dropped before any handler;
  - the recording path runs before the open-batch check, with its six checks in order;
  - for a handle-bearing call, `longReadInBackground` is `false` and `worksOnOwnConnection`
    keeps it in the main flow;
  - access restrictions are checked at the compact point;
  - the handle is stripped.
- `src/lib/batch/recorder.ts`: the node-structure rule and its partial-call answer.
- `tools/batch-handlers.json`: the first core row, `GetClass`, with its `oneRequestPerEntry`
  case, so that the dispatch has a real admitted read to drive. Every test of this task runs on
  `GetClass`, or on the recorder directly. A test that needs a row from task 11 or 12 is listed
  there.
- `src/__tests__/unit/surface/envelopeSurface.test.ts`, new and table-driven: it reads the core
  entries of `tools/batch-handlers.json`, so it grows by itself as tasks 11 and 12 add rows.

**Tests first** — `envelopeRecording.test.ts`, new, through a real SDK `Client` over
`InMemoryTransport`:

- a read with a handle answers its number; without one it sends as before, also while an
  envelope is open;
- creating an envelope records nothing;
- a non-admitted tool given `"x"`, `""`, `null` or `42` is refused `envelope_not_recordable`;
- an admitted read given `""`, `null` or `42` gets the schema refusal;
- the four tools are never routed to recording;
- `background: true` is refused on `GetClass`, which does not declare it;
- an undeclared `background` without a handle is dropped as today;
- an instance without an owner answers `envelopes_unavailable` on `GetClass` with a handle;
- an access-restricted call is refused before taking a number, and its package-tree read goes
  out at once;
- a read with a handle reaches its envelope while a debugger batch is open, and the debugger
  batch is unchanged;
- the session check of §9.2 for record: byte-identical answers, nothing recorded or sent; the
  other session differs in one way at a time, as in task 9;
- on a cold instance, a `GetClass` call with a foreign or unknown handle never calls the
  connection factory or `getConnection`, and makes no request and no logon (§9.4);
- execute, record and discard sent at once over one transport: one send, and the later calls
  answer `envelope_unavailable`;
- a SAP session lost between record and execute, and a replaced SAP connection under the same
  connection context: the envelope stays valid, and execute sends on the current connection;
- on stdio, the destination's token refreshed between record and execute: execute sends with
  the current credential;
- the instance's close with recorded `GetClass` calls pending: every recorded handler settles,
  and the connection counts no send;
- the listed schemas of the loose tools equal today's apart from `additionalProperties`.

**Recorder tests**, with fake requests, needing no row:

- a second node-structure request is refused;
- the partial-call case keeps its number and its earlier part, and answers the refusal;
- a node-structure refusal under a number answers that refusal even when its run fails.

**Surface tests**, in `envelopeSurface.test.ts`:

- every core entry's tool declares `envelope_handle` with its parameter description and ends
  with its sentence (always form or "When …");
- no other core tool declares it or carries the sentence;
- every compact tool's schema and description equal today's.

**Commits.** Two, each buildable on its own:

1. "feat(envelopes): the schemas carry envelope_handle". It holds the registration forms, the
   surface test and the loose-schema listing test. A call with a handle is still refused
   `envelope_not_recordable` here, including on `GetClass`, and a test says so.
2. "feat(envelopes): recording by handle". It holds the recording path, the node-structure rule,
   the `GetClass` row and its case, and the rest of the tests.

## Task 11. The group A rows (§8.2)

**Files.**

- `tools/batch-handlers.json`: the other 18 group A rows;
- `src/__tests__/unit/batch/batchEntryCases.ts` and `oneRequestPerEntry.test.ts`: a case per row,
  with §8.2's arguments and expected requests (held open, answered, `404`), a source range
  included;
- `eligibility.test.ts`: `GetFunctionModule` admitted for `metadata`, refused for `source` and
  with no `part`.

**Tests first:**

- the cases;
- the projection equality — the answer under a number equals the answer outside an envelope
  for the same SAP answer: success, `404`, and a non-2xx with a body.

**Commit.** "feat(batch): the core object reads admitted (group A)".

## Task 12. The group B rows (§8.2)

**Files.**

- `tools/batch-handlers.json`: the 27 group B rows;
- the cases in `batchEntryCases.ts` / `oneRequestPerEntry.test.ts`;
- the pinning test of §8.3, new.

The pinning test asserts:

- no listed tool has a core entry;
- no `sends` names `/cts/`;
- `GetObjectsByType` alone names `nodestructure`.

**Tests first:**

- the cases;
- the projection equality per row;
- with data tools on, `GetSqlQuery` and `GetTableContents` are recorded; with them off, neither
  is listed;
- with a background strategy configured, each listed long read among the rows (`SearchObject`,
  say), given a handle and no `background`, is recorded, takes the main flow and creates no run;
- `background: true` is refused on a row that declares `background` (`SearchObject`);
- `GetObjectsByType` end to end: one per envelope, and a second call refused
  `envelope_node_structure`;
- `GetObjectVersionDiff` and `GetObjectDraft` end to end: their independent requests share one
  number, and each answer equals the answer outside an envelope.

If a case shows a row sending other requests than §8.2 states, that row is not added. The
finding is reported in #402 with the request seen, and the spec is corrected there before going
on.

**Commit.** "feat(batch): the core single-call reads admitted (group B)".

## Task 13. The integration case (§9.9)

**Files.** A new case under `src/__tests__/integration/`, following the existing hard and soft
mode harness: one envelope with a group A read of each shared object, executed without a bound
and with a bound of 2, each answer compared with the same read made without an envelope. Plus
the template switch in `tests/test-config.yaml.template`, if the harness needs one.

**Run.** Only when the owner says so, on onprem and cloud, one file at a time, with the full log
saved.

**Commit.** "test(integration): envelope reads against the system".

## Task 14. The docs (§10)

**Files.** Every file of §10:

- the user guide: `BATCH_MODE.md`, `README.md`, `CLI_OPTIONS.md`, `YAML_CONFIG.md`,
  `HANDLERS_MANAGEMENT.md`, `ACCESS_RESTRICTIONS.md`, `TERMINOLOGY.md`;
- the architecture: `ARCHITECTURE.md`, `STATEFUL_SESSION_GUIDE.md`, `REQUEST_HEADERS.md`,
  `HANDLER_EXPORTER.md`;
- `http/README.md`, `SECURITY.md`, `README.md`, `docs/README.md`;
- the generator first, `tools/generate-tools-docs.js`. Its hard-coded words say batch mode is
  compact's alone and the full binaries serve none: the binaries line (line 722) and
  `READ_ONLY_PAGE_INTRO` (line 931). Both are rewritten to name the envelope tools of the core
  and core-ro binaries. The generator also stops reading the core tools' handler definitions as
  they are. It takes each core tool's schema and description from `envelopeSurfaceOf` (task 10),
  the builder registration uses, so every admitted read's `envelope_handle` and sentence appear in
  the listings exactly as they are served. A test compares, for every core tool, the generator's
  schema and description with the registered ones from an SDK `Client`'s `listTools`;
- then the generated listings and the tool-search index, rewritten by their writers
  (`npm run docs:tools` and the listing writers). Their output is checked: the core pages list
  the four envelope tools, the admitted reads' `envelope_handle` and sentence, and no line saying
  the core binaries serve no batching;
- the dated 24.3.0 entry in `CHANGELOG.md`.

CLAUDE.md's "The state handle" section is not edited here. The PR names the change for the
controller.

**Tests.**

- The table and listing tests pass against the rewritten files.
- A grep of `docs/`, `README.md`, `http/README.md` and the generator finds no sentence left
  saying batching is compact's alone.

**Commits**, one per document group, in this order:

1. the generator;
2. the generated listings;
3. the user guide;
4. the architecture docs;
5. security and the READMEs;
6. the changelog.

## Task 15. Before the release

- The goal, spec and plan under `docs/superpowers/` are deleted in the last commit of #402,
  "docs: the #392 goal, spec and plan leave — implemented".
- What they still owe the future goes into the PR description first.
