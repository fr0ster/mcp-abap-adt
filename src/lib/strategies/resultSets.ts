import {
  atcDocuments,
  classExecutorDocuments,
  feedDocuments,
  profilerDocuments,
  programExecutorDocuments,
  unitTestDocuments,
  utilDocuments,
} from '@mcp-abap-adt/adt-clients';
import {
  asItCame,
  atcRunStatus,
  atcStartedRun,
  atcSystemCheckVariant,
  atcWaitingRun,
  atcWorklistId,
  feedDescriptors,
  feedEntries,
  feedGatewayErrorDetail,
  feedGatewayErrors,
  feedSystemMessages,
  feedVariants,
  objectVersions,
  profilerDbAccesses,
  profilerHitList,
  profilerStatements,
  profilerTraceEntries,
  traceSchedulingProfilerId,
  traceSchedulingRequests,
  traceSchedulingTypes,
  unitTestRunId,
  utilActivationRunId,
} from '@mcp-abap-adt/adt-strategies';
import type { IResultStrategy } from '@mcp-abap-adt/interfaces-adt';
import { nodeLevel } from './packageWalk';
import { statusOnly, structured, verbatim } from './reading';
import { sqlPreview } from './sqlPreview';

/**
 * Which reading a result-set slot wants — keyed on the slot, because that is
 * what it depends on for roughly 300 of the 308 slots. 31 sets, 39 distinct
 * names.
 *
 *  - **the document is the answer** → `verbatim`. Source, metadata, a transport
 *    document. The tools carry metadata as a string inside their JSON and have
 *    never parsed it.
 *  - **named fields are promised** → `structured`. A check's messages, an
 *    activation's verdict, a deletion's `isDeleted`, a validation's verdict.
 *  - **there is no body** → `statusOnly`. A successful write answers 200 with
 *    zero bytes. It still carries `raw` and `status`, so `detail: 'raw'` is
 *    answerable and `terseWrite` has a status to read.
 *
 * **Two named exceptions to the slot-name premise, found in review.**
 *
 * `created` is `verbatim`, not `statusOnly`: `create-class--01-oo-classes` is
 * the zero-byte case the name suggests, but `create-domain--01-ddic-domains`
 * (1878 bytes of `doma:domain`) and `create-dataelement--01-ddic-dataelements`
 * (1345 bytes) prove a DDIC create answers a document. `verbatim` carries
 * `raw` and `status` both, so a zero-byte create is unaffected — `raw` is `''`
 * and `terseWrite(value, status)` still has its status — while a DDIC create
 * stops losing the document it was sent. `updated`, `metadataUpdated` and
 * `written` stay `statusOnly`: every write fixture in the corpus
 * (`update-source-success--02-update-source`, `--03-unlock`,
 * `unlock-success--01-unlock`) is a zero-byte body, and nothing in the corpus
 * shows otherwise.
 *
 * `utilDocuments.activation` and `unitTestDocuments.run` are NOT in this
 * table — they are named in `resultsFor`'s keep-list at their call sites
 * instead, because the reading they need looks at `answer.headers`, and none
 * of `verbatim`, `structured` or `statusOnly` looks anywhere but
 * `answer.data`. `/activation/runs` and `/abapunit/runs` both answer with the
 * run id only in `Location` (`unittest-run-passing--01-abapunit-runs` is a
 * 0-byte body, status 201, id only in `location`), and `getActivationRun`,
 * `getActivationResults` and a run's own follow-up calls have no other way to
 * reach it. Read every slot of both sets before assuming a third one needs
 * the same treatment — `search`, `types`, `node`, `inactive`, `status` and
 * `result` in those two sets all read only `answer.data` and are unaffected.
 */
