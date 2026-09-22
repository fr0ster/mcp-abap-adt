/**
 * CreatePackage Handler - Create ABAP Package
 *
 * Uses AdtClient.getPackage().create from @mcp-abap-adt/adt-clients 19.
 *
 * A create is one request, and its own answer: `resultSets.ts` maps the
 * `created` slot to `verbatim`, so `project(detail, terseWrite)` reads the
 * status for `terse` while `full`/`raw` answer the document ADT sent instead
 * of discarding it. No corpus fixture for `create-package` exists yet — the
 * corpus README names `/oo/classes create`, `/ddic/domains create` and
 * `/ddic/dataelements create` as the only DDIC-create states captured so
 * far — so this is proven only against the generic `terseWrite`/`verbatim`
 * shape every sibling DDIC create shares, not against a package-specific
 * document.
 *
 * Unlike every other family in this cluster, `AdtPackage.create()` has no
 * `packageName` guard: for a package the name being created IS the object
 * this create is about, and what would strand an un-deletable object
 * elsewhere (`superPackage`) is genuinely optional here — a top-level
 * package has none by design.
 */

import { packageDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CreatePackageLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Create a new ABAP package. - use CreatePackage (high-level) for full workflow with validation, lock, update, check, unlock, and activate.',
  inputSchema: {
    type: 'object',
    properties: {
      package_name: {
        type: 'string',
        description:
          'Package name (e.g., ZOK_TEST_0002). Must follow SAP naming conventions.',
      },
      super_package: {
        type: 'string',
        description:
          'Super package (parent package) name (e.g., ZOK_PACKAGE). Required.',
      },
      description: {
        type: 'string',
        description: 'Package description.',
      },
      package_type: {
        type: 'string',
        description:
          'Package type (development/structure). Defaults to development.',
      },
      software_component: {
        type: 'string',
        description:
          'Software component (e.g., HOME, ZLOCAL). If not provided, SAP will set a default (typically ZLOCAL for local packages).',
      },
      transport_layer: {
        type: 'string',
        description:
          'Transport layer (e.g., ZDEV). Required for transportable packages.',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable packages. A REQUEST number, not a task: an object is created on a request and moved onto a task afterwards with AddTransportObject. A task number here answers SUCCESS on a create and is then refused on the next write with CTS_WBO_API 020, "already locked in request".',
      },
      record_changes: {
        type: 'boolean',
        description:
          'Enable change recording for the package. Required for transportable packages (non-$TMP). Default: false.',
      },
      application_component: {
        type: 'string',
        description: 'Application component (e.g., BC-ABA).',
      },
      session_id: {
        type: 'string',
        description:
          'Session ID from GetSession. If not provided, a new session will be created.',
      },
      session_state: {
        type: 'object',
        description:
          'Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.',
        properties: {
          cookies: { type: 'string' },
          csrf_token: { type: 'string' },
          cookie_store: { type: 'object' },
        },
      },
      ...DETAIL_PROPERTY,
    },
    required: ['package_name', 'super_package', 'description'],
  },
} as const;

interface CreatePackageArgs {
  package_name: string;
  super_package: string;
  description: string;
  package_type?: string;
  software_component?: string;
  transport_layer?: string;
  transport_request?: string;
  record_changes?: boolean;
  application_component?: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleCreatePackage(
  context: HandlerContext,
  args: CreatePackageArgs,
) {
  const { connection, logger } = context;
  const {
    package_name,
    super_package,
    description,
    package_type,
    software_component,
    transport_layer,
    transport_request,
    record_changes,
    application_component,
    session_id,
    session_state,
  } = args;

  if (!package_name || !super_package || !description) {
    return return_error(
      new Error('package_name, super_package, and description are required'),
    );
  }

  if (session_id && session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const packageName = package_name.toUpperCase();
  const superPackage = super_package.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'CreatePackageLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getPackage(resultsFor(packageDocuments))
        .create(
          {
            packageName,
            superPackage,
            description,
            packageType: package_type,
            softwareComponent: software_component,
            transportLayer: transport_layer,
            transportRequest: transport_request,
            recordChanges: record_changes,
            applicationComponent: application_component,
          },
          { analyse: analyseException },
        ),
    project(detail, terseWrite),
  );
}
