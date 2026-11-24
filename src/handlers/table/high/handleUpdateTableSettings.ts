/**
 * UpdateTableSettings - write a table's technical settings.
 *
 * One call: LOCK the settings, patch the named settings, UNLOCK, then
 * activate the table when `activate` is true and the release was clean.
 *
 * - **Their own lock.** The settings are locked as `TABT`, apart from the
 *   table's `TABL` (Code, both systems: `CL_TABT_WB_PERSIST` lock,
 *   `ENQUEUE_ESDICT … objtype = cl_tabt_object_data=>co_sub_transport_type`,
 *   `'TABT'`; measured: a settings LOCK beside a table LOCK answered 200, in
 *   either order, on premise and on the cloud, 2026-11-19).
 * - **The patch is adt-clients'.** `patchMetadata` reads the working area
 *   with its ETag, overlays the named settings and PUTs the whole document
 *   with `If-Match` (adt-clients 46.1.0): SAP writes every field from the
 *   document and resets one left out (Code, both systems:
 *   `CL_TABT_WB_PERSIST->move_adt_to_ddv`; measured on both 2026-11-19), so the
 *   server never builds or merges a document itself.
 * - **The cloud client on the cloud.** The patch keeps `isWritableByAMDP` as
 *   read unless it is named, and refuses a cloud read without it, only on a
 *   handler the cloud client builds (adt-clients 46.1.0): `adtClientOf` gives
 *   the declared system kind's client.
 * - **Activating the table activates its settings** (measured on premise and
 *   on the cloud, 2026-11-19). An activation is judged by its messages
 *   (`analyseActivation`): SAP may answer `activationExecuted="true"` with an
 *   error and leave the table inactive (measured on both, a data class SAP
 *   stored but refused at activation, 2026-11-19).
 */

import {
  tableDocuments,
  tableSettingsDocuments,
} from '@mcp-abap-adt/adt-clients';
import {
  analyseActivation,
  analyseException,
} from '@mcp-abap-adt/adt-strategies';
import {
  type AdtModernVariant,
  type IAdtError,
  type IAdtResponse,
  type ITableBufferingChange,
  type ITableSettingsChangesOf,
  TABLE_SETTINGS_MEDIA_TYPE,
} from '@mcp-abap-adt/interfaces-adt';
import * as z from 'zod';
import type { TableSettingsApi } from '../../../lib/adtClientContract';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import type { ProjectionVariant } from '../../../lib/adtProjections';
import { answer } from '../../../lib/answer';
import { adtClientOf } from '../../../lib/clients';
import { updateTool } from '../../../lib/description';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_SHAPE, detailOf } from '../../../lib/strategies/detail';
import { analyseLock } from '../../../lib/strategies/lockAnswer';
import { project, terseWrite } from '../../../lib/strategies/projections';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { atStep } from '../../../lib/strategies/step';
import { cleanupOf } from '../../../lib/strategies/stepResponse';
import { carryCleanup, withLock } from '../../../lib/strategies/withLock';
import { byVariant } from '../../../lib/variantDefinition';
import { AMDP_FLAG, SETTINGS_SHAPE } from '../tableSettingsFields';

/** The fields every variant's schema ends with. */
const TAIL = {
  transport_request: z
    .string()
    .optional()
    .describe(
      'Transport request number, not a task. Optional if the table is local or already in a transport request.',
    ),
  activate: z
    .boolean()
    .describe(
      'true activates the table after the settings are written; false leaves them inactive.',
    ),
  ...DETAIL_SHAPE,
};

/** The update's schema on `variant`: the AMDP flag on the cloud only. */
function settingsSchema(variant: ProjectionVariant) {
  const shape =
    variant === 'cloud'
      ? { ...SETTINGS_SHAPE, is_writable_by_amdp: AMDP_FLAG, ...TAIL }
      : { ...SETTINGS_SHAPE, ...TAIL };
  // The on-premise object keeps keys it does not declare, so the refinement
  // sees a cloud-only flag given there (`loose`).
  const object = variant === 'cloud' ? z.object(shape) : z.looseObject(shape);
  return object.superRefine((args, ctx) => {
    // The on-premise table has no AMDP flag (S7): a call naming it is
    // refused rather than written without it.
    if (variant === 'onprem' && 'is_writable_by_amdp' in args) {
      ctx.addIssue({
        code: 'custom',
        message: 'is_writable_by_amdp is taken on cloud systems',
        path: ['is_writable_by_amdp'],
      });
    }
    const changes =
      variant === 'cloud' ? cloudChangesOf(args) : changesOf(args);
    if (changes === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'Name at least one setting to write',
        path: ['table_name'],
      });
    }
  });
}

