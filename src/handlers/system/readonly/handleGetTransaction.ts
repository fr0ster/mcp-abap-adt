import { analyseObjectProperties } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import type { AnswerDetail } from '../../../lib/strategies/projections';
import type { AdtReading } from '../../../lib/strategies/reading';
import { ourUtils } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetTransaction',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Reads the properties of the ABAP transaction (t-code) named by transaction_name in one request. Answers the transaction under `object` (name, text, type, package) and its facets under `properties`, in the order the system gives them — the application component chain, the package chain, type, owner, language, creation and the others the system names — each entry with its facet, name, displayName and text.',
  inputSchema: {
    type: 'object',
    properties: {
      transaction_name: {
        type: 'string',
        description: 'Name of the ABAP transaction',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['transaction_name'],
  },
} as const;

/** The workbench uri ADT knows a transaction by. */
export function transactionUri(name: string): string {
  return `/sap/bc/adt/vit/wb/object_type/trant/object_name/${encodeURIComponent(name)}`;
}

const asArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : value === undefined ? [] : [value];

/** An element's attributes as SAP sent them, values as text. */
const attributesOf = (element: unknown): Record<string, string> => {
  const group = (element as { '@'?: unknown } | null | undefined)?.['@'];
  if (group === null || typeof group !== 'object') return {};
  return Object.fromEntries(
    Object.entries(group as Record<string, unknown>).map(([k, v]) => [
      k,
      String(v),
    ]),
  );
};

/**
 * `opr:objectProperties` (measured on premise, BASIS 816, 2026-10-21):
 * one `opr:object` — `text`, `name`, `package`, `type`, `expandable` as
 * attributes — and its facets as `opr:property` elements (`facet`, `name`,
 * `displayName`, and where given `text`, `hasChildrenOfSameFacet`): the
 * application component chain (`APPL`), the package chain (`PACKAGE`), then
 * type, owner, language, creation and the rest. Every attribute is answered
 * as SAP sent it.
 */
export function transactionPropertiesOf(value: unknown): {
  object: Record<string, string> | undefined;
  properties: Record<string, string>[];
} {
  const root = (value as Record<string, unknown> | null | undefined)?.[
    'opr:objectProperties'
  ] as Record<string, unknown> | undefined;
  const object = asArray(root?.['opr:object'])[0];
  return {
    object: object === undefined ? undefined : attributesOf(object),
    properties: asArray(root?.['opr:property']).map(attributesOf),
  };
}

export async function handleGetTransaction(
  context: HandlerContext,
  args: { transaction_name: string; detail?: AnswerDetail },
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
    (reading: AdtReading<unknown>) => {
      if (detail === 'raw') return reading.raw;
      const answered = {
        success: true,
        transaction_name: name,
        ...transactionPropertiesOf(reading.value),
      };
      // `full` adds the document's own parse, so nothing it carries is lost.
      return detail === 'full'
        ? { ...answered, document: reading.value }
        : answered;
    },
  );
}
