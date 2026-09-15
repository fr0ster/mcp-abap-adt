/**
 * UpdateBehaviorImplementation Handler - Write a Behavior Implementation's
 * implementations include
 *
 * Uses AdtClient.getBehaviorImplementation().update from
 * @mcp-abap-adt/adt-clients 19.
 *
 * **This handler holds no lock — it takes the caller's lock handle as an
 * argument.** `AdtBehaviorImplementation.update()`'s own doc comment: "The
 * lock is the *class's*, not the include's: `getClass().lock()` is what takes
 * it, and the same handle serves every include." The caller locks the class
 * (e.g. via LockClass) once and can then write the main source (UpdateClass),
 * the implementations include (this tool) and the other class members under
 * that one window; acquiring a second lock here would either collide with the
 * caller's or, if it succeeded, require releasing a lock the caller still
 * needs. This changes the tool's surface beyond `detail` — see the task
 * report for why.
 *
 * **`update()` writes the implementations include only, one request.** The
 * declaration file's own doc comment describes a two-write chain (main source
 * then include); the shipped `AdtBehaviorImplementation.js` does not match
 * it — `update()` makes exactly one `updateBehaviorImplementation()` call,
 * and no longer reads `behaviorDefinition` at all (its own comment: "this
 * writes the implementation include and never reads the definition's name").
 * A class written through this handler does not get its `FOR BEHAVIOR OF`
 * clause from this call — that is `UpdateClass`'s, under the same lock.
 *
 * **The source goes in `options`, not `config`.** The shipped `update()`
 * reads `options?.sourceCode` only (`const source = options?.sourceCode;`).
 * Verified against `AdtBehaviorImplementation.js`, not the declaration file.
 */

import { classDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UpdateBehaviorImplementation',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Update. Subject: BehaviorImplementation. Write the implementations include (handler code) of an existing ABAP behavior implementation class. Takes the lock handle from a prior LockClass call — this tool does not lock or unlock the class itself, so the caller releases it separately. Does not write the FOR BEHAVIOR OF main source; use UpdateClass (under the same lock handle) for that.',
  inputSchema: {
    type: 'object',
    properties: {
      behavior_implementation_name: {
        type: 'string',
        description:
          'Behavior Implementation class name (e.g., ZBP_MY_ENTITY). Must exist in the system.',
      },
      source_code: {
        type: 'string',
        description:
          'Implementation code for the implementations include. Contains the actual behavior implementation methods.',
      },
      lock_handle: {
        type: 'string',
        description:
          'Lock handle from a LockClass call on this class. Required — the shipped write endpoint answers "400 Parameter lockHandle could not be found" without one.',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Optional if object is local or already in transport.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['behavior_implementation_name', 'source_code', 'lock_handle'],
  },
} as const;

interface UpdateBehaviorImplementationArgs {
  behavior_implementation_name: string;
  source_code: string;
  lock_handle: string;
  transport_request?: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleUpdateBehaviorImplementation(
  context: HandlerContext,
  args: UpdateBehaviorImplementationArgs,
) {
  const { connection, logger } = context;

  if (!args?.behavior_implementation_name) {
    return return_error(new Error('behavior_implementation_name is required'));
  }
  if (!args?.source_code) {
    return return_error(new Error('source_code is required'));
  }
  if (!args?.lock_handle) {
    return return_error(new Error('lock_handle is required'));
  }

  const className = args.behavior_implementation_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'UpdateBehaviorImplementation', detail },
    () =>
      createAdtClient(connection, logger)
        .getBehaviorImplementation(resultsFor(classDocuments))
        .update(
          { className, transportRequest: args.transport_request },
          {
            sourceCode: args.source_code,
            lockHandle: args.lock_handle,
            analyse: analyseException,
          },
        ),
    project(detail, terseWrite),
  );
}
