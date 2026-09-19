/**
 * CreateDataElement Handler - ABAP Data Element Creation via ADT API
 *
 * Uses AdtClient.getDataElement().{validate,create,lock,readMetadata,
 * updateMetadata,unlock,check,activate} from @mcp-abap-adt/adt-clients 19.
 *
 * A lifecycle, not one call: validate the name, create the bare object, lock
 * it, read-patch-write the properties the caller gave (through `withLock`,
 * released on every path out), wait for the write to be visible, check the
 * inactive version, and optionally activate — the order the pre-migration
 * handler ran them in: `unlock` then the wait then `check`, because `check`
 * is the first call after the write that reads it back and so the one the
 * wait has to sit ahead of. `create` itself never reaches
 * `type_kind`/`data_type`/`type_name`/`length`/`decimals` (see
 * `CreateDataElementLow`); they reach the object only through the write
 * inside the lock. The pre-migration handler's own wait was
 * `read({withLongPolling: true})`; data element exposes no plain `read` in
 * adt-clients 19 (only `readMetadata`), so the wait here is
 * `readMetadata({withLongPolling: true})`, discarded for its result but not
 * for what it does — this repository's own `xmlPatch.ts` documents the live
 * incident behind it.
 *
 * **`config.packageName` never reaches the wire on `updateMetadata`.** The
 * shipped `updateDataElement()` wire function
 * (`core/dataElement/update.js`) builds its URL and PUT from
 * `params.data_element_name`, `params.transport_request` and `document`
 * only — `params.package_name` is passed in but never read. Not sent (the
 * create call above still carries it, where it is read).
 */

import { dataElementDocuments } from '@mcp-abap-adt/adt-clients';
import {
  analyseActivation,
  analyseCheck,
  analyseException,
  analyseValidation,
} from '@mcp-abap-adt/adt-strategies';
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { patchDataElementXml } from '../../../lib/strategies/dataElementPatch';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { sequence } from '../../../lib/strategies/sequence';
import { withLock } from '../../../lib/strategies/withLock';
import { extractXmlString } from '../../../lib/strategies/xmlPatch';
import { return_error } from '../../../lib/utils';
import { validateTransportRequest } from '../../../utils/transportValidation.js';

