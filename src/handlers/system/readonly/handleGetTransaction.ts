import { XMLParser } from 'fast-xml-parser';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
// import { createAdtClient } from '../../../lib/clients';
export const TOOL_DEFINITION = {
  name: 'GetTransaction',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Retrieve ABAP transaction (t-code) details — program, screen, authorization object, and transaction type (dialog, report, OO).',
  inputSchema: {
    type: 'object',
    properties: {
      transaction_name: {
        type: 'string',
        description: 'Name of the ABAP transaction',
      },
    },
    required: ['transaction_name'],
  },
} as const;

function _parseTransactionXml(xml: string) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    parseAttributeValue: true,
    trimValues: true,
  });
  const result = parser.parse(xml);

  // ADT Transaction XML (opr:objectProperties)
  if (result['opr:objectProperties']?.['opr:object']) {
    const obj = result['opr:objectProperties']['opr:object'];
    return {
      name: obj.name,
      objectType: 'transaction',
      description: obj.text,
      package: obj.package,
      type: obj.type,
    };
  }

  // fallback: return raw
  return { raw: result };
}

export async function handleGetTransaction(
  context: HandlerContext,
  _args: any,
) {
  const { connection, logger } = context;
  return {
    isError: false,
    content: [{ type: 'json', json: { message: 'Not implemented' } }],
  };
}
