/**
 * A write under a lock the caller holds: the compact update's `lock_handle`.
 *
 * `HandlerUpdate` without a handle runs the high update — lock, write, unlock,
 * and the check or activation it adds. With a handle the caller locked the
 * object itself (`HandlerLock`), and this sends the write alone under that
 * handle: no lock and no unlock of its own, nothing checked or activated. The
 * write is the one each family's own write handler sends — the same request
 * the low set's `Update*Low` tools sent, because these are the functions they
 * ran.
 *
 * Arguments arrive in the compact update's names and are translated here.
 * `DOMAIN` and `DATA_ELEMENT` patch their metadata document: the changes are
 * `properties` plus the flat fields the compact update already names.
 */

import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { return_error } from '../../../lib/utils';
import { handleUpdateBehaviorDefinition } from '../../behavior_definition/low/handleUpdateBehaviorDefinition';
import { handleUpdateClass } from '../../class/low/handleUpdateClass';
import { handleUpdateDataElement } from '../../data_element/low/handleUpdateDataElement';
import { handleUpdateDdl } from '../../ddl/low/handleUpdateDdl';
import { handleUpdateMetadataExtension } from '../../ddlx/low/handleUpdateMetadataExtension';
import { handleUpdateDomain } from '../../domain/low/handleUpdateDomain';
import { handleUpdateFunctionModule } from '../../function/low/handleUpdateFunctionModule';
import { handleUpdateInterface } from '../../interface/low/handleUpdateInterface';
import { handleUpdatePackage } from '../../package/low/handleUpdatePackage';
import { handleUpdateProgram } from '../../program/low/handleUpdateProgram';
import { handleUpdateStructure } from '../../structure/low/handleUpdateStructure';
import { handleUpdateTable } from '../../table/low/handleUpdateTable';

/** The object types a write under the caller's lock is sent for. */
export const UNDER_LOCK_TYPES = [
  'PACKAGE',
  'DOMAIN',
  'DATA_ELEMENT',
  'TABLE',
  'STRUCTURE',
  'DDL',
  'CLASS',
  'PROGRAM',
  'INTERFACE',
  'FUNCTION_MODULE',
  'BEHAVIOR_DEFINITION',
  'METADATA_EXTENSION',
] as const;

type Args = Record<string, unknown> & {
  object_type?: string;
  lock_handle?: string;
};

/** The metadata changes of a DOMAIN or DATA_ELEMENT: `properties` and the flat fields. */
const FLAT_PROPERTIES = [
  'description',
  'datatype',
  'length',
  'decimals',
  'conversion_exit',
  'lowercase',
  'sign_exists',
  'value_table',
  'fixed_values',
  'transport_request',
] as const;

function propertiesOf(args: Args): Record<string, unknown> {
  const given =
    args.properties && typeof args.properties === 'object'
      ? (args.properties as Record<string, unknown>)
      : {};
  const flat: Record<string, unknown> = {};
  for (const key of FLAT_PROPERTIES) {
    if (args[key] !== undefined) flat[key] = args[key];
  }
  return { ...flat, ...given };
}

/** `source_code` and the source fields some types name otherwise. */
const source = (args: Args, field: string): unknown =>
  args[field] ?? args.source_code;

export async function handleUpdateUnderLock(
  context: HandlerContext,
  args: Args,
): Promise<unknown> {
  const lockHandle = args.lock_handle;
  if (!lockHandle) {
    return return_error(
      new Error(
        'lock_handle is required: lock the object with HandlerLock first and pass the handle it answered.',
      ),
    );
  }
  if (args.activate === true) {
    return return_error(
      new Error(
        'A write under lock_handle activates nothing: unlock the object, then activate it.',
      ),
    );
  }
  const common = {
    lock_handle: lockHandle,
    transport_request: args.transport_request,
  } as const;

  switch (args.object_type) {
    case 'PACKAGE':
      return handleUpdatePackage(context, {
        ...common,
        package_name: args.package_name,
        super_package: args.super_package,
        updated_description: args.description,
      } as never);
    case 'DOMAIN':
      return handleUpdateDomain(context, {
        domain_name: args.domain_name,
        properties: propertiesOf(args),
        lock_handle: lockHandle,
      } as never);
    case 'DATA_ELEMENT':
      return handleUpdateDataElement(context, {
        data_element_name: args.data_element_name,
        properties: propertiesOf(args),
        lock_handle: lockHandle,
      } as never);
    case 'TABLE':
      return handleUpdateTable(context, {
        ...common,
        table_name: args.table_name,
        ddl_code: source(args, 'ddl_code'),
      } as never);
    case 'STRUCTURE':
      return handleUpdateStructure(context, {
        ...common,
        structure_name: args.structure_name,
        ddl_code: source(args, 'ddl_code'),
      } as never);
    case 'DDL':
      return handleUpdateDdl(context, {
        ...common,
        ddl_name: args.ddl_name,
        ddl_source: source(args, 'ddl_source'),
      } as never);
    case 'CLASS':
      return handleUpdateClass(context, {
        ...common,
        class_name: args.class_name,
        source_code: args.source_code,
      } as never);
    case 'PROGRAM':
      return handleUpdateProgram(context, {
        ...common,
        program_name: args.program_name,
        source_code: args.source_code,
      } as never);
    case 'INTERFACE':
      return handleUpdateInterface(context, {
        ...common,
        interface_name: args.interface_name,
        source_code: args.source_code,
      } as never);
    case 'FUNCTION_MODULE':
      return handleUpdateFunctionModule(context, {
        ...common,
        function_module_name: args.function_module_name,
        function_group_name: args.function_group_name,
        source_code: args.source_code,
      } as never);
    case 'BEHAVIOR_DEFINITION':
      return handleUpdateBehaviorDefinition(context, {
        ...common,
        name: args.name,
        source_code: args.source_code,
      } as never);
    case 'METADATA_EXTENSION':
      return handleUpdateMetadataExtension(context, {
        ...common,
        name: args.name,
        source_code: args.source_code,
      } as never);
    default:
      return return_error(
        new Error(
          `lock_handle is not taken for object_type ${String(args.object_type)}. ` +
            `A write under the caller's lock is sent for: ${UNDER_LOCK_TYPES.join(', ')}.`,
        ),
      );
  }
}
