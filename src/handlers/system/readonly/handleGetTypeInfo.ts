/**
 * @TODO Migrate to infrastructure module
 * Endpoints: Multiple fallback chain:
 * - /sap/bc/adt/ddic/domains/{name}/source/main
 * - /sap/bc/adt/ddic/dataelements/{name}
 * - /sap/bc/adt/ddic/tabletypes/{name}
 * - /sap/bc/adt/repository/informationsystem/objectproperties/values
 * This handler uses makeAdtRequestWithTimeout directly and should be moved to adt-clients infrastructure module
 */

import { XMLParser } from 'fast-xml-parser';
import { objectsListCache } from '../../../lib/getObjectsListCache';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  ErrorCode,
  encodeSapObjectName,
  McpError,
  makeAdtRequestWithTimeout,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetTypeInfo',
  description: '[read-only] Retrieve ABAP type information.',
  inputSchema: {
    type: 'object',
    properties: {
      type_name: {
        type: 'string',
        description: 'Name of the ABAP type',
      },
      include_structure_fallback: {
        type: 'boolean',
        description:
          'When true (default), tries DDIC structure lookup only if type lookup returns 404/empty.',
        default: true,
      },
    },
    required: ['type_name'],
  },
} as const;

function parseTypeInfoXml(xml: string) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    parseAttributeValue: true,
    trimValues: true,
  });
  const result = parser.parse(xml);

  // Data Element (DTEL/DE)
  if (result['blue:wbobj']?.['dtel:dataElement']) {
    const wb = result['blue:wbobj'];
    const dtel = wb['dtel:dataElement'];
    return {
      name: wb['adtcore:name'],
      objectType: 'data_element',
      description: wb['adtcore:description'],
      dataType: dtel['dtel:dataType'],
      length: parseInt(dtel['dtel:dataTypeLength'], 10),
      decimals: parseInt(dtel['dtel:dataTypeDecimals'], 10),
      domain: dtel['dtel:typeName'],
      package: wb['adtcore:packageRef']?.['adtcore:name'] || null,
      labels: {
        short: dtel['dtel:shortFieldLabel'],
        medium: dtel['dtel:mediumFieldLabel'],
        long: dtel['dtel:longFieldLabel'],
        heading: dtel['dtel:headingFieldLabel'],
      },
    };
  }

  // Domain (DOMA/DD) via repository informationsystem
  if (result['opr:objectProperties']?.['opr:object']) {
    const obj = result['opr:objectProperties']['opr:object'];
    return {
      name: obj.name,
      objectType: 'domain',
      description: obj.text,
      package: obj.package,
      type: obj.type,
    };
  }

  // Table Type (not implemented, fallback)
  return { raw: result };
}

function parseStructureInfoXml(xml: string) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    parseAttributeValue: true,
    trimValues: true,
  });
  const result = parser.parse(xml);
  const wb = result['blue:wbobj'] || {};

  return {
    name: wb['adtcore:name'] || null,
    objectType: 'structure',
    description: wb['adtcore:description'] || null,
    package: wb['adtcore:packageRef']?.['adtcore:name'] || null,
    resolved_as: 'structure_fallback',
    raw: result,
  };
}

function hasUsableResult(value: any): boolean {
  if (value == null) {
    return false;
  }
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === 'object') {
    if ('raw' in value) {
      const raw = (value as any).raw;
      return !!raw && typeof raw === 'object' && Object.keys(raw).length > 0;
    }
    return Object.keys(value).length > 0;
  }
  return true;
}

function isNotFoundError(error: any): boolean {
  return error?.response?.status === 404;
}

type LookupResult =
  | { status: 'ok'; payload: any }
  | { status: 'not_found_or_empty' };

async function tryLookup(
  connection: any,
  url: string,
  parseFn: (xml: string) => any,
): Promise<LookupResult> {
  try {
    const response = await makeAdtRequestWithTimeout(
      connection,
      url,
      'GET',
      'default',
    );
    if (!hasUsableResult(response?.data)) {
      return { status: 'not_found_or_empty' };
    }

    const payload = parseFn(response.data);
    if (!hasUsableResult(payload)) {
      return { status: 'not_found_or_empty' };
    }

    return { status: 'ok', payload };
  } catch (error: any) {
    if (isNotFoundError(error)) {
      return { status: 'not_found_or_empty' };
    }
    throw error;
  }
}

export async function handleGetTypeInfo(context: HandlerContext, args: any) {
  const { connection, logger } = context;
  const includeStructureFallback = args?.include_structure_fallback !== false;
  try {
    if (!args?.type_name) {
      throw new McpError(ErrorCode.InvalidParams, 'Type name is required');
    }
  } catch (error) {
    logger?.error('Invalid parameters for GetTypeInfo', error as any);
    // MCP-compliant error response: always return content[] with type "text"
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `ADT error: ${String(error)}`,
        },
      ],
    };
  }

  try {
    const typeName = args.type_name;
    const encodedTypeName = encodeSapObjectName(typeName);
    const uri = encodeURIComponent(
      `/sap/bc/adt/ddic/domains/${typeName.toLowerCase()}`,
    );

    const lookups: Array<{
      label: string;
      url: string;
      parseFn: (xml: string) => any;
    }> = [
      {
        label: 'domain',
        url: `/sap/bc/adt/ddic/domains/${encodedTypeName}/source/main`,
        parseFn: parseTypeInfoXml,
      },
      {
        label: 'data element',
        url: `/sap/bc/adt/ddic/dataelements/${encodedTypeName}`,
        parseFn: parseTypeInfoXml,
      },
      {
        label: 'table type',
        url: `/sap/bc/adt/ddic/tabletypes/${encodedTypeName}`,
        parseFn: parseTypeInfoXml,
      },
      {
        label: 'repository information system',
        url: `/sap/bc/adt/repository/informationsystem/objectproperties/values?uri=${uri}`,
        parseFn: parseTypeInfoXml,
      },
    ];

    for (const lookup of lookups) {
      logger?.debug(`Trying ${lookup.label} lookup for ${typeName}`);
      const result = await tryLookup(connection, lookup.url, lookup.parseFn);
      if (result.status === 'ok') {
        const mcpResult = {
          isError: false,
          content: [{ type: 'json', json: result.payload }],
        };
        objectsListCache.setCache(mcpResult);
        return mcpResult;
      }
    }

    if (includeStructureFallback) {
      logger?.debug(
        `Type lookups returned 404/empty for ${typeName}, trying structure fallback`,
      );
      const structureResult = await tryLookup(
        connection,
        `/sap/bc/adt/ddic/structures/${encodedTypeName}`,
        parseStructureInfoXml,
      );
      if (structureResult.status === 'ok') {
        const mcpResult = {
          isError: false,
          content: [{ type: 'json', json: structureResult.payload }],
        };
        objectsListCache.setCache(mcpResult);
        return mcpResult;
      }
    }

    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Type ${typeName} was not found as domain, data element, table type, or structure.`,
        },
      ],
    };
  } catch (error) {
    logger?.error(
      `Failed to resolve type info for ${args.type_name}`,
      error as any,
    );
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `ADT error: ${String(error)}`,
        },
      ],
    };
  }
}
