import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ReadProgram',
  available_in: ['onprem', 'legacy'] as const,
  description:
    'Operation: Read, Create, Update. Subject: Program. Will be useful for reading, creating, or updating program. [read-only] Read ABAP program (report) source code and metadata. Answers: "show program code", "display report source", "view program X", "get program source". Returns source code, package, responsible, description.',
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
  try {
    const { program_name, version = 'active' } = args;
    if (!program_name)
      return return_error(new Error('program_name is required'));

    const client = createAdtClient(connection, logger);
    const programName = program_name.toUpperCase();
    const obj = client.getProgram();

    let source_code: string | null = null;
    try {
      const readResult = await obj.read(
        { programName },
        version as 'active' | 'inactive',
      );
      if (readResult?.readResult?.data) {
        source_code =
          typeof readResult.readResult.data === 'string'
            ? readResult.readResult.data
            : safeStringify(readResult.readResult.data);
      }
    } catch (e: any) {
      logger?.warn(`Could not read source for ${programName}: ${e?.message}`);
    }

    let metadata: string | null = null;
    try {
      const metaResult = await obj.readMetadata({ programName });
      if (metaResult?.metadataResult?.data) {
        metadata =
          typeof metaResult.metadataResult.data === 'string'
            ? metaResult.metadataResult.data
            : safeStringify(metaResult.metadataResult.data);
      }
    } catch (e: any) {
      logger?.warn(`Could not read metadata for ${programName}: ${e?.message}`);
    }

    // A readable main program (PROG/P) always returns source. If both source
    // and metadata are empty, the name is almost certainly an include
    // (PROG/I) — surface that as a structured error with a redirect instead of
    // a misleading { success: true, source_code: null } that the model reads
    // as a permission/inactive-object problem rather than "wrong tool".
    if (source_code === null && metadata === null) {
      return return_response({
        data: JSON.stringify(
          {
            success: false,
            error: 'include_name_passed',
            program_name: programName,
            message: `No main-program source found for "${programName}". If this is an include (e.g. a name returned by GetIncludesList), call GetInclude("${programName}") instead.`,
            suggestion: `GetInclude("${programName}")`,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    }

    return return_response({
      data: JSON.stringify(
        {
          success: true,
          program_name: programName,
          version,
          source_code,
          metadata,
        },
        null,
        2,
      ),
    } as AxiosResponse);
  } catch (error: any) {
    return return_error(error);
  }
}

function safeStringify(data: unknown): string {
  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}
