import { includeDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { XMLParser } from 'fast-xml-parser';
import * as z from 'zod';
import { answer } from '../../../lib/answer';
import { createOnPremAdtClient } from '../../../lib/clients';
import {
  answered,
  type DetailTable,
  entries,
  formatted,
  type ListDetailTable,
  rawLevel,
  readingAt,
  rows,
  writeJson,
  writeListing,
  written,
} from '../../../lib/detail';
import { requiredText } from '../../../lib/handlers/argumentRules';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  DETAIL_SHAPE,
  detailOf,
  levelOf,
} from '../../../lib/strategies/detail';
import { rawOf } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { parseXml } from '../../../lib/xml/node';
import { child, isElement, listOf } from '../../../lib/xml/tree';

export const TOOL_DEFINITION = {
  name: 'GetMainPrograms',
  available_in: ['onprem'] as const,
  description:
    '[read-only] Reads the main programs of the ABAP include named by include_name in one request: each program that includes it, or for an include of a function group the group. Returns the type and name of each main program (PROG/P for a program, FUGR/F for a function group): by default as TSV rows; with detail full, main_programs, a list of { name, type, uri }.',
  inputSchema: z.object({
    include_name: requiredText('Include name is required').describe(
      'Include name.',
    ),
    ...DETAIL_SHAPE,
  }),
} as const;

type GetMainProgramsArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

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
 * The references of SAP's `adtcore:objectReferences` document (typed at the
 * parse): one entry per `adtcore:objectReference` that
 * carries a name, a type and a uri; none for an empty document.
 */
export function mainProgramsOf(document: string): MainProgram[] {
  const parsed = parseXml(parser, document);
  const root = child(parsed, 'adtcore:objectReferences');
  if (!isElement(root)) return [];
  const each = listOf(child(root, 'adtcore:objectReference'));
  const programs: MainProgram[] = [];
  for (const reference of each) {
    if (!isElement(reference)) continue;
    const name = reference['@_adtcore:name'];
    const type = reference['@_adtcore:type'];
    const uri = reference['@_adtcore:uri'];
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

/**
 * What GetMainPrograms answers at each `detail`: the reading the answer is
 * read with, selected before the call (`src/lib/detail`) — terse a
 * `type\tname` row per main program under its include, medium every field
 * but the uri, full the answer before `detail`, raw the document.
 */
function mainProgramReadings(
  includeName: string,
): ListDetailTable<string | object> {
  const programsOf = (answer: Parameters<typeof rawOf>[0]) =>
    mainProgramsOf(rawOf(answer));
  // Every main program the reading held, written by the listing writers.
  return {
    terse: written(programsOf, (programs: MainProgram[]) =>
      writeListing({
        heads: [{ head: 'include', value: includeName }],
        reading: { programs },
        lists: {
          programs: rows('programs', {
            columns: [
              { name: 'type', cell: (program: MainProgram) => program.type },
              { name: 'name', cell: (program: MainProgram) => program.name },
            ],
            header: 'always',
          }),
        },
      }),
    ),
    medium: written(programsOf, (programs: MainProgram[]) =>
      writeJson(
        { include_name: includeName },
        { programs },
        {
          programs: entries(
            'programs',
            ({ uri: _uri, ...fields }: MainProgram) => fields,
            { as: 'main_programs' },
          ),
        },
      ),
    ),
    full: formatted(programsOf, (programs) => ({
      success: true,
      include_name: includeName,
      main_programs: programs,
    })),
    raw: rawLevel,
  };
}

export async function handleGetMainPrograms(
  context: HandlerContext,
  args: GetMainProgramsArgs,
) {
  const { connection, logger } = context;
  const { include_name } = args;
  const includeName = include_name.toUpperCase();
  logger?.info(`Fetching main programs of include: ${includeName}`);
  // One request; SAP's refusal is the method's error as it is.
  return answer(
    { tool: 'GetMainPrograms', detail: detailOf(args) },
    () =>
      createOnPremAdtClient(connection, logger)
        .getInclude({
          ...resultsFor(includeDocuments),
          mainPrograms: readingAt(
            mainProgramReadings(includeName),
            levelOf(args),
          ),
        })
        .readMainPrograms({ includeName }, { analyse: analyseException }),
    answered,
  );
}
