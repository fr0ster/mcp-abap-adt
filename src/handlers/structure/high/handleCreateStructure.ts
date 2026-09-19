/**
 * CreateStructure Handler - ABAP Structure Creation via ADT API
 *
 * Uses AdtClient.getStructure().{validate,create,check,activate} from
 * @mcp-abap-adt/adt-clients 19.
 *
 * Workflow: validate -> create -> check -> (activate) — the order the
 * pre-migration handler ran them in, minus the lock/unlock pair it held
 * around nothing.
 *
 * **`fields`/`includes` never reach the object.** They did not before this
 * migration either: the pre-migration handler's own comment said as much
 * ("skip update as structure creation already includes field definitions",
 * which it does not — `create()` posts a metadata document only, see
 * `CreateStructureLow`). The parameters stay on this tool's surface with
 * their pre-migration descriptions; wiring DDL generation from
 * `fields`/`includes` is a separate change, not part of this task.
 *
 * **No lock.** The pre-migration handler locked, wrote nothing, and
 * unlocked — a `withLock` migrating that mechanically would cost two round
 * trips for a body that never writes anything, and would let a refused
 * unlock on that empty window sink an otherwise-good create. Since nothing
 * here needs the object locked (there is no write between `create` and
 * `check`), the lock/unlock pair is dropped rather than faithfully
 * reproduced.
 *
 * **`check` does not gate the answer, and did not before either.** The
 * pre-migration handler caught a genuine (non-"already checked") check
 * failure and only `logger.warn`'d it: the create still answered success and
 * still went on to activate. A migration pass gave this step `analyseCheck`,
 * which turns a `chkrun:checkMessage` of type `E` into a refusal, so a create
 * whose source has a syntax error stopped answering at all — and that change
 * was then written up here as deliberate. It was not: it is a regression,
 * and this step carries `analyseException` again. What genuinely failed —
 * an `exc:exception`, a non-2xx, a broken connection — still stops the
 * chain; findings do not.
 */

import { structureDocuments } from '@mcp-abap-adt/adt-clients';
import {
  analyseActivation,
  analyseException,
} from '@mcp-abap-adt/adt-strategies';
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
import { validateTransportRequest } from '../../../utils/transportValidation.js';

export const TOOL_DEFINITION = {
  name: 'CreateStructure',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Create. Subject: Structure. Will be useful for creating structure. Create a new ABAP structure in SAP system. Creates the structure object in initial state.',
  inputSchema: {
    type: 'object',
    properties: {
      structure_name: {
        type: 'string',
        description:
          'Structure name (e.g., ZZ_S_TEST_001). Must follow SAP naming conventions.',
      },
      description: {
        type: 'string',
        description:
          'Structure description. If not provided, structure_name will be used.',
      },
      package_name: {
        type: 'string',
        description: 'Package name (e.g., ZOK_LOCAL, $TMP for local objects)',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable packages.',
      },
      fields: {
        type: 'array',
        description:
          'Does not reach creation — the shipped create endpoint posts a metadata document only. Use UpdateStructure (with ddl_code) after creating to set the fields.',
        items: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Field name (e.g., CLIENT, MATERIAL_ID)',
            },
            data_type: {
              type: 'string',
              description:
                'Data type: CHAR, NUMC, DATS, TIMS, DEC, INT1, INT2, INT4, INT8, CURR, QUAN, etc.',
            },
            length: {
              type: 'number',
              description: 'Field length',
            },
            decimals: {
              type: 'number',
              description: 'Decimal places (for DEC, CURR, QUAN types)',
              default: 0,
            },
            domain: {
              type: 'string',
              description: 'Domain name for type reference (optional)',
            },
            data_element: {
              type: 'string',
              description: 'Data element name for type reference (optional)',
            },
            structure_ref: {
              type: 'string',
              description: 'Include another structure (optional)',
            },
            table_ref: {
              type: 'string',
              description: 'Reference to table type (optional)',
            },
            description: {
              type: 'string',
              description: 'Field description',
            },
          },
          required: ['name'],
        },
      },
      includes: {
        type: 'array',
        description:
          'Does not reach creation — see `fields`. Use UpdateStructure (with ddl_code) after creating to set includes.',
        items: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Include structure name',
            },
            suffix: {
              type: 'string',
              description: 'Optional suffix for include fields',
            },
          },
          required: ['name'],
        },
      },
      activate: {
        type: 'boolean',
        description:
          'Activate structure after creation. Default: true. Set to false for batch operations (activate multiple objects later).',
      },
      master_language: {
        type: 'string',
        description:
          'Optional master/original language for the created object (e.g. "EN", "DE", "ZH"). Defaults to the session language (SAP_LANGUAGE) or EN.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['structure_name', 'package_name', 'fields'],
  },
} as const;

interface StructureField {
  name: string;
  data_type?: string;
  length?: number;
  decimals?: number;
  domain?: string;
  data_element?: string;
  structure_ref?: string;
  table_ref?: string;
  description?: string;
}

interface StructureInclude {
  name: string;
  suffix?: string;
}

interface CreateStructureArgs {
  structure_name: string;
  description?: string;
  package_name: string;
  transport_request?: string;
  fields: StructureField[];
  includes?: StructureInclude[];
  activate?: boolean;
  master_language?: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleCreateStructure(
  context: HandlerContext,
  args: CreateStructureArgs,
) {
  const { connection, logger } = context;

  if (!args?.structure_name) {
    return return_error('Structure name is required');
  }
  if (!args?.package_name) {
    return return_error('Package name is required');
  }

  validateTransportRequest(args.package_name, args.transport_request);

  if (
    !args?.fields ||
    !Array.isArray(args.fields) ||
    args.fields.length === 0
  ) {
    return return_error('At least one field is required');
  }

  const structureName = args.structure_name.toUpperCase();
  const shouldActivate = args.activate !== false;
  const detail = detailOf(args);

  return answer(
    { tool: 'CreateStructure', detail },
    async (): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>> => {
      const obj = createAdtClient(connection, logger).getStructure(
        resultsFor(structureDocuments),
      );

      const checked = await sequence(
        () =>
          obj.validate(
            {
              structureName,
              description: args.description || structureName,
              packageName: args.package_name,
            },
            { analyse: analyseException },
          ),
        () =>
          obj.create(
            {
              structureName,
              description: args.description || structureName,
              packageName: args.package_name,
              transportRequest: args.transport_request,
              masterLanguage: args.master_language,
            },
            { analyse: analyseException },
          ),
        () =>
          obj.check({ structureName }, 'inactive', {
            analyse: analyseException,
          }),
      );

      if (!checked.ok || !shouldActivate) {
        return checked as IAdtResponse<AdtReading<unknown>, IAdtError>;
      }

      return obj.activate({ structureName }, { analyse: analyseActivation });
    },
    project(detail, terseWrite),
  );
}
