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
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CreatePackage',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Create a new ABAP package in SAP system. Packages are containers for development objects and are essential for organizing code.',
  inputSchema: {
    package_name: z
      .string()
      .describe(
        'Package name (e.g., ZOK_TEST_0002). Must follow SAP naming conventions (start with Z or Y for customer namespace).',
      ),
    description: z
      .string()
      .optional()
      .describe(
        'Package description. If not provided, package_name will be used.',
      ),
    super_package: z
      .string()
      .describe(
        'Parent package name (e.g., ZOK_PACKAGE). Required for structure packages.',
      ),
    package_type: z
      .enum(['development', 'structure'])
      .default('development')
      .describe("Package type: 'development' (default) or 'structure'"),
    software_component: z
      .string()
      .optional()
      .describe(
        'Software component (e.g., HOME, ZLOCAL). If not provided, SAP will set a default (typically ZLOCAL for local packages).',
      ),
    transport_layer: z
      .string()
      .optional()
      .describe(
        'Transport layer (e.g., ZE19). Required for transportable packages.',
      ),
    transport_request: z
      .string()
      .optional()
      .describe(
        'Transport request number (e.g., E19K905635). Required if package is transportable.',
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
      .describe(
        'Optional master/original language for the created object (e.g. "EN", "DE", "ZH"). Defaults to the session language (SAP_LANGUAGE) or EN.',
      ),
    detail: z
      .enum(['terse', 'full', 'raw'])
      .optional()
      .default('terse')
      .describe(
        'How much of the answer to return: "terse" (default, the fields you need to act), "full" (the whole parse), "raw" (the document as ADT sent it).',
      ),
  },
} as const;

interface CreatePackageArgs {
  package_name: string;
  description?: string;
  super_package: string;
  package_type?: string;
  software_component?: string;
  transport_layer?: string;
  transport_request?: string;
  record_changes?: boolean;
  application_component?: string;
  master_language?: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleCreatePackage(
  context: HandlerContext,
  args: CreatePackageArgs,
) {
  const { connection, logger } = context;

  if (!args?.package_name) {
    return return_error(new Error('package_name is required'));
  }
  if (!args?.super_package) {
    return return_error(new Error('super_package is required'));
  }

  const packageName = args.package_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'CreatePackage', detail },
    () =>
      createAdtClient(connection, logger)
        .getPackage(resultsFor(packageDocuments))
        .create(
          {
            packageName,
            superPackage: args.super_package.toUpperCase(),
            description: args.description || packageName,
            packageType: args.package_type,
            softwareComponent: args.software_component,
            transportLayer: args.transport_layer,
            transportRequest: args.transport_request,
            recordChanges: args.record_changes,
            applicationComponent: args.application_component,
            masterLanguage: args.master_language,
          },
          { analyse: analyseException },
        ),
    project(detail, terseWrite),
  );
}
