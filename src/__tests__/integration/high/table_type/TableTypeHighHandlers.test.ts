/**
 * Integration tests for the table type (TTYP/DA) tools, high and compact.
 *
 * **Where it runs: on premise and on ABAP cloud** (`create_table_type` /
 * `builder_table_type`, `available_in: ["onprem", "cloud"]`). On premise the
 * run creates a local package of its own ($ZMCP_T<run>, no transport) and
 * deletes it last; on ABAP cloud it works in `shared_dependencies.package`
 * with the configured transport. Without an integration configuration the
 * case skips and says so (LambdaTester: "No configuration found").
 *
 * Lifecycle, one run, every object of its own:
 *   CreateTableType with a definition (activated): the stored definition it
 *   answers, read active after the activation, is what GetTableType reads
 *   -> UpdateTableType changing the access type: SAP's own key-kind rule shows
 *      in the stored definition (measured on premise, 2026-11-01: a hashed
 *      access forces a unique key, a standard one a non-unique one)
 *   -> UpdateTableType activate:false (sorted): stored_version inactive;
 *      GetTableType inactive / workingArea read it, active the active one
 *   -> CheckTableType active and inactive -> GetObjectVersions and one
 *      version's source (recorded: what it answers) -> GetTypeInfo shows the
 *      row type
 *   -> a definition SAP stores and refuses to activate (an empty key under a
 *      sorted access: "Empty keys are only allowed in standard tables",
 *      measured on premise 2026-11-01): the refusal carries the stored definition,
 *      the inactive version
 *   -> compact: HandlerCreate, HandlerGet, HandlerLock, HandlerUpdate with the
 *      read document, HandlerUnlock, HandlerValidate (a free name),
 *      HandlerCheckRun, HandlerDeletionCheck, HandlerActivate, HandlerWhereUsed,
 *      HandlerDelete
 *   -> ActivateObjects TTYP/DA (the sorted version becomes active) -> DeleteTableType
 *   -> afterAll: whatever is left deleted, the package last; SearchObject by
 *      the run's names answers no hit.
 *
 * Run: MCP_TEST_CONFIG=<config> npm test -- src/__tests__/integration/high/table_type/TableTypeHighHandlers.test.ts
 */

import { handleHandlerActivate } from '../../../../../compact-modify/src/handlers/handleHandlerActivate';
import { handleHandlerCreate } from '../../../../../compact-modify/src/handlers/handleHandlerCreate';
import { handleHandlerDelete } from '../../../../../compact-modify/src/handlers/handleHandlerDelete';
import { handleHandlerLock } from '../../../../../compact-modify/src/handlers/handleHandlerLock';
import { handleHandlerUnlock } from '../../../../../compact-modify/src/handlers/handleHandlerUnlock';
import { handleHandlerUpdate } from '../../../../../compact-modify/src/handlers/handleHandlerUpdate';
import { handleHandlerCheckRun } from '../../../../../compact-readonly-entries/src/handlers/handleHandlerCheckRun';
import { handleHandlerDeletionCheck } from '../../../../../compact-readonly-entries/src/handlers/handleHandlerDeletionCheck';
import { handleHandlerGet } from '../../../../../compact-readonly-entries/src/handlers/handleHandlerGet';
import { handleHandlerValidate } from '../../../../../compact-readonly-entries/src/handlers/handleHandlerValidate';
import { handleHandlerWhereUsed } from '../../../../../compact-readonly-entries/src/handlers/handleHandlerWhereUsed';
import { handleActivateObjects } from '../../../../handlers/common/high/handleActivateObjects';
import { handleGetObjectVersionSource } from '../../../../handlers/common/readonly/handleGetObjectVersionSource';
import { handleGetObjectVersions } from '../../../../handlers/common/readonly/handleGetObjectVersions';
import { handleCreatePackage } from '../../../../handlers/package/high/handleCreatePackage';
import { handleDeletePackage } from '../../../../handlers/package/high/handleDeletePackage';
import { handleSearchObject } from '../../../../handlers/search/readonly/handleSearchObject';
import { handleGetTypeInfo } from '../../../../handlers/system/readonly/handleGetTypeInfo';
import { handleCheckTableType } from '../../../../handlers/table_type/high/handleCheckTableType';
import {
  ACCESS_TYPES,
  type AccessType,
  handleCreateTableType,
  type KeyDefinition,
  type KeyKind,
  type RowTypeKind,
} from '../../../../handlers/table_type/high/handleCreateTableType';
import { handleDeleteTableType } from '../../../../handlers/table_type/high/handleDeleteTableType';
import { handleGetTableType } from '../../../../handlers/table_type/high/handleGetTableType';
import { handleUpdateTableType } from '../../../../handlers/table_type/high/handleUpdateTableType';
import type { HandlerContext } from '../../../../lib/handlers/interfaces';
import {
  patchTableTypeXml,
  readTableTypeDefinition,
  type StoredTableTypeDefinition,
} from '../../../../lib/strategies/tableTypePatch';
import {
  getSharedDependenciesConfig,
  getSystemType,
  getTimeout,
  resolveTransportRequest,
} from '../../helpers/configHelpers';
import { createTestLogger } from '../../helpers/loggerHelpers';
import { LambdaTester } from '../../helpers/testers/LambdaTester';
import type { LambdaTesterContext } from '../../helpers/testers/types';
import { createHandlerContext, delay } from '../../helpers/testHelpers';

