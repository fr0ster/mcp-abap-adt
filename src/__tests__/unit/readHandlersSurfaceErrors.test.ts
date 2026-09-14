/**
 * Unit test (#159): readonly handlers must NOT mask a failed read as
 * `success:true` + null. When the underlying read is refused, the handler
 * must surface a structured failure (isError:true) carrying the refusal's
 * own message — never a re-summarised one.
 *
 * One row per handler in the two-call `read`/`readMetadata` family (task 9's
 * `handleReadClass` is the template; task 11 applies its shape to the other
 * sixteen). `refusingClient` refuses whatever member is called, so this
 * proves the refusal reaches the caller regardless of which call — `read`,
 * `readMetadata`, or the single `readMetadata` a container object answers
 * for both — a given handler happens to make first.
 */
import { handleReadBehaviorDefinition } from '../../handlers/behavior_definition/readonly/handleReadBehaviorDefinition';
import { handleReadBehaviorImplementation } from '../../handlers/behavior_implementation/readonly/handleReadBehaviorImplementation';
import { handleReadDataElement } from '../../handlers/data_element/readonly/handleReadDataElement';
import { handleReadDdl } from '../../handlers/ddl/readonly/handleReadDdl';
import { handleReadDomain } from '../../handlers/domain/readonly/handleReadDomain';
import { handleReadFunctionGroup } from '../../handlers/function_group/readonly/handleReadFunctionGroup';
import { handleReadFunctionInclude } from '../../handlers/function_include/readonly/handleReadFunctionInclude';
import { handleReadFunctionModule } from '../../handlers/function_module/readonly/handleReadFunctionModule';
import { handleReadInterface } from '../../handlers/interface/readonly/handleReadInterface';
import { handleReadMetadataExtension } from '../../handlers/metadata_extension/readonly/handleReadMetadataExtension';
import { handleReadPackage } from '../../handlers/package/readonly/handleReadPackage';
import { handleReadProgram } from '../../handlers/program/readonly/handleReadProgram';
import { handleReadServiceBinding } from '../../handlers/service_binding/readonly/handleReadServiceBinding';
import { handleReadServiceDefinition } from '../../handlers/service_definition/readonly/handleReadServiceDefinition';
import { handleReadStructure } from '../../handlers/structure/readonly/handleReadStructure';
import { handleReadTable } from '../../handlers/table/readonly/handleReadTable';
import { refusingClient } from '../helpers/fakeClient';

let fakeClient: any;
jest.mock('../../lib/clients', () => ({ createAdtClient: () => fakeClient }));

const context = { connection: {} as any, logger: undefined };

describe('readonly handlers surface read failures as isError (#159)', () => {
  it.each([
    ['ReadTable', handleReadTable, { table_name: 'ZT' }],
    ['ReadStructure', handleReadStructure, { structure_name: 'ZS' }],
    [
      'ReadServiceDefinition',
      handleReadServiceDefinition,
      { service_definition_name: 'ZSD' },
    ],
    [
      'ReadServiceBinding',
      handleReadServiceBinding,
      { service_binding_name: 'ZSB' },
    ],
    ['ReadProgram', handleReadProgram, { program_name: 'ZP' }],
    [
      'ReadMetadataExtension',
      handleReadMetadataExtension,
      { metadata_extension_name: 'ZME' },
    ],
    ['ReadInterface', handleReadInterface, { interface_name: 'ZIF' }],
    [
      'ReadFunctionModule',
      handleReadFunctionModule,
      { function_module_name: 'ZFM', function_group_name: 'ZFG' },
    ],
    [
      'ReadFunctionInclude',
      handleReadFunctionInclude,
      { include_name: 'ZINC', function_group_name: 'ZFG' },
    ],
    ['ReadDdl', handleReadDdl, { ddl_name: 'ZDDL' }],
    [
      'ReadBehaviorImplementation',
      handleReadBehaviorImplementation,
      { behavior_implementation_name: 'ZBI' },
    ],
    [
      'ReadBehaviorDefinition',
      handleReadBehaviorDefinition,
      { behavior_definition_name: 'ZBD' },
    ],
    ['ReadDomain', handleReadDomain, { domain_name: 'ZD' }],
    ['ReadDataElement', handleReadDataElement, { data_element_name: 'ZDE' }],
    ['ReadPackage', handleReadPackage, { package_name: 'ZPKG' }],
    [
      'ReadFunctionGroup',
      handleReadFunctionGroup,
      { function_group_name: 'ZFG' },
    ],
  ])('%s reports a refusal as an error', async (_name, handler, args) => {
    fakeClient = refusingClient('Resource not found');
    const result: any = await (handler as any)(context as any, args);
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text).message).toBe(
      'Resource not found',
    );
  });
});
