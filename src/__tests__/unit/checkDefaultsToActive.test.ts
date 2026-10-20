import { handleCheckBehaviorDefinition as bdefHigh } from '../../handlers/behavior_definition/high/handleCheckBehaviorDefinition';
import { handleCheckBehaviorDefinition as bdefLow } from '../../handlers/behavior_definition/low/handleCheckBehaviorDefinition';
import { handleCheckClass as clasHigh } from '../../handlers/class/high/handleCheckClass';
import { handleCheckClass as clasLow } from '../../handlers/class/low/handleCheckClass';
import { handleCheckObject as objectLow } from '../../handlers/common/low/handleCheckObject';
import { handleCheckDataElement as dtelHigh } from '../../handlers/data_element/high/handleCheckDataElement';
import { handleCheckDataElement as dtelLow } from '../../handlers/data_element/low/handleCheckDataElement';
import { handleCheckDdl as ddlHigh } from '../../handlers/ddl/high/handleCheckDdl';
import { handleCheckDdl as ddlLow } from '../../handlers/ddl/low/handleCheckDdl';
import { handleCheckMetadataExtension as ddlxHigh } from '../../handlers/ddlx/high/handleCheckMetadataExtension';
import { handleCheckMetadataExtension as ddlxLow } from '../../handlers/ddlx/low/handleCheckMetadataExtension';
import { handleCheckDomain as domaHigh } from '../../handlers/domain/high/handleCheckDomain';
import { handleCheckDomain as domaLow } from '../../handlers/domain/low/handleCheckDomain';
import { handleCheckFunctionGroup as fugrHigh } from '../../handlers/function/high/handleCheckFunctionGroup';
import { handleCheckFunctionModule as fmodHigh } from '../../handlers/function/high/handleCheckFunctionModule';
import { handleCheckFunctionGroup as fugrLow } from '../../handlers/function/low/handleCheckFunctionGroup';
import { handleCheckFunctionModule as fmodLow } from '../../handlers/function/low/handleCheckFunctionModule';
import { handleCheckInterface as intfHigh } from '../../handlers/interface/high/handleCheckInterface';
import { handleCheckInterface as intfLow } from '../../handlers/interface/low/handleCheckInterface';
import { handleCheckPackage as devcHigh } from '../../handlers/package/high/handleCheckPackage';
import { handleCheckPackage as devcLow } from '../../handlers/package/low/handleCheckPackage';
import { handleCheckProgram as progHigh } from '../../handlers/program/high/handleCheckProgram';
import { handleCheckProgram as progLow } from '../../handlers/program/low/handleCheckProgram';
import { handleCheckStructure as strucHigh } from '../../handlers/structure/high/handleCheckStructure';
import { handleCheckStructure as strucLow } from '../../handlers/structure/low/handleCheckStructure';
import { handleCheckTable as tablHigh } from '../../handlers/table/high/handleCheckTable';
import { handleCheckTable as tablLow } from '../../handlers/table/low/handleCheckTable';
import { corpusBody } from '../../lib/adtCorpus';
import { parseStructure } from '../../lib/strategies/reading';
import { fakeClientOf, okResponse, reading } from '../helpers/fakeClient';

/**
 * #181: a check names the version it runs on, and without `version` that is
 * the active one. adt-clients reads `status === 'active' ? 'active' :
 * 'inactive'`, so a missing status checked the inactive version, and a sound
 * object with no inactive version reported syntax errors that were not there.
 */

const DOCUMENT = corpusBody('check-ddlx-active-version--01-checkrun');

let fakeClient: any;
jest.mock('../../lib/clients', () => ({ createAdtClient: () => fakeClient }));

const context = { connection: {} as any, logger: undefined };

const asking = (asked: unknown[]) => {
  const check = async (_config: unknown, version: unknown) => {
    asked.push(version);
    return okResponse(reading(parseStructure(DOCUMENT), DOCUMENT, 200));
  };
  return fakeClientOf({ check });
};

type Handler = (context: any, args: any) => Promise<any>;
const cases: Array<[string, Handler, Record<string, unknown>]> = [
  ['CheckProgramLow', progLow, { program_name: 'ZP' }],
  ['CheckProgram', progHigh, { program_name: 'ZP' }],
  ['CheckFunctionGroupLow', fugrLow, { function_group_name: 'ZG' }],
  ['CheckFunctionGroup', fugrHigh, { function_group_name: 'ZG' }],
  ['CheckInterfaceLow', intfLow, { interface_name: 'ZIF' }],
  ['CheckInterface', intfHigh, { interface_name: 'ZIF' }],
  ['CheckBehaviorDefinitionLow', bdefLow, { name: 'ZB' }],
  ['CheckBehaviorDefinition', bdefHigh, { name: 'ZB' }],
  ['CheckDomainLow', domaLow, { domain_name: 'ZD' }],
  ['CheckDomain', domaHigh, { domain_name: 'ZD' }],
  ['CheckDataElementLow', dtelLow, { data_element_name: 'ZE' }],
  ['CheckDataElement', dtelHigh, { data_element_name: 'ZE' }],
  ['CheckDdlLow', ddlLow, { ddl_name: 'ZV' }],
  ['CheckDdl', ddlHigh, { ddl_name: 'ZV' }],
  ['CheckStructureLow', strucLow, { structure_name: 'ZS' }],
  ['CheckStructure', strucHigh, { structure_name: 'ZS' }],
  ['CheckTableLow', tablLow, { table_name: 'ZT' }],
  ['CheckTable', tablHigh, { table_name: 'ZT' }],
  ['CheckClassLow', clasLow, { class_name: 'ZCL' }],
  ['CheckClass', clasHigh, { class_name: 'ZCL' }],
  [
    'CheckFunctionModuleLow',
    fmodLow,
    { function_group_name: 'ZG', function_module_name: 'ZFM' },
  ],
  [
    'CheckFunctionModule',
    fmodHigh,
    { function_group_name: 'ZG', function_module_name: 'ZFM' },
  ],
  ['CheckMetadataExtensionLow', ddlxLow, { name: 'ZX' }],
  ['CheckMetadataExtension', ddlxHigh, { name: 'ZX' }],
  ['CheckObjectLow', objectLow, { object_name: 'ZCL', object_type: 'class' }],
];

describe.each(cases)('%s', (_name, handler, base) => {
  it('checks the active version when no version is given', async () => {
    const asked: unknown[] = [];
    fakeClient = asking(asked);
    await handler(context, base);
    expect(asked).toEqual(['active']);
  });

  it('checks the inactive version when version is inactive', async () => {
    const asked: unknown[] = [];
    fakeClient = asking(asked);
    await handler(context, { ...base, version: 'inactive' });
    expect(asked).toEqual(['inactive']);
  });
});

describe('CheckPackage', () => {
  it.each([
    ['CheckPackageLow', devcLow],
    ['CheckPackage', devcHigh],
  ] as Array<[string, Handler]>)(
    '%s checks the active version',
    async (_n, handler) => {
      const asked: unknown[] = [];
      fakeClient = asking(asked);
      await handler(context, { package_name: 'ZPKG' });
      expect(asked).toEqual(['active']);
    },
  );
});