/** A tool's answer as the model reads it: the error flag and the first text. */
type Answer = { isError: boolean; text: string };

/** Read a handler's result (typed `unknown` by the compact routes). */
function answerOf(value: unknown): Answer {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`Not a tool answer: ${String(value)}`);
  }
  const isError = 'isError' in value && value.isError === true;
  const content = 'content' in value ? value.content : undefined;
  const first: unknown = Array.isArray(content) ? content[0] : undefined;
  if (typeof first !== 'object' || first === null) return { isError, text: '' };
  // A text item, or a json item (GetTypeInfo) read as its JSON text.
  if ('text' in first && typeof first.text === 'string') {
    return { isError, text: first.text };
  }
  if ('json' in first) return { isError, text: JSON.stringify(first.json) };
  return { isError, text: '' };
}

/** A field of a parsed JSON value, or `undefined`. */
function field(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) return undefined;
  return key in value ? Reflect.get(value, key) : undefined;
}

/** A tool's JSON text, parsed; `undefined` when it is not JSON. */
function parsed(text: string): unknown {
  try {
    const value: unknown = JSON.parse(text);
    return value;
  } catch {
    return undefined;
  }
}

/** The stored definition an answer carries, read field by field. */
function storedOf(answer: Answer): StoredTableTypeDefinition | undefined {
  const stored = field(parsed(answer.text), 'stored_definition');
  if (typeof stored !== 'object' || stored === null) return undefined;
  const read: StoredTableTypeDefinition = {};
  const keys: ReadonlyArray<keyof StoredTableTypeDefinition> = [
    'row_type_kind',
    'row_type_name',
    'data_type',
    'length',
    'decimals',
    'access_type',
    'key_definition',
    'key_kind',
  ];
  for (const key of keys) {
    const value = field(stored, key);
    if (typeof value === 'string') read[key] = value;
  }
  return read;
}

/** The version the stored definition was read at, as the answer names it. */
function storedVersionOf(answer: Answer): unknown {
  return field(parsed(answer.text), 'stored_version');
}

/** The definition a metadata read answers (GetTableType, HandlerGet). */
function definitionOf(answer: Answer): StoredTableTypeDefinition | undefined {
  const document = field(parsed(answer.text), 'metadata');
  return typeof document === 'string'
    ? readTableTypeDefinition(document)
    : undefined;
}

/**
 * The key kind SAP stores for a standard or row-type key under `access`
 * (measured on premise, 2026-11-01): hashed forces unique, standard forces
 * non-unique, sorted keeps what was sent.
 */
function storedKeyKind(access: string, sent: string): string {
  if (access === 'hashed') return 'unique';
  if (access === 'standard') return 'nonUnique';
  return sent;
}

