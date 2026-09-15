/**
 * CreateUnitTest Handler - Create the container class for a class's ABAP
 * Unit tests
 *
 * Uses AdtClient.getUnitTest().create from @mcp-abap-adt/adt-clients 19.
 *
 * **`create` no longer means "start a run".** In adt-clients 18, `AdtUnitTest
 * .create()` meant "start a run" — this tool's own pre-migration schema
 * (`tests`, `title`, `context`, `scope`, `risk_level`, `duration`) was built
 * for that call. adt-clients 19's `AdtUnitTest` splits the two apart (its own
 * doc comment: "until 12.0.0 they shared one method: `create` meant 'start a
 * run', which is why `update` and `delete` looked like capabilities ADT
 * withheld"): `create` now posts the **container class** — the CLAS/OC a
 * class's local test classes live in — and `run` (a separate member, used by
 * the pre-existing `RunUnitTest` tool, not part of this task) starts one.
 * This tool's surface changes beyond `detail` accordingly — see the task
 * report for why.
 *
 * A create is one request, and its own answer: `resultSets.ts` maps the
 * `created` slot to `verbatim`. `create()` posts the class shell only — no
 * tests; write them afterward with `UpdateUnitTest`, taking the lock handle
 * from a `LockClass`-style lock on this same container class. No lock here.
 */

import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { ourUnitTest } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CreateUnitTest',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    'Operation: Create. Subject: the container class for a set of ABAP Unit tests. Creates the class in initial state, with no tests written yet. Use UpdateUnitTest (with a lock handle from a class lock) to write the tests, and RunUnitTest to run them.',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description:
          'Container class name (e.g., ZCL_MY_TESTS). Must follow SAP naming conventions.',
      },
      package_name: {
        type: 'string',
        description: 'Package name (e.g., ZOK_LOCAL, $TMP for local objects).',
      },
      description: {
        type: 'string',
        description: 'Optional description. Defaults to class_name.',
      },
      class_template: {
        type: 'string',
        description: 'Optional template the container class is created from.',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (required for transportable packages).',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['class_name', 'package_name'],
  },
} as const;

interface CreateUnitTestArgs {
  class_name: string;
  package_name: string;
  description?: string;
  class_template?: string;
  transport_request?: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleCreateUnitTest(
  context: HandlerContext,
  args: CreateUnitTestArgs,
) {
  const { connection, logger } = context;

  if (!args?.class_name) {
    return return_error(new Error('class_name is required'));
  }
  if (!args?.package_name) {
    return return_error(new Error('package_name is required'));
  }

  const className = args.class_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'CreateUnitTest', detail },
    () =>
      createAdtClient(connection, logger)
        .getUnitTest(ourUnitTest)
        .create(
          {
            className,
            packageName: args.package_name,
            description: args.description || className,
            classTemplate: args.class_template,
            transportRequest: args.transport_request,
          },
          { analyse: analyseException },
        ),
    project(detail, terseWrite),
  );
}
