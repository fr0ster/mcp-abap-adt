/**
 * CheckPackage Handler - Syntax check for ABAP Package
 *
 * Uses AdtClient.getPackage().check from @mcp-abap-adt/adt-clients 19.
 *
 * **`super_package` is accepted and not required, because the check never sends
 * it.** It was in `required` and guarded here, so a caller with no parent
 * package — or one who left it empty, which is what a top-level package has —
 * got `package_name and super_package are required` and **no request was made at
 * all**. Measured on a BTP trial, 2026-09-28: the integration suite passes
 * `super_package: ""` for `ZMCP_SHR_PKG` and this tool answered `isError: true`
 * with nothing on the wire, while the other nine check tools passed. The member
 * takes `check({ packageName }, status?, options?)` and the parameter's own
 * description has said it does not reach the endpoint all along — the guard
 * simply contradicted it.
 *
 * It stays in the schema: `ValidatePackage` and `CreatePackage` do read a super
 * package, and a caller who passes it here is not wrong, only ignored.
 */

import { packageDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseCheck } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CheckPackageLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Perform syntax check on an ABAP package. Returns syntax errors, warnings, and messages. super_package is accepted but not read by the check endpoint — see its own parameter description.',
  inputSchema: {
    type: 'object',
    properties: {
      package_name: {
        type: 'string',
        description: 'Package name.',
      },
      super_package: {
        type: 'string',
        description:
          'Optional, and it does not reach the check endpoint — the shipped check() call takes only the package name. Kept for compatibility with ValidatePackage/CreatePackage, which do read it (LockPackage/UnlockPackage/UpdatePackage do not either). Requiring it here refused the call before any request was made.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['package_name'],
  },
} as const;

interface CheckPackageArgs {
  package_name: string;
  super_package?: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleCheckPackage(
  context: HandlerContext,
  args: CheckPackageArgs,
) {
  const { connection, logger } = context;
  const { package_name } = args;

  if (!package_name) {
    return return_error(new Error('package_name is required'));
  }

  const packageName = package_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'CheckPackageLow', detail },
    () =>
      withAdtHeaders(context, 'package.check', (headers) =>
        createAdtClient(connection, logger)
          .getPackage(resultsFor(packageDocuments))
          .check({ packageName }, 'active', {
            headers,
            analyse: analyseException,
          }),
      ),
    project(detail, terseCheck),
  );
}
