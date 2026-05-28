/**
 * GetATCFindings Handler - Read ATC findings by worklist_id via AdtClient
 *
 * Fetches /sap/bc/adt/atc/worklists/{worklist_id} and returns the findings XML.
 * Supports both native ATC worklist XML and Checkstyle XML output formats.
 */

import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetATCFindings',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    'Retrieve ATC findings for a completed worklist. The worklist_id is returned by ' +
    'RunATC. Use this once GetATCRunStatus reports status="finished". Optionally choose ' +
    'the Checkstyle XML flavor, which is easier to consume from external tooling.',
  inputSchema: {
    type: 'object',
    properties: {
      worklist_id: {
        type: 'string',
        description: '32-character worklist GUID returned by RunATC.',
      },
      format: {
        type: 'string',
        enum: ['xml', 'checkstyle'],
        description:
          'Findings format: "xml" (native ATC worklist) or "checkstyle" (Checkstyle XML). Default: xml.',
        default: 'xml',
      },
      include_exempted_findings: {
        type: 'boolean',
        description: 'Include exempted (suppressed) findings in the result.',
        default: false,
      },
    },
    required: ['worklist_id'],
  },
} as const;

interface GetATCFindingsArgs {
  worklist_id: string;
  format?: 'xml' | 'checkstyle';
  include_exempted_findings?: boolean;
}

export async function handleGetATCFindings(
  context: HandlerContext,
  args: GetATCFindingsArgs,
) {
  const { connection, logger } = context;
  try {
    const { worklist_id, format, include_exempted_findings } =
      args as GetATCFindingsArgs;

    if (!worklist_id) {
      return return_error(new Error('worklist_id is required'));
    }

    const client = createAdtClient(connection, logger);
    const atc = client.getAtc();

    logger?.info(
      `Reading ATC findings for worklist_id: ${worklist_id} (format: ${format ?? 'xml'})`,
    );

    try {
      const response = await atc.getFindings(worklist_id, {
        format,
        includeExemptedFindings: include_exempted_findings,
      });
      return return_response({
        data: JSON.stringify(
          {
            success: true,
            worklist_id,
            format: format ?? 'xml',
            findings: response.data,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: unknown) {
      const err = error as Error;
      logger?.error(
        `Error reading ATC findings ${worklist_id}: ${err?.message ?? String(error)}`,
      );
      return return_error(new Error(err?.message ?? String(error)));
    }
  } catch (error: unknown) {
    return return_error(error as Error);
  }
}
