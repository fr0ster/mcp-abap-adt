// Handler for retrieving all valid ADT object types and validating a type

import { makeAdtRequestWithTimeout, logger as baseLogger } from '../../../lib/utils';
import { XMLParser } from 'fast-xml-parser';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';
import { AbapConnection } from '@mcp-abap-adt/connection';
import { HandlerContext } from '../../../lib/handlers/interfaces';
export const TOOL_DEFINITION = {
  name: "GetAdtTypes",
  description: "[read-only] Retrieve all valid ADT object types.",
  inputSchema: {
    type: "object",
    properties: {
      validate_type: {
        type: "string",
        description: "Type name to validate (optional)"
      }
    },
    required: []
  }
} as const;

function parseObjectTypesXml(xml: string) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    parseAttributeValue: true,
    trimValues: true
  });
  const result = parser.parse(xml);
  const types: { name: string; description: string; provider: string }[] = [];
  const objects = result['opr:objectTypes']?.['opr:objectType'];
  if (Array.isArray(objects)) {
    for (const obj of objects) {
      types.push({
        name: obj['name'],
        description: obj['text'],
        provider: obj['provider']
      });
    }
  } else if (objects) {
    types.push({
      name: objects['name'],
      description: objects['text'],
      provider: objects['provider']
    });
  }
  return types;
}

function extractNamedItems(xml: string) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    parseAttributeValue: true,
    trimValues: true
  });
  const result = parser.parse(xml);
  const items: Array<{ name: string; description: string }> = [];
  const namedItems = result['nameditem:namedItemList']?.['nameditem:namedItem'];
  if (Array.isArray(namedItems)) {
    for (const item of namedItems) {
      items.push({
        name: item['nameditem:name'],
        description: item['nameditem:description']
      });
    }
  } else if (namedItems) {
    items.push({
      name: namedItems['nameditem:name'],
      description: namedItems['nameditem:description']
    });
  }
  return items;
}

export async function handleGetAdtTypes(context: HandlerContext, args: any) {
  const { connection, logger } = context;
  const handlerLogger = getHandlerLogger(
    'handleGetAdtTypes',
    process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
  );
  try {
    const url = `/sap/bc/adt/repository/informationsystem/objecttypes?maxItemCount=999&name=*&data=usedByProvider`;
    const response = await makeAdtRequestWithTimeout(connection, url, 'GET', 'default');
    handlerLogger.info('Fetched ADT object types list');
    const items = extractNamedItems(response.data);
    return {
      isError: false,
      content: [
        {
          type: "text",
          text: JSON.stringify(items)
        }
      ]
    };
  } catch (error) {
    handlerLogger.error('Failed to fetch ADT object types', error as any);
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `ADT error: ${String(error)}`
        }
      ]
    };
  }
}
