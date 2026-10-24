/**
 * GetTypeInfo: every DDIC kind a type name is (#321).
 *
 * One name can be several kinds — MANDT is a data element and a domain — so
 * the name is read as each: a data element, a domain, a structure (unless
 * switched off) and a table type, each through its adt-clients member (#235),
 * and the call answers every kind that exists, in alphabetical order of kind.
 * Measured on E19 (2026-10-24): each read answers `404` for a kind the name is
 * not, and `200` with its own document for one it is (`blue:wbobj` /
 * `dtel:dataElement`, `doma:domain`, `blue:blueSource`, `ttyp:tableType`), so
 * nothing is tried in an order and nothing is guessed.
 *
 * A `404` (or an empty answer) is the kind's absence; any other refusal is the
 * call's answer, with the read as its step. A name no read finds is the call's
 * error.
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
  readDomainMetadata,
  readStructureMetadata,
} from '../../../lib/strategies/metadataReads';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { withStep } from '../../../lib/strategies/step';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetTypeInfo',
  available_in: ['onprem', 'cloud'] as const,
  description:
    "[read-only] Retrieve ABAP type information for a DDIC type name: data elements (DTEL), domains (DOMA), structures and table types. One name can be more than one type (MANDT is a data element and a domain): the answer lists every type the name is, in alphabetical order of type, each with its definition — data type, length and decimals, field labels, a domain's output format, value table and fixed values, a table type's row type and key.",
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
          'When true (default), the name is also read as a DDIC structure; false leaves the structure read out.',
        default: true,
      },
    },
    required: ['type_name'],
  },
} as const;

/** The kinds a name is read as, in the order they are answered. */
type Kind = 'data_element' | 'domain' | 'structure' | 'table_type';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
  isArray: (name) => name === 'doma:fixValue',
});