// `satisfies`, never a `: Record<string, IResultStrategy<unknown>>`
// annotation — the annotation is what erased every slot's type to `unknown`
// and made `resultsFor` return its input type untouched. `satisfies` checks
// the same shape (every value is an `IResultStrategy<unknown>`) without
// widening a single one of them: `READING_BY_SLOT.source` stays the literal
// type of `verbatim`, `(answer) => AdtReading<string>`, which is what makes
// the mapped type below able to answer it back per slot. The package's own
// `core/class/types.d.ts` documents the identical rule above `classDocuments`.
export const READING_BY_SLOT = {
  source: verbatim,
  sourceDocument: verbatim,
  metadata: verbatim,
  transport: verbatim,
  include: verbatim,
  read: verbatim,
  created: verbatim,

  updated: statusOnly,
  metadataUpdated: statusOnly,
  written: statusOnly,

  check: structured,
  cdsCheck: structured,
  activation: structured,
  validation: structured,
  deletion: structured,
  deleted: structured,
  deletionCheck: structured,
  classification: structured,
  generation: structured,
  publication: structured,
  odata: structured,
  bindingTypes: structured,
  list: structured,
  // Arrived with adt-clients 19.1.0, on `AdtRequest.searchConfigurations()`.
  // `structured` is the default any call site gets: the document parsed into
  // named structure, like its neighbour `list`. `ListTransports` is the one
  // caller that wants something else and keeps the shipped reading instead
  // (`resultsFor(transportDocuments, ['searchConfigurations'])`), because
  // what it needs is the addressable list — `uri`, `etag`, attributes — that
  // the package already parses, and a `configUri` is not something to dig
  // back out of a generic parse.
  searchConfigurations: structured,
  search: structured,
  whereUsed: structured,
  whereUsedScope: structured,
  folders: structured,
  types: structured,
  node: structured,
  objectStructure: structured,
  inactive: structured,
  results: structured,
  result: structured,
  run: structured,
  status: structured,
  query: structured,
  columns: structured,
  contents: structured,
  discovery: structured,

  // Arrived with adt-clients 20.0.0, on the four user actions a request's
  // object list answers to and the reading that lists it.
  //
  // The three echo documents get `structured` because that is what they are:
  // the server repeats the object it was asked about and says nothing else.
  // **A `200` from `removedObject` is not evidence a removal happened** —
  // measured on an on-premise system, an entry asked for without a position
  // echoed back exactly the same way while staying on the task. What settles
  // it is `actionLog` or a re-read through `objects`, which is why all four
  // are here rather than one of them standing in for the rest.
  removedObject: structured,
  addedObject: structured,
  createdTask: structured,
  actionLog: structured,
  // `objects` is the one a call site keeps rather than stamps, like
  // `searchConfigurations` above: the package parses the entries and, with
  // them, the `tm:position` that `removeObject` requires. Stamped with
  // `structured` it would hand back a parsed document and leave a caller
  // digging a position out of it — which is the work `readObjects` exists to
  // end. `ReadTransportObjects` therefore calls
  // `resultsFor(transportDocuments, ['objects'])`. The table still declares
  // the slot, because the ratchet in `resultSets.test.ts` asks for a reading
  // per slot and a call site that forgets the keep-list should get something
  // rather than a throw.
  objects: structured,
  // Arrived with adt-clients 22.0.0, on `changeTaskType`. `structured` for the
  // same reason the echoes above are: the answer is the task document read
  // back, and a `200` says the request was accepted, not that the type is now
  // what was asked for — a re-read through `objects` or the request listing is
  // what settles that. Measured on BTP ABAP: a task is born `Unclassified`,
  // `tm:type` on the creating call is ignored, and CTS also assigns a type on
  // its own when the first object lands.
  taskTypeChanged: structured,

  // Arrived with adt-clients 23.0.0 in every versionable type's set. The
  // library stopped reading them (MIGRATION-23 §4): `versions` is the feed as
  // it came unless a reading is given, so the list is `objectVersions`'
  // (`IObjectVersion[]`, what `getVersions` answered in 22.x), and a version's
  // source is the text as it came — `asItCame`, the 22.x default. Without
  // them `resultsFor` threw for every versionable type's set, which is nearly
  // every handler here.
  versions: objectVersions,
  versionSource: asItCame,

  // Arrived with adt-clients 23.0.0, when the runtime, executor, abapGit and
  // feature-toggle implementations took result sets. What the tools read
  // through them is not these: `ourAtc`, `ourProfiler`, `ourFeeds`,
  // `ourClassExecutor` and `ourProgramExecutor` below carry the readings
  // adt-strategies ships for them. The table names a generic reading per slot
  // so that a `resultsFor` over one of those sets gets something rather than
  // a throw — `structured` for a document, `verbatim` for a bare text id, and
  // `statusOnly` where the answer is a header and an empty body.
  checkVariant: structured,
  worklist: verbatim,
  startedRun: structured,
  waitingRun: structured,
  runStatus: structured,
  findings: structured,
  checkFailures: structured,
  executionLog: structured,
  hitlist: structured,
  statements: structured,
  dbAccesses: structured,
  requests: structured,
  scheduled: statusOnly,
  feeds: structured,
  variants: structured,
  entries: structured,
  systemMessages: structured,
  gatewayErrors: structured,
  gatewayErrorDetail: structured,
  dump: verbatim,
  error: structured,
  message: structured,
  object: structured,
  graph: structured,
  trace: structured,
  records: structured,
  recordContent: structured,
  activations: structured,
  state: structured,
  directory: structured,
  linked: structured,
  pulled: structured,
  unlinked: structured,
  repos: structured,
  errorLog: structured,
  externalRepo: structured,
  switched: structured,
  runtimeState: structured,
  checkState: structured,
} satisfies Record<string, IResultStrategy<unknown>>;

