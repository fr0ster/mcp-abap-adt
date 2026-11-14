import * as z from 'zod';
import { createArguments } from '../../../lib/handlers/createArguments';
import { MASTER_LANGUAGE_DESCRIPTION } from '../../../lib/masterLanguage';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
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
 *
 * **No `abstract`.** SAP ignores `class:abstract` on create (measured on
 * premise: an `abstract="true"` create gave a class that is not abstract,
 * while `class:final` in the same body was taken), so the tool takes none:
 * a class is abstract by its source's `ABSTRACT`.
 */

import { classDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CreateClass',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Creates the ABAP class named by class_name in the package named by package_name, in initial state: the class object alone; its source code is written by an update of the class.',
  inputSchema: createArguments('CreateClass', {
    class_name: z.string().describe('Class name.'),
    description: z
      .string()
      .optional()
      .describe('Class description (defaults to class_name).'),
    package_name: z.string().describe('Package name.'),
    transport_request: z
      .string()
      .optional()
      .describe(
        'Transport request number (required for transportable packages), not a task.',
      ),
    superclass: z.string().optional().describe('Optional superclass name.'),
    final: z
      .boolean()
      .optional()
      .describe('Mark class as final. Default: false'),
    create_protected: z
      .boolean()
      .optional()
      .describe('Protected constructor. Default: false'),
    master_language: z
      .string()
      .optional()
      .describe(MASTER_LANGUAGE_DESCRIPTION),
    ...DETAIL_SHAPE,
  }),
} as const;

type CreateClassArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

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
      withAdtHeaders(context, 'class.create', (headers) =>
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
              createProtected: args.create_protected || false,
              masterLanguage: args.master_language,
            },
            { headers, analyse: analyseException },
          ),
      ),
    project(detail, terseWrite),
  );
}
