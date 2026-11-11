import * as z from 'zod';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
/**
 * UpdateDataElement Handler - Update Existing ABAP Data Element
 *
 * Uses AdtClient.getDataElement().{lock,readMetadata,updateMetadata,check,
 * unlock,activate} from @mcp-abap-adt/adt-clients 19, through `withLock` —
 * the lock is held for the read-modify-write-check in its body, released on
 * every path out.
 *
 * Workflow: lock -> (read, patch, write, check) -> unlock -> (wait for the
 * write to be visible) -> (activate). `check` runs unconditionally, not
 * gated by `activate` — the pre-migration handler ran it the same way (a
 * refusal there stopped the answer), and it is now a step of the `sequence`
 * below rather than a hand-rolled rethrow. The pre-migration handler's own
 * wait was `read({withLongPolling: true})`; data element exposes no plain
 * `read` in adt-clients 19 (only `readMetadata`), so the wait between
 * `unlock` and `activate` here is `readMetadata({withLongPolling: true})`,
 * discarded for its result but not for what it does — see
 * `handleUpdateDomain.ts` (high) for the live incident this guards against,
 * documented in `documentPatch.ts`. The pre-write "already exists" validation is
 * gone — it tolerated exactly one refusal shape from an endpoint an update
 * never needs to call.
 *
 * **The patched document goes in `options.source`.** See
 * `UpdateDataElementLow` — since `interfaces-adt@9` that is the one body
 * channel, and `AdtDataElement.updateMetadata()` reads `options?.source` only.
 *
 * **`config.packageName` never reaches the wire on an update.** The shipped
 * `updateDataElement()` wire function (`core/dataElement/update.js`) builds
 * its URL and PUT from `params.data_element_name`, `params.transport_request`
 * and `document` only — `params.package_name` is passed in but never read.
 * Not sent.
 */

import {
  dataElementDocuments,
  patchDataElementDocument,
} from '@mcp-abap-adt/adt-clients';
import {
  analyseActivation,
  analyseException,
} from '@mcp-abap-adt/adt-strategies';
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces-adt';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { answer, unlessCredentialFailure } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf } from '../../../lib/strategies/detail';
import {
  type DataElementChanges,
  type DataElementTypeKind,
  dataElementChanges,
} from '../../../lib/strategies/documentChanges';
import { patchedDocument } from '../../../lib/strategies/documentPatch';
import { analyseLock } from '../../../lib/strategies/lockAnswer';
import { project, terseWrite } from '../../../lib/strategies/projections';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { sequence } from '../../../lib/strategies/sequence';
import { atStep } from '../../../lib/strategies/step';
import { carryCleanup, withLock } from '../../../lib/strategies/withLock';
import { return_error } from '../../../lib/utils';
import { validateTransportRequest } from '../../../utils/transportValidation.js';

export const TOOL_DEFINITION = {
  name: 'UpdateDataElement',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Update an existing ABAP data element. Locks, updates with provided parameters (complete replacement), unlocks, and optionally activates.',
  inputSchema: z.object({
    data_element_name: z.string().describe('Data element name to update'),
    description: z.string().optional().describe('New data element description'),
    package_name: z.string().describe('Package name'),
    transport_request: z
      .string()
      .optional()
      .describe(
        'Transport request number, not a task. Required for transportable packages.',
      ),
    type_kind: z
      .enum([
        'domain',
        'predefinedAbapType',
        'refToPredefinedAbapType',
        'refToDictionaryType',
        'refToClifType',
      ])
      .default('domain')
      .optional()
      .describe(
        'Type kind: domain, predefinedAbapType, refToPredefinedAbapType, refToDictionaryType, refToClifType',
      ),
    type_name: z
      .string()
      .optional()
      .describe(
        'Type name: domain name, data element name, or class name (depending on type_kind)',
      ),
    data_type: z
      .string()
      .optional()
      .describe(
        'Data type (CHAR, NUMC, etc.) - for predefinedAbapType or refToPredefinedAbapType',
      ),
    length: z
      .number()
      .optional()
      .describe('Length - for predefinedAbapType or refToPredefinedAbapType'),
    decimals: z
      .number()
      .optional()
      .describe('Decimals - for predefinedAbapType or refToPredefinedAbapType'),
    field_label_short: z
      .string()
      .optional()
      .describe('Short field label (max 10 chars)'),
    field_label_medium: z
      .string()
      .optional()
      .describe('Medium field label (max 20 chars)'),
    field_label_long: z
      .string()
      .optional()
      .describe('Long field label (max 40 chars)'),
    field_label_heading: z
      .string()
      .optional()
      .describe('Heading field label (max 55 chars)'),
    search_help: z.string().optional().describe('Search help name'),
    search_help_parameter: z
      .string()
      .optional()
      .describe('Search help parameter'),
    set_get_parameter: z.string().optional().describe('Set/Get parameter ID'),
    activate: z
      .boolean()
      .default(true)
      .optional()
      .describe('Activate data element after update (default: true)'),
    ...DETAIL_SHAPE,
  }),
} as const;

interface DataElementArgs {
  data_element_name: string;
  description?: string;
  package_name: string;
  transport_request?: string;
  type_kind?: DataElementTypeKind;
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
        () => obj.lock({ dataElementName }, { analyse: analyseLock }),
        (lockHandle): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>> =>
          sequence(
            atStep('read metadata', () =>
              obj.readMetadata(
                { dataElementName },
                { version: 'workingArea', analyse: analyseException },
              ),
            ),
            async (current) =>
              patchedDocument(
                patchDataElementDocument(
                  current.raw,
                  dataElementChanges(changes),
                ),
                `data element ${dataElementName}`,
              ),
            atStep('update metadata', (document) =>
              withAdtHeaders(context, 'dataElement.updateMetadata', (headers) =>
                obj.updateMetadata(
                  {
                    dataElementName,
                    transportRequest: args.transport_request,
                  },
                  {
                    headers,
                    source: document,
                    lockHandle,
                    analyse: analyseException,
                  },
                ),
              ),
            ),
            atStep('check', () =>
              withAdtHeaders(context, 'dataElement.check', (headers) =>
                obj.check({ dataElementName }, undefined, {
                  headers,
                  analyse: analyseException,
                }),
              ),
            ),
          ),
        (lockHandle) =>
          obj.unlock({ dataElementName }, lockHandle, {
            analyse: analyseException,
          }),
        { type: 'DATA_ELEMENT', name: dataElementName },
      );

      if (!written.ok) {
        return written;
      }

      // Best-effort (a credential failure ends the call): wait for the write to be visible before activating.
      await obj
        .readMetadata(
          { dataElementName },
          {
            version: 'inactive',
            withLongPolling: true,
            analyse: analyseException,
          },
        )
        .catch(unlessCredentialFailure);

      if (!shouldActivate) {
        return written;
      }

      return carryCleanup(
        written,
        atStep('activate', () =>
          withAdtHeaders(context, 'dataElement.activate', (headers) =>
            obj.activate(
              { dataElementName },
              { headers, analyse: analyseActivation },
            ),
          ),
        ),
      );
    },
    project(detail, terseWrite),
  );
}
