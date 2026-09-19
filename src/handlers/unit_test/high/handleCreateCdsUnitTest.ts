/**
 * CreateCdsUnitTest Handler - Create the container class for a CDS view's
 * ABAP Unit tests
 *
 * Uses AdtClient.getCdsUnitTest().checkCdsTestDoubles and
 * AdtClient.getClass().create from @mcp-abap-adt/adt-clients 19.
 *
 * **The class shell is created through `getClass()`, not through
 * `getCdsUnitTest().create()`.** `AdtUnitTest`'s constructor — which
 * `AdtCdsUnitTest` inherits — builds its own inner delegate with no result
 * set of its own: `this.adtClass = new AdtClass(connection, logger)`, no
 * third argument. Whatever result set a caller injects at
 * `getCdsUnitTest(results)` never reaches that inner `AdtClass`, so
 * `create()`'s answer is read through the shipped default reading, not
 * `resultsFor`'s `AdtReading`-producing one — and `project(detail,
 * terseWrite)` then reads `.value`/`.status` off a value that isn't a
 * reading at all, turning every successful create into a local
 * `projection_failed` (`isError: true`, always — confirmed with a real,
 * unmocked `AdtClient` against a recording connection, not a mocked member;
 * mocking the member is exactly what let this reproduce every time and
 * never show up in a test). Calling `getClass(resultsFor(classDocuments))`
 * directly is the same wire request `AdtUnitTest.create()`'s plain path
 * makes (`this.adtClass.create({className, packageName, description,
 * transportRequest}, options)`, with no `classTemplate` since this handler
 * never sets one) — through an accessor that actually honours the injected
 * set.
 *
 * Workflow: checkCdsTestDoubles -> create. No lock: the test-doubles check is
 * a plain GET-shaped request (`checkCdsTestDoubles(cdsViewName)` takes no
 * lock, no `options`, and ships its own `testDoublesVerdict` reading — there
 * is no `analyse` to inject), and `create()` is a bare POST of the class
 * shell.
 *
 * `cds_view_name` is real work here, not a dead parameter: it is what the
 * test-doubles check is about, asked first because a view the doubles
 * framework cannot handle makes everything after it pointless. It does not
 * itself reach `create()`'s request body — so the created class is not
 * otherwise bound to the view; that binding lives in the test source
 * written afterward, via `UpdateCdsUnitTest`.
 */

import { classDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { sequence } from '../../../lib/strategies/sequence';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CreateCdsUnitTest',
  available_in: ['onprem', 'cloud'] as const,
  description:
    "Operation: Create. Subject: the container class for a CDS view's ABAP Unit tests. Checks the view can be tested with test doubles, then creates the container class in initial state — no tests written yet. Use UpdateCdsUnitTest to write the tests. " +
    'Refused outright on legacy systems (BASIS < 7.50): AdtClientLegacy.getCdsUnitTest() throws — the CDS framework endpoints this needs are not present there (issue #207).',
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
      const client = createAdtClient(connection, logger);
      const cdsUnitTest = client.getCdsUnitTest();
      const classObj = client.getClass(resultsFor(classDocuments));

      return sequence(
        () => cdsUnitTest.checkCdsTestDoubles(cdsViewName),
        () =>
          classObj.create(
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
