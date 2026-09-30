/**
 * CreateCdsUnitTest — give a CDS view ABAP Unit tests, in one call: check the
 * view can be tested with test doubles, create the global class that holds the
 * tests (a view cannot hold one), write the test classes into it, activate it.
 *
 * adt-clients 24 has no CDS unit-test handler: the check is the view's
 * (`getDdl().checkCdsTestDoubles`), the container is a class (`getClass()`),
 * the tests its `testclasses` include — composed here.
 */

import { classDocuments, ddlDocuments } from '@mcp-abap-adt/adt-clients';
import {
  analyseCdsTestDoubles,
  analyseException,
} from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { sequence } from '../../../lib/strategies/sequence';
import { return_error } from '../../../lib/utils';
import { writeClassTests } from '../shared/writeTests';

export const TOOL_DEFINITION = {
  name: 'CreateCdsUnitTest',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Create ABAP Unit tests for a CDS view: check the view supports CDS test doubles, create a test class holding the local test classes, activate it.',
  inputSchema: {
    type: 'object',
    properties: {
      cds_view_name: {
        type: 'string',
        description:
          'CDS view under test (DDL source). Must be active and testable with test doubles.',
      },
      class_name: {
        type: 'string',
        description: 'Name of the new global class that holds the tests.',
      },
      package_name: {
        type: 'string',
        description: 'Package of the new test class.',
      },
      test_class_source: {
        type: 'string',
        description:
          'ABAP source of the local test classes: definitions and implementations, FOR TESTING.',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request, not a task. Required for a transportable package.',
      },
      ...DETAIL_PROPERTY,
    },
    required: [
      'cds_view_name',
      'class_name',
      'package_name',
      'test_class_source',
    ],
  },
} as const;

interface CreateCdsUnitTestArgs {
  cds_view_name: string;
  class_name: string;
  package_name: string;
  test_class_source: string;
  transport_request?: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleCreateCdsUnitTest(
  context: HandlerContext,
  args: CreateCdsUnitTestArgs,
) {
  for (const required of TOOL_DEFINITION.inputSchema.required) {
    if (!args?.[required]) {
      return return_error(new Error(`${required} is required`));
    }
  }

  const client = createAdtClient(context.connection, context.logger);
  const className = args.class_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'CreateCdsUnitTest', detail },
    () =>
      sequence(
        () =>
          client
            .getDdl(resultsFor(ddlDocuments))
            .checkCdsTestDoubles(args.cds_view_name.toUpperCase(), {
              analyse: analyseCdsTestDoubles,
            }),
        () =>
          client.getClass(resultsFor(classDocuments)).create(
            {
              className,
              packageName: args.package_name,
              description: `ABAP Unit tests of ${args.cds_view_name.toUpperCase()}`,
              final: true,
              transportRequest: args.transport_request,
            },
            { analyse: analyseException },
          ),
        () =>
          writeClassTests(
            context,
            className,
            args.test_class_source,
            args.transport_request,
          ),
      ),
    project(detail, terseWrite),
  );
}
