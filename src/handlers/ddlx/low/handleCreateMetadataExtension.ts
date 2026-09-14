/**
 * CreateMetadataExtensionLow Handler - Create ABAP Metadata Extension
 *
 * Uses AdtClient.getMetadataExtension().create from @mcp-abap-adt/adt-clients 19.
 *
 * A create is one request, and its own answer: `resultSets.ts` maps the
 * `created` slot to `verbatim`, so `project(detail, terseWrite)` still reads
 * the status for `terse` while `full`/`raw` answer the document ADT sent
 * instead of discarding it.
 *
 * **No source here.** `createMetadataExtension` never reads a source; the
 * source is `UpdateMetadataExtensionLow`'s job, after `LockMetadataExtensionLow`.
 * `master_language` does reach the wire, through `config.masterLanguage`.
 * Verified against `AdtMetadataExtension.js`.
 */

import { metadataExtensionDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CreateMetadataExtensionLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Create a new ABAP Metadata Extension. - use CreateMetadataExtension (high-level) for full workflow with validation, lock, update, check, unlock, and activate.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Metadata Extension name (e.g., ZI_MY_DDLX).',
      },
      description: {
        type: 'string',
        description: 'Metadata Extension description.',
      },
      package_name: {
        type: 'string',
        description: 'Package name (e.g., ZOK_LOCAL, $TMP for local objects).',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Optional for local objects.',
      },
      master_language: {
        type: 'string',
        description: "Master language (optional, e.g., 'EN').",
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
    required: ['name', 'description', 'package_name'],
  },
} as const;

interface CreateMetadataExtensionArgs {
  name: string;
  description: string;
  package_name: string;
  transport_request?: string;
  master_language?: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleCreateMetadataExtension(
  context: HandlerContext,
  args: CreateMetadataExtensionArgs,
) {
  const { connection, logger } = context;
  const {
    name,
    description,
    package_name,
    transport_request,
    master_language,
    session_id,
    session_state,
  } = args;

  if (!name || !description || !package_name) {
    return return_error(
      new Error('name, description, and package_name are required'),
    );
  }

  if (session_id && session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const ddlxName = name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'CreateMetadataExtensionLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getMetadataExtension(resultsFor(metadataExtensionDocuments))
        .create(
          {
            name: ddlxName,
            description,
            packageName: package_name,
            transportRequest: transport_request,
            masterLanguage: master_language,
          },
          { analyse: analyseException },
        ),
    project(detail, terseWrite),
  );
}
