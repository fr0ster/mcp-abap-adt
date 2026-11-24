import { analyseObjectProperties } from '@mcp-abap-adt/adt-strategies';
import * as z from 'zod';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import { purpose, toolDescription } from '../../../lib/description';
import {
  about,
  headShape,
  listAnswerAt,
  type RowSchemas,
  rows,
  values,
  writeJson,
  writeListing,
} from '../../../lib/detail';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  DETAIL_SHAPE,
  detailOf,
  levelOf,
} from '../../../lib/strategies/detail';
import type { AdtReading } from '../../../lib/strategies/reading';
import { ourUtils } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';
import {
  child,
  entries,
  isList,
  type XmlList,
  type XmlNode,
  type XmlRead,
} from '../../../lib/xml/tree';

/** A transaction's property as read: its facet, name and text. */
type TransactionProperty = Record<string, string>;

/** The lists the transaction listing writes: what its description states. */
export const TRANSACTION_LISTS: RowSchemas<{
  properties: TransactionProperty[];
}> = {
  properties: about(
    'for each property, such as its application component, package, type, owner or language',
    rows('properties', {
      columns: [
        {
          name: 'facet',
          means: 'its facet',
          cell: (property: TransactionProperty) => property.facet ?? '',
        },
        {
          name: 'name',
          means: 'its name',
          cell: (property: TransactionProperty) => property.name ?? '',
        },
        {
          name: 'text',
          means: 'its text',
          cell: (property: TransactionProperty) => property.text ?? '',
        },
      ],
      header: 'always',
    }),
  ),
};

/** The heads the transaction listing opens with: the transaction's own facts. */
export const TRANSACTION_HEADS = [
  headShape('transaction', 'name'),
  headShape('text', 'text'),
  headShape('package', 'package'),
];

export const TOOL_DEFINITION = {
  name: 'GetTransaction',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription({
    tag: 'read-only',
    purpose: purpose('Reads the properties of an ABAP transaction code.'),
  }),
  inputSchema: z.object({
    transaction_name: z.string().describe('Name of the ABAP transaction'),
    ...DETAIL_SHAPE,
  }),
} as const;

/** The workbench uri ADT knows a transaction by. */
export function transactionUri(name: string): string {
  return `/sap/bc/adt/vit/wb/object_type/trant/object_name/${encodeURIComponent(name)}`;
}

const asArray = (value: XmlNode | undefined): XmlList =>
  isList(value) ? value : value === undefined ? [] : [value];

/** The child whose local name (the part after any prefix) is `name`. */
const byLocalName = (node: XmlRead, name: string): XmlNode | undefined =>
  entries(node).find(([k]) => k.slice(k.indexOf(':') + 1) === name)?.[1];

/** An element's attributes as SAP sent them, values as text. */
const attributesOf = (element: XmlRead): Record<string, string> =>
  Object.fromEntries(
    entries(child(element, '@')).map(([k, v]) => [k, String(v)]),
  );

/**
 * `opr:objectProperties` (measured on premise, BASIS 816, 2026-10-21):
 * one `opr:object` — `text`, `name`, `package`, `type`, `expandable` as
 * attributes — and its facets as `opr:property` elements (`facet`, `name`,
 * `displayName`, and where given `text`, `hasChildrenOfSameFacet`): the
 * application component chain (`APPL`), the package chain (`PACKAGE`), then
 * type, owner, language, creation and the rest. Every attribute is answered
 * as SAP sent it.
 */
export function transactionPropertiesOf(value: XmlRead): {
  object: Record<string, string> | undefined;
  properties: Record<string, string>[];
} {
  // By local name, whatever the prefix (or none) — as the strategy reads it.
  const root = byLocalName(value, 'objectProperties');
  const object = asArray(byLocalName(root, 'object'))[0];
  return {
    object: object === undefined ? undefined : attributesOf(object),
    properties: asArray(byLocalName(root, 'property')).map(attributesOf),
  };
}

export async function handleGetTransaction(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  const { connection, logger } = context;
  if (!args?.transaction_name) {
    return return_error(new Error('transaction_name is required'));
  }
  const name = args.transaction_name.trim().toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'GetTransaction', detail },
    () =>
      createAdtClient(connection, logger)
        .getUtils(ourUtils)
        // Whether the answer is the transaction's properties is the
        // strategy's verdict: a 200 that is no `opr:objectProperties`
        // document holding `opr:object` (empty, not XML, a sign-in page) is
        // refused `ADT_OBJECT_NOT_FOUND`; SAP's own refusal (a `422` for a
        // name it does not know) passes through as it came.
        .getObjectProperties(transactionUri(name), {
          analyse: analyseObjectProperties,
        }),
    listAnswerAt<AdtReading<XmlRead>, string | object>(
      {
        // Every property the document held, written by the listing writer.
        terse: (reading: AdtReading<XmlRead>) => {
          const read = transactionPropertiesOf(reading.value);
          const { object } = read;
          return writeListing({
            heads: [
              { head: 'transaction', value: name },
              ...(object?.text === undefined
                ? []
                : [{ head: 'text', value: object.text }]),
              ...(object?.package === undefined
                ? []
                : [{ head: 'package', value: object.package }]),
            ],
            reading: read,
            lists: TRANSACTION_LISTS,
          });
        },
        // The object and every property, the properties by the JSON writer.
        medium: (reading) => {
          const read = transactionPropertiesOf(reading.value);
          return writeJson(
            { success: true, transaction_name: name, object: read.object },
            read,
            {
              properties: values(
                'properties',
                (property: Record<string, string>) => property,
              ),
            },
          );
        },
        // `full` adds the document's own parse, so nothing it carries is lost.
        full: (reading) => ({
          success: true,
          transaction_name: name,
          ...transactionPropertiesOf(reading.value),
          document: reading.value,
        }),
        raw: (reading) => reading.raw,
      },
      levelOf(args),
    ),
  );
}
