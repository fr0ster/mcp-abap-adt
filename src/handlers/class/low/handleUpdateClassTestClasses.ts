/**
 * UpdateClassTestClasses Handler - Update ABAP Unit test include for a class
 *
 * Uses AdtClient.getLocalTestClass().update from @mcp-abap-adt/adt-clients 19.
 *
 * The testclasses include has no result set of its own: `AdtLocalTestClass`
 * is declared over `IClassResults`/`classDocuments`, the same set `class`
 * uses, because ADT addresses the include as part of the class. So this
 * injects `resultsFor(classDocuments)` — the shipped set applied through the
 * table, same as every other family here — rather than a set of its own.
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
  name: 'UpdateClassTestClassesLow',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    '[low-level] Upload ABAP Unit test include source code for an existing class. Requires test_classes_lock_handle from LockClassTestClassesLow.',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description: 'Class name (e.g., ZCL_MY_CLASS).',
      },
      test_class_source: {
        type: 'string',
        description: 'Complete ABAP Unit test class source code.',
      },
      lock_handle: {
        type: 'string',
        description: 'Test classes lock handle from LockClassTestClassesLow.',
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
    required: ['class_name', 'test_class_source', 'lock_handle'],
  },
} as const;

interface UpdateClassTestClassesArgs {
  class_name: string;
  test_class_source: string;
  lock_handle: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleUpdateClassTestClasses(
  context: HandlerContext,
  args: UpdateClassTestClassesArgs,
) {
  const { connection, logger } = context;
  const {
    class_name,
    test_class_source,
    lock_handle,
    session_id,
    session_state,
  } = args;

  if (!class_name || !test_class_source || !lock_handle) {
    return return_error(
      new Error('class_name, test_class_source, and lock_handle are required'),
    );
  }

  if (session_id && session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const className = class_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'UpdateClassTestClassesLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getLocalTestClass(resultsFor(classDocuments))
        .update(
          { className, testClassCode: test_class_source },
          { lockHandle: lock_handle, analyse: analyseException },
        ),
    project(detail, terseWrite),
  );
}
