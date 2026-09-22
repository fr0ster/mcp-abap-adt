/**
 * CreateBehaviorImplementation Handler - Create ABAP Behavior Implementation Class
 *
 * Uses AdtClient.getBehaviorImplementation().create from
 * @mcp-abap-adt/adt-clients 19.
 *
 * A create is one request, and its own answer: `resultSets.ts` maps the
 * `created` slot to `verbatim`, so `project(detail, terseWrite)` still reads
 * the status for `terse` while `full`/`raw` answer the document ADT sent
 * instead of discarding it.
 *
 * A behavior implementation *is* a class — every request `AdtBehaviorImplementation`
 * makes composes `AdtClass` and is declared over `classDocuments`, not a result
 * set of its own (see `AdtBehaviorImplementation`'s own doc comment). This
 * handler holds no lock: `create()` makes the class shell only, and does not
 * write the `FOR BEHAVIOR OF` main source or the implementations include —
 * that is `UpdateClass` (main source) and `UpdateBehaviorImplementation`
 * (implementations include, taking a lock handle the caller already holds)
 * after it.
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
import { validateTransportRequest } from '../../../utils/transportValidation.js';

export const TOOL_DEFINITION = {
  name: 'CreateBehaviorImplementation',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Create. Subject: BehaviorImplementation. Create a new ABAP behavior implementation class for a behavior definition. Creates the object in initial state — no FOR BEHAVIOR OF main source and no implementations include yet. Use UpdateClass to write the main source and UpdateBehaviorImplementation (with a lock handle from LockClass) to write the implementations include.',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description:
          'Behavior Implementation class name (e.g., ZBP_MY_ENTITY). Must follow SAP naming conventions (typically starts with ZBP_ for behavior implementations).',
      },
      behavior_definition: {
        type: 'string',
        description:
          'Behavior Definition name (e.g., ZI_MY_ENTITY). The behavior definition must exist. Accepted for compatibility; not forwarded to the create request — the shipped create endpoint posts a metadata document (name/description/package) only. The class is bound to this behavior definition when its FOR BEHAVIOR OF main source is written, separately, via UpdateClass.',
      },
      description: {
        type: 'string',
        description:
          'Class description. If not provided, class_name will be used.',
      },
      package_name: {
        type: 'string',
        description: 'Package name (e.g., ZOK_LOCAL, $TMP for local objects)',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable packages. A REQUEST number, not a task: an object is created on a request and moved onto a task afterwards with AddTransportObject. A task number here answers SUCCESS on a create and is then refused on the next write with CTS_WBO_API 020, "already locked in request".',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['class_name', 'behavior_definition', 'package_name'],
  },
} as const;

interface CreateBehaviorImplementationArgs {
  class_name: string;
  behavior_definition: string;
  description?: string;
  package_name: string;
  transport_request?: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleCreateBehaviorImplementation(
  context: HandlerContext,
  args: CreateBehaviorImplementationArgs,
) {
  const { connection, logger } = context;

  if (!args?.class_name) {
    return return_error(new Error('class_name is required'));
  }
  if (!args?.behavior_definition) {
    return return_error(new Error('behavior_definition is required'));
  }
  if (!args?.package_name) {
    return return_error(new Error('package_name is required'));
  }

  validateTransportRequest(args.package_name, args.transport_request);

  const className = args.class_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'CreateBehaviorImplementation', detail },
    () =>
      createAdtClient(connection, logger)
        .getBehaviorImplementation(resultsFor(classDocuments))
        .create(
          {
            className,
            behaviorDefinition: args.behavior_definition.toUpperCase(),
            packageName: args.package_name.toUpperCase(),
            description: args.description || className,
            transportRequest: args.transport_request,
          },
          { analyse: analyseException },
        ),
    project(detail, terseWrite),
  );
}