/** A run-unique suffix: five characters of A–Z and 0–9. */
function runSuffix(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let suffix = '';
  for (let i = 0; i < 5; i++) {
    suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return suffix;
}

const RUN = runSuffix();
const OWN_PACKAGE = `$ZMCP_T${RUN}`;
const NAME_PREFIX = `ZMCP_IT_TT_${RUN}`;
const TABLE_TYPE = `${NAME_PREFIX}A`;
const COMPACT_TABLE_TYPE = `${NAME_PREFIX}B`;
const REFUSED_TABLE_TYPE = `${NAME_PREFIX}R`;
const FREE_NAME = `${NAME_PREFIX}Z`;

const logger = createTestLogger('ttyp-high');

describe('TableType High-Level Handlers Integration', () => {
  let tester: LambdaTester;
  let handlerContext: HandlerContext | undefined;
  /** Set once the case runs here: only then is absence read back. */
  let ran = false;
  /** The package the run works in; its own on premise. */
  let packageName = OWN_PACKAGE;
  let transportRequest: string | undefined;
  /** What this run created and has not deleted yet, in creation order. */
  const created: Array<{ kind: 'package' | 'table_type'; name: string }> = [];
  /** A compact lock this run holds, released before any delete. */
  let heldLock: { name: string; handle: string } | undefined;
  /** Each step's answer, for the log the run is read from. */
  const record = (label: string, answer: Answer) =>
    logger?.info(
      `[answer] ${label}: ${answer.isError ? 'isError ' : ''}${answer.text}`,
    );

  const forget = (name: string) => {
    const index = created.findIndex((entry) => entry.name === name);
    if (index >= 0) created.splice(index, 1);
  };
  const transport = () =>
    transportRequest === undefined
      ? {}
      : { transport_request: transportRequest };

  /** Delete everything still listed, the package last. Idempotent. */
  const deleteEverything = async () => {
    const context = handlerContext;
    if (context === undefined) return;
    if (heldLock !== undefined) {
      const lock = heldLock;
      heldLock = undefined;
      record(
        `cleanup HandlerUnlock ${lock.name}`,
        answerOf(
          await handleHandlerUnlock(context, {
            object_type: 'TABLE_TYPE',
            object_name: lock.name,
            lock_handle: lock.handle,
          }),
        ),
      );
    }
    for (const entry of [...created].reverse()) {
      if (entry.kind !== 'table_type') continue;
      const answer = answerOf(
        await handleDeleteTableType(context, {
          table_type_name: entry.name,
          ...transport(),
        }),
      );
      record(`cleanup DeleteTableType ${entry.name}`, answer);
      if (!answer.isError) forget(entry.name);
    }
    for (const entry of [...created]) {
      if (entry.kind !== 'package') continue;
      const answer = answerOf(
        await handleDeletePackage(context, {
          package_name: entry.name,
          force_new_connection: true,
        }),
      );
      record(`cleanup DeletePackage ${entry.name}`, answer);
      if (!answer.isError) forget(entry.name);
    }
  };

  beforeAll(async () => {
    tester = new LambdaTester(
      'create_table_type',
      'builder_table_type',
      'ttyp-high',
    );
    await tester.beforeAll(
      async (context: LambdaTesterContext) => {
        if (context.hasConfig) {
          handlerContext = createHandlerContext({
            connection: context.connection,
            logger: context.logger,
          });
        }
      },
      async () => deleteEverything(),
    );
  });

  afterEach(async () => {
    await tester.afterEach();
  });

  afterAll(async () => {
    await tester.afterAll(async () => {
      // Whatever the outcome, nothing of the run stays.
      await deleteEverything();
      const context = handlerContext;
      if (context === undefined || !ran) return;
      const tableTypes = answerOf(
        await handleSearchObject(context, { object_name: `${NAME_PREFIX}*` }),
      );
      record(`absence SearchObject ${NAME_PREFIX}*`, tableTypes);
      expect(created).toEqual([]);
      expect(tableTypes.isError).toBe(false);
      expect(tableTypes.text.includes(NAME_PREFIX)).toBe(false);
      if (packageName === OWN_PACKAGE) {
        const pkg = answerOf(
          await handleSearchObject(context, {
            object_name: OWN_PACKAGE,
            object_type: 'DEVC',
          }),
        );
        record(`absence SearchObject ${OWN_PACKAGE}`, pkg);
        expect(pkg.isError).toBe(false);
        expect(pkg.text.includes(OWN_PACKAGE)).toBe(false);
      }
    });
  });

  it(
    'creates, changes, checks, reads, activates and deletes a table type, high and compact',
    async () => {
      await tester.run(async (ctx: LambdaTesterContext) => {
        const context = handlerContext;
        if (context === undefined) throw new Error('No handler context');
        ran = true;
        const params = ctx.params;
        const description: string =
          params.description || 'Table type for the table type tests';
        const rowTypeName: string = params.row_type_name;
        const updateAccess = ACCESS_TYPES.find(
          (value) => value === params.update_access_type,
        );
        if (!rowTypeName || !updateAccess) {
          throw new Error('row_type_name and update_access_type are required');
        }
        const settle = () => delay(ctx.getOperationDelay('create'));

        /** A step that must succeed: its answer, or the test ends with it. */
        const must = async (label: string, call: () => Promise<unknown>) => {
          const answer = answerOf(await call());
          record(label, answer);
          if (answer.isError) {
            throw new Error(`${label} was refused: ${answer.text}`);
          }
          return answer;
        };

        if (getSystemType() === 'cloud') {
          packageName = getSharedDependenciesConfig()?.package;
          transportRequest = resolveTransportRequest(ctx.testCase);
          if (!packageName) {
            throw new Error('shared_dependencies.package is required on cloud');
          }
        } else {
          await must(`CreatePackage ${OWN_PACKAGE}`, () =>
            handleCreatePackage(context, {
              package_name: OWN_PACKAGE,
              super_package: '$TMP',
              description: `Table type suite run ${RUN}`,
              package_type: 'development',
              software_component: 'LOCAL',
            }),
          );
          created.push({ kind: 'package', name: OWN_PACKAGE });
        }

        // CreateTableType with a definition, activated: the stored
        // definition is what was sent, and what GetTableType reads.
        const definition: {
          row_type_kind: RowTypeKind;
          row_type_name: string;
          access_type: AccessType;
          key_definition: KeyDefinition;
          key_kind: KeyKind;
        } = {
          row_type_kind: 'dictionaryType',
          row_type_name: rowTypeName,
          access_type: 'standard',
          key_definition: 'standard',
          key_kind: 'nonUnique',
        };
        const createdAnswer = await must(`CreateTableType ${TABLE_TYPE}`, () =>
          handleCreateTableType(context, {
            table_type_name: TABLE_TYPE,
            package_name: packageName,
            description,
            ...transport(),
            ...definition,
          }),
        );
        created.push({ kind: 'table_type', name: TABLE_TYPE });
        const createdStored = storedOf(createdAnswer);
        expect(createdStored).toMatchObject(definition);
        // Activated: read after the activation, at the active version.
        expect(storedVersionOf(createdAnswer)).toBe('active');
        const read = await must(`GetTableType ${TABLE_TYPE}`, () =>
          handleGetTableType(context, { table_type_name: TABLE_TYPE }),
        );
        expect(definitionOf(read)).toEqual(createdStored);

        // UpdateTableType: one property, the access type.
        const updated = await must(
          `UpdateTableType ${TABLE_TYPE} access_type=${updateAccess}`,
          () =>
            handleUpdateTableType(context, {
              table_type_name: TABLE_TYPE,
              ...transport(),
              access_type: updateAccess,
            }),
        );
        const updatedStored = storedOf(updated);
        expect(storedVersionOf(updated)).toBe('active');
        expect(updatedStored?.access_type).toBe(updateAccess);
        expect(updatedStored?.key_kind).toBe(
          storedKeyKind(updateAccess, definition.key_kind),
        );
        const readAfter = await must(`GetTableType ${TABLE_TYPE} (after)`, () =>
          handleGetTableType(context, { table_type_name: TABLE_TYPE }),
        );
        expect(definitionOf(readAfter)).toEqual(updatedStored);

        // UpdateTableType with activate false: the stored definition is the
        // inactive version; GetTableType reads it at `inactive` and at
        // `workingArea`, while `active` still answers the active one.
        const unactivated = await must(
          `UpdateTableType ${TABLE_TYPE} access_type=sorted activate=false`,
          () =>
            handleUpdateTableType(context, {
              table_type_name: TABLE_TYPE,
              ...transport(),
              access_type: 'sorted',
              activate: false,
            }),
        );
        expect(storedVersionOf(unactivated)).toBe('inactive');
        expect(storedOf(unactivated)?.access_type).toBe('sorted');
        const readInactive = await must(
          `GetTableType ${TABLE_TYPE} version=inactive`,
          () =>
            handleGetTableType(context, {
              table_type_name: TABLE_TYPE,
              version: 'inactive',
            }),
        );
        expect(definitionOf(readInactive)?.access_type).toBe('sorted');
        const readWorkingArea = await must(
          `GetTableType ${TABLE_TYPE} version=workingArea`,
          () =>
            handleGetTableType(context, {
              table_type_name: TABLE_TYPE,
              version: 'workingArea',
            }),
        );
        expect(definitionOf(readWorkingArea)?.access_type).toBe('sorted');
        const readActive = await must(
          `GetTableType ${TABLE_TYPE} version=active`,
          () =>
            handleGetTableType(context, {
              table_type_name: TABLE_TYPE,
              version: 'active',
            }),
        );
        expect(definitionOf(readActive)).toEqual(updatedStored);

        await must(`CheckTableType ${TABLE_TYPE} active`, () =>
          handleCheckTableType(context, { table_type_name: TABLE_TYPE }),
        );
        // The inactive check after an activated write: recorded as answered.
        record(
          `CheckTableType ${TABLE_TYPE} inactive`,
          answerOf(
            await handleCheckTableType(context, {
              table_type_name: TABLE_TYPE,
              version: 'inactive',
            }),
          ),
        );

        // Versions, and one version's source: what it answers is recorded.
        const versions = await must(`GetObjectVersions ${TABLE_TYPE}`, () =>
          handleGetObjectVersions(context, {
            object_type: 'table_type',
            object_name: TABLE_TYPE,
          }),
        );
        const list = field(parsed(versions.text), 'versions');
        const firstVersion: unknown = Array.isArray(list) ? list[0] : undefined;
        const contentUri =
          field(firstVersion, 'contentUri') ??
          field(firstVersion, 'content_uri');
        if (typeof contentUri === 'string') {
          record(
            `GetObjectVersionSource ${TABLE_TYPE}`,
            answerOf(
              await handleGetObjectVersionSource(context, {
                object_type: 'table_type',
                content_uri: contentUri,
              }),
            ),
          );
        } else {
          logger?.info(
            `[answer] GetObjectVersionSource ${TABLE_TYPE}: no version carries a content URI`,
          );
        }

        const typeInfo = await must(`GetTypeInfo ${TABLE_TYPE}`, () =>
          handleGetTypeInfo(context, { type_name: TABLE_TYPE }),
        );
        expect(typeInfo.text.includes(rowTypeName)).toBe(true);

        // A definition SAP stores and refuses to activate: the refusal
        // carries what SAP stored.
        const refused = answerOf(
          await handleCreateTableType(context, {
            table_type_name: REFUSED_TABLE_TYPE,
            package_name: packageName,
            description,
            ...transport(),
            row_type_kind: 'dictionaryType',
            row_type_name: rowTypeName,
            access_type: 'sorted',
            key_definition: 'empty',
          }),
        );
        record(
          `CreateTableType ${REFUSED_TABLE_TYPE} sorted + empty key`,
          refused,
        );
        // Listed whatever the answer: the cleanup deletes what exists.
        created.push({ kind: 'table_type', name: REFUSED_TABLE_TYPE });
        expect(refused.isError).toBe(true);
        expect(storedOf(refused)).toMatchObject({
          access_type: 'sorted',
          key_definition: 'empty',
        });
        // The activation refused: the inactive version the wait read.
        expect(storedVersionOf(refused)).toBe('inactive');
        await must(`DeleteTableType ${REFUSED_TABLE_TYPE}`, () =>
          handleDeleteTableType(context, {
            table_type_name: REFUSED_TABLE_TYPE,
            ...transport(),
          }),
        );
        forget(REFUSED_TABLE_TYPE);

        // Compact: every member on a second table type.
        await must(`HandlerCreate TABLE_TYPE ${COMPACT_TABLE_TYPE}`, () =>
          handleHandlerCreate(context, {
            object_type: 'TABLE_TYPE',
            table_type_name: COMPACT_TABLE_TYPE,
            package_name: packageName,
            description,
            ...transport(),
          }),
        );
        created.push({ kind: 'table_type', name: COMPACT_TABLE_TYPE });
        await settle();
        const bare = await must(
          `HandlerGet TABLE_TYPE ${COMPACT_TABLE_TYPE} metadata`,
          () =>
            handleHandlerGet(context, {
              object_type: 'TABLE_TYPE',
              table_type_name: COMPACT_TABLE_TYPE,
              part: 'metadata',
            }),
        );
        const bareDocument = field(parsed(bare.text), 'metadata');
        if (typeof bareDocument !== 'string') {
          throw new Error('HandlerGet metadata answered no document');
        }

        const locked = answerOf(
          await handleHandlerLock(context, {
            object_type: 'TABLE_TYPE',
            object_name: COMPACT_TABLE_TYPE,
          }),
        );
        // The lock's answer carries the handle: never logged.
        logger?.info(
          `[answer] HandlerLock TABLE_TYPE ${COMPACT_TABLE_TYPE}: ${locked.isError ? `isError ${locked.text}` : 'locked'}`,
        );
        if (locked.isError) {
          throw new Error(`HandlerLock was refused: ${locked.text}`);
        }
        const handle = field(parsed(locked.text), 'lock_handle');
        if (typeof handle !== 'string' || handle === '') {
          throw new Error('HandlerLock answered no lock handle');
        }
        heldLock = { name: COMPACT_TABLE_TYPE, handle };
        const compactDefinition: {
          row_type_kind: RowTypeKind;
          data_type: string;
          length: number;
          access_type: AccessType;
          key_definition: KeyDefinition;
          key_kind: KeyKind;
        } = {
          row_type_kind: 'predefinedAbapType',
          data_type: 'CHAR',
          length: 10,
          access_type: 'standard',
          key_definition: 'standard',
          key_kind: 'nonUnique',
        };
        await must(`HandlerUpdate TABLE_TYPE ${COMPACT_TABLE_TYPE}`, () =>
          handleHandlerUpdate(context, {
            object_type: 'TABLE_TYPE',
            table_type_name: COMPACT_TABLE_TYPE,
            source_code: patchTableTypeXml(bareDocument, compactDefinition),
            lock_handle: handle,
            ...transport(),
          }),
        );
        await must(`HandlerUnlock TABLE_TYPE ${COMPACT_TABLE_TYPE}`, () =>
          handleHandlerUnlock(context, {
            object_type: 'TABLE_TYPE',
            object_name: COMPACT_TABLE_TYPE,
            lock_handle: handle,
          }),
        );
        heldLock = undefined;

        await must(`HandlerValidate TABLE_TYPE ${FREE_NAME}`, () =>
          handleHandlerValidate(context, {
            object_type: 'TABLE_TYPE',
            object_name: FREE_NAME,
            package_name: packageName,
            description,
          }),
        );
        await must(`HandlerCheckRun TABLE_TYPE ${COMPACT_TABLE_TYPE}`, () =>
          handleHandlerCheckRun(context, {
            object_type: 'TABLE_TYPE',
            object_name: COMPACT_TABLE_TYPE,
            version: 'inactive',
          }),
        );
        await must(
          `HandlerDeletionCheck TABLE_TYPE ${COMPACT_TABLE_TYPE}`,
          () =>
            handleHandlerDeletionCheck(context, {
              object_type: 'TABLE_TYPE',
              object_name: COMPACT_TABLE_TYPE,
            }),
        );
        await must(`HandlerActivate TABLE_TYPE ${COMPACT_TABLE_TYPE}`, () =>
          handleHandlerActivate(context, {
            object_type: 'TABLE_TYPE',
            object_name: COMPACT_TABLE_TYPE,
          }),
        );
        const compactRead = await must(
          `HandlerGet TABLE_TYPE ${COMPACT_TABLE_TYPE} metadata (after)`,
          () =>
            handleHandlerGet(context, {
              object_type: 'TABLE_TYPE',
              table_type_name: COMPACT_TABLE_TYPE,
              part: 'metadata',
            }),
        );
        expect(definitionOf(compactRead)).toMatchObject({
          row_type_kind: 'predefinedAbapType',
          data_type: 'CHAR',
          access_type: 'standard',
          key_definition: 'standard',
          key_kind: 'nonUnique',
        });
        await must(`HandlerWhereUsed TABLE_TYPE ${COMPACT_TABLE_TYPE}`, () =>
          handleHandlerWhereUsed(context, {
            object_type: 'TABLE_TYPE',
            object_name: COMPACT_TABLE_TYPE,
          }),
        );
        await must(`HandlerDelete TABLE_TYPE ${COMPACT_TABLE_TYPE}`, () =>
          handleHandlerDelete(context, {
            object_type: 'TABLE_TYPE',
            table_type_name: COMPACT_TABLE_TYPE,
            ...transport(),
          }),
        );
        forget(COMPACT_TABLE_TYPE);

        await must(`ActivateObjects ${TABLE_TYPE} TTYP/DA`, () =>
          handleActivateObjects(context, {
            objects: [{ name: TABLE_TYPE, type: 'TTYP/DA' }],
          }),
        );
        // The inactive version (sorted) is now the active one.
        const activatedRead = await must(
          `GetTableType ${TABLE_TYPE} (after ActivateObjects)`,
          () => handleGetTableType(context, { table_type_name: TABLE_TYPE }),
        );
        expect(definitionOf(activatedRead)?.access_type).toBe('sorted');
        await must(`DeleteTableType ${TABLE_TYPE}`, () =>
          handleDeleteTableType(context, {
            table_type_name: TABLE_TYPE,
            ...transport(),
          }),
        );
        forget(TABLE_TYPE);
      });
    },
    getTimeout('long'),
  );
});