/**
 * What `resultsFor` answers for one slot that is NOT in the keep-list: the
 * table's own reading if it declares the slot's name, `never` otherwise —
 * matching the throw `resultsFor` raises at runtime for exactly that slot.
 * `never` rather than `IResultStrategy<unknown>` because the whole point of
 * the exercise is that a caller of a slot the table does not know should not
 * type-check quietly; it should fail to compile, the same way it fails to run.
 */
type SlotReading<P extends PropertyKey> = P extends keyof typeof READING_BY_SLOT
  ? (typeof READING_BY_SLOT)[P]
  : never;

/**
 * Stamp the table over a shipped result set, keeping that set's own keys.
 *
 * `keep` names the slots to leave exactly as the shipped set has them —
 * for the rare slot whose shipped reading sees something none of `verbatim`,
 * `structured` or `statusOnly` can: a header, not the body. `activation` on
 * `utilDocuments` and `run` on `unitTestDocuments` are the two known cases;
 * see the exceptions documented on `READING_BY_SLOT` above.
 *
 * **The return type is a per-slot map, not `R`.** `K` is a `const` type
 * parameter so a call site's `keep` array is known at the type level as the
 * literal slots it names, not widened to `(keyof R)[]` — that is what lets a
 * kept slot answer `R[P]` (the shipped strategy's own type) while every other
 * slot answers `SlotReading<P>` (the table's). Returning `R` here — the bug
 * this function shipped with — typed every slot as the shipped strategy's
 * type even where the runtime had swapped it for `verbatim`/`structured`/
 * `statusOnly`, so `getClass(resultsFor(classDocuments)).read(...)` type
 * checked as answering `string` when it actually answers `AdtReading<string>`.
 */
export function resultsFor<
  R extends Record<string, unknown>,
  const K extends readonly (keyof R)[] = [],
>(
  shipped: R,
  keep: K = [] as unknown as K,
): { [P in keyof R]: P extends K[number] ? R[P] : SlotReading<P> } {
  const kept = new Set<keyof R>(keep);
  const out: Record<string, unknown> = {};
  const table = READING_BY_SLOT as Record<string, IResultStrategy<unknown>>;
  for (const slot of Object.keys(shipped)) {
    if (kept.has(slot as keyof R)) {
      out[slot] = shipped[slot];
      continue;
    }
    const reading = table[slot];
    if (reading === undefined) {
      throw new Error(`resultsFor: no reading declared for the slot "${slot}"`);
    }
    out[slot] = reading;
  }
  return out as { [P in keyof R]: P extends K[number] ? R[P] : SlotReading<P> };
}

/**
 * The util set, with our own node reading — `nodeLevel` keeps the descriptions
 * the shipped `nodeContents` drops, and a tree without them is a tree a caller
 * has to walk again. `activation` is kept as shipped: `activationRunId` reads
 * the `Location` header a started activation run answers with, which is not a
 * question `structured` (the table's default for the slot name `activation`)
 * can even see.
 */
