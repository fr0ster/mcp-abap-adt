/**
 * The exact-optional pairing typecheck of the 17 source readers (their schemas spread SOURCE_RANGE_SHAPE) (no-assertions plan, S2a):
 * each handler takes its definition's schema output. Run by `test:check`, under `exactOptionalPropertyTypes` as every
 * project is; never emitted (excluded from the build).
 */

import {
  TOOL_DEFINITION as D0,
  handleGetBehaviorDefinition as H0,
} from '../../handlers/behavior_definition/high/handleGetBehaviorDefinition';
import {
  TOOL_DEFINITION as D1,
  handleGetBehaviorImplementation as H1,
} from '../../handlers/behavior_implementation/high/handleGetBehaviorImplementation';
import {
  TOOL_DEFINITION as D2,
  handleGetClass as H2,
} from '../../handlers/class/high/handleGetClass';
import {
  TOOL_DEFINITION as D3,
  handleGetLocalDefinitions as H3,
} from '../../handlers/class/high/handleGetLocalDefinitions';
import {
  TOOL_DEFINITION as D4,
  handleGetLocalMacros as H4,
} from '../../handlers/class/high/handleGetLocalMacros';
import {
  TOOL_DEFINITION as D5,
  handleGetLocalTestClass as H5,
} from '../../handlers/class/high/handleGetLocalTestClass';
import {
  TOOL_DEFINITION as D6,
  handleGetLocalTypes as H6,
} from '../../handlers/class/high/handleGetLocalTypes';
import {
  TOOL_DEFINITION as D7,
  handleGetDdl as H7,
} from '../../handlers/ddl/high/handleGetDdl';
import {
  TOOL_DEFINITION as D8,
  handleGetFunctionInclude as H8,
} from '../../handlers/function_include/readonly/handleGetFunctionInclude';
import {
  TOOL_DEFINITION as D9,
  handleGetFunctionModule as H9,
} from '../../handlers/function_module/high/handleGetFunctionModule';
import {
  TOOL_DEFINITION as D10,
  TOOL_DEFINITION as D11,
  handleGetInclude as H10,
  handleGetIncludePart as H11,
} from '../../handlers/include/readonly/handleGetInclude';
import {
  TOOL_DEFINITION as D12,
  handleGetInterface as H12,
} from '../../handlers/interface/high/handleGetInterface';
import {
  TOOL_DEFINITION as D13,
  handleGetMetadataExtension as H13,
} from '../../handlers/metadata_extension/high/handleGetMetadataExtension';
import {
  TOOL_DEFINITION as D14,
  handleGetProgram as H14,
} from '../../handlers/program/high/handleGetProgram';
import {
  TOOL_DEFINITION as D15,
  handleGetServiceDefinition as H15,
} from '../../handlers/service_definition/high/handleGetServiceDefinition';
import {
  TOOL_DEFINITION as D16,
  handleGetStructure as H16,
} from '../../handlers/structure/high/handleGetStructure';
import {
  TOOL_DEFINITION as D17,
  handleGetTable as H17,
} from '../../handlers/table/high/handleGetTable';
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
];
