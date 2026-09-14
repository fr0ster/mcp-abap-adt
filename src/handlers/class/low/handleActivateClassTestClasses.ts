/**
 * ActivateClassTestClasses Handler - Activate ABAP Unit test include for a class
 *
 * Uses AdtClient.getClass().activate from @mcp-abap-adt/adt-clients 19.
 *
 * Despite the name, this activates the parent class itself — that activates
 * all of its local includes (test classes, definitions, macros) together, the
 * same `activate()` member `ActivateClassLow` calls. There is no separate
 * `activateTestClasses()` request to make: v19's `AdtClass.activateTestClasses`
 * exists but takes no `options`/`analyse` and is not what this tool has ever
 * called (the doc comment claiming otherwise was stale even before this
 * migration — the old code already called `.activate({ className })`).
 *
 * `test_class_name` stays on this tool's surface (removing it would be a
 * surface change beyond the one this migration is allowed) but was never
 * read by the old handler either — `activate({ className })` activates
 * everything the class owns, test classes included, without naming one.
 * Ignored, not newly ignored.
 */

import { classDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseActivation } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseActivation } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ActivateClassTestClassesLow',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    '[low-level] Activate ABAP Unit test classes include for an existing class. Should be executed after updating and unlocking test classes.',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description: 'Class name (e.g., ZCL_MY_CLASS).',
      },
      test_class_name: {
        type: 'string',
        description:
          'Ignored. This activates the whole class, test classes included, without naming one — there is no per-test-class activation to target.',
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
    required: ['class_name'],
  },
} as const;

interface ActivateClassTestClassesArgs {
  class_name: string;
  test_class_name?: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleActivateClassTestClasses(
  context: HandlerContext,
  args: ActivateClassTestClassesArgs,
) {
  const { connection, logger } = context;
  const { class_name, session_id, session_state } = args;

  if (!class_name) {
    return return_error(new Error('class_name is required'));
  }

  if (session_id && session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const className = class_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'ActivateClassTestClassesLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getClass(resultsFor(classDocuments))
        .activate({ className }, { analyse: analyseActivation }),
    project(detail, terseActivation),
  );
}
