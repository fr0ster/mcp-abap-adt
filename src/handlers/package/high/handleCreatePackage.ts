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
 * **The `inputSchema` moves from a bare zod raw shape to plain JSON Schema.**
 * Both are read identically by `scripts/list-tools.ts` (see its own comment
 * on the two shapes it supports), so this changes nothing about the tool
 * surface — it only lets `...DETAIL_PROPERTY` spread the same way every
 * other migrated handler in this repository does.
 */

import { packageDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CreatePackage',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Create a new ABAP package in SAP system. Packages are containers for development objects and are essential for organizing code.',
  inputSchema: {
    type: 'object',
    properties: {
      package_name: {
        type: 'string',
        description:
          'Package name (e.g., ZOK_TEST_0002). Must follow SAP naming conventions (start with Z or Y for customer namespace).',
      },
      description: {
        type: 'string',
        description:
          'Package description. If not provided, package_name will be used.',
      },
      super_package: {
        type: 'string',
        description:
          'Parent package name (e.g., ZOK_PACKAGE). Required for structure packages.',
      },
      package_type: {
        type: 'string',
        enum: ['development', 'structure'],
        default: 'development',
        description: "Package type: 'development' (default) or 'structure'",
      },
      software_component: {
        type: 'string',
        description:
          'Software component (e.g., HOME, ZLOCAL). If not provided, SAP will set a default (typically ZLOCAL for local packages).',
      },
      transport_layer: {
        type: 'string',
        description:
          'Transport layer (e.g., ZE19). Required for transportable packages.',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required if package is transportable.',
      },
      record_changes: {
        type: 'boolean',
        description:
          'Enable change recording for the package. Required for transportable packages. Default: false.',
      },
      application_component: {
        type: 'string',
        description: 'Application component (optional, e.g., BC-ABA)',
      },
      master_language: {
        type: 'string',
        description:
          'Optional master/original language for the created object (e.g. "EN", "DE", "ZH"). Defaults to the session language (SAP_LANGUAGE) or EN.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['package_name', 'super_package'],
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
