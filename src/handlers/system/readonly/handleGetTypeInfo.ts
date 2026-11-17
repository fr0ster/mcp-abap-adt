import * as z from 'zod';

/**
 * GetTypeInfo: every DDIC kind a type name is (#321).
 *
 * One name can be several kinds — MANDT is a data element and a domain — so
 * the name is read as each: a data element, a domain, a structure (unless
 * switched off) and a table type, each through its adt-clients member (#235),
 * and the call answers every kind that exists, in alphabetical order of kind.
 * Measured on premise (2026-10-24): each read answers `404` for a kind the name is
 * not, and `200` with its own document for one it is (`blue:wbobj` /
 * `dtel:dataElement`, `doma:domain`, `blue:blueSource`, `ttyp:tableType`), so
 * nothing is tried in an order and nothing is guessed.
 *
 * A `404` (or an empty answer) is the kind's absence; any other refusal is the
 * call's answer, with the read as its step, and so is a document the read
 * cannot recognise. A name no read finds is the call's error.
 */

import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces-adt';
import { XMLParser } from 'fast-xml-parser';
import {
  answerCaught,
  answerFailure,
  type JsonAnswer,
  type McpResult,
} from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import { objectsListCache } from '../../../lib/getObjectsListCache';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { type JsonValue, jsonFields } from '../../../lib/json';
import {
  readDataElementMetadata,
  readDomainMetadata,
  readStructureMetadata,
  readTableTypeMetadata,
} from '../../../lib/strategies/metadataReads';
import type { AdtReading } from '../../../lib/strategies/reading';
import { withStep } from '../../../lib/strategies/step';
import { return_error } from '../../../lib/utils';
import { parseXml } from '../../../lib/xml/node';
import {
  child,
  childAt,
  listOf,
  type XmlList,
  type XmlNode,
  type XmlRead,
} from '../../../lib/xml/tree';

export const TOOL_DEFINITION = {
  name: 'GetTypeInfo',
  available_in: ['onprem', 'cloud'] as const,
  description:
    "[read-only] Retrieve ABAP type information for a DDIC type name: data elements (DTEL), domains (DOMA), structures and table types. One name can be more than one type (MANDT is a data element and a domain): the answer lists every type the name is, in alphabetical order of type, each with its definition — data type, length and decimals, field labels, a domain's output format, value table and fixed values, a table type's row type and key. Each type is read from the working area: its inactive version where one exists.",
  inputSchema: z.object({
    type_name: z.string().describe('Name of the ABAP type'),
    include_structure_fallback: z
      .boolean()
      .default(true)
      .optional()
      .describe(
        'When true (default), the name is also read as a DDIC structure; false leaves the structure read out.',
      ),
  }),
} as const;

/** The kinds a name is read as, in the order they are answered. */
type Kind = 'data_element' | 'domain' | 'structure' | 'table_type';

// Values as written: a fixed value's bounds may be blank or carry spaces that
// are the value, so nothing is trimmed here; metadata is trimmed where read.
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: false,
  isArray: (name) => name === 'doma:fixValue',
});

/** A DDIC number as it is written (`000003`), as a number; absent stays absent. */
function numberOf(value: XmlRead): number | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/** A text element's value, trimmed; an empty element (`<x/>`) is absent. */
function textOf(value: XmlRead): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

/**
 * A fixed value's bound as written: an empty element is the blank value
 * (`''`), spaces are kept; only an element that is not there is absent.
 */
function boundOf(value: XmlRead): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** The attributes every ADT object document carries. */
function objectFacts(root: XmlRead) {
  return {
    name: textOf(child(root, 'adtcore:name')),
    description: textOf(child(root, 'adtcore:description')),
    package: textOf(childAt(root, 'adtcore:packageRef', 'adtcore:name')),
  };
}

/** The document `xml` parses to, read from outside the type system. */
function documentOf(xml: string): XmlRead {
  return parseXml(parser, xml);
}

function parseDataElement(xml: string) {
  const root = child(documentOf(xml), 'blue:wbobj');
  const dtel = child(root, 'dtel:dataElement');
  if (!dtel) return undefined;
  return jsonFields({
    objectType: 'data_element',
    ...objectFacts(root),
    typeKind: textOf(child(dtel, 'dtel:typeKind')),
    domain: textOf(child(dtel, 'dtel:typeName')),
    dataType: textOf(child(dtel, 'dtel:dataType')),
    length: numberOf(child(dtel, 'dtel:dataTypeLength')),
    decimals: numberOf(child(dtel, 'dtel:dataTypeDecimals')),
    labels: jsonFields({
      short: textOf(child(dtel, 'dtel:shortFieldLabel')),
      medium: textOf(child(dtel, 'dtel:mediumFieldLabel')),
      long: textOf(child(dtel, 'dtel:longFieldLabel')),
      heading: textOf(child(dtel, 'dtel:headingFieldLabel')),
    }),
  });
}

