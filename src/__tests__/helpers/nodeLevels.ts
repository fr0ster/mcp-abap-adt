/**
 * Repository tree levels for the walk cases, as adt-strategies reads them
 * (`utilNodeContents`, 0.28.1): a document read through the shipped reading,
 * or a level built from names and types — each object listed as one SAP
 * gave without a technical name or URI (`incompleteObjects`), as the cases'
 * objects carry neither.
 */

import { answeredObject, utilNodeContents } from '@mcp-abap-adt/adt-strategies';
import type { NodeLevel } from '../../lib/strategies/packageWalk';

/** A node-structure document, read by the shipped reading. */
export function nodeLevelOfXml(data: string): NodeLevel {
  return utilNodeContents({ status: 200, statusText: 'OK', headers: {}, data });
}

/** An object of a case: its name and type, and what else its node carries. */
interface CaseObject {
  name: string;
  type: string;
  description?: string;
  techName?: string;
  uri?: string;
}

/**
 * A level of `objects` and `childNodes` (type and id): an object with a
 * technical name and a URI is complete, any other is listed incomplete.
 */
export function levelOf(
  objects: ReadonlyArray<CaseObject>,
  childNodes: ReadonlyArray<{ type: string; nodeId: string }> = [],
): NodeLevel {
  const complete = objects.flatMap((o) =>
    o.techName !== undefined && o.uri !== undefined
      ? [
          {
            ...answeredObject(o.type),
            objectName: o.name,
            techName: o.techName,
            objectUri: o.uri,
            ...(o.description === undefined
              ? {}
              : { description: o.description }),
          },
        ]
      : [],
  );
  const incomplete = objects.flatMap((o) =>
    o.techName !== undefined && o.uri !== undefined
      ? []
      : [
          {
            ...answeredObject(o.type),
            objectName: o.name,
            ...(o.techName === undefined ? {} : { techName: o.techName }),
            ...(o.uri === undefined ? {} : { objectUri: o.uri }),
            ...(o.description === undefined
              ? {}
              : { description: o.description }),
          },
        ],
  );
  return {
    objects: complete,
    ...(incomplete.length > 0 ? { incompleteObjects: incomplete } : {}),
    childNodes: childNodes.map((c) => ({
      ...answeredObject(c.type),
      nodeId: c.nodeId,
    })),
  };
}
