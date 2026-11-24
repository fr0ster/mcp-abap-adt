/**
 * GetTableSettings - a database table's technical settings.
 *
 * SAP keeps them apart from the table's document, at
 * `/sap/bc/adt/ddic/db/settings/{name}` (`TABL/DTT`), and answers them with
 * media type `application/vnd.sap.adt.table.settings.v2+xml` only (a v1
 * Accept is refused 406, measured on premise 2026-11-19; the cloud's
 * discovery accepts v2 and text/html only, measured 2026-11-19). One GET,
 * through adt-clients' `getTableSettings().readMetadata`.
 *
 * The client is the declared system kind's (`adtClientOf`): on the cloud the
 * document carries `ts:isWritableByAMDP` (measured on the cloud, absent on
 * premise; the cloud's `SDDIC_ADT_TTAB` maps it, Code), and adt-strategies'
 * `cloudTableSettings` refuses a cloud read without it.
 */

import { tableSettingsDocuments } from '@mcp-abap-adt/adt-clients';
import {
  analyseException,
  cloudTableSettings,
  type ICloudTableSettingsAnswer,
  type ITableSettingsAnswer,
  tableSettings,
} from '@mcp-abap-adt/adt-strategies';
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces-adt';
import * as z from 'zod';
import { answer } from '../../../lib/answer';
import { adtClientOf } from '../../../lib/clients';
import { readerParts, toolDescription } from '../../../lib/description';
import { requiredText } from '../../../lib/handlers/argumentRules';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { READ_VERSION_FIELD } from '../../../lib/handlers/readVersion';

export const TOOL_DEFINITION = {
  name: 'GetTableSettings',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription(
    readerParts({
      object: 'the technical settings of an ABAP database table',
    }),
  ),
  inputSchema: z.object({
    table_name: requiredText('table_name is required').describe('Table name.'),
    version: READ_VERSION_FIELD,
  }),
} as const;

type GetTableSettingsArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

/** A settings read, on premise or on the cloud. */
type SettingsRead = ITableSettingsAnswer | ICloudTableSettingsAnswer;

/** The settings as the tool answers them. */
export function settingsAnswer(tableName: string, read: SettingsRead) {
  const { settings } = read;
  return {
    success: true,
    table_name: tableName,
    version: read.version,
    description: read.description,
    data_class: settings.dataClassCategory,
    size_category: settings.sizeCategory,
    buffering: {
      allowed: settings.buffering.allowed,
      type: settings.buffering.type,
      area_key_fields: settings.buffering.areaKeyFields,
    },
    storage_type: settings.storageType,
    sharing_type: settings.sharingType,
    load_unit: settings.loadUnit,
    translation: {
      value: settings.translation.value,
      is_visible: settings.translation.isVisible,
      is_editable: settings.translation.isEditable,
      granularity: settings.translation.granularity,
    },
    logging_enabled: settings.loggingEnabled,
    ...(settings.isWritableByAMDP === undefined
      ? {}
      : { is_writable_by_amdp: settings.isWritableByAMDP }),
  };
}

export async function handleGetTableSettings(
  context: HandlerContext,
  args: GetTableSettingsArgs,
) {
  const { connection, logger } = context;
  const { table_name, version = 'active' } = args;
  const tableName = table_name.toUpperCase();
  const target = adtClientOf(connection, logger);

  const read = (): Promise<IAdtResponse<SettingsRead, IAdtError>> =>
    target.variant === 'cloud'
      ? target.client
          .getTableSettings({
            ...tableSettingsDocuments,
            metadata: cloudTableSettings,
          })
          .readMetadata({ tableName }, { version, analyse: analyseException })
      : target.client
          .getTableSettings({
            ...tableSettingsDocuments,
            metadata: tableSettings,
          })
          .readMetadata({ tableName }, { version, analyse: analyseException });

  return answer({ tool: 'GetTableSettings', detail: 'terse' }, read, (value) =>
    settingsAnswer(tableName, value),
  );
}
