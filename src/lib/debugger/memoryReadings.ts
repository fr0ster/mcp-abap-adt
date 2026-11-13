/** Memory snapshot documents, and any document without a reading of its own. */

import { XMLParser } from 'fast-xml-parser';
import { child, childAt, type Element, isElement, listOf } from '../xml/tree';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  removeNSPrefix: true,
  parseTagValue: false,
  ignoreDeclaration: true, // the `<?xml …?>` line carries nothing a reader needs
  isArray: (n) => n === 'snapshot',
});

/**
 * Any document, its namespaces dropped — `full` for an answer without a
 * reading of its own. A blank document parses to `{}`.
 */
export function readXmlDocument(xml: string): unknown {
  return parser.parse(xml);
}

export interface SnapshotReading {
  id: string;
  user: string;
  timestamp: string;
  size: number;
  programName: string;
  fileName: string;
}

const field = (v: unknown): string =>
  v === undefined || v === null || typeof v === 'object' ? '' : String(v);

export function readSnapshotList(xml: string): SnapshotReading[] {
  const snapshots = childAt(readXmlDocument(xml), 'snapshotsList', 'snapshots');
  return listOf(child(snapshots, 'snapshot')).map((s) => ({
    id: field(child(s, 'id')),
    user: field(child(s, 'user')),
    timestamp: field(child(s, 'timestamp')),
    size: Number(field(child(s, 'size')) || 0),
    programName: field(child(s, 'programName')),
    fileName: field(child(s, 'fileName')),
  }));
}

/** The memory a stopped debuggee uses, in bytes, named after the document's elements. */
export interface MemorySizesReading {
  abap: {
    staticVariables: number;
    stackUsed: number;
    stackAllocated: number;
    dynamicMemoryObjectsUsed: number;
    dynamicMemoryObjectsAllocated: number;
  };
  internal: { used: number; allocated: number; peakUsed: number };
  external: {
    used: number;
    allocated: number;
    peakUsed: number;
    numberOfInternalSessions: number;
  };
}

const count = (v: unknown): number => Number(field(v).trim() || 0);
const group = (node: unknown): Element => (isElement(node) ? node : {});

export function readMemorySizes(xml: string): MemorySizesReading {
  const doc = group(child(readXmlDocument(xml), 'memorySizes'));
  const abap = group(doc.abap);
  const internal = group(doc.internal);
  const external = group(doc.external);
  return {
    abap: {
      staticVariables: count(abap.staticVariables),
      stackUsed: count(abap.stackUsed),
      stackAllocated: count(abap.stackAllocated),
      dynamicMemoryObjectsUsed: count(abap.dynamicMemoryObjectsUsed),
      dynamicMemoryObjectsAllocated: count(abap.dynamicMemoryObjectsAllocated),
    },
    internal: {
      used: count(internal.used),
      allocated: count(internal.allocated),
      peakUsed: count(internal.peakUsed),
    },
    external: {
      used: count(external.used),
      allocated: count(external.allocated),
      peakUsed: count(external.peakUsed),
      numberOfInternalSessions: count(external.numberOfInternalSessions),
    },
  };
}

/**
 * Three sizes, in bytes, that say the most about the program under debug:
 * what its own data objects hold (dynamic memory objects used — the part a
 * growing table or a leak changes), what its internal session uses now, and
 * the most it used so far. What is allocated but unused, the stack and the
 * static variables say how the system reserves memory, not what the program
 * does with it; `full` keeps them.
 */
export function terseMemorySizes(r: MemorySizesReading): {
  abap_objects_used: number;
  internal_used: number;
  internal_peak_used: number;
} {
  return {
    abap_objects_used: r.abap.dynamicMemoryObjectsUsed,
    internal_used: r.internal.used,
    internal_peak_used: r.internal.peakUsed,
  };
}
