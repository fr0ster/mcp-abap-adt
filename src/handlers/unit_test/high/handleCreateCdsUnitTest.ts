/**
 * CreateCdsUnitTest Handler - Create the container class for a CDS view's
 * ABAP Unit tests
 *
 * Uses AdtClient.getCdsUnitTest().{checkCdsTestDoubles,create} from
 * @mcp-abap-adt/adt-clients 19.
 *
 * Workflow: checkCdsTestDoubles -> create. No lock: the test-doubles check is
 * a plain GET-shaped request (`checkCdsTestDoubles(cdsViewName)` takes no
 * lock, no `options`, and ships its own `testDoublesVerdict` reading — there
 * is no `analyse` to inject), and `create()` — called here without
 * `classTemplate`/`testClassSource`, which routes it through
 * `AdtUnitTest.create()`'s plain path rather than the CDS-specific one — is a
 * bare POST of the class shell.
 *
 * `cds_view_name` is real work here, not a dead parameter: it is what the
 * test-doubles check is about, asked first because a view the doubles
 * framework cannot handle makes everything after it pointless. It does not
 * itself reach `create()`'s request body — `AdtUnitTest.create()` never reads
 * a CDS view name — so the created class is not otherwise bound to the view;
 * that binding lives in the test source written afterward, via
 * `UpdateCdsUnitTest`, under a lock this handler does not hold.
 */

import { analyseException } from '@mcp-abap-adt/adt-strategies';
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import type { AdtReading } from '../../../lib/strategies/reading';
import { ourUnitTest } from '../../../lib/strategies/resultSets';
import { sequence } from '../../../lib/strategies/sequence';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CreateCdsUnitTest',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    "Operation: Create. Subject: the container class for a CDS view's ABAP Unit tests. Checks the view can be tested with test doubles, then creates the container class in initial state — no tests written yet. Use UpdateCdsUnitTest (with a lock handle from a class lock) to write the tests.",
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description: 'Container class name (e.g., ZCL_CDS_TEST).',
      },
      package_name: {
        type: 'string',
        description: 'Package name (e.g., ZOK_TEST_PKG_01, $TMP).',
      },
      cds_view_name: {
        type: 'string',
        description:
          'CDS view name to check for unit test doubles before creating the class.',
      },
      description: {
        type: 'string',
        description: 'Optional description for the container class.',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (required for transportable packages).',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['class_name', 'package_name', 'cds_view_name'],
  },
} as const;

interface CreateCdsUnitTestArgs {
  class_name: string;
  package_name: string;
  cds_view_name: string;
  description?: string;
  transport_request?: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleCreateCdsUnitTest(
  context: HandlerContext,
  args: CreateCdsUnitTestArgs,
) {
  const { connection, logger } = context;

  if (!args?.class_name) {
    return return_error(new Error('class_name is required'));
  }
  if (!args?.package_name) {
    return return_error(new Error('package_name is required'));
  }
  if (!args?.cds_view_name) {
    return return_error(new Error('cds_view_name is required'));
  }

  const className = args.class_name.toUpperCase();
  const cdsViewName = args.cds_view_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'CreateCdsUnitTest', detail },
    async (): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>> => {
      const obj = createAdtClient(connection, logger).getCdsUnitTest(
        ourUnitTest,
      );

      return sequence(
        () => obj.checkCdsTestDoubles(cdsViewName),
        () =>
          obj.create(
            {
              className,
              packageName: args.package_name,
              description: args.description || className,
              transportRequest: args.transport_request,
            },
            { analyse: analyseException },
          ),
      );
    },
    project(detail, terseWrite),
  );
}
