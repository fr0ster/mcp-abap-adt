/**
 * A `SearchSource` source reader answering from a map, for the orchestrator's
 * own tests: a source the map holds answers its text, any other read SAP's
 * `404` (a listed source's failure, a probe's absence). Keys:
 * `PROG:<name>` (program), `INC:<name>` (program include), `CLAS:<name>`
 * (class main), `CLASINC:<name>/<kind>` (a class's local include),
 * `INTF:<name>`, `DDLS:<name>`, `BDEF:<name>`, `DDLX:<name>`, `SRVD:<name>`,
 * `FM:<group>/<name>` (function module), `FINC:<group>/<name>` (function
 * include); `FUGRSTR:<group>` a function group's structure, one
 * `<objecttype>|<objectname>` per line.
 */
import type { IAdtError } from '@mcp-abap-adt/interfaces-adt';
import type { PackageContentItem } from '../../lib/search-source/packageEnumerator';
import type {
  FugrChild,
  ReadAnswer,
  SourceRead,
  SourceReader,
} from '../../lib/search-source/sourceReader';

/** The map key of a source read. */
export function fakeKeyOf(read: SourceRead): string {
  switch (read.reader) {
    case 'program':
      return `PROG:${read.name}`;
    case 'include':
      return `INC:${read.name}`;
    case 'class':
      return `CLAS:${read.name}`;
    case 'classInclude':
      return `CLASINC:${read.name}/${read.include}`;
    case 'interface':
      return `INTF:${read.name}`;
    case 'ddl':
      return `DDLS:${read.name}`;
    case 'behaviorDefinition':
      return `BDEF:${read.name}`;
    case 'metadataExtension':
      return `DDLX:${read.name}`;
    case 'serviceDefinition':
      return `SRVD:${read.name}`;
    case 'functionModule':
      return `FM:${read.group}/${read.name}`;
    case 'functionInclude':
      return `FINC:${read.group}/${read.name}`;
  }
}

/** SAP's answer of `status` with no document. */
export function sapAnswered(status: number): IAdtError {
  return {
    origin: 'refusal',
    message: `status ${status}`,
    response: { status, statusText: 'Refused', headers: {}, data: '' },
  };
}

const notThere = <T>(): ReadAnswer<T> => ({
  ok: false,
  error: sapAnswered(404),
});

/** A reader over `map`; `onRead` sees every source read asked. */
export function sourcesFrom(
  map: Readonly<Record<string, string>>,
  onRead?: (read: SourceRead) => void,
): SourceReader {
  return {
    async readSource(read) {
      onRead?.(read);
      const text = map[fakeKeyOf(read)];
      return text === undefined ? notThere() : { ok: true, value: text };
    },
    async readStructure(group) {
      const raw = map[`FUGRSTR:${group}`];
      if (raw === undefined) return { ok: true, value: [] };
      const nodes: FugrChild[] = raw.split('\n').map((row) => {
        const bar = row.indexOf('|');
        return {
          objecttype: row.slice(0, bar),
          objectname: row.slice(bar + 1),
        };
      });
      return { ok: true, value: nodes };
    },
  };
}

/** The resolution of exact package names: the entries as they are. */
export const exactPackages = async (entries: string[]) => ({
  packages: entries,
});

/** A walk of `_packageName` that found `items`. */
export const listing = (
  _packageName: string,
  items: PackageContentItem[],
): PackageContentItem[] => items;
