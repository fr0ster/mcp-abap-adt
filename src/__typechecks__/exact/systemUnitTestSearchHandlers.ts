/**
 * The exact-optional pairing typecheck of the handlers of system, unit_test and search (no-assertions plan, S2a):
 * each handler takes its definition's schema output. Run by
 * `npm run test:check:exact` with `exactOptionalPropertyTypes`, and by
 * `test:check` without it; never emitted (excluded from the build).
 */

import {
  TOOL_DEFINITION as D0,
  handleGetObjectsByType as H0,
} from '../../handlers/search/readonly/handleGetObjectsByType';
import {
  TOOL_DEFINITION as D1,
  handleGetObjectsList as H1,
} from '../../handlers/search/readonly/handleGetObjectsList';
import {
  TOOL_DEFINITION as D2,
  handleSearchObject as H2,
} from '../../handlers/search/readonly/handleSearchObject';
import {
  TOOL_DEFINITION as D3,
  handleGetPackageTree as H3,
} from '../../handlers/system/high/handleGetPackageTree';
import {
  TOOL_DEFINITION as D4,
  handleRuntimeCreateProfilerTraceParameters as H4,
} from '../../handlers/system/high/handleRuntimeCreateProfilerTraceParameters';
import {
  TOOL_DEFINITION as D5,
  handleRuntimeRunClass as H5,
} from '../../handlers/system/high/handleRuntimeRunClass';
import {
  TOOL_DEFINITION as D6,
  handleRuntimeRunProgram as H6,
} from '../../handlers/system/high/handleRuntimeRunProgram';
import {
  TOOL_DEFINITION as D7,
  TOOL_DEFINITION as D8,
  handleGetNodeStructure as H7,
  handleGetNodeStructureOnce as H8,
} from '../../handlers/system/low/handleGetNodeStructure';
import {
  TOOL_DEFINITION as D9,
  handleGetVirtualFolders as H9,
} from '../../handlers/system/low/handleGetVirtualFolders';
import {
  TOOL_DEFINITION as D10,
  handleDescribeByList as H10,
} from '../../handlers/system/readonly/handleDescribeByList';
import {
  TOOL_DEFINITION as D11,
  handleGetAdtTypes as H11,
} from '../../handlers/system/readonly/handleGetAllTypes';
import {
  TOOL_DEFINITION as D12,
  handleGetInactiveObjects as H12,
} from '../../handlers/system/readonly/handleGetInactiveObjects';
import {
  TOOL_DEFINITION as D13,
  handleGetObjectInfo as H13,
} from '../../handlers/system/readonly/handleGetObjectInfo';
import {
  TOOL_DEFINITION as D14,
  handleGetObjectNodeFromCache as H14,
} from '../../handlers/system/readonly/handleGetObjectNodeFromCache';
import {
  TOOL_DEFINITION as D15,
  handleGetObjectOutline as H15,
} from '../../handlers/system/readonly/handleGetObjectOutline';
import {
  TOOL_DEFINITION as D16,
  handleGetObjectStructure as H16,
} from '../../handlers/system/readonly/handleGetObjectStructure';
import {
  TOOL_DEFINITION as D17,
  handleGetServiceBindingPreviewUrl as H17,
} from '../../handlers/system/readonly/handleGetServiceBindingPreviewUrl';
import {
  TOOL_DEFINITION as D18,
  handleGetSqlQuery as H18,
} from '../../handlers/system/readonly/handleGetSqlQuery';
import {
  TOOL_DEFINITION as D19,
  handleGetTransaction as H19,
} from '../../handlers/system/readonly/handleGetTransaction';
import {
  TOOL_DEFINITION as D20,
  handleGetTypeInfo as H20,
} from '../../handlers/system/readonly/handleGetTypeInfo';
import {
  TOOL_DEFINITION as D21,
  handleGetWhereUsed as H21,
} from '../../handlers/system/readonly/handleGetWhereUsed';
import {
  TOOL_DEFINITION as D22,
  handleRuntimeAnalyzeProfilerTrace as H22,
} from '../../handlers/system/readonly/handleRuntimeAnalyzeProfilerTrace';
import {
  TOOL_DEFINITION as D23,
  handleRuntimeGetDumpById as H23,
} from '../../handlers/system/readonly/handleRuntimeGetDumpById';
import {
  TOOL_DEFINITION as D24,
  handleRuntimeGetGatewayErrorLog as H24,
} from '../../handlers/system/readonly/handleRuntimeGetGatewayErrorLog';
import {
  TOOL_DEFINITION as D25,
  handleRuntimeGetProfilerTraceData as H25,
} from '../../handlers/system/readonly/handleRuntimeGetProfilerTraceData';
import {
  TOOL_DEFINITION as D26,
  handleRuntimeListFeeds as H26,
} from '../../handlers/system/readonly/handleRuntimeListFeeds';
import {
  TOOL_DEFINITION as D27,
  handleRuntimeListSystemMessages as H27,
} from '../../handlers/system/readonly/handleRuntimeListSystemMessages';
import {
  TOOL_DEFINITION as D28,
  handleSearchSource as H28,
} from '../../handlers/system/readonly/handleSearchSource';
import {
  TOOL_DEFINITION as D29,
  handleCreateCdsUnitTest as H29,
} from '../../handlers/unit_test/high/handleCreateCdsUnitTest';
import {
  TOOL_DEFINITION as D30,
  handleCreateFunctionGroupUnitTest as H30,
} from '../../handlers/unit_test/high/handleCreateFunctionGroupUnitTest';
import {
  TOOL_DEFINITION as D31,
  handleCreateProgramUnitTest as H31,
} from '../../handlers/unit_test/high/handleCreateProgramUnitTest';
import {
  TOOL_DEFINITION as D32,
  handleCreateUnitTest as H32,
} from '../../handlers/unit_test/high/handleCreateUnitTest';
import {
  TOOL_DEFINITION as D33,
  handleDeleteCdsUnitTest as H33,
} from '../../handlers/unit_test/high/handleDeleteCdsUnitTest';
import {
  TOOL_DEFINITION as D34,
  handleDeleteUnitTest as H34,
} from '../../handlers/unit_test/high/handleDeleteUnitTest';
import {
  TOOL_DEFINITION as D35,
  handleGetCdsUnitTest as H35,
} from '../../handlers/unit_test/high/handleGetCdsUnitTest';
import {
  TOOL_DEFINITION as D36,
  handleGetCdsUnitTestResult as H36,
} from '../../handlers/unit_test/high/handleGetCdsUnitTestResult';
import {
  TOOL_DEFINITION as D37,
  handleGetCdsUnitTestStatus as H37,
} from '../../handlers/unit_test/high/handleGetCdsUnitTestStatus';
import {
  TOOL_DEFINITION as D38,
  handleGetUnitTest as H38,
} from '../../handlers/unit_test/high/handleGetUnitTest';
import {
  TOOL_DEFINITION as D39,
  handleGetUnitTestResult as H39,
} from '../../handlers/unit_test/high/handleGetUnitTestResult';
import {
  TOOL_DEFINITION as D40,
  handleGetUnitTestStatus as H40,
} from '../../handlers/unit_test/high/handleGetUnitTestStatus';
import {
  TOOL_DEFINITION as D41,
  handleRunAbapUnit as H41,
} from '../../handlers/unit_test/high/handleRunAbapUnit';
import {
  TOOL_DEFINITION as D42,
  handleRunCdsUnitTest as H42,
} from '../../handlers/unit_test/high/handleRunCdsUnitTest';
import {
  TOOL_DEFINITION as D43,
  handleRunFunctionGroupUnitTest as H43,
} from '../../handlers/unit_test/high/handleRunFunctionGroupUnitTest';
import {
  TOOL_DEFINITION as D44,
  handleRunFunctionModuleUnitTest as H44,
} from '../../handlers/unit_test/high/handleRunFunctionModuleUnitTest';
import {
  TOOL_DEFINITION as D45,
  handleRunProgramUnitTest as H45,
} from '../../handlers/unit_test/high/handleRunProgramUnitTest';
import {
  TOOL_DEFINITION as D46,
  handleRunUnitTest as H46,
} from '../../handlers/unit_test/high/handleRunUnitTest';
import {
  TOOL_DEFINITION as D47,
  handleUpdateCdsUnitTest as H47,
} from '../../handlers/unit_test/high/handleUpdateCdsUnitTest';
import {
  TOOL_DEFINITION as D48,
  handleUpdateFunctionGroupUnitTest as H48,
} from '../../handlers/unit_test/high/handleUpdateFunctionGroupUnitTest';
import {
  TOOL_DEFINITION as D49,
  handleUpdateProgramUnitTest as H49,
} from '../../handlers/unit_test/high/handleUpdateProgramUnitTest';
import {
  TOOL_DEFINITION as D50,
  handleUpdateUnitTest as H50,
} from '../../handlers/unit_test/high/handleUpdateUnitTest';
import { defineTool } from '../../lib/handlers/interfaces';

