/**
 * The locks of an object's sub-resources: a table's technical settings and
 * the text elements of a program, a function group or a class.
 *
 * - **The settings' own lock**, `TABT`, apart from the table's (Code, both
 *   systems: `CL_TABT_WB_PERSIST->if_wb_object_persist~lock`,
 *   `ENQUEUE_ESDICT … objtype = cl_tabt_object_data=>co_sub_transport_type`;
 *   measured: the settings LOCK and UNLOCK answer 200 with the table locked
 *   or not, on premise and on the cloud, 2026-11-19). Taken through the
 *   variant's own client, so the cloud guard holds.
 * - **The text elements' own lock**, `TEXT`, at their address (Code:
 *   `lcl_access_permission->modify`, `cl_adt_lock_handle=>get_instance(
 *   'TEXT' )`; measured: LOCK and UNLOCK 200 on both; the cloud's LOCK
 *   answers `MODIFICATION_SUPPORT=NoModification` and the PUT is still
 *   saved).
 *
 * A lock clash between two users is SAP's enqueue refusal, passed through as
 * SAP answers it.
 */

import {
  tableSettingsDocuments,
  textElementsDocuments,
} from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { adtClientOf, textElementsClientOf } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { analyseLock } from '../../../lib/strategies/lockAnswer';
import { resultsFor } from '../../../lib/strategies/resultSets';

/** The sub-resource kinds the lock tools take. */
export type SubResourceKind =
  | 'table_settings'
  | 'program_text_elements'
  | 'function_group_text_elements'
  | 'class_text_elements';

/** The text elements' owner, as the library names it. */
function textOwner(
  kind: Exclude<SubResourceKind, 'table_settings'>,
  objectName: string,
) {
  switch (kind) {
    case 'program_text_elements':
      return { objectKind: 'program' as const, objectName };
    case 'function_group_text_elements':
      return { objectKind: 'functionGroup' as const, objectName };
    case 'class_text_elements':
      return { objectKind: 'class' as const, objectName };
  }
}

/** LOCK the sub-resource `kind` of `objectName`: SAP's lock handle. */
export function lockSubResource(
  context: Pick<HandlerContext, 'connection' | 'logger'>,
  kind: SubResourceKind,
  objectName: string,
) {
  const { connection, logger } = context;
  if (kind === 'table_settings') {
    const target = adtClientOf(connection, logger);
    return target.variant === 'cloud'
      ? target.client
          .getTableSettings(resultsFor(tableSettingsDocuments))
          .lock({ tableName: objectName }, { analyse: analyseLock })
      : target.client
          .getTableSettings(resultsFor(tableSettingsDocuments))
          .lock({ tableName: objectName }, { analyse: analyseLock });
  }
  return textElementsClientOf(connection, logger)
    .getTextElements(resultsFor(textElementsDocuments))
    .lock(textOwner(kind, objectName), { analyse: analyseLock });
}

/** UNLOCK the sub-resource `kind` of `objectName` under `lockHandle`. */
export function unlockSubResource(
  context: Pick<HandlerContext, 'connection' | 'logger'>,
  kind: SubResourceKind,
  objectName: string,
  lockHandle: string,
) {
  const { connection, logger } = context;
  if (kind === 'table_settings') {
    const target = adtClientOf(connection, logger);
    return target.variant === 'cloud'
      ? target.client
          .getTableSettings(resultsFor(tableSettingsDocuments))
          .unlock({ tableName: objectName }, lockHandle, {
            analyse: analyseException,
          })
      : target.client
          .getTableSettings(resultsFor(tableSettingsDocuments))
          .unlock({ tableName: objectName }, lockHandle, {
            analyse: analyseException,
          });
  }
  return textElementsClientOf(connection, logger)
    .getTextElements(resultsFor(textElementsDocuments))
    .unlock(textOwner(kind, objectName), lockHandle, {
      analyse: analyseException,
    });
}