export const TOOL_DEFINITION = {
  name: 'UpdateTableSettings',
  available_in: ['onprem', 'cloud'] as const,
  ...byVariant((variant) => ({
    description: updateTool({
      object:
        'the technical settings of an existing ABAP database table, its data class, size category, buffering and logging',
      how: ', each given over the stored one',
    }),
    inputSchema: settingsSchema(variant),
  })),
} as const;

/** The arguments as the cloud schema reads them; on premise without the flag. */
export type UpdateTableSettingsArgs = z.output<
  ReturnType<typeof settingsSchema>
> & {
  is_writable_by_amdp?: boolean | undefined;
};

/** A buffering change from the arguments, `undefined` when none is named. */
function bufferingOf(
  buffering: UpdateTableSettingsArgs['buffering'],
): ITableBufferingChange | undefined {
  if (buffering === undefined) return undefined;
  const { allowed, type, area_key_fields: areaKeyFields } = buffering;
  const allowedPart = allowed === undefined ? {} : { allowed };
  if (type === 'G') {
    return {
      ...allowedPart,
      type,
      ...(areaKeyFields === undefined ? {} : { areaKeyFields }),
    };
  }
  if (type !== undefined) return { ...allowedPart, type };
  if (areaKeyFields !== undefined) return { ...allowedPart, areaKeyFields };
  if (allowed !== undefined) return { allowed };
  return undefined;
}

/** The fields an update names, before the cloud flag. */
interface NamedSettings {
  readonly dataClassCategory?: string;
  readonly sizeCategory?: string;
  readonly buffering?: ITableBufferingChange;
  readonly storageType?: string;
  readonly sharingType?: string;
  readonly loadUnit?: string;
  readonly translation?: { readonly value: string };
  readonly loggingEnabled?: boolean;
}

/** The settings the arguments name, `undefined` when they name none. */
function namedSettings(args: UpdateTableSettingsArgs): NamedSettings {
  const buffering = bufferingOf(args.buffering);
  return {
    ...(args.data_class === undefined
      ? {}
      : { dataClassCategory: args.data_class }),
    ...(args.size_category === undefined
      ? {}
      : { sizeCategory: args.size_category }),
    ...(buffering === undefined ? {} : { buffering }),
    ...(args.storage_type === undefined
      ? {}
      : { storageType: args.storage_type }),
    ...(args.sharing_type === undefined
      ? {}
      : { sharingType: args.sharing_type }),
    ...(args.load_unit === undefined ? {} : { loadUnit: args.load_unit }),
    ...(args.translation === undefined
      ? {}
      : { translation: { value: args.translation } }),
    ...(args.logging_enabled === undefined
      ? {}
      : { loggingEnabled: args.logging_enabled }),
  };
}

/**
 * The on-premise change set the arguments name, `undefined` when they name
 * no setting: each branch states the setting it requires, so the value is
 * the "at least one setting" the patch's type asks for.
 */
function changesOf(
  args: UpdateTableSettingsArgs,
): ITableSettingsChangesOf<'onprem'> | undefined {
  const named = namedSettings(args);
  if (named.dataClassCategory !== undefined)
    return { ...named, dataClassCategory: named.dataClassCategory };
  if (named.sizeCategory !== undefined)
    return { ...named, sizeCategory: named.sizeCategory };
  if (named.buffering !== undefined)
    return { ...named, buffering: named.buffering };
  if (named.storageType !== undefined)
    return { ...named, storageType: named.storageType };
  if (named.sharingType !== undefined)
    return { ...named, sharingType: named.sharingType };
  if (named.loadUnit !== undefined)
    return { ...named, loadUnit: named.loadUnit };
  if (named.translation !== undefined)
    return { ...named, translation: named.translation };
  if (named.loggingEnabled !== undefined)
    return { ...named, loggingEnabled: named.loggingEnabled };
  return undefined;
}

/** The cloud change set: the on-premise one, and the AMDP flag when named. */
function cloudChangesOf(
  args: UpdateTableSettingsArgs,
): ITableSettingsChangesOf<'cloud'> | undefined {
  const flag = args.is_writable_by_amdp;
  const named = changesOf(args);
  if (flag === undefined) return named;
  return { ...namedSettings(args), isWritableByAMDP: flag };
}

/** The result set the settings handler is built with. */
const settingsResults = () => resultsFor(tableSettingsDocuments);

/** The settings handler of a client of variant `V`. */
type SettingsHandler<V extends AdtModernVariant> = TableSettingsApi<
  ReturnType<typeof settingsResults>,
  V
