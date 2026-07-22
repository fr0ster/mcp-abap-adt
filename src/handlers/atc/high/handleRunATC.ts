/**
 * RunATC Handler - Start an ATC (ABAP Test Cockpit) check via AdtClient
 *
 * Creates an ATC worklist for the given check variant and submits an
 * asynchronous ATC run for an ADT object. Returns worklist_id and run_id
 * for status polling and findings retrieval.
 */

import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'RunATC',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    'Start an asynchronous ATC (ABAP Test Cockpit) run for an ABAP object. ' +
    'Creates a worklist for the selected check variant, then submits the run. ' +
    'Returns worklist_id and run_id; use GetATCRunStatus to poll and GetATCFindings ' +
    'to fetch results once status is finished. When check_variant is omitted, the ' +
    "system's default ATC check variant is used (if configured).",
  inputSchema: {
    type: 'object',
    properties: {
      object_name: {
        type: 'string',
        description:
          'Name of the ABAP object to check (e.g., "ZCL_MY_CLASS", "ZMY_PACKAGE").',
      },
      object_type: {
        type: 'string',
        enum: [
          'class',
          'interface',
          'program',
          'function_group',
          'include',
          'package',
        ],
        description:
          'Type of object to check. Use "package" to check all objects inside a package.',
      },
      check_variant: {
        type: 'string',
        description:
          "ATC check variant name. If omitted, uses the system's default check variant.",
      },
      max_findings: {
        type: 'number',
        description: 'Maximum number of findings to return (default: 100).',
        default: 100,
      },
    },
    required: ['object_name', 'object_type'],
  },
} as const;

interface RunATCArgs {
  object_name: string;
  object_type:
    | 'class'
    | 'interface'
    | 'program'
    | 'function_group'
    | 'include'
    | 'package';
  check_variant?: string;
  max_findings?: number;
}

export async function handleRunATC(context: HandlerContext, args: RunATCArgs) {
  const { connection, logger } = context;
  try {
    const { object_name, object_type, check_variant, max_findings } =
      args as RunATCArgs;

    if (!object_name) {
      return return_error(new Error('object_name is required'));
    }
    if (!object_type) {
      return return_error(new Error('object_type is required'));
    }

    const client = createAdtClient(connection, logger);
    const atc = client.getAtc();

    logger?.info(
      `Starting ATC run for ${object_type} ${object_name.toUpperCase()}` +
        (check_variant ? ` (variant: ${check_variant})` : ' (system default)'),
    );

    try {
      const result = await atc.create({
        objectName: object_name,
        objectType: object_type,
        options: {
          checkVariant: check_variant,
          maxFindings: max_findings,
        },
      });

      if (!result.worklistId || !result.runId) {
        throw new Error('ATC run did not return both worklistId and runId');
      }

      logger?.info(
        `ATC run started — worklist: ${result.worklistId}, run: ${result.runId}`,
      );

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            worklist_id: result.worklistId,
            run_id: result.runId,
            check_variant: result.checkVariant,
            message:
              `ATC run started. Use GetATCRunStatus with run_id ${result.runId} to poll, ` +
              `then GetATCFindings with worklist_id ${result.worklistId} to fetch findings.`,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: unknown) {
      const err = error as Error;
      logger?.error(`Error starting ATC run: ${err?.message ?? String(error)}`);
      return return_error(new Error(err?.message ?? String(error)));
    }
  } catch (error: unknown) {
    return return_error(error as Error);
  }
}
