/**
 * GetTypeInfo: what a DDIC type name is, tried in order — a data element, a
 * table type, the repository's object properties of a domain, and, unless
 * switched off, a structure. Each lookup is an adt-clients member (#235); a
 * `404` or an empty answer moves on to the next, any other refusal is the
 * call's answer.
 *
 * A domain is found through its object properties, as before #235. The
 * lookup that came first, `/ddic/domains/{name}/source/main`, answered `404`
 * for every domain (measured on E19, 2026-10-24), so it never found one; the
 * domain's metadata does answer, but nothing here reads a `doma:domain`
 * document yet, and a name that is a domain and a data element (MANDT) would
 * then answer an unread domain instead of the data element.
 */

import { tableTypeDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces-adt';
import { XMLParser } from 'fast-xml-parser';
import {
  answerCaught,
  answerFailure,
  type McpResult,
} from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import { objectsListCache } from '../../../lib/getObjectsListCache';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  readDataElementMetadata,
  readStructureMetadata,
} from '../../../lib/strategies/metadataReads';
import type { AdtReading } from '../../../lib/strategies/reading';
import { ourUtils, resultsFor } from '../../../lib/strategies/resultSets';
import { withStep } from '../../../lib/strategies/step';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetTypeInfo',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Retrieve ABAP type information for domains (DOMA), data elements (DTEL), table types, and structures. Returns field definitions, value ranges, fixed values, and DDIC metadata.',
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

/** Whether a refusal is SAP's `404`: the name is not of this kind. */
function isNotFound(error: IAdtError): boolean {
  return (error.response as { status?: unknown } | undefined)?.status === 404;
}

type LookupResult =
  | { status: 'ok'; payload: any }
  | { status: 'not_found_or_empty' }
  /** SAP refused the lookup (not a 404): the call's answer. */
  | { status: 'failed'; answer: McpResult };

/**
 * One lookup, through its member. A credential refusal the connection raised
 * rejects from the member as it came and ends the call (the handler's catch).
 */
async function tryLookup(
  read: () => Promise<IAdtResponse<unknown, IAdtError>>,
  parseFn: (xml: string) => any,
  step: string,
): Promise<LookupResult> {
  const answered = await read();
  if (!answered.ok) {
    const failed = answered.getError();
    if (isNotFound(failed)) return { status: 'not_found_or_empty' };
    // SAP's refusal as the member answered it, with the lookup as its step.
    return { status: 'failed', answer: answerFailure(withStep(failed, step)) };
  }
  const raw = (answered.getResult().value as AdtReading<unknown>).raw;
  if (!hasUsableResult(raw)) {
    return { status: 'not_found_or_empty' };
  }

  // A document we cannot read is our failure, not SAP's answer.
  const payload = parseFn(raw);
  if (!hasUsableResult(payload)) {
    return { status: 'not_found_or_empty' };
  }

  return { status: 'ok', payload };
}

export async function handleGetTypeInfo(context: HandlerContext, args: any) {
  const { connection, logger } = context;
  const includeStructureFallback = args?.include_structure_fallback !== false;
  try {
    if (!args?.type_name) {
      return return_error('Type name is required');
    }
  } catch (error) {
    logger?.error('Invalid parameters for GetTypeInfo', error as any);
    return return_error(error);
  }

  try {
    const typeName = args.type_name;
    const client = createAdtClient(connection, logger);

    const lookups: Array<{
      label: string;
      step: string;
      read: () => Promise<IAdtResponse<unknown, IAdtError>>;
      parseFn: (xml: string) => any;
    }> = [
      {
        label: 'data element',
        step: 'read data element',
        read: () =>
          readDataElementMetadata(client, { dataElementName: typeName }),
        parseFn: parseTypeInfoXml,
      },
      {
        label: 'table type',
        step: 'read table type',
        read: () =>
          client
            .getTableType(resultsFor(tableTypeDocuments))
            .readMetadata(
              { tableTypeName: typeName },
              { analyse: analyseException },
            ),
        parseFn: parseTypeInfoXml,
      },
      {
        label: 'repository information system',
        step: 'read repository information',
        read: () =>
          client
            .getUtils(ourUtils)
            .getObjectProperties(
              `/sap/bc/adt/ddic/domains/${typeName.toLowerCase()}`,
              { analyse: analyseException },
            ),
        parseFn: parseTypeInfoXml,
      },
    ];

    for (const lookup of lookups) {
      logger?.debug(`Trying ${lookup.label} lookup for ${typeName}`);
      const result = await tryLookup(lookup.read, lookup.parseFn, lookup.step);
      if (result.status === 'failed') return result.answer;
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
        () => readStructureMetadata(client, { structureName: typeName }),
        parseStructureInfoXml,
        'read structure',
      );
      if (structureResult.status === 'failed') return structureResult.answer;
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
    // Not a request's failure (each lookup answers its own): ours.
    return answerCaught(error, { tool: 'GetTypeInfo', detail: 'terse' });
  }
}