export const TOOL_DEFINITION = {
  name: 'CreateDataElement',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Create. Subject: DataElement. Will be useful for creating data element. Create a new ABAP data element in SAP system. Creates the data element object in initial state.',
  inputSchema: {
    type: 'object',
    properties: {
      data_element_name: {
        type: 'string',
        description:
          'Data element name (e.g., ZZ_E_TEST_001). Must follow SAP naming conventions.',
      },
      description: {
        type: 'string',
        description:
          'Data element description. If not provided, data_element_name will be used.',
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
      data_type: {
        type: 'string',
        description:
          "Data type (e.g., CHAR, NUMC) or domain name when type_kind is 'domain'.",
        default: 'CHAR',
      },
      length: {
        type: 'number',
        description: 'Data type length. Usually inherited from domain.',
        default: 100,
      },
      decimals: {
        type: 'number',
        description: 'Decimal places. Usually inherited from domain.',
        default: 0,
      },
      short_label: {
        type: 'string',
        description:
          'Short field label (max 10 chars). Applied during update step after creation.',
      },
      medium_label: {
        type: 'string',
        description:
          'Medium field label (max 20 chars). Applied during update step after creation.',
      },
      long_label: {
        type: 'string',
        description:
          'Long field label (max 40 chars). Applied during update step after creation.',
      },
      heading_label: {
        type: 'string',
        description:
          'Heading field label (max 55 chars). Applied during update step after creation.',
      },
      type_kind: {
        type: 'string',
        description:
          "Type kind: 'domain' (default), 'predefinedAbapType', 'refToPredefinedAbapType', 'refToDictionaryType', 'refToClifType'. If not specified, defaults to 'domain'.",
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
          "Type name: domain name (when type_kind is 'domain'), data element name (when type_kind is 'refToDictionaryType'), or class name (when type_kind is 'refToClifType')",
      },
      search_help: {
        type: 'string',
        description:
          'Search help name. Applied during update step after creation.',
      },
      search_help_parameter: {
        type: 'string',
        description:
          'Search help parameter. Applied during update step after creation.',
      },
      set_get_parameter: {
        type: 'string',
        description:
          'Set/Get parameter ID. Applied during update step after creation.',
      },
      master_language: {
        type: 'string',
        description:
          'Optional master/original language for the created object (e.g. "EN", "DE", "ZH"). Defaults to the session language (SAP_LANGUAGE) or EN.',
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
  data_type?: string;
  length?: number;
  decimals?: number;
  short_label?: string;
  medium_label?: string;
  long_label?: string;
  heading_label?: string;
  type_kind?:
    | 'domain'
    | 'predefinedAbapType'
    | 'refToPredefinedAbapType'
    | 'refToDictionaryType'
    | 'refToClifType';
  type_name?: string;
  search_help?: string;
  search_help_parameter?: string;
  set_get_parameter?: string;
  activate?: boolean;
  master_language?: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleCreateDataElement(
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
  const typeKind = args.type_kind || 'domain';
  const detail = detailOf(args);

  return answer(
    { tool: 'CreateDataElement', detail },
    async (): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>> => {
      const obj = createAdtClient(connection, logger).getDataElement(
        resultsFor(dataElementDocuments),
      );

      const checked = await sequence(
        () =>
          obj.validate(
            {
              dataElementName,
              description: args.description || dataElementName,
              packageName: args.package_name,
            },
            { analyse: analyseValidation },
          ),
        () =>
          obj.create(
            {
              dataElementName,
              description: args.description || dataElementName,
              packageName: args.package_name,
              transportRequest: args.transport_request,
              masterLanguage: args.master_language,
            },
            { analyse: analyseException },
          ),
        () =>
          withLock(
            () => obj.lock({ dataElementName }),
            (
              lockHandle,
            ): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>> =>
              sequence(
                () =>
                  obj.readMetadata(
                    { dataElementName },
                    { analyse: analyseException },
                  ),
                (current) =>
                  obj.updateMetadata(
                    {
                      dataElementName,
                      transportRequest: args.transport_request,
                      document: patchDataElementXml(
                        extractXmlString(
                          current.raw,
                          `data element ${dataElementName}`,
                        ),
                        {
                          description: args.description || dataElementName,
                          type_kind: typeKind,
                          type_name: args.type_name,
                          data_type: args.data_type || 'CHAR',
                          length: args.length || 100,
                          decimals: args.decimals || 0,
                          short_label: args.short_label,
                          medium_label: args.medium_label,
                          long_label: args.long_label,
                          heading_label: args.heading_label,
                          search_help: args.search_help,
                          search_help_parameter: args.search_help_parameter,
                          set_get_parameter: args.set_get_parameter,
                        },
                      ),
                    },
                    { lockHandle, analyse: analyseException },
                  ),
              ),
            (lockHandle) => obj.unlock({ dataElementName }, lockHandle),
          ),
        // Best-effort: wait for the write to be visible, right before the
        // first call that reads it back — see `handleCreateDomain.ts` for
        // why the wait sits here rather than after `check`.
        async () => {
          await obj
            .readMetadata(
              { dataElementName },
              { withLongPolling: true, analyse: analyseException },
            )
            .catch(() => undefined);
          return obj.check({ dataElementName }, undefined, {
            analyse: analyseCheck,
          });
        },
      );

      if (!checked.ok || !shouldActivate) {
        return checked as IAdtResponse<AdtReading<unknown>, IAdtError>;
      }

      return obj.activate({ dataElementName }, { analyse: analyseActivation });
    },
    project(detail, terseWrite),
  );
}
