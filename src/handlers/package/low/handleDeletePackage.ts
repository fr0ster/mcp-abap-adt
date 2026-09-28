/**
 * DeletePackage Handler - Delete ABAP Package
 *
 * Uses AdtClient.getPackage().delete from @mcp-abap-adt/adt-clients 19.
 *
 * `analyseDeletion` is passed explicitly rather than left to the shipped
 * default. `AdtPackage.delete()`'s own default is `packageDeletionRefusal`,
 * a package-specific reading of `del:deletionResult`/`del:isDeleted` — but
 * `analyseDeletion` (`readDeletionRefusal` in `@mcp-abap-adt/adt-strategies`)
 * reads that same attribute, on both `del:deletionResult` and
 * `del:checkResponse`, generically. Passing it explicitly is what every
 * sibling family in this cluster does for delete, and package's own document
 * shape is not special enough to need its own strategy where the generic one
 * already reads the right attribute.
 */

import { packageDocuments } from '@mcp-abap-adt/adt-clients';
import type { SapConfig } from '@mcp-abap-adt/connection';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  closeQuietly,
  openFreshConnection,
} from '../../../lib/packageSessions';
import { analyseDeletion } from '../../../lib/strategies/deletionRefusal';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseDeletion } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'DeletePackageLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Delete an ABAP package from the SAP system via ADT deletion API. Transport request optional for local objects. A package can be saved only once per ABAP session (PAK/058 "Package … is already locked" otherwise). The package tools of this server never save a package in its own session, so a delete here works after them; for a package saved elsewhere through this connection, pass force_new_connection=true to delete from a new session, closed afterwards.',
  inputSchema: {
    type: 'object',
    properties: {
      package_name: {
        type: 'string',
        description: 'Package name.',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number. Required for transportable objects. Optional for local objects. A REQUEST number, not a task: an object is created on a request and moved onto a task afterwards with AddTransportObject. A task number here answers SUCCESS on a create and is then refused on the next write with CTS_WBO_API 020, "already locked in request".',
      },
      force_new_connection: {
        type: 'boolean',
        description:
          'Force creation of a new connection (bypass cache). Useful when package was locked/unlocked and needs to be deleted in a fresh session. Default: false.',
      },
      connection_config: {
        type: 'object',
        description:
          'Optional SAP connection config to create a fresh connection for deletion. Useful when the existing connection config is unavailable.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['package_name'],
  },
} as const;

interface DeletePackageArgs {
  package_name: string;
  transport_request?: string;
  force_new_connection?: boolean;
  connection_config?: SapConfig;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleDeletePackage(
  context: HandlerContext,
  args: DeletePackageArgs,
) {
  const { connection, logger } = context;
  const {
    package_name,
    transport_request,
    force_new_connection = false,
    connection_config,
  } = args;

  if (!package_name) {
    return return_error(new Error('package_name is required'));
  }

  const packageName = package_name.toUpperCase();
  const detail = detailOf(args);

  // A package this session has created or updated cannot be deleted by this
  // same session: PAK/058 "Package … is already locked", even after a clean
  // UNLOCK. It is `CL_PACKAGE`'s static instance buffer, left `requested` by
  // the save, which `CL_PAK_ADT_PERSIST~DELETE` meets in `set_changeable`
  // (docs/installation/RFC_SETUP.md). A fresh connection is a fresh ABAP
  // session and the one way around it; that choice belongs here, not inside
  // the strategy call. The connection opened here is closed here: over RFC it
  // is an ABAP session that would otherwise stay open.
  let deleteConnection = connection;
  if (force_new_connection) {
    try {
      deleteConnection = await openFreshConnection(
        connection,
        logger,
        connection_config ??
          (connection as { getConfig?: () => unknown }).getConfig?.() ??
          (connection as { config?: unknown }).config,
      );
      logger?.info(
        `DeletePackage using fresh connection for ${packageName} (force_new_connection=true)`,
      );
    } catch (createError) {
      logger?.warn(
        `DeletePackage failed to create fresh connection for ${packageName}, falling back to existing connection: ${
          createError instanceof Error
            ? createError.message
            : String(createError)
        }`,
      );
      deleteConnection = connection;
    }
  }

  try {
    return await answer(
      { tool: 'DeletePackageLow', detail },
      () =>
        createAdtClient(deleteConnection, logger)
          .getPackage(resultsFor(packageDocuments))
          .delete(
            { packageName, transportRequest: transport_request },
            { analyse: analyseDeletion },
          ),
      project(detail, terseDeletion),
    );
  } finally {
    if (deleteConnection !== connection) {
      await closeQuietly(deleteConnection, logger, 'DeletePackage');
    }
  }
}