>;

/** The write's answer: SAP's answer to the PUT, as a reading. */
type Written = IAdtResponse<
  ReturnType<ReturnType<typeof settingsResults>['metadataUpdated']>,
  IAdtError
>;

/** Patch `changes` under `lockHandle`: the library's read and guarded PUT. */
function patchSettings<V extends AdtModernVariant>(
  settings: SettingsHandler<V>,
  config: { tableName: string; transportRequest?: string | undefined },
  changes: ITableSettingsChangesOf<Extract<V, AdtModernVariant>>,
  lockHandle: string,
): Promise<Written> {
  return settings.patchMetadata(
    { ...config, changes },
    {
      headers: { accept: TABLE_SETTINGS_MEDIA_TYPE },
      lockHandle,
      analyse: analyseException,
    },
  );
}

/**
 * The settings' write under a lock the caller holds (compact HandlerUpdate):
 * `patchMetadata` alone, no lock, unlock or activation of its own; the
 * change set typed by the variant the client was built for.
 */
export function patchTableSettingsUnderLock(
  context: Pick<HandlerContext, 'connection' | 'logger'>,
  args: UpdateTableSettingsArgs,
  lockHandle: string,
) {
  const target = adtClientOf(context.connection, context.logger);
  const config = {
    tableName: args.table_name.toUpperCase(),
    transportRequest: args.transport_request,
  };
  return target.variant === 'cloud'
    ? writeOrRefuse(cloudChangesOf(args), (changes) =>
        patchSettings(
          target.client.getTableSettings(settingsResults()),
          config,
          changes,
          lockHandle,
        ),
      )
    : writeOrRefuse(changesOf(args), (changes) =>
        patchSettings(
          target.client.getTableSettings(settingsResults()),
          config,
          changes,
          lockHandle,
        ),
      );
}

/**
 * LOCK the settings, patch `changes` under the handle, UNLOCK: one atomic
 * call, the release reported when it is refused (`withLock`).
 */
function writeSettings<V extends AdtModernVariant>(
  settings: SettingsHandler<V>,
  config: { tableName: string; transportRequest?: string | undefined },
  changes: ITableSettingsChangesOf<Extract<V, AdtModernVariant>>,
) {
  return withLock(
    () =>
      settings.lock({ tableName: config.tableName }, { analyse: analyseLock }),
    atStep(
      'update',
      (lockHandle: string): Promise<Written> =>
        patchSettings(settings, config, changes, lockHandle),
    ),
    (lockHandle) =>
      settings.unlock({ tableName: config.tableName }, lockHandle, {
        analyse: analyseException,
      }),
    { type: 'TABLE', name: config.tableName },
  );
}

export async function handleUpdateTableSettings(
  context: HandlerContext,
  args: UpdateTableSettingsArgs,
) {
  const { connection, logger } = context;
  const tableName = args.table_name.toUpperCase();
  const detail = detailOf(args);
  const config = { tableName, transportRequest: args.transport_request };

  return answer(
    { tool: 'UpdateTableSettings', detail },
    async (): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>> => {
      const target = adtClientOf(connection, logger);
      // The schema refuses a call naming no setting; the change set is
      // built once, typed by the variant the client was built for.
      const written =
        target.variant === 'cloud'
          ? await writeOrRefuse(cloudChangesOf(args), (changes) =>
              writeSettings(
                target.client.getTableSettings(settingsResults()),
                config,
                changes,
              ),
            )
          : await writeOrRefuse(changesOf(args), (changes) =>
              writeSettings(
                target.client.getTableSettings(settingsResults()),
                config,
                changes,
              ),
            );

      // The table is activated only after a clean release: a settings lock
      // SAP may still hold leaves the answer to the caller, with the lock.
      if (!written.ok || !args.activate || cleanupOf(written) !== undefined) {
        return written;
      }

      return carryCleanup(
        written,
        atStep('activate', () =>
          withAdtHeaders(context, 'table.activate', (headers) =>
            target.client
              .getTable(resultsFor(tableDocuments))
              .activate({ tableName }, { headers, analyse: analyseActivation }),
          ),
        ),
      );
    },
    project(detail, terseWrite),
  );
}

/**
 * `write` with the change set, or the refusal of a call naming no setting
 * (the schema refuses it first; a caller past the schema meets it here),
 * nothing sent.
 */
async function writeOrRefuse<C, T>(
  changes: C | undefined,
  write: (changes: C) => Promise<T>,
): Promise<T> {
  if (changes === undefined)
    throw new Error('Name at least one setting to write');
  return write(changes);
}
