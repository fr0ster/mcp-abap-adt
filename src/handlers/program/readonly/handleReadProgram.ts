import { programDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { pair } from '../../../lib/strategies/sequence';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ReadProgram',
  available_in: ['onprem', 'legacy'] as const,
  description:
    '[read-only] Read a MAIN ABAP program (report) source code and metadata by name. Works ONLY for main programs (adtcore type PROG/P); NOT for includes — use GetInclude for include source. Include names (PROG/I) and other object types are rejected with error "invalid_object_type". Answers: "show program code", "display report source", "view program X", "get program source". Returns source code, package, responsible, description.',
  inputSchema: {
    type: 'object',
    properties: {
      program_name: {
        type: 'string',
        description: 'Program name (e.g., Z_MY_PROGRAM).',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description: 'Version to read: "active" (default) or "inactive".',
        default: 'active',
      },
    },
    required: ['program_name'],
  },
} as const;

export async function handleReadProgram(
  context: HandlerContext,
  args: { program_name: string; version?: 'active' | 'inactive' },
) {
  const { connection, logger } = context;
  const { program_name, version = 'active' } = args;
  if (!program_name) return return_error(new Error('program_name is required'));

  const programName = program_name.toUpperCase();
  const obj = createAdtClient(connection, logger).getProgram(
    resultsFor(programDocuments),
  );

  // Two calls, so the order is ours — 19 removed the members that made several.
  // Each carries its own `analyse`: a refused read and a refused metadata read
  // are different failures, and whichever comes back is the one the caller
  // sees, built by the strategy rather than summarised here.
  //
  // ReadProgram reads only main programs (PROG/P). Unlike every other read in
  // this family, a successful pair of calls is not by itself the answer: the
  // object-type check below is application-level judgment on top of two
  // otherwise-successful reads, so it belongs in the projection, not in a
  // strategy. Both calls always run — the type can only be known from
  // metadata, so a wrong-type object is never told apart from a missing one
  // without reading it first.
  return answer(
    { tool: 'ReadProgram', detail: 'terse' },
    () =>
      pair(
        () => obj.read({ programName }, version, { analyse: analyseException }),
        () => obj.readMetadata({ programName }, { analyse: analyseException }),
      ),
    ([source, metadata]: [AdtReading<string>, AdtReading<string>]) => {
      const objectType = metadata.raw
        ? (/adtcore:type="([^"]+)"/.exec(metadata.raw)?.[1] ?? null)
        : null;
      const isMainProgram = objectType === 'PROG/P';
      // When both documents are empty we cannot read it as a main program
      // either (the programs endpoint returned nothing usable) — treat that
      // as the same error. No redirect/suggestion is emitted — choosing the
      // right tool is the consumer's decision; we only report what the
      // object is.
      if (!isMainProgram || (source.raw === '' && metadata.raw === '')) {
        return {
          success: false,
          error: 'invalid_object_type',
          program_name: programName,
          object_type: objectType,
          message: objectType
            ? `"${programName}" has object type ${objectType}, not a main program (PROG/P). ReadProgram reads only main programs (PROG/P).`
            : `No main-program (PROG/P) source or metadata found for "${programName}". ReadProgram reads only main programs (PROG/P).`,
        };
      }

      return {
        success: true,
        program_name: programName,
        version,
        source_code: source.raw,
        metadata: metadata.raw,
      };
    },
  );
}
