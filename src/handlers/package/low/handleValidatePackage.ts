/**
 * ValidatePackage Handler - Validate ABAP Package Name
 *
 * Uses AdtClient.getPackage().validate from @mcp-abap-adt/adt-clients 19.
 */

import { packageDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseValidation } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseValidation } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ValidatePackageLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Validate an ABAP package name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.',
  inputSchema: {
    type: 'object',
    properties: {
      package_name: {
        type: 'string',
        description: 'Package name to validate (e.g., Z_MY_PROGRAM).',
      },
      super_package: {
        type: 'string',
        description:
          'Parent (super) package name. The new package will be created under this package.',
      },
      session_id: {
        type: 'string',
        description:
          'Session ID from GetSession. If not provided, a new session will be created.',
      },
      session_state: {
        type: 'object',
        description:
          'Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.',
        properties: {
          cookies: { type: 'string' },
          csrf_token: { type: 'string' },
          cookie_store: { type: 'object' },
        },
      },
      ...DETAIL_PROPERTY,
    },
    required: ['package_name', 'super_package'],
  },
} as const;

interface ValidatePackageArgs {
  package_name: string;
  super_package: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleValidatePackage(
  context: HandlerContext,
  args: ValidatePackageArgs,
) {
  const { connection, logger } = context;
  const { package_name, super_package, session_id, session_state } = args;

  if (!package_name || !super_package) {
    return return_error(
      new Error('package_name and super_package are required'),
    );
  }

  if (session_id && session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const packageName = package_name.toUpperCase();
  const superPackage = super_package.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'ValidatePackageLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getPackage(resultsFor(packageDocuments))
        .validate(
          { packageName, superPackage },
          { analyse: analyseValidation },
        ),
    project(detail, terseValidation),
  );
}
