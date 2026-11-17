/**
 * The exact-optional pairing typecheck of the handlers of function, function_group, function_include, function_module, include, interface, message_class, metadata_extension, package and program (no-assertions plan, S2a):
 * each handler takes its definition's schema output. Run by `test:check`, under `exactOptionalPropertyTypes` as every
 * project is; never emitted (excluded from the build).
 */

import {
  TOOL_DEFINITION as D0,
  handleCheckFunctionGroup as H0,
} from '../../handlers/function/high/handleCheckFunctionGroup';
import {
  TOOL_DEFINITION as D1,
  handleCheckFunctionModule as H1,
} from '../../handlers/function/high/handleCheckFunctionModule';
import {
  TOOL_DEFINITION as D2,
  handleCreateFunctionGroup as H2,
} from '../../handlers/function/high/handleCreateFunctionGroup';
import {
  TOOL_DEFINITION as D3,
  handleCreateFunctionModule as H3,
} from '../../handlers/function/high/handleCreateFunctionModule';
import {
  TOOL_DEFINITION as D4,
  handleUpdateFunctionGroup as H4,
} from '../../handlers/function/high/handleUpdateFunctionGroup';
import {
  TOOL_DEFINITION as D5,
  handleUpdateFunctionModule as H5,
} from '../../handlers/function/high/handleUpdateFunctionModule';
import {
  TOOL_DEFINITION as D6,
  handleActivateFunctionGroup as H6,
} from '../../handlers/function/low/handleActivateFunctionGroup';
import {
  TOOL_DEFINITION as D7,
  handleActivateFunctionModule as H7,
} from '../../handlers/function/low/handleActivateFunctionModule';
import {
  TOOL_DEFINITION as D8,
  handleCheckFunctionGroup as H8,
} from '../../handlers/function/low/handleCheckFunctionGroup';
import {
  TOOL_DEFINITION as D9,
  handleCheckFunctionModule as H9,
} from '../../handlers/function/low/handleCheckFunctionModule';
import {
  TOOL_DEFINITION as D10,
  handleUpdateFunctionModule as H10,
} from '../../handlers/function/low/handleUpdateFunctionModule';
import {
  TOOL_DEFINITION as D11,
  handleDeleteFunctionGroup as H11,
} from '../../handlers/function_group/high/handleDeleteFunctionGroup';
import {
  TOOL_DEFINITION as D12,
  handleGetFunctionGroup as H12,
} from '../../handlers/function_group/high/handleGetFunctionGroup';
import {
  TOOL_DEFINITION as D13,
  handleCreateFunctionInclude as H13,
} from '../../handlers/function_include/high/handleCreateFunctionInclude';
import {
  TOOL_DEFINITION as D14,
  handleDeleteFunctionInclude as H14,
} from '../../handlers/function_include/high/handleDeleteFunctionInclude';
import {
  TOOL_DEFINITION as D15,
  handleUpdateFunctionInclude as H15,
} from '../../handlers/function_include/high/handleUpdateFunctionInclude';
import {
  TOOL_DEFINITION as D16,
  handleListFunctionGroupIncludes as H16,
} from '../../handlers/function_include/readonly/handleListFunctionGroupIncludes';
import {
  TOOL_DEFINITION as D17,
  handleListFunctionModules as H17,
} from '../../handlers/function_include/readonly/handleListFunctionModules';
import {
  TOOL_DEFINITION as D18,
  handleDeleteFunctionModule as H18,
} from '../../handlers/function_module/high/handleDeleteFunctionModule';
import {
  TOOL_DEFINITION as D19,
  handleCreateInclude as H19,
} from '../../handlers/include/high/handleCreateInclude';
import {
  TOOL_DEFINITION as D20,
  handleDeleteInclude as H20,
} from '../../handlers/include/high/handleDeleteInclude';
import {
  TOOL_DEFINITION as D21,
  handleUpdateInclude as H21,
} from '../../handlers/include/high/handleUpdateInclude';
import {
  TOOL_DEFINITION as D22,
  handleUpdateIncludeMetadata as H22,
} from '../../handlers/include/high/handleUpdateIncludeMetadata';
import {
  TOOL_DEFINITION as D23,
  handleActivateInclude as H23,
} from '../../handlers/include/low/handleActivateInclude';
import {
  TOOL_DEFINITION as D24,
  handleGetIncludesList as H24,
} from '../../handlers/include/readonly/handleGetIncludesList';
import {
  TOOL_DEFINITION as D25,
  handleGetMainPrograms as H25,
} from '../../handlers/include/readonly/handleGetMainPrograms';
import {
  TOOL_DEFINITION as D26,
  handleCheckInterface as H26,
} from '../../handlers/interface/high/handleCheckInterface';
import {
  TOOL_DEFINITION as D27,
  handleCreateInterface as H27,
} from '../../handlers/interface/high/handleCreateInterface';
import {
  TOOL_DEFINITION as D28,
  handleDeleteInterface as H28,
} from '../../handlers/interface/high/handleDeleteInterface';
import {
  TOOL_DEFINITION as D29,
  handleUpdateInterface as H29,
} from '../../handlers/interface/high/handleUpdateInterface';
import {
  TOOL_DEFINITION as D30,
  handleActivateInterface as H30,
} from '../../handlers/interface/low/handleActivateInterface';
import {
  TOOL_DEFINITION as D31,
  handleCheckInterface as H31,
} from '../../handlers/interface/low/handleCheckInterface';
import {
  TOOL_DEFINITION as D32,
  handleUpdateInterface as H32,
} from '../../handlers/interface/low/handleUpdateInterface';
import {
  TOOL_DEFINITION as D33,
  handleCreateMessageClass as H33,
} from '../../handlers/message_class/high/handleCreateMessageClass';
import {
  TOOL_DEFINITION as D34,
  handleCreateMessageClassMessage as H34,
} from '../../handlers/message_class/high/handleCreateMessageClassMessage';
import {
  TOOL_DEFINITION as D35,
  handleDeleteMessageClass as H35,
} from '../../handlers/message_class/high/handleDeleteMessageClass';
import {
  TOOL_DEFINITION as D36,
  handleDeleteMessageClassMessage as H36,
} from '../../handlers/message_class/high/handleDeleteMessageClassMessage';
import {
  TOOL_DEFINITION as D37,
  handleGetMessageClass as H37,
} from '../../handlers/message_class/high/handleGetMessageClass';
import {
  TOOL_DEFINITION as D38,
  handleGetMessageClassMessage as H38,
} from '../../handlers/message_class/high/handleGetMessageClassMessage';
import {
  TOOL_DEFINITION as D39,
  handleUpdateMessageClass as H39,
} from '../../handlers/message_class/high/handleUpdateMessageClass';
import {
  TOOL_DEFINITION as D40,
  handleUpdateMessageClassMessage as H40,
} from '../../handlers/message_class/high/handleUpdateMessageClassMessage';
import {
  TOOL_DEFINITION as D41,
  handleDeleteMetadataExtension as H41,
} from '../../handlers/metadata_extension/high/handleDeleteMetadataExtension';
import {
  TOOL_DEFINITION as D42,
  handleCheckPackage as H42,
} from '../../handlers/package/high/handleCheckPackage';
import {
  TOOL_DEFINITION as D43,
  handleCreatePackage as H43,
} from '../../handlers/package/high/handleCreatePackage';
import {
  TOOL_DEFINITION as D44,
  handleDeletePackage as H44,
} from '../../handlers/package/high/handleDeletePackage';
import {
  TOOL_DEFINITION as D45,
  handleGetPackage as H45,
} from '../../handlers/package/high/handleGetPackage';
import {
  TOOL_DEFINITION as D46,
  handleUpdatePackage as H46,
} from '../../handlers/package/high/handleUpdatePackage';
import {
  TOOL_DEFINITION as D47,
  handleCheckPackage as H47,
} from '../../handlers/package/low/handleCheckPackage';
import {
  TOOL_DEFINITION as D48,
  handleUpdatePackage as H48,
} from '../../handlers/package/low/handleUpdatePackage';
import {
  TOOL_DEFINITION as D49,
  handleGetPackageContents as H49,
} from '../../handlers/package/readonly/handleGetPackageContents';
import {
  TOOL_DEFINITION as D50,
  handleCheckProgram as H50,
} from '../../handlers/program/high/handleCheckProgram';
import {
  TOOL_DEFINITION as D51,
  handleCreateProgram as H51,
} from '../../handlers/program/high/handleCreateProgram';
import {
  TOOL_DEFINITION as D52,
  handleDeleteProgram as H52,
} from '../../handlers/program/high/handleDeleteProgram';
import {
  TOOL_DEFINITION as D53,
  handleUpdateProgram as H53,
} from '../../handlers/program/high/handleUpdateProgram';
import {
  TOOL_DEFINITION as D54,
  handleActivateProgram as H54,
} from '../../handlers/program/low/handleActivateProgram';
import {
  TOOL_DEFINITION as D55,
  handleCheckProgram as H55,
} from '../../handlers/program/low/handleCheckProgram';
import {
  TOOL_DEFINITION as D56,
  handleUpdateProgram as H56,
} from '../../handlers/program/low/handleUpdateProgram';
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
  defineTool(D51, H51),
  defineTool(D52, H52),
  defineTool(D53, H53),
  defineTool(D54, H54),
  defineTool(D55, H55),
  defineTool(D56, H56),
];
