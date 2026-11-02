import { includeDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { XMLParser } from 'fast-xml-parser';
import { answer } from '../../../lib/answer';
import { createOnPremAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetMainPrograms',
  available_in: ['onprem'] as const,
  description:
    '[read-only] Reads the main programs of the ABAP include named by include_name in one request: each program that includes it, or for an include of a function group the group. Returns main_programs, a list of { name, type, uri } — type PROG/P for a program, FUGR/F for a function group.',
  inputSchema: {
    type: 'object',
    properties: {
      include_name: {
        type: 'string',
        description: 'Include name.',
      },
    },
    required: ['include_name'],
  },
} as const;

interface GetMainProgramsArgs {
  /** Required by the schema; a call from outside it may leave it out. */
  include_name?: string;
}

/** One main program, as SAP's object reference names it. */
export interface MainProgram {
  name: string;
  type: string;
  uri: string;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
});

/**
 * The references of SAP's `adtcore:objectReferences` document (data from
 * outside the type system): one entry per `adtcore:objectReference` that
 * carries a name, a type and a uri; none for an empty document.
 */
export function mainProgramsOf(document: string): MainProgram[] {
  const parsed: unknown = parser.parse(document);
  if (typeof parsed !== 'object' || parsed === null) return [];
  const root: unknown = Reflect.get(parsed, 'adtcore:objectReferences');
  if (typeof root !== 'object' || root === null) return [];
  const listed: unknown = Reflect.get(root, 'adtcore:objectReference');
  const each: unknown[] = Array.isArray(listed)
    ? listed
    : listed === undefined
      ? []
      : [listed];
  const programs: MainProgram[] = [];
  for (const reference of each) {
    if (typeof reference !== 'object' || reference === null) continue;
    const name: unknown = Reflect.get(reference, '@_adtcore:name');
    const type: unknown = Reflect.get(reference, '@_adtcore:type');
    const uri: unknown = Reflect.get(reference, '@_adtcore:uri');
    if (
      typeof name === 'string' &&
      typeof type === 'string' &&
      typeof uri === 'string'
    ) {
      programs.push({ name, type, uri });
    }
  }
  return programs;
}

export async function handleGetMainPrograms(
  context: HandlerContext,
  args: GetMainProgramsArgs,
) {
  const { connection, logger } = context;
  const { include_name } = args;
  if (!include_name) return return_error('Include name is required');
  const includeName = include_name.toUpperCase();
  logger?.info(`Fetching main programs of include: ${includeName}`);
  // One request; SAP's refusal is the method's error as it is.
  return answer(
    { tool: 'GetMainPrograms', detail: 'terse' },
    () =>
      createOnPremAdtClient(connection, logger)
        .getInclude(resultsFor(includeDocuments))
        .readMainPrograms({ includeName }, { analyse: analyseException }),
    (programs: AdtReading<string>) => ({
      success: true,
      include_name: includeName,
      main_programs: mainProgramsOf(programs.raw),
    }),
  );
}
