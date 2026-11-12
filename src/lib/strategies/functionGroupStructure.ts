import type { IResultStrategy } from '@mcp-abap-adt/interfaces-adt';
import { XMLParser } from 'fast-xml-parser';
import { child, childAt, listOf } from '../xml/tree';

/** One node of a function group's object structure. */
export interface FugrChild {
  objecttype: string;
  objectname: string;
  /** The node's `objecturi`: where its source is, or a SAP GUI address. */
  objecturi?: string;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
});

/**
 * The `objectStructure` reading for a function group: the `FUGR/*` nodes of
 * `/sap/bc/adt/repository/objectstructure`, each with its type, its name and
 * its `objecturi`. Which of them has a source is the source reader's
 * question (`readSourceUnits`), not this reading's.
 */
export const functionGroupStructure: IResultStrategy<FugrChild[]> = (
  answer,
) => {
  const xml = String(answer.data ?? '');
  const parsed: unknown = parser.parse(xml);
  const found = childAt(
    parsed,
    'projectexplorer:objectstructure',
    'projectexplorer:node',
  );
  if (!found) return [];
  const out: FugrChild[] = [];
  for (const node of listOf(found)) {
    const type = child(node, 'objecttype');
    const name = child(node, 'objectname');
    const uri = child(node, 'objecturi');
    if (typeof type !== 'string' || typeof name !== 'string') continue;
    if (type === '' || name === '' || !type.startsWith('FUGR/')) continue;
    out.push(
      uri === undefined
        ? { objecttype: type, objectname: name }
        : {
            objecttype: type,
            objectname: name,
            objecturi: String(uri),
          },
    );
  }
  return out;
};
