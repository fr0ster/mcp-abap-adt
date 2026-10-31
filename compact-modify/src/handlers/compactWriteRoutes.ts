/**
 * The compact WRITE routes: `object_type` to the handlers that change it.
 *
 * `create`, `update` and `delete`, kept apart from the read routes so that
 * importing the read half cannot reach a write handler. Nothing here is reachable
 * from `compactReadRoutes`, and a test asserts that of the module graph, not of
 * the intention.
 */

import type {
  CompactCrudOperation,
  CompactObjectType,
} from '@mcp-abap-adt/lib/compact-shared';
import {
  type CompactHandler,
  type CompactRouterMap,
  dispatchCompact,
} from '@mcp-abap-adt/lib/compact-shared';
import {
  handleCreateOnly,
  handleDeleteOnly,
  handleUpdateUnderLock,
} from '@mcp-abap-adt/lib/handlers/write';

/**
 * The create of every type: its create request alone, one `POST`
 * (`handleCreateOnly`, spec §4.6) — UNIT_TEST and CDS_UNIT_TEST, whose create
 * is a chain, refused there before anything is sent.
 */
const create = handleCreateOnly as unknown as CompactHandler;

/**
 * The update of every type: its one write under the caller's `lock_handle`
 * (`handleUpdateUnderLock`, spec §4.6).
 */
const update = handleUpdateUnderLock as unknown as CompactHandler;

/**
 * The delete of every type: one request (`handleDeleteOnly`, spec §4.6) — the
 * deletion request alone, or for a class include and the unit tests the
 * include written empty under the caller's `lock_handle`.
 */
const remove = handleDeleteOnly as unknown as CompactHandler;

export const compactWriteRouterMap: CompactRouterMap = {
  PACKAGE: {
    create,
    update,
    delete: remove,
  },
  DOMAIN: {
    create,
    update,
    delete: remove,
  },
  DATA_ELEMENT: {
    create,
    update,
    delete: remove,
  },
  TRANSPORT: {
    create,
  },
  TABLE: {
    create,
    update,
    delete: remove,
  },
  STRUCTURE: {
    create,
    update,
    delete: remove,
  },
  DDL: {
    create,
    update,
    delete: remove,
  },
  SERVICE_DEFINITION: {
    create,
    update,
    delete: remove,
  },
  SERVICE_BINDING: {
    create,
    update,
    delete: remove,
  },
  CLASS: {
    create,
    update,
    delete: remove,
  },
  UNIT_TEST: {
    create,
    update,
    delete: remove,
  },
  CDS_UNIT_TEST: {
    create,
    update,
    delete: remove,
  },
  LOCAL_TEST_CLASS: {
    update,
    delete: remove,
  },
  LOCAL_TYPES: {
    update,
    delete: remove,
  },
  LOCAL_DEFINITIONS: {
    update,
    delete: remove,
  },
  LOCAL_MACROS: {
    update,
    delete: remove,
  },
  PROGRAM: {
    create,
    update,
    delete: remove,
  },
  INTERFACE: {
    create,
    update,
    delete: remove,
  },
  FUNCTION_GROUP: {
    create,
    update,
    delete: remove,
  },
  FUNCTION_MODULE: {
    create,
    update,
    delete: remove,
  },
  BEHAVIOR_DEFINITION: {
    create,
    update,
    delete: remove,
  },
  BEHAVIOR_IMPLEMENTATION: {
    create,
    update,
    delete: remove,
  },
  METADATA_EXTENSION: {
    create,
    update,
    delete: remove,
  },
  // No CRUD: a profiler run and a dump are read through their own tools.
  RUNTIME_PROFILE: {},
  RUNTIME_DUMP: {},
};

/** Route a compact write: `create`, `update` or `delete`. */
export async function routeCompactWrite(
  context: Parameters<typeof dispatchCompact>[0],
  operation: Exclude<CompactCrudOperation, 'get'>,
  args: { object_type?: CompactObjectType } & Record<string, unknown>,
): Promise<unknown> {
  return dispatchCompact(context, compactWriteRouterMap, operation, args);
}
