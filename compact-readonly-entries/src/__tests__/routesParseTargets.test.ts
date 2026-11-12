/**
 * A compact read or part route is the target tool's entry (spec §3): the
 * call is parsed with the target's own schema before its handler runs. An
 * argument the target requires and `HandlerGet` does not is refused in the
 * target schema's words, naming the target and the argument, and nothing is
 * sent. (Before, the target's handler ran on the unchecked arguments and
 * refused in its own words.)
 */

import { recordingConnection } from '../../../src/__tests__/helpers/recordingConnection';
import { declareSystemKind } from '../../../src/lib/systemKind';
import { handleHandlerGet } from '../handlers/handleHandlerGet';

process.env.SAP_SYSTEM_TYPE = 'onprem';

/** object_type, part, the target tool, the argument it requires. */
const CASES: ReadonlyArray<[string, string, string, string]> = [
  ['PACKAGE', 'metadata', 'GetPackage', 'package_name'],
  ['DOMAIN', 'metadata', 'GetDomain', 'domain_name'],
  ['DATA_ELEMENT', 'metadata', 'GetDataElement', 'data_element_name'],
  ['TRANSPORT', 'source', 'ReadTransportObjects', 'transport_number'],
  ['TABLE', 'source', 'GetTable', 'table_name'],
  ['TABLE', 'metadata', 'GetTable', 'table_name'],
  ['STRUCTURE', 'source', 'GetStructure', 'structure_name'],
  ['STRUCTURE', 'metadata', 'GetStructure', 'structure_name'],
  ['TABLE_TYPE', 'metadata', 'GetTableType', 'table_type_name'],
  ['DDL', 'source', 'GetDdl', 'ddl_name'],
  ['DDL', 'metadata', 'GetDdl', 'ddl_name'],
  [
    'SERVICE_DEFINITION',
    'source',
    'GetServiceDefinition',
    'service_definition_name',
  ],
  [
    'SERVICE_DEFINITION',
    'metadata',
    'GetServiceDefinition',
    'service_definition_name',
  ],
  ['SERVICE_BINDING', 'source', 'GetServiceBinding', 'service_binding_name'],
  ['SERVICE_BINDING', 'metadata', 'GetServiceBinding', 'service_binding_name'],
  [
    'SERVICE_BINDING',
    'urls',
    'GetServiceBindingPreviewUrl',
    'service_binding_name',
  ],
  ['CLASS', 'source', 'GetClass', 'class_name'],
  ['CLASS', 'metadata', 'GetClass', 'class_name'],
  ['UNIT_TEST', 'source', 'GetUnitTestResult', 'run_id'],
  ['CDS_UNIT_TEST', 'source', 'GetCdsUnitTestResult', 'run_id'],
  ['LOCAL_TEST_CLASS', 'source', 'GetLocalTestClass', 'class_name'],
  ['LOCAL_TYPES', 'source', 'GetLocalTypes', 'class_name'],
  ['LOCAL_DEFINITIONS', 'source', 'GetLocalDefinitions', 'class_name'],
  ['LOCAL_MACROS', 'source', 'GetLocalMacros', 'class_name'],
  ['PROGRAM', 'source', 'GetProgram', 'program_name'],
  ['PROGRAM', 'metadata', 'GetProgram', 'program_name'],
  ['INCLUDE', 'source', 'GetInclude', 'include_name'],
  ['INCLUDE', 'metadata', 'GetInclude', 'include_name'],
  ['INCLUDE', 'main_programs', 'GetMainPrograms', 'include_name'],
  ['INTERFACE', 'source', 'GetInterface', 'interface_name'],
  ['INTERFACE', 'metadata', 'GetInterface', 'interface_name'],
  ['FUNCTION_GROUP', 'metadata', 'GetFunctionGroup', 'function_group_name'],
  [
    'BEHAVIOR_DEFINITION',
    'source',
    'GetBehaviorDefinition',
    'behavior_definition_name',
  ],
  [
    'BEHAVIOR_DEFINITION',
    'metadata',
    'GetBehaviorDefinition',
    'behavior_definition_name',
  ],
  [
    'BEHAVIOR_IMPLEMENTATION',
    'source',
    'GetBehaviorImplementation',
    'behavior_implementation_name',
  ],
  [
    'BEHAVIOR_IMPLEMENTATION',
    'metadata',
    'GetBehaviorImplementation',
    'behavior_implementation_name',
  ],
  [
    'METADATA_EXTENSION',
    'source',
    'GetMetadataExtension',
    'metadata_extension_name',
  ],
  [
    'METADATA_EXTENSION',
    'metadata',
    'GetMetadataExtension',
    'metadata_extension_name',
  ],
];

describe('a compact read route parses with its target tool’s schema', () => {
  it.each(CASES)(
    '%s part %s without the name: refused by %s’s schema, naming %s, nothing sent',
    async (objectType, part, target, argument) => {
      const connection = recordingConnection();
      declareSystemKind(connection, 'onprem');
      await expect(
        handleHandlerGet({ connection }, { object_type: objectType, part }),
      ).rejects.toThrow(
        `Invalid arguments for tool ${target}: Invalid input: expected string, received undefined at ${argument}`,
      );
      expect(connection.requests).toEqual([]);
    },
  );
});