export const ourUtils = {
  ...resultsFor(utilDocuments, ['activation']),
  // adt-clients 23 ships the document for `activation`; the run id is a
  // reading now, and `utilActivationRunId` is the one that looks at the
  // `Location` header (MIGRATION-23 §4).
  activation: utilActivationRunId,
  node: nodeLevel,
  // `query` for the same reason as `node`: the generic `structured` parse has
  // never carried `dataPreview:columns` or `dataPreview:data` in its
  // repeatable list, so a preview read through it collapses a column's cells
  // into one. `GetSqlQuery` worked around that by projecting `reading.raw`
  // and running a regular expression over it inside the handler — which is
  // where a defect that silently reordered a caller's rows sat through the
  // whole migration. `sqlPreview` is that parse, in the place a parse
  // belongs.
  query: sqlPreview,
  // `GetTableContents` reads the same `/datapreview/freestyle` document
  // through a different slot, and carried the same regular expression.
  contents: sqlPreview,
};

/**
 * The unit-test set, kept as shipped. `run` is kept as shipped because
 * `runId` reads the `Location` header a started run answers with, which is
 * not a question any of `verbatim`, `structured` or `statusOnly` can see —
 * the same reason `ourUtils` keeps `activation`. A later task that calls
 * `getUnitTest`/`getCdsUnitTest` imports this instead of re-deriving the
 * exception: `getClass(resultsFor(classDocuments))`'s pattern, applied to
 * `unitTestDocuments` without a keep-list, would silently discard the run id
 * again.
 */
export const ourUnitTest = {
  ...resultsFor(unitTestDocuments, ['run']),
  // adt-clients 23 ships the document for `run`; the id is in a header, and
  // `unitTestRunId` reads it (MIGRATION-23 §6).
  run: unitTestRunId,
};

/**
 * The ATC set with the readings adt-clients 22 applied by default and 23 moved
 * to adt-strategies (MIGRATION-23 §9): the system's check variant and the
 * worklist id as text, a started run's id, a waited run's finding stats, and a
 * run's status. `findings` stays the document — `parseAtcWorklist` reads it.
 */
export const ourAtc = {
  ...atcDocuments,
  checkVariant: atcSystemCheckVariant,
  worklist: atcWorklistId,
  startedRun: atcStartedRun,
  waitingRun: atcWaitingRun,
  runStatus: atcRunStatus,
};

/**
 * The profiler set with the readings adt-clients 22 applied by default
 * (MIGRATION-23 §9): the trace list as entries, and each trace view parsed.
 * `newTraceAfter` compares entries by id and `recordedAt`; the trace tools
 * answer the parsed views.
 */
export const ourProfiler = {
  ...profilerDocuments,
  list: profilerTraceEntries,
  hitlist: profilerHitList,
  statements: profilerStatements,
  dbAccesses: profilerDbAccesses,
};

/**
 * The executors' trace scheduling, read as in adt-clients 22: `scheduleTrace`
 * answers the profiler id that `runWithProfiler` takes (MIGRATION-23 §9).
 * `run` stays the output text it always was.
 */
const traceScheduling = {
  types: traceSchedulingTypes,
  requests: traceSchedulingRequests,
  scheduled: traceSchedulingProfilerId,
};
export const ourClassExecutor = {
  ...classExecutorDocuments,
  ...traceScheduling,
};
export const ourProgramExecutor = {
  ...programExecutorDocuments,
  ...traceScheduling,
};

/**
 * The feed set with the readings adt-clients 22 applied by default
 * (MIGRATION-23 §9). `RuntimeListFeeds`' variants are not `feedVariants`:
 * on E19 `/feeds/variants` answers an empty body, and the variants are read
 * out of the feed list instead (`feedVariantsOf`).
 */
export const ourFeeds = {
  ...feedDocuments,
  feeds: feedDescriptors,
  variants: feedVariants,
  entries: feedEntries,
  systemMessages: feedSystemMessages,
  gatewayErrors: feedGatewayErrors,
  gatewayErrorDetail: feedGatewayErrorDetail,
};