export const pairings = [
  defineTool(D0, H0),
  defineTool(D1, H1),
  defineTool(D2, H2),
  defineTool(D3, H3),
  defineTool(D4, H4),
  defineTool(D5, H5),
  defineTool(D6, H6),
  defineTool(D7, H7),
  defineTool(D8, H8),
  defineTool(D9, H9),
  defineTool(D10, H10),
  defineTool(D11, H11),
  defineTool(D12, H12),
  defineTool(D13, H13),
  defineTool(D14, H14),
  defineTool(D15, H15),
  defineTool(D16, H16),
  defineTool(D17, H17),
  defineTool(D18, H18),
  defineTool(D19, H19),
  defineTool(D20, H20),
  defineTool(D21, H21),
  defineTool(D22, H22),
  defineTool(D23, H23),
  defineTool(D24, H24),
  defineTool(D25, H25),
  defineTool(D26, H26),
  defineTool(D27, H27),
  defineTool(D28, H28),
  defineTool(D29, H29),
  defineTool(D30, H30),
  defineTool(D31, H31),
  defineTool(D32, H32),
  defineTool(D33, H33),
  defineTool(D34, H34),
  defineTool(D35, H35),
  defineTool(D36, H36),
  defineTool(D37, H37),
  defineTool(D38, H38),
  defineTool(D39, H39),
  defineTool(D40, H40),
  defineTool(D41, H41),
  defineTool(D42, H42),
  defineTool(D43, H43),
  defineTool(D44, H44),
  defineTool(D45, H45),
  defineTool(D46, H46),
  defineTool(D47, H47),
  defineTool(D48, H48),
  defineTool(D49, H49),
  defineTool(D50, H50),
];
