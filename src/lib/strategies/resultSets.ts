import { utilDocuments } from '@mcp-abap-adt/adt-clients';
import type { IResultStrategy } from '@mcp-abap-adt/interfaces';
import { nodeLevel } from './packageWalk';
import { statusOnly, structured, verbatim } from './reading';

/**
 * Which reading a result-set slot wants — keyed on the slot, because that is
 * what it depends on. 31 sets, 308 slots, 39 distinct names.
 *
 *  - **the document is the answer** → `verbatim`. Source, metadata, a transport
 *    document. The tools carry metadata as a string inside their JSON and have
 *    never parsed it.
 *  - **named fields are promised** → `structured`. A check's messages, an
 *    activation's verdict, a deletion's `isDeleted`, a validation's verdict.
 *  - **there is no body** → `statusOnly`. A create answers 200 with zero bytes,
 *    and so does a successful write. It still carries `raw` and `status`, so
 *    `detail: 'raw'` is answerable and `terseWrite` has a status to read.
 */
export const READING_BY_SLOT: Record<string, IResultStrategy<unknown>> = {
  source: verbatim,
  sourceDocument: verbatim,
  metadata: verbatim,
  transport: verbatim,
  include: verbatim,
  read: verbatim,

  created: statusOnly,
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

/** Stamp the table over a shipped result set, keeping that set's own keys. */
export function resultsFor<R extends Record<string, unknown>>(shipped: R): R {
  const out: Record<string, unknown> = {};
  for (const slot of Object.keys(shipped)) {
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
 * has to walk again.
 */
export const ourUtils = { ...resultsFor(utilDocuments), node: nodeLevel };
