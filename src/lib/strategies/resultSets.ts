import { unitTestDocuments, utilDocuments } from '@mcp-abap-adt/adt-clients';
import type { IResultStrategy } from '@mcp-abap-adt/interfaces';
import { nodeLevel } from './packageWalk';
import { statusOnly, structured, verbatim } from './reading';

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
export const READING_BY_SLOT: Record<string, IResultStrategy<unknown>> = {
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
};

/**
 * Stamp the table over a shipped result set, keeping that set's own keys.
 *
 * `keep` names the slots to leave exactly as the shipped set has them —
 * for the rare slot whose shipped reading sees something none of `verbatim`,
 * `structured` or `statusOnly` can: a header, not the body. `activation` on
 * `utilDocuments` and `run` on `unitTestDocuments` are the two known cases;
 * see the exceptions documented on `READING_BY_SLOT` above.
 */
export function resultsFor<R extends Record<string, unknown>>(
  shipped: R,
  keep: ReadonlyArray<keyof R> = [],
): R {
  const kept = new Set<keyof R>(keep);
  const out: Record<string, unknown> = {};
  for (const slot of Object.keys(shipped)) {
    if (kept.has(slot as keyof R)) {
      out[slot] = shipped[slot];
      continue;
    }
    const reading = READING_BY_SLOT[slot];
    if (reading === undefined) {
      throw new Error(`resultsFor: no reading declared for the slot "${slot}"`);
    }
    out[slot] = reading;
  }
  return out as R;
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
  node: nodeLevel,
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
export const ourUnitTest = resultsFor(unitTestDocuments, ['run']);
