import { includeDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { XMLParser } from 'fast-xml-parser';
import * as z from 'zod';
import { answer } from '../../../lib/answer';
import { createOnPremAdtClient } from '../../../lib/clients';
import { purpose, toolDescription } from '../../../lib/description';
import {
  about,
  answered,
  entries,
  formatted,
  headShape,
  type ListDetailTable,
  type RowSchemas,
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

/** The lists a main programs listing writes: what its description states. */
export const MAIN_PROGRAMS_LISTS: RowSchemas<{ programs: MainProgram[] }> = {
  programs: about(
    'for each main program',
    rows('programs', {
      columns: [
        {
          name: 'type',
          means: 'whether it is a program or a function group',
          cell: (program: MainProgram) => program.type,
        },
        {
          name: 'name',
          means: 'its name',
          cell: (program: MainProgram) => program.name,
        },
      ],
      header: 'always',
    }),
  ),
};

/** The head every main programs listing opens with. */
export const MAIN_PROGRAMS_HEADS = [headShape('include', "the include's name")];

export const TOOL_DEFINITION = {
  name: 'GetMainPrograms',
  available_in: ['onprem'] as const,
  description: toolDescription({
    tag: 'read-only',
    purpose: purpose(
      'Reads the main programs of an ABAP include: each program that includes it, or the function group it belongs to.',
    ),
  }),
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
        lists: MAIN_PROGRAMS_LISTS,
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
