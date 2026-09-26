/**
 * CreateClass Handler - Create ABAP Class
 *
 * Uses AdtClient.getClass().create from @mcp-abap-adt/adt-clients 19.
 *
 * A create is one request, and its own answer: `resultSets.ts` maps the
 * `created` slot to `verbatim`, so `project(detail, terseWrite)` still reads
 * the status for `terse` while `full`/`raw` answer the document ADT sent
 * instead of discarding it. `create()` makes the class shell only — no
 * source — matching `CreateClassLow`; the pre-migration handler's
 * validate/check/lock/update/unlock/check/activate chain was
 * `AdtClass.create()`'s own internal workflow in adt-clients 18, which v19
 * removed (a member is one request now). Source is `UpdateClass`'s job.
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
  name: 'CreateClass',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Create. Subject: Class. Will be useful for creating class. Create a new ABAP class in SAP system. Creates the class object in initial state. Use UpdateClass to set source code.',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description: 'Class name (e.g., ZCL_TEST_CLASS_001).',
      },
      description: {
        type: 'string',
        description: 'Class description (defaults to class_name).',
      },
      package_name: {
        type: 'string',
        description: 'Package name (e.g., ZOK_LAB, $TMP).',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (required for transportable packages). A REQUEST number, not a task: an object is created on a request and moved onto a task afterwards with AddTransportObject. A task number here answers SUCCESS on a create and is then refused on the next write with CTS_WBO_API 020, "already locked in request".',
      },
      superclass: { type: 'string', description: 'Optional superclass name.' },
      final: {
        type: 'boolean',
        description: 'Mark class as final. Default: false',
      },
      abstract: {
        type: 'boolean',
        description: 'Mark class as abstract. Default: false',
      },
      create_protected: {
        type: 'boolean',
        description: 'Protected constructor. Default: false',
      },
      master_language: {
        type: 'string',
        description:
          'Optional master/original language for the created object (e.g. "EN", "DE", "ZH"). Defaults to the session language (SAP_LANGUAGE) or EN.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['class_name', 'package_name'],
  },
} as const;

interface CreateClassArgs {
  class_name: string;
  description?: string;
  package_name: string;
  transport_request?: string;
  superclass?: string;
  final?: boolean;
  abstract?: boolean;
  create_protected?: boolean;
  master_language?: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleCreateClass(
  context: HandlerContext,
  args: CreateClassArgs,
) {
  const { connection, logger } = context;

  if (!args.class_name || !args.package_name) {
    return return_error(
      new Error('Missing required parameters: class_name and package_name'),
    );
  }

  const className = args.class_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'CreateClass', detail },
    () =>
      createAdtClient(connection, logger)
        .getClass(resultsFor(classDocuments))
        .create(
          {
            className,
            packageName: args.package_name,
            transportRequest: args.transport_request,
            description: args.description || className,
            superclass: args.superclass,
            final: args.final || false,
            abstract: args.abstract || false,
            createProtected: args.create_protected || false,
            masterLanguage: args.master_language,
          },
          { analyse: analyseException },
        ),
    project(detail, terseWrite),
  );
}
