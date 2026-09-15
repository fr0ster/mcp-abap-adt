/**
 * UpdatePackage Handler - Update ABAP Package Description
 *
 * Read, patch, write. adt-clients 19 removed the merge that used to happen
 * inside `updatePackage`: the member takes the whole document now and
 * replaces with it, so anything not sent is gone. The sequence is the
 * handler's, and every step of it carries its own `analyse` — the verdict on
 * each answer stays the strategy's.
 *
 * **The patched document goes in `config.document`, not `options.xmlContent`.**
 * `AdtPackage.updateMetadata()`'s shipped body reads `config.document` only
 * and passes it straight to `updatePackage(connection, {...}, config.document,
 * options?.lockHandle)` as the PUT body — every other field it builds into
 * that `fields` object (`superPackage`, `softwareComponent`,
 * `transportLayer`, `description`, `packageType`, `responsible`,
 * `recordChanges`) describes a create and is never read to build or merge a
 * body on an update; only `package_name` (for the URL path) and
 * `transport_request` (the write-query string) reach the wire function at
 * all. Verified against the compiled `AdtPackage.js` and
 * `core/package/update.js`, not the declaration file.
 */

import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { patchPackageXml } from '../../../lib/strategies/packagePatch';
import { sequence } from '../../../lib/strategies/sequence';
import { extractXmlString } from '../../../lib/strategies/xmlPatch';
import {
  type AxiosResponse,
  restoreSessionInConnection,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UpdatePackageLow',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    '[low-level] Update description of an existing ABAP package. Requires lock handle from LockObject and superPackage. - use UpdatePackageSource for full workflow with lock/unlock.',
  inputSchema: {
    type: 'object',
    properties: {
      package_name: {
        type: 'string',
        description:
          'Package name (e.g., ZOK_TEST_0002). Package must already exist.',
      },
      super_package: {
        type: 'string',
        description:
          'Does not reach the update endpoint — the shipped updatePackage() call reads only the patched document, the package name and the transport request. Kept for compatibility with CreatePackage/ValidatePackage, which do read it.',
      },
      updated_description: {
        type: 'string',
        description: 'New description for the package.',
      },
      lock_handle: {
        type: 'string',
        description:
          'Lock handle from LockObject. Required for update operation.',
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
    },
    required: [
      'package_name',
      'super_package',
      'updated_description',
      'lock_handle',
    ],
  },
} as const;

interface UpdatePackageArgs {
  package_name: string;
  super_package: string;
  updated_description: string;
  lock_handle: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

export async function handleUpdatePackage(
  context: HandlerContext,
  args: UpdatePackageArgs,
) {
  const { connection, logger } = context;
  try {
    const {
      package_name,
      super_package,
      updated_description,
      lock_handle,
      session_id,
      session_state,
    } = args as UpdatePackageArgs;

    if (
      !package_name ||
      !super_package ||
      !updated_description ||
      !lock_handle
    ) {
      return return_error(
        new Error(
          'package_name, super_package, updated_description, and lock_handle are required',
        ),
      );
    }

    const client = createAdtClient(connection, logger);
    const packageName = package_name.toUpperCase();

    logger?.info(`Starting package update: ${packageName}`);

    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    }

    try {
      // The three steps, in the handler because 19 put them there. `analyse`
      // on each one: a refusal from the read and a refusal from the write are
      // different failures, and whichever comes back is the one the caller
      // sees, built by the strategy rather than summarised here.
      const written = await sequence(
        () =>
          client
            .getPackage()
            .readMetadata({ packageName }, { analyse: analyseException }),
        (current) =>
          client.getPackage().updateMetadata(
            {
              packageName,
              document: patchPackageXml(
                extractXmlString(current, `package ${packageName}`),
                { description: updated_description },
              ),
            },
            {
              lockHandle: lock_handle,
              analyse: analyseException,
            },
          ),
      );

      if (!written.ok) {
        const failure = written.getError();
        logger?.error(`UpdatePackage refused: ${failure.message}`);
        return return_error(new Error(failure.message));
      }

      logger?.info(`✅ UpdatePackage completed: ${packageName}`);

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            package_name: packageName,
            super_package: super_package.toUpperCase(),
            updated_description,
            session_id: session_id || null,
            session_state: null, // Session state management is now handled by auth-broker,
            message: `Package ${packageName} updated successfully. Remember to unlock using UnlockObject.`,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error updating package ${packageName}: ${error?.message || error}`,
      );

      let errorMessage = `Failed to update package: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Package ${packageName} not found.`;
      } else if (error.response?.status === 423) {
        errorMessage = `Package ${packageName} is locked by another user or lock handle is invalid.`;
      } else if (
        error.response?.data &&
        typeof error.response.data === 'string'
      ) {
        try {
          const { XMLParser } = require('fast-xml-parser');
          const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '@_',
          });
          const errorData = parser.parse(error.response.data);
          const errorMsg =
            errorData['exc:exception']?.message?.['#text'] ||
            errorData['exc:exception']?.message;
          if (errorMsg) {
            errorMessage = `SAP Error: ${errorMsg}`;
          }
        } catch (_parseError) {
          // Ignore parse errors
        }
      }

      return return_error(new Error(errorMessage));
    }
  } catch (error: any) {
    return return_error(error);
  }
}
