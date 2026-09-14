/**
 * CreateClass Handler - Create ABAP Class
 *
 * Uses AdtClient.getClass().create from @mcp-abap-adt/adt-clients 19.
 *
 * A create is one request, and its own answer: `resultSets.ts` maps the
 * `created` slot to `verbatim`, so `project(detail, terseWrite)` still reads
 * the status for `terse` while `full`/`raw` answer the document ADT sent
 * instead of discarding it.
 */

import { classDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CreateClassLow',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    '[low-level] Create a new ABAP class. - use CreateClass (high-level) for full workflow with validation, lock, update, check, unlock, and activate.',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description:
          'Class name (e.g., ZCL_TEST_CLASS_001). Must follow SAP naming conventions.',
      },
      description: {
        type: 'string',
        description: 'Class description.',
      },
      package_name: {
        type: 'string',
        description: 'Package name (e.g., ZOK_LOCAL, $TMP for local objects).',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable packages.',
      },
      superclass: {
        type: 'string',
        description: 'Superclass name (optional).',
      },
      final: {
        type: 'boolean',
        description: 'Mark class as final (optional, default: false).',
      },
      abstract: {
        type: 'boolean',
        description: 'Mark class as abstract (optional, default: false).',
      },
      create_protected: {
        type: 'boolean',
        description: 'Create protected section (optional, default: false).',
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
    required: ['class_name', 'description', 'package_name'],
  },
} as const;

interface CreateClassArgs {
  class_name: string;
  description: string;
  package_name: string;
  transport_request?: string;
  superclass?: string;
  final?: boolean;
  abstract?: boolean;
  create_protected?: boolean;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleCreateClass(
  context: HandlerContext,
  args: CreateClassArgs,
) {
  const { connection, logger } = context;
  const {
    class_name,
    description,
    package_name,
    transport_request,
    superclass,
    final,
    abstract,
    create_protected,
    session_id,
    session_state,
  } = args;

  if (!class_name || !description || !package_name) {
    return return_error(
      new Error('class_name, description, and package_name are required'),
    );
  }

  if (session_id && session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const className = class_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'CreateClassLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getClass(resultsFor(classDocuments))
        .create(
          {
            className,
            description,
            packageName: package_name,
            transportRequest: transport_request,
            superclass,
            final,
            abstract,
            createProtected: create_protected,
          },
          { analyse: analyseException },
        ),
    project(detail, terseWrite),
  );
}
