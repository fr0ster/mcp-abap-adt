/**
 * UpdateDataElement Handler - Update Existing ABAP Data Element
 *
 * Uses AdtClient.getDataElement().{lock,readMetadata,updateMetadata,unlock,
 * activate} from @mcp-abap-adt/adt-clients 19, through `withLock` — the lock
 * is held for the read-modify-write in its body, released on every path out.
 *
 * Workflow: lock -> (read, patch, write) -> unlock -> (activate). The
 * post-write syntax check the pre-migration handler ran (swallowed except
 * for a genuine, non-"already checked" refusal) is gone: it duplicated what
 * `updateMetadata`'s own `analyseException` already verdicts. The pre-write
 * "already exists" validation is also gone — it tolerated exactly one
 * refusal shape from an endpoint an update never needs to call.
 *
 * **The patched document goes in `config.document`, not `options.xmlContent`.**
 * See `UpdateDataElementLow` — the shipped `AdtDataElement.updateMetadata()`
 * reads `config.document` only.
 */

import { dataElementDocuments } from '@mcp-abap-adt/adt-clients';
import {
  analyseActivation,
  analyseException,
} from '@mcp-abap-adt/adt-strategies';
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type DataElementChanges,
  patchDataElementXml,
} from '../../../lib/strategies/dataElementPatch';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { withLock } from '../../../lib/strategies/withLock';
import { extractXmlString } from '../../../lib/strategies/xmlPatch';
import { return_error } from '../../../lib/utils';
import { validateTransportRequest } from '../../../utils/transportValidation.js';

export const TOOL_DEFINITION = {
  name: 'UpdateDataElement',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Update, Create. Subject: DataElement. Will be useful for updating or creating data element. Update an existing ABAP data element. Locks, updates with provided parameters (complete replacement), unlocks, and optionally activates.',
  inputSchema: {
    type: 'object',
    properties: {
      data_element_name: {
        type: 'string',
        description: 'Data element name to update (e.g., ZZ_TEST_DTEL_01)',
      },
      description: {
        type: 'string',
        description: 'New data element description',
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
      type_kind: {
        type: 'string',
        description:
          'Type kind: domain, predefinedAbapType, refToPredefinedAbapType, refToDictionaryType, refToClifType',
        enum: [
          'domain',
          'predefinedAbapType',
          'refToPredefinedAbapType',
          'refToDictionaryType',
          'refToClifType',
        ],
        default: 'domain',
      },
      type_name: {
        type: 'string',
        description:
          'Type name: domain name, data element name, or class name (depending on type_kind)',
      },
      data_type: {
        type: 'string',
        description:
          'Data type (CHAR, NUMC, etc.) - for predefinedAbapType or refToPredefinedAbapType',
      },
      length: {
        type: 'number',
        description:
          'Length - for predefinedAbapType or refToPredefinedAbapType',
      },
      decimals: {
        type: 'number',
        description:
          'Decimals - for predefinedAbapType or refToPredefinedAbapType',
      },
      field_label_short: {
        type: 'string',
        description: 'Short field label (max 10 chars)',
      },
      field_label_medium: {
        type: 'string',
        description: 'Medium field label (max 20 chars)',
      },
      field_label_long: {
        type: 'string',
        description: 'Long field label (max 40 chars)',
      },
      field_label_heading: {
        type: 'string',
        description: 'Heading field label (max 55 chars)',
      },
      search_help: {
        type: 'string',
        description: 'Search help name',
      },
      search_help_parameter: {
        type: 'string',
        description: 'Search help parameter',
      },
      set_get_parameter: {
        type: 'string',
        description: 'Set/Get parameter ID',
      },
      activate: {
        type: 'boolean',
        description: 'Activate data element after update (default: true)',
        default: true,
      },
      ...DETAIL_PROPERTY,
    },
    required: ['data_element_name', 'package_name'],
  },
} as const;

interface DataElementArgs {
  data_element_name: string;
  description?: string;
  package_name: string;
  transport_request?: string;
  type_kind?: string;
  type_name?: string;
  data_type?: string;
  length?: number;
  decimals?: number;
  field_label_short?: string;
  field_label_medium?: string;
  field_label_long?: string;
  field_label_heading?: string;
  search_help?: string;
  search_help_parameter?: string;
  set_get_parameter?: string;
  activate?: boolean;
  detail?: 'terse' | 'full' | 'raw';
}

function changesOf(args: DataElementArgs): DataElementChanges {
  return {
    description: args.description,
    type_kind: args.type_kind,
    type_name: args.type_name,
    data_type: args.data_type,
    length: args.length,
    decimals: args.decimals,
    short_label: args.field_label_short,
    medium_label: args.field_label_medium,
    long_label: args.field_label_long,
    heading_label: args.field_label_heading,
    search_help: args.search_help,
    search_help_parameter: args.search_help_parameter,
    set_get_parameter: args.set_get_parameter,
  };
}

export async function handleUpdateDataElement(
  context: HandlerContext,
  args: DataElementArgs,
) {
  const { connection, logger } = context;

  if (!args?.data_element_name) {
    return return_error('Data element name is required');
  }
  if (!args?.package_name) {
    return return_error('Package name is required');
  }

  validateTransportRequest(args.package_name, args.transport_request);

  const dataElementName = args.data_element_name.toUpperCase();
  const shouldActivate = args.activate !== false;
  const detail = detailOf(args);
  const changes = changesOf(args);

  return answer(
    { tool: 'UpdateDataElement', detail },
    async (): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>> => {
      const obj = createAdtClient(connection, logger).getDataElement(
        resultsFor(dataElementDocuments),
      );

      const written = await withLock(
        () => obj.lock({ dataElementName }),
        async (
          lockHandle,
        ): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>> => {
          const current = await obj.readMetadata(
            { dataElementName },
            { analyse: analyseException },
          );
          if (!current.ok) {
            return current as IAdtResponse<AdtReading<unknown>, IAdtError>;
          }
          return obj.updateMetadata(
            {
              dataElementName,
              packageName: args.package_name,
              transportRequest: args.transport_request,
              document: patchDataElementXml(
                extractXmlString(
                  current.getResult().value.raw,
                  `data element ${dataElementName}`,
                ),
                changes,
              ),
            },
            { lockHandle, analyse: analyseException },
          );
        },
        (lockHandle) => obj.unlock({ dataElementName }, lockHandle),
      );

      if (!written.ok || !shouldActivate) {
        return written as IAdtResponse<AdtReading<unknown>, IAdtError>;
      }

      return obj.activate({ dataElementName }, { analyse: analyseActivation });
    },
    project(detail, terseWrite),
  );
}
