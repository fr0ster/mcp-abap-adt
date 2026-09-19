/**
 * CheckPackage Handler - Syntax check for ABAP Package
 *
 * Uses AdtClient.getPackage().check from @mcp-abap-adt/adt-clients 19.
 */

import { packageDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseCheck } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseCheck } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CheckPackageLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Perform syntax check on an ABAP package. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session. super_package is required by this schema but not read by the check endpoint — see its own parameter description.',
  inputSchema: {
    type: 'object',
    properties: {
      package_name: {
        type: 'string',
        description: 'Package name (e.g., ZOK_TEST_0002).',
      },
      super_package: {
        type: 'string',
        description:
          'Does not reach the check endpoint — the shipped checkPackage() call takes only the package name. Kept for compatibility with ValidatePackage/CreatePackage, which do read it (LockPackage/UnlockPackage/UpdatePackage do not either).',
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

interface CheckPackageArgs {
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

export async function handleCheckPackage(
  context: HandlerContext,
  args: CheckPackageArgs,
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
  const detail = detailOf(args);

  return answer(
    { tool: 'CheckPackageLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getPackage(resultsFor(packageDocuments))
        // `status` left undefined: the shipped default checks the inactive
        // version, which is what a caller wants right after a write.
        .check({ packageName }, undefined, { analyse: analyseCheck }),
    project(detail, terseCheck),
  );
}