function parseDomain(xml: string) {
  const root = child(documentOf(xml), 'doma:domain');
  const content = child(root, 'doma:content');
  if (!content) return undefined;
  const type = child(content, 'doma:typeInformation');
  const output = child(content, 'doma:outputInformation');
  const values = child(content, 'doma:valueInformation');
  const fixed = listOf(childAt(values, 'doma:fixValues', 'doma:fixValue'));
  return jsonFields({
    objectType: 'domain',
    ...objectFacts(root),
    dataType: textOf(child(type, 'doma:datatype')),
    length: numberOf(child(type, 'doma:length')),
    decimals: numberOf(child(type, 'doma:decimals')),
    output: jsonFields({
      length: numberOf(child(output, 'doma:length')),
      conversionExit: textOf(child(output, 'doma:conversionExit')),
      lowercase: child(output, 'doma:lowercase') === 'true',
      signExists: child(output, 'doma:signExists') === 'true',
    }),
    valueTable: textOf(childAt(values, 'doma:valueTableRef', 'adtcore:name')),
    fixedValues: fixed.map((entry) =>
      jsonFields({
        low: boundOf(child(entry, 'doma:low')),
        high: boundOf(child(entry, 'doma:high')),
        text: textOf(child(entry, 'doma:text')),
      }),
    ),
  });
}

function parseStructure(xml: string) {
  const root = child(documentOf(xml), 'blue:blueSource');
  if (!root) return undefined;
  return jsonFields({ objectType: 'structure', ...objectFacts(root) });
}

function parseTableType(xml: string) {
  const root = child(documentOf(xml), 'ttyp:tableType');
  if (!root) return undefined;
  const row = child(root, 'ttyp:rowType');
  const builtIn = child(row, 'ttyp:builtInType');
  const key = child(root, 'ttyp:primaryKey');
  return jsonFields({
    objectType: 'table_type',
    ...objectFacts(root),
    rowType: jsonFields({
      typeKind: textOf(child(row, 'ttyp:typeKind')),
      typeName: textOf(child(row, 'ttyp:typeName')),
      dataType: textOf(child(builtIn, 'ttyp:dataType')),
      length: numberOf(child(builtIn, 'ttyp:length')),
      decimals: numberOf(child(builtIn, 'ttyp:decimals')),
    }),
    accessType: textOf(child(root, 'ttyp:accessType')),
    primaryKey: jsonFields({
      definition: textOf(child(key, 'ttyp:definition')),
      kind: textOf(child(key, 'ttyp:kind')),
    }),
  });
}

/** Whether a refusal is SAP's `404`: the name is not of this kind. */
function isNotFound(error: IAdtError): boolean {
  return error.response?.status === 404;
}

type Lookup = {
  kind: Kind;
  step: string;
  /** The root element of the kind's document, named in a refusal to read one. */
  document: string;
  read: () => Promise<IAdtResponse<AdtReading<XmlRead>, IAdtError>>;
  parse: (xml: string) => JsonValue | undefined;
};

type LookupResult =
  | { status: 'found'; payload: JsonValue }
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
  const raw = answered.getResult().value.raw;
  if (typeof raw !== 'string' || raw.trim() === '') return { status: 'absent' };
  // A document we cannot read is our failure, not SAP's answer, and never the
  // kind's absence: the call ends naming the read.
  const payload = lookup.parse(raw);
  if (payload === undefined) {
    throw new Error(
      `${lookup.step}: the system answered a document that is not a ${lookup.document} document`,
    );
  }
  return { status: 'found', payload };
}

export async function handleGetTypeInfo(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
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
        document: 'blue:wbobj (dtel:dataElement)',
        read: () =>
          readDataElementMetadata(
            client,
            { dataElementName: typeName },
            'workingArea',
          ),
        parse: parseDataElement,
      },
      {
        kind: 'domain',
        step: 'read domain',
        document: 'doma:domain',
        read: () =>
          readDomainMetadata(client, { domainName: typeName }, 'workingArea'),
        parse: parseDomain,
      },
      ...(includeStructure
        ? [
            {
              kind: 'structure' as const,
              step: 'read structure',
              document: 'blue:blueSource',
              read: () =>
                readStructureMetadata(
                  client,
                  { structureName: typeName },
                  'workingArea',
                ),
              parse: parseStructure,
            },
          ]
        : []),
      {
        kind: 'table_type',
        step: 'read table type',
        document: 'ttyp:tableType',
        read: () =>
          readTableTypeMetadata(
            client,
            { tableTypeName: typeName },
            'workingArea',
          ),
        parse: parseTableType,
      },
    ];

    // One after another: the session's requests are sequential.
    const types: JsonValue[] = [];
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

    const mcpResult: JsonAnswer = {
      isError: false,
      content: [{ type: 'json', json: { name: typeName, types } }],
    };
    objectsListCache.setCache(mcpResult);
    return mcpResult;
  } catch (error) {
    logger?.error(`Failed to resolve type info for ${args.type_name}`, error);
    // Not a read's refusal (each answers its own): ours.
    return answerCaught(error, { tool: 'GetTypeInfo', detail: 'terse' });
  }
}
