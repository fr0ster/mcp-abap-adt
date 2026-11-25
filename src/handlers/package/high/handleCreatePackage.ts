/**
 * CreatePackage Handler - Create ABAP Package
 *
 * Uses AdtClient.getPackage().create from @mcp-abap-adt/adt-clients 19.
 *
 * A create is one request, and its own answer: `resultSets.ts` maps the
 * `created` slot to `verbatim`, so `project(detail, terseWrite)` still reads
 * the status for `terse` while `full`/`raw` answer the document ADT sent
 * instead of discarding it. The pre-migration handler's `validate()` and
 * `check()` calls are dropped — this is a bare create, matching
 * `CreatePackageLow`. Unlike every other family in this cluster,
 * `AdtPackage.create()` has no `packageName` guard: for a package the name
 * being created IS the object this create is about, and `superPackage` is
 * genuinely optional — a top-level package has none by design.
 *
 * **The `inputSchema` stays a bare zod raw shape.** Fix round 1: this was
 * converted to plain JSON Schema, reasoning the two are read identically by
 * `scripts/list-tools.ts`. True for the tool's own surface (only `detail`
 * moved), but the conversion also changed what
 * `compactSchemaCompleteness.test.ts` could see: a zod-shaped handler's
 * `required[]` is unreadable to that test's `requiredOf()` helper, which is
 * why it had never flagged `compactCreateSchema` missing `super_package` in
 * the first place. Reverted to zod, `detail` added as a proper zod field
 * (not a plain object mixed into a zod raw shape) alongside its siblings.
 */

import { packageDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import * as z from 'zod';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import { purpose, toolDescription } from '../../../lib/description';
import { DETAIL_LEVELS } from '../../../lib/detail/levels';
import { givenName } from '../../../lib/givenName';
import { createArguments } from '../../../lib/handlers/createArguments';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { MASTER_LANGUAGE_DESCRIPTION } from '../../../lib/masterLanguage';
import { inOwnSessionOverRfc } from '../../../lib/packageSessions';
import { DETAIL_WORDS, detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CreatePackage',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription({
    purpose: purpose(
      'Creates a new ABAP package under a super package, with its type, software component, transport layer and description.',
    ),
  }),
  inputSchema: createArguments('CreatePackage', {
    package_name: z.string().describe('Package name.'),
    description: z
      .string()
      .optional()
      .describe(
        'Package description. If not provided, package_name will be used.',
      ),
    super_package: z
      .string()
      .optional()
      .describe(
        'Optional: the package this package belongs to, which must exist (SAP creates the package with no super package when the named one is missing). Without one the package is top level, which SAP allows for a structure package or a package in software component LOCAL ($ or TEST names, no transport layer); in an ABAP Cloud software component the top level is a structure package (SAP answers TR 462 to any other).',
      ),
    package_type: z
      .enum(['development', 'structure'])
      .optional()
      .default('development')
      .describe("Package type: 'development' (default) or 'structure'"),
    software_component: z
      .string()
      .optional()
      .describe('Software component. If not provided, SAP will set a default.'),
    transport_layer: z
      .string()
      .optional()
      .describe('Transport layer. Required for transportable packages.'),
    transport_request: z
      .string()
      .optional()
      .describe(
        'Transport request number, not a task. Required if the package is transportable.',
      ),
    record_changes: z
      .boolean()
      .optional()
      .describe(
        'Enable change recording for the package. Required for transportable packages. Default: false.',
      ),
    application_component: z
      .string()
      .optional()
      .describe('Application component (optional, e.g., BC-ABA)'),
    master_language: z
      .string()
      .optional()
      .describe(MASTER_LANGUAGE_DESCRIPTION),
    detail: z
      .enum(DETAIL_LEVELS)
      .optional()
      .default('terse')
      .describe(DETAIL_WORDS),
  }),
} as const;

type CreatePackageArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

export async function handleCreatePackage(
  context: HandlerContext,
  args: CreatePackageArgs,
) {
  const { connection, logger } = context;

  // The names as the access check read them (`givenName`): a blank
  // super_package is not given, and the package is created top level.
  const packageName = givenName(args.package_name);
  if (packageName === undefined) {
    return return_error(new Error('package_name is required'));
  }
  const superPackage =
    args.super_package === undefined
      ? undefined
      : givenName(args.super_package);
  const detail = detailOf(args);

  return answer(
    { tool: 'CreatePackage', detail },
    // Over RFC in an ABAP session of its own: the session that saves a package
    // cannot change it again (PAK/058, lib/packageSessions.ts).
    () =>
      inOwnSessionOverRfc(connection, logger, 'CreatePackage', (own) =>
        withAdtHeaders(context, 'package.create', (headers) =>
          createAdtClient(own, logger)
            .getPackage(resultsFor(packageDocuments))
            .create(
              {
                packageName,
                // A top-level package has none: adt-clients then writes an
                // empty `<pak:superPackage/>`.
                superPackage,
                description: args.description || packageName,
                packageType: args.package_type,
                softwareComponent: args.software_component,
                transportLayer: args.transport_layer,
                transportRequest: args.transport_request,
                recordChanges: args.record_changes,
                applicationComponent: args.application_component,
                masterLanguage: args.master_language,
              },
              { headers, analyse: analyseException },
            ),
        ),
      ),
    project(detail, terseWrite),
  );
}