/** A DDIC number as it is written (`000003`), as a number; absent stays absent. */
function numberOf(value: unknown): number | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/** A text element's value; an empty element (`<x/>`) is absent. */
function textOf(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/** The attributes every ADT object document carries. */
function objectFacts(root: Record<string, any>) {
  return {
    name: textOf(root['adtcore:name']),
    description: textOf(root['adtcore:description']),
    package: textOf(root['adtcore:packageRef']?.['adtcore:name']),
  };
}

function parseDataElement(xml: string) {
  const root = parser.parse(xml)['blue:wbobj'];
  const dtel = root?.['dtel:dataElement'];
  if (!dtel) return undefined;
  return {
    objectType: 'data_element' as const,
    ...objectFacts(root),
    typeKind: textOf(dtel['dtel:typeKind']),
    domain: textOf(dtel['dtel:typeName']),
    dataType: textOf(dtel['dtel:dataType']),
    length: numberOf(dtel['dtel:dataTypeLength']),
    decimals: numberOf(dtel['dtel:dataTypeDecimals']),
    labels: {
      short: textOf(dtel['dtel:shortFieldLabel']),
      medium: textOf(dtel['dtel:mediumFieldLabel']),
      long: textOf(dtel['dtel:longFieldLabel']),
      heading: textOf(dtel['dtel:headingFieldLabel']),
    },
  };
}

function parseDomain(xml: string) {
  const root = parser.parse(xml)['doma:domain'];
  const content = root?.['doma:content'];
  if (!content) return undefined;
  const type = content['doma:typeInformation'] ?? {};
  const output = content['doma:outputInformation'] ?? {};
  const values = content['doma:valueInformation'] ?? {};
  const fixed: any[] = values['doma:fixValues']?.['doma:fixValue'] ?? [];
  return {
    objectType: 'domain' as const,
    ...objectFacts(root),
    dataType: textOf(type['doma:datatype']),
    length: numberOf(type['doma:length']),
    decimals: numberOf(type['doma:decimals']),
    output: {
      length: numberOf(output['doma:length']),
      conversionExit: textOf(output['doma:conversionExit']),
      lowercase: output['doma:lowercase'] === 'true',
      signExists: output['doma:signExists'] === 'true',
    },
    valueTable: textOf(values['doma:valueTableRef']?.['adtcore:name']),
    fixedValues: fixed.map((entry) => ({
      low: textOf(entry['doma:low']),
      high: textOf(entry['doma:high']),
      text: textOf(entry['doma:text']),
    })),
  };
}

function parseStructure(xml: string) {
  const root = parser.parse(xml)['blue:blueSource'];
  if (!root) return undefined;
  return { objectType: 'structure' as const, ...objectFacts(root) };
}

function parseTableType(xml: string) {
  const root = parser.parse(xml)['ttyp:tableType'];
  if (!root) return undefined;
  const row = root['ttyp:rowType'] ?? {};
  const builtIn = row['ttyp:builtInType'] ?? {};
  const key = root['ttyp:primaryKey'] ?? {};
  return {
    objectType: 'table_type' as const,
    ...objectFacts(root),
    rowType: {
      typeKind: textOf(row['ttyp:typeKind']),
      typeName: textOf(row['ttyp:typeName']),
      dataType: textOf(builtIn['ttyp:dataType']),
      length: numberOf(builtIn['ttyp:length']),
      decimals: numberOf(builtIn['ttyp:decimals']),
    },
    accessType: textOf(root['ttyp:accessType']),
    primaryKey: {
      definition: textOf(key['ttyp:definition']),
      kind: textOf(key['ttyp:kind']),
    },
  };
}

/** Whether a refusal is SAP's `404`: the name is not of this kind. */
function isNotFound(error: IAdtError): boolean {
  return (error.response as { status?: unknown } | undefined)?.status === 404;
}

type Lookup = {
  kind: Kind;
  step: string;
  read: () => Promise<IAdtResponse<unknown, IAdtError>>;
  parse: (xml: string) => object | undefined;
};

type LookupResult =
  | { status: 'found'; payload: object }
  | { status: 'absent' }
  /** SAP refused the read (not a 404): the call's answer. */
  | { status: 'failed'; answer: McpResult };

/**
 * One read, through its member. A credential refusal the connection raised
 * rejects from the member as it came and ends the call (the handler's catch).
 */
async function lookUp(lookup: Lookup): Promise<LookupResult> {
  const answered = await lookup.read();
  if (!answered.ok) {
    const failed = answered.getError();
    if (isNotFound(failed)) return { status: 'absent' };
    return {
      status: 'failed',
      answer: answerFailure(withStep(failed, lookup.step)),
    };
  }
  const raw = (answered.getResult().value as AdtReading<unknown>).raw;
  if (typeof raw !== 'string' || raw.trim() === '') return { status: 'absent' };
  // A document we cannot read is our failure, not SAP's answer.
  const payload = lookup.parse(raw);
  return payload === undefined
    ? { status: 'absent' }
    : { status: 'found', payload };
}

export async function handleGetTypeInfo(context: HandlerContext, args: any) {
  const { connection, logger } = context;
  if (!args?.type_name) {
    return return_error('Type name is required');
  }
  const includeStructure = args.include_structure_fallback !== false;

  try {
    const typeName: string = args.type_name;
    const client = createAdtClient(connection, logger);

    // In alphabetical order of kind: the order the answer lists them in.
    const lookups: Lookup[] = [
      {
        kind: 'data_element',
        step: 'read data element',
        read: () =>
          readDataElementMetadata(client, { dataElementName: typeName }),
        parse: parseDataElement,
      },
      {
        kind: 'domain',
        step: 'read domain',
        read: () => readDomainMetadata(client, { domainName: typeName }),
        parse: parseDomain,
      },
      ...(includeStructure
        ? [
            {
              kind: 'structure' as const,
              step: 'read structure',
              read: () =>
                readStructureMetadata(client, { structureName: typeName }),
              parse: parseStructure,
            },
          ]
        : []),
      {
        kind: 'table_type',
        step: 'read table type',
        read: () =>
          client
            .getTableType(resultsFor(tableTypeDocuments))
            .readMetadata(
              { tableTypeName: typeName },
              { analyse: analyseException },
            ),
        parse: parseTableType,
      },
    ];

    // One after another: the session's requests are sequential.
    const types: object[] = [];
    for (const lookup of lookups) {
      logger?.debug(`Reading ${typeName} as ${lookup.kind}`);
      const result = await lookUp(lookup);
      if (result.status === 'failed') return result.answer;
      if (result.status === 'found') types.push(result.payload);
    }

    if (types.length === 0) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Type ${typeName} was not found as data element, domain${includeStructure ? ', structure' : ''} or table type.`,
          },
        ],
      };
    }

    const mcpResult = {
      isError: false,
      content: [{ type: 'json', json: { name: typeName, types } }],
    };
    objectsListCache.setCache(mcpResult);
    return mcpResult;
  } catch (error) {
    logger?.error(
      `Failed to resolve type info for ${args.type_name}`,
      error as any,
    );
    // Not a read's refusal (each answers its own): ours.
    return answerCaught(error, { tool: 'GetTypeInfo', detail: 'terse' });
  }
}
