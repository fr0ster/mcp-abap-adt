/** Memory snapshot documents, and any document without a reading of its own. */
import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  removeNSPrefix: true,
  parseTagValue: false,
  isArray: (n) => n === 'snapshot',
});

/** Any document, its namespaces dropped — `full` for an answer without a reading of its own. */
export function readXmlDocument(xml: string): unknown {
  return xml?.trim() ? parser.parse(xml) : {};
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
  const snapshots = (readXmlDocument(xml) as any)?.snapshotsList?.snapshots;
  const list: any[] =
    snapshots && typeof snapshots === 'object'
      ? (snapshots.snapshot ?? [])
      : [];
  return list.map((s) => ({
    id: field(s.id),
    user: field(s.user),
    timestamp: field(s.timestamp),
    size: Number(field(s.size) || 0),
    programName: field(s.programName),
    fileName: field(s.fileName),
  }));
}
