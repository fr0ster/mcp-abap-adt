import type { IResultStrategy } from '@mcp-abap-adt/interfaces-adt';
import { XMLParser } from 'fast-xml-parser';

/** One node of a function group's object structure. */
export interface FugrChild {
  objecttype: string;
  objectname: string;
  /** The node's `objecturi`: where its source is, or a SAP GUI address. */
  objecturi?: string;
}

interface StructureNode {
  objecttype?: unknown;
  objectname?: unknown;
  objecturi?: unknown;
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
  const xml = String((answer as { data?: unknown })?.data ?? '');
  const parsed = parser.parse(xml);
  const found = parsed?.['projectexplorer:objectstructure']?.[
    'projectexplorer:node'
  ] as StructureNode | StructureNode[] | undefined;
  if (!found) return [];
  const nodes = Array.isArray(found) ? found : [found];
  const out: FugrChild[] = [];
  for (const node of nodes) {
    const type = node.objecttype;
    const name = node.objectname;
    if (typeof type !== 'string' || typeof name !== 'string') continue;
    if (type === '' || name === '' || !type.startsWith('FUGR/')) continue;
    out.push(
      node.objecturi === undefined
        ? { objecttype: type, objectname: name }
        : {
            objecttype: type,
            objectname: name,
            objecturi: String(node.objecturi),
          },
    );
  }
  return out;
};
