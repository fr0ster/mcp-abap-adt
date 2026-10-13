/**
 * UpdatePackage Handler - Update an ABAP package's description, atomically
 *
 * One tool of the high set and the route of compact's `HandlerUpdate`
 * PACKAGE without `lock_handle` (19.0.0). Like the other high updates it
 * locks, writes and unlocks inside the tool (`withLock`: the lock is held for
 * the read-modify-write in its body and released on every path out): the
 * package's metadata is read, its description patched (`patchPackageXml`,
 * the patch the write under a held lock uses too) and written back.
 *
 * **A package can be saved only once per ABAP session** (PAK/058). Over RFC
 * the whole lock → write → unlock runs in a session of its own, closed
 * afterwards — `inOwnSessionOverRfc`, as CreatePackage does; over HTTP the
 * caller's connection serves, the write outside the lock's stateful context.
 */

import { packageDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces-adt';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { inOwnSessionOverRfc } from '../../../lib/packageSessions';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { analyseLock } from '../../../lib/strategies/lockAnswer';
import { patchPackageXml } from '../../../lib/strategies/packagePatch';
import { project, terseWrite } from '../../../lib/strategies/projections';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { sequence } from '../../../lib/strategies/sequence';
import { withLock } from '../../../lib/strategies/withLock';
import { extractXmlString } from '../../../lib/strategies/xmlPatch';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UpdatePackage',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Update the description of an existing ABAP package. Locks the package, writes, and unlocks it again, whatever the write answered. Over RFC this runs in an ABAP session of its own, closed afterwards.',
  inputSchema: {
    type: 'object',
    properties: {
      package_name: {
        type: 'string',
        description: 'Package name. Package must already exist.',
      },
      description: {
        type: 'string',
        description: 'New description for the package.',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (required for transportable packages), not a task.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['package_name', 'description'],
  },
} as const;

interface UpdatePackageArgs {
  package_name: string;
  description: string;
  transport_request?: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleUpdatePackage(
  context: HandlerContext,
  args: UpdatePackageArgs,
) {
  const { connection, logger } = context;

  if (!args?.package_name || !args?.description) {
    return return_error(new Error('package_name and description are required'));
  }

  const packageName = args.package_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'UpdatePackage', detail },
    () =>
      inOwnSessionOverRfc(
        connection,
        logger,
        'UpdatePackage',
        (own): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>> => {
          const pkg = createAdtClient(own, logger).getPackage(
            resultsFor(packageDocuments),
          );
          return withLock(
            () => pkg.lock({ packageName }, { analyse: analyseLock }),
            (
              lockHandle,
            ): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>> =>
              sequence(
                () =>
                  pkg.readMetadata(
                    { packageName },
                    { analyse: analyseException },
                  ),
                (current) =>
                  pkg.updateMetadata(
                    {
                      packageName,
                      ...(args.transport_request && {
                        transportRequest: args.transport_request,
                      }),
                    },
                    {
                      source: patchPackageXml(
                        extractXmlString(current.raw, `package ${packageName}`),
                        { description: args.description },
                      ),
                      lockHandle,
                      analyse: analyseException,
                    },
                  ),
              ),
            (lockHandle) =>
              pkg.unlock({ packageName }, lockHandle, {
                analyse: analyseException,
              }),
          ) as Promise<IAdtResponse<AdtReading<unknown>, IAdtError>>;
        },
      ),
    project(detail, terseWrite),
  );
}
